"""Universal eval worker for Phoenix.

Polls ALL Phoenix projects for new LLM spans, runs evaluations,
and uploads annotations. Independent of any specific agent.
Uses httpx for Phoenix API calls (no phoenix server dependency).
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from collections import deque
from datetime import datetime, timedelta, timezone

import httpx
import pandas as pd
from openai import OpenAI
from phoenix.evals import QAEvaluator, RelevanceEvaluator, run_evals
from phoenix.evals.models import OpenAIModel

import prompts as default_prompts

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
logger = logging.getLogger("eval_worker")

# ── Configuration ──────────────────────────────────────────────────────────

POLL_INTERVAL = int(os.getenv("EVAL_POLL_INTERVAL", "15"))
PHOENIX_URL = os.getenv("PHOENIX_URL", "http://localhost:6006").rstrip("/")
DASHBOARD_URL = os.getenv("DASHBOARD_URL", "http://localhost:3000").rstrip("/")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
MAX_CACHE = 5000

BANNED_WORDS_DEFAULT = ["fuck", "shit"]
_extra = os.getenv("BANNED_WORDS", "")
BANNED_WORDS = BANNED_WORDS_DEFAULT + [w.strip() for w in _extra.split(",") if w.strip()]
BANNED_RE = re.compile("|".join(re.escape(w) for w in BANNED_WORDS), re.IGNORECASE)

ALL_ANNOTATIONS = {"banned_word", "hallucination", "qa_correctness", "rag_relevance", "citation", "tool_calling"}

# ── Phoenix API helpers (httpx, no phoenix server dependency) ─────────────

_http = httpx.Client(base_url=PHOENIX_URL, timeout=30)


def phoenix_get_projects() -> list[str]:
    try:
        resp = _http.get("/v1/projects")
        return [p["name"] for p in resp.json().get("data", []) if p["name"] != "playground"]
    except Exception as e:
        logger.warning("Failed to get projects: %s", e)
        return []


def phoenix_get_spans(project: str, start_time: datetime, end_time: datetime) -> list[dict]:
    try:
        params = {"limit": "200"}
        if start_time:
            params["start_time"] = start_time.isoformat()
        if end_time:
            params["end_time"] = end_time.isoformat()
        resp = _http.get(f"/v1/projects/{project}/spans", params=params)
        return resp.json().get("data", [])
    except Exception as e:
        logger.warning("Failed to get spans for %s: %s", project, e)
        return []


def phoenix_get_annotations(project: str, span_ids: list[str]) -> dict[str, set[str]]:
    """Returns {span_id: {annotation_names}}."""
    if not span_ids:
        return {}
    try:
        params = [("span_ids", sid) for sid in span_ids[:100]] + [("limit", "1000")]
        resp = _http.get(f"/v1/projects/{project}/span_annotations", params=params)
        result: dict[str, set[str]] = {}
        for a in resp.json().get("data", []):
            result.setdefault(a["span_id"], set()).add(a["name"])
        return result
    except Exception as e:
        logger.warning("Failed to get annotations: %s", e)
        return {}


def phoenix_upload_annotation(span_id: str, name: str, kind: str, label: str, score: float, explanation: str = "") -> None:
    try:
        _http.post("/v1/span_annotations?sync=true", json={
            "data": [{
                "span_id": span_id,
                "name": name,
                "annotator_kind": kind,
                "result": {"label": label, "score": score, "explanation": explanation},
            }],
        })
    except Exception as e:
        logger.warning("Annotation upload failed (%s): %s", name, e)


# ── Custom prompts ────────────────────────────────────────────────────────

_custom_prompts: dict[str, str] | None = None


def _load_custom_prompts() -> None:
    global _custom_prompts
    if _custom_prompts is not None:
        return
    try:
        resp = httpx.get(f"{DASHBOARD_URL}/api/eval-prompts", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            _custom_prompts = {p["name"]: p["template"] for p in data.get("prompts", [])}
            logger.info("Loaded %d custom eval prompts", len(_custom_prompts))
        else:
            _custom_prompts = {}
    except Exception:
        _custom_prompts = {}
        logger.info("Dashboard not reachable, using default prompts")


def get_prompt(name: str, default: str) -> str:
    _load_custom_prompts()
    return (_custom_prompts or {}).get(name, default)


# ── Span parsing ──────────────────────────────────────────────────────────

def _extract_input_output(span: dict) -> tuple[str, str, str]:
    """Extract query, context, response from a span."""
    attrs = span.get("attributes", {})
    raw_input = str(attrs.get("input.value", ""))
    raw_output = str(attrs.get("output.value", ""))

    query = ""
    context = ""
    response = ""

    # Try RAG pattern
    try:
        data = json.loads(raw_input)
        for msg in data.get("messages", [[]])[0]:
            content = msg.get("kwargs", {}).get("content", "")
            q = re.search(r"<question>(.*?)</question>", content, re.DOTALL)
            c = re.search(r"<context>(.*?)</context>", content, re.DOTALL)
            if q:
                query = q.group(1).strip()
            if c:
                context = c.group(1).strip()
    except Exception:
        pass

    # Fallback: messages array
    if not query:
        try:
            data = json.loads(raw_input)
            msgs = data.get("messages", [])
            if isinstance(msgs, list):
                for m in msgs:
                    if isinstance(m, dict):
                        role = m.get("role", "") or m.get("type", "")
                        content = m.get("content", "") or m.get("kwargs", {}).get("content", "")
                        if role in ("user", "human") and content:
                            query = content[:2000]
                            break
        except Exception:
            pass

    if not query:
        query = raw_input[:2000]

    # Extract response
    try:
        data = json.loads(raw_output)
        response = data.get("generations", [[]])[0][0].get("text", "")
    except Exception:
        pass
    if not response:
        try:
            data = json.loads(raw_output)
            msgs = data.get("messages", [])
            if isinstance(msgs, list) and msgs:
                last = msgs[-1] if isinstance(msgs[-1], dict) else msgs[0]
                response = last.get("content", "") or str(last)
        except Exception:
            response = raw_output[:2000]

    return query, context, response


# ── Evaluators ────────────────────────────────────────────────────────────

def _openai_eval(prompt_text: str) -> dict:
    try:
        client = OpenAI(api_key=OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt_text}],
            response_format={"type": "json_object"},
            temperature=0,
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as e:
        logger.error("OpenAI eval failed: %s", e)
        return {}


def eval_banned_word(response: str) -> dict:
    m = BANNED_RE.search(response)
    return {"label": "detected" if m else "clean", "score": 1.0 if m else 0.0, "explanation": f"Matched: '{m.group()}'" if m else ""}


def eval_hallucination(response: str, context: str) -> dict:
    if not context:
        return {}
    prompt = get_prompt("hallucination", default_prompts.HALLUCINATION)
    r = _openai_eval(prompt.format(context=context[:2000], response=response[:2000], query=""))
    return {"label": str(r.get("label", "factual")), "score": float(r.get("score", 0.0)), "explanation": str(r.get("explanation", ""))} if r else {}


def eval_citation(response: str, context: str) -> dict:
    if not context:
        return {}
    prompt = get_prompt("citation", default_prompts.CITATION)
    r = _openai_eval(prompt.format(context=context[:2000], response=response[:2000], query=""))
    return {"label": str(r.get("label", "unfaithful")), "score": float(r.get("score", 0.0)), "explanation": str(r.get("explanation", ""))} if r else {}


def eval_tool_calling(query: str, context: str) -> dict:
    if not context:
        return {}
    prompt = get_prompt("tool_calling", default_prompts.TOOL_CALLING)
    r = _openai_eval(prompt.format(query=query[:1000], context=context[:1000], response=""))
    return {"label": str(r.get("label", "inappropriate")), "score": float(r.get("score", 0.0)), "explanation": str(r.get("explanation", ""))} if r else {}


# ── Main loop ─────────────────────────────────────────────────────────────

def main() -> None:
    model = OpenAIModel(model="gpt-4o-mini", api_key=OPENAI_API_KEY)
    qa_eval = QAEvaluator(model)
    relevance_eval = RelevanceEvaluator(model)

    evaluated: dict[str, set[str]] = {}
    caches: dict[str, deque] = {}
    last_checked = datetime.now(timezone.utc) - timedelta(minutes=5)

    logger.info("Eval worker started (phoenix=%s, interval=%ds)", PHOENIX_URL, POLL_INTERVAL)

    while True:
        time.sleep(POLL_INTERVAL)
        try:
            now = datetime.now(timezone.utc)
            projects = phoenix_get_projects()

            for project in projects:
                if project not in evaluated:
                    evaluated[project] = set()
                    caches[project] = deque(maxlen=MAX_CACHE)

                spans = phoenix_get_spans(project, last_checked - timedelta(seconds=30), now)
                if not spans:
                    continue

                # Build root span map
                root_map: dict[str, str] = {}
                for s in spans:
                    if s.get("parent_id") is None:
                        root_map[s["context"]["trace_id"]] = s["context"]["span_id"]

                # Find LLM spans
                llm_spans = [s for s in spans if s.get("span_kind") == "LLM" or s.get("attributes", {}).get("openinference.span.kind") == "LLM"]

                new_count = 0
                for span in llm_spans:
                    span_id = span["context"]["span_id"]
                    if span_id in evaluated[project]:
                        continue

                    trace_id = span["context"]["trace_id"]
                    target_id = root_map.get(trace_id, span_id)

                    # Check existing annotations
                    existing = phoenix_get_annotations(project, [target_id])
                    existing_names = existing.get(target_id, set())
                    missing = ALL_ANNOTATIONS - existing_names

                    if not missing:
                        evaluated[project].add(span_id)
                        caches[project].append(span_id)
                        continue

                    # Parse span
                    query, context, response = _extract_input_output(span)
                    if not query and not response:
                        evaluated[project].add(span_id)
                        continue

                    logger.info("[%s] Evaluating %s (%d missing: %s)", project, target_id[:8], len(missing), ", ".join(missing))

                    if "banned_word" in missing and response:
                        r = eval_banned_word(response)
                        phoenix_upload_annotation(target_id, "banned_word", "CODE", r["label"], r["score"], r.get("explanation", ""))

                    if "hallucination" in missing and response and context:
                        r = eval_hallucination(response, context)
                        if r:
                            phoenix_upload_annotation(target_id, "hallucination", "LLM", r["label"], r["score"], r.get("explanation", ""))

                    if "qa_correctness" in missing and query and response and context:
                        try:
                            df = pd.DataFrame([{"context.span_id": target_id, "input": query, "output": response, "reference": context}]).set_index("context.span_id")
                            (result,) = run_evals(evaluators=[qa_eval], dataframe=df[["input", "output", "reference"]], provide_explanation=True, concurrency=1)
                            if result is not None and not result.empty:
                                row = result.iloc[0]
                                phoenix_upload_annotation(target_id, "qa_correctness", "LLM", str(row.get("label", "")), float(row.get("score", 0)), str(row.get("explanation", "")))
                        except Exception as e:
                            logger.error("qa_correctness failed: %s", e)

                    if "rag_relevance" in missing and query and context:
                        try:
                            docs = [d.strip() for d in context.split("\n\n") if d.strip()][:5]
                            if docs:
                                rows = [{"idx": f"d{i}", "input": query, "reference": d[:800]} for i, d in enumerate(docs)]
                                df = pd.DataFrame(rows).set_index("idx")
                                (result,) = run_evals(evaluators=[relevance_eval], dataframe=df[["input", "reference"]], provide_explanation=False, concurrency=3)
                                if result is not None and not result.empty:
                                    avg = float(result["score"].mean())
                                    n = int(result["score"].sum())
                                    phoenix_upload_annotation(target_id, "rag_relevance", "LLM", "relevant" if avg > 0.5 else "unrelated", avg, f"{n}/{len(result)} docs relevant")
                        except Exception as e:
                            logger.error("rag_relevance failed: %s", e)

                    if "citation" in missing and response and context:
                        r = eval_citation(response, context)
                        if r:
                            phoenix_upload_annotation(target_id, "citation", "LLM", r["label"], r["score"], r.get("explanation", ""))

                    if "tool_calling" in missing and query and context:
                        r = eval_tool_calling(query, context)
                        if r:
                            phoenix_upload_annotation(target_id, "tool_calling", "LLM", r["label"], r["score"], r.get("explanation", ""))

                    evaluated[project].add(span_id)
                    caches[project].append(span_id)
                    new_count += 1

                    if len(evaluated[project]) > MAX_CACHE:
                        try:
                            evaluated[project].discard(caches[project][0])
                        except IndexError:
                            pass

                if new_count > 0:
                    logger.info("[%s] Evaluated %d new spans", project, new_count)

            last_checked = now

        except Exception as e:
            logger.error("Eval loop error: %s", e, exc_info=True)


if __name__ == "__main__":
    if not OPENAI_API_KEY:
        logger.error("OPENAI_API_KEY is required")
        exit(1)
    main()
