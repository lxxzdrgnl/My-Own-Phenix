"""Universal eval worker for Phoenix.

Polls ALL Phoenix projects for new traces, runs two-level evaluations:
- Trace-level: root span (QA correctness, banned word, tool calling)
- Span-level: individual LLM spans with context (hallucination, citation)
- Span-level: RETRIEVER spans (RAG relevance)

Works with any agent type (RAG, tool-calling, simple chat, multi-step).
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
MAX_LLM_EVALS_PER_TRACE = 5

BANNED_WORDS_DEFAULT = ["fuck", "shit"]
_extra = os.getenv("BANNED_WORDS", "")
BANNED_WORDS = BANNED_WORDS_DEFAULT + [w.strip() for w in _extra.split(",") if w.strip()]
BANNED_RE = re.compile("|".join(re.escape(w) for w in BANNED_WORDS), re.IGNORECASE)

_reeval_raw = os.getenv("REEVAL_ANNOTATIONS", "")
REEVAL_ANNOTATIONS = {a.strip() for a in _reeval_raw.split(",") if a.strip()}

# ── Phoenix API helpers ───────────────────────────────────────────────────

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
        params = {"limit": "500"}
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


# ── Eval config from dashboard ────────────────────────────────────────────

class EvalDef:
    """Eval definition loaded from dashboard."""
    def __init__(self, name: str, eval_type: str, template: str, rule_config: dict):
        self.name = name
        self.eval_type = eval_type  # "llm_prompt" | "code_rule" | "builtin"
        self.template = template
        self.rule_config = rule_config

_eval_defs: dict[str, EvalDef] | None = None
_eval_defs_loaded_at: float = 0
_project_configs: dict[str, dict[str, bool]] = {}  # project → {eval_name → enabled}
_project_configs_loaded_at: dict[str, float] = {}


def _load_eval_defs() -> dict[str, EvalDef]:
    """Load all eval definitions from dashboard API. Refresh every 60s."""
    global _eval_defs, _eval_defs_loaded_at
    now = time.time()
    if _eval_defs is not None and now - _eval_defs_loaded_at < 60:
        return _eval_defs
    try:
        resp = httpx.get(f"{DASHBOARD_URL}/api/eval-prompts", timeout=5)
        if resp.status_code == 200:
            defs = {}
            for p in resp.json().get("prompts", []):
                rc = {}
                try:
                    rc = json.loads(p.get("ruleConfig", "{}"))
                except Exception:
                    pass
                defs[p["name"]] = EvalDef(
                    name=p["name"],
                    eval_type=p.get("evalType", "llm_prompt"),
                    template=p.get("template", ""),
                    rule_config=rc,
                )
            _eval_defs = defs
            _eval_defs_loaded_at = now
            logger.info("Loaded %d eval definitions from dashboard", len(defs))
            return defs
    except Exception:
        pass
    if _eval_defs is None:
        _eval_defs = {}
    return _eval_defs


def _load_project_config(project: str) -> dict[str, bool]:
    """Load enabled/disabled evals for a project. Refresh every 60s."""
    now = time.time()
    if project in _project_configs and now - _project_configs_loaded_at.get(project, 0) < 60:
        return _project_configs[project]
    try:
        resp = httpx.get(f"{DASHBOARD_URL}/api/eval-config?projectId={project}", timeout=5)
        if resp.status_code == 200:
            configs = resp.json().get("configs", [])
            result = {c["evalName"]: c["enabled"] for c in configs}
            _project_configs[project] = result
            _project_configs_loaded_at[project] = now
            return result
    except Exception:
        pass
    return _project_configs.get(project, {})


def get_enabled_evals(project: str) -> set[str]:
    """Returns set of eval names enabled for this project."""
    defs = _load_eval_defs()
    config = _load_project_config(project)

    # All known evals (built-in + custom)
    all_evals = set(BUILT_IN_EVALS) | set(defs.keys())

    enabled = set()
    for name in all_evals:
        # If project has explicit config, use it; otherwise default enabled
        if name in config:
            if config[name]:
                enabled.add(name)
        else:
            enabled.add(name)
    return enabled


def get_prompt(name: str, default: str) -> str:
    """Get prompt template: custom from dashboard > default."""
    defs = _load_eval_defs()
    if name in defs and defs[name].template:
        return defs[name].template
    return default


def get_eval_def(name: str) -> EvalDef | None:
    defs = _load_eval_defs()
    return defs.get(name)


# Built-in eval names (always available even without dashboard)
BUILT_IN_EVALS = {"hallucination", "qa_correctness", "rag_relevance", "banned_word", "citation", "tool_calling"}


# ── Span tree helpers ─────────────────────────────────────────────────────

def _get_span_kind(span: dict) -> str:
    """Get span kind, checking both top-level and attributes."""
    kind = span.get("span_kind", "")
    if not kind:
        kind = span.get("attributes", {}).get("openinference.span.kind", "")
    return kind.upper()


def _group_by_trace(spans: list[dict]) -> dict[str, list[dict]]:
    """Group spans by trace_id."""
    traces: dict[str, list[dict]] = {}
    for s in spans:
        tid = s.get("context", {}).get("trace_id", "")
        if tid:
            traces.setdefault(tid, []).append(s)
    return traces


def _find_root(spans: list[dict]) -> dict | None:
    """Find the root span (no parent) in a trace."""
    for s in spans:
        if s.get("parent_id") is None:
            return s
    return None


def _extract_text(raw: str) -> str:
    """Extract readable text from various JSON formats."""
    if not raw:
        return ""
    # Try JSON parsing
    try:
        data = json.loads(raw)
        # LangChain generations format
        if "generations" in data:
            return data["generations"][0][0].get("text", "")
        # Messages format
        if "messages" in data:
            msgs = data["messages"]
            if isinstance(msgs, list):
                # Nested list (LangChain)
                if msgs and isinstance(msgs[0], list):
                    for msg in msgs[0]:
                        content = msg.get("kwargs", {}).get("content", "") or msg.get("content", "")
                        if content:
                            return content[:3000]
                # Flat list
                for msg in msgs:
                    if isinstance(msg, dict):
                        content = msg.get("content", "") or msg.get("kwargs", {}).get("content", "")
                        if content:
                            return content[:3000]
        # Direct content
        if "content" in data:
            return str(data["content"])[:3000]
        if "output" in data:
            return str(data["output"])[:3000]
    except Exception:
        pass
    return raw[:3000]


def _extract_query_from_input(raw_input: str) -> str:
    """Extract user query from span input."""
    try:
        data = json.loads(raw_input)
        # LangChain messages format
        msgs = data.get("messages", [])
        if isinstance(msgs, list):
            # Nested list
            if msgs and isinstance(msgs[0], list):
                for msg in msgs[0]:
                    content = msg.get("kwargs", {}).get("content", "") or msg.get("content", "")
                    role = msg.get("id", ["", "", "", ""])
                    is_human = "HumanMessage" in str(role) or msg.get("type") == "human"
                    if is_human and content:
                        # Check for <question> tag
                        q = re.search(r"<question>(.*?)</question>", content, re.DOTALL)
                        if q:
                            return q.group(1).strip()
                        return content[:2000]
            # Flat list
            for msg in msgs:
                if isinstance(msg, dict):
                    role = msg.get("role", "") or msg.get("type", "")
                    if role in ("user", "human"):
                        return (msg.get("content", "") or "")[:2000]
        # Direct input
        if "input" in data:
            return str(data["input"])[:2000]
        if "prompt" in data:
            return str(data["prompt"])[:2000]
    except Exception:
        pass
    return raw_input[:2000]


def _extract_context_from_input(raw_input: str) -> str:
    """Try to extract injected context from LLM input (e.g., RAG <context> tags, tool call data)."""
    try:
        data = json.loads(raw_input)
        msgs = data.get("messages", [])
        if isinstance(msgs, list) and msgs and isinstance(msgs[0], list):
            for msg in msgs[0]:
                content = msg.get("kwargs", {}).get("content", "") or msg.get("content", "")
                # <context> tag style
                c = re.search(r"<context>(.*?)</context>", content, re.DOTALL)
                if c:
                    return c.group(1).strip()
    except Exception:
        pass

    # Plain text: "Data retrieved from tool calls:" pattern
    marker = "Data retrieved from tool calls:"
    idx = raw_input.find(marker)
    if idx >= 0:
        return raw_input[idx + len(marker):].strip()[:3000]

    # Plain text: any content after "Query:" that contains data
    if "\n" in raw_input and len(raw_input) > 500:
        # Long input likely contains context
        return raw_input[:3000]

    return ""


def _aggregate_context_from_siblings(target_span: dict, all_spans: list[dict]) -> str:
    """Collect outputs from TOOL/RETRIEVER spans that occurred before this span."""
    target_start = target_span.get("start_time", "")
    parent_id = target_span.get("parent_id")
    parts = []
    for s in all_spans:
        kind = _get_span_kind(s)
        if kind not in ("TOOL", "RETRIEVER"):
            continue
        # Same parent (sibling) or direct child of root
        s_parent = s.get("parent_id")
        if s_parent != parent_id and s_parent != target_span.get("context", {}).get("span_id"):
            continue
        # Chronologically before
        s_end = s.get("end_time", "")
        if s_end and target_start and s_end <= target_start:
            output = s.get("attributes", {}).get("output.value", "")
            if output:
                parts.append(_extract_text(output))
    return "\n---\n".join(parts) if parts else ""


# ── Code Rule engine ──────────────────────────────────────────────────────

def _eval_code_rule(rule_config: dict, query: str, response: str, context: str, span: dict) -> dict:
    """Execute a code_rule eval definition."""
    rules = rule_config.get("rules", [])
    logic = rule_config.get("logic", "any")  # "any" or "all"
    match_result = rule_config.get("match", {"label": "detected", "score": 1.0})
    clean_result = rule_config.get("clean", {"label": "clean", "score": 0.0})

    # Resolve check fields
    attrs = span.get("attributes", {})
    field_values = {
        "response": response,
        "query": query,
        "context": context,
        "total_tokens": int(attrs.get("llm.token_count.total", 0)),
        "prompt_tokens": int(attrs.get("llm.token_count.prompt", 0)),
        "completion_tokens": int(attrs.get("llm.token_count.completion", 0)),
        "latency_ms": 0,
        "cost": 0.0,
        "model_name": str(attrs.get("llm.model_name", "")),
        "status": str(span.get("status_code", "OK")),
        "span_kind": str(attrs.get("openinference.span.kind", "")),
    }
    # Calculate latency
    try:
        start = span.get("start_time", "")
        end = span.get("end_time", "")
        if start and end:
            from datetime import datetime as dt
            s = dt.fromisoformat(start.replace("Z", "+00:00"))
            e = dt.fromisoformat(end.replace("Z", "+00:00"))
            field_values["latency_ms"] = int((e - s).total_seconds() * 1000)
    except Exception:
        pass

    results = []
    for rule in rules:
        check_field = rule.get("check", "response")
        op = rule.get("op", "contains_any")
        value = rule.get("value", "")
        case_sensitive = rule.get("caseSensitive", False)

        field_val = field_values.get(check_field, "")
        matched = False

        try:
            if isinstance(field_val, str):
                text = field_val if case_sensitive else field_val.lower()
                cmp_val = value if case_sensitive else value.lower()

                if op == "contains_any":
                    keywords = [k.strip() for k in cmp_val.split(",") if k.strip()]
                    matched = any(k in text for k in keywords)
                elif op == "not_contains_any":
                    keywords = [k.strip() for k in cmp_val.split(",") if k.strip()]
                    matched = not any(k in text for k in keywords)
                elif op == "matches_regex":
                    flags = 0 if case_sensitive else re.IGNORECASE
                    matched = bool(re.search(value, field_val, flags))
                elif op == "length_gt":
                    matched = len(field_val) > int(value)
                elif op == "length_lt":
                    matched = len(field_val) < int(value)
                elif op == "is_empty":
                    matched = len(field_val.strip()) == 0
                elif op == "is_not_empty":
                    matched = len(field_val.strip()) > 0
                elif op == "equals":
                    matched = text == cmp_val
                elif op == "not_equals":
                    matched = text != cmp_val
            else:
                # Numeric
                num = float(field_val)
                if op == "gt":
                    matched = num > float(value)
                elif op == "lt":
                    matched = num < float(value)
                elif op == "gte":
                    matched = num >= float(value)
                elif op == "lte":
                    matched = num <= float(value)
                elif op == "between":
                    parts = [v.strip() for v in value.split(",")]
                    if len(parts) == 2:
                        matched = float(parts[0]) <= num <= float(parts[1])
                elif op == "equals":
                    matched = num == float(value)
        except Exception:
            pass

        results.append(matched)

    # Apply logic
    if logic == "all":
        triggered = all(results) if results else False
    else:
        triggered = any(results) if results else False

    if triggered:
        return {"label": match_result.get("label", "detected"), "score": float(match_result.get("score", 1.0)), "explanation": "Rule matched"}
    return {"label": clean_result.get("label", "clean"), "score": float(clean_result.get("score", 0.0)), "explanation": ""}


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
    return {"label": "detected" if m else "clean", "score": 1.0 if m else 0.0,
            "explanation": f"Matched: '{m.group()}'" if m else ""}


def eval_hallucination(response: str, context: str) -> dict:
    if not context:
        return {}
    prompt = get_prompt("hallucination", default_prompts.HALLUCINATION)
    r = _openai_eval(prompt.format(context=context[:3000], response=response[:2000], query=""))
    return {"label": str(r.get("label", "factual")), "score": float(r.get("score", 0.0)),
            "explanation": str(r.get("explanation", ""))} if r else {}


def eval_citation(response: str, context: str) -> dict:
    if not context:
        return {}
    prompt = get_prompt("citation", default_prompts.CITATION)
    r = _openai_eval(prompt.format(context=context[:3000], response=response[:2000], query=""))
    return {"label": str(r.get("label", "unfaithful")), "score": float(r.get("score", 0.0)),
            "explanation": str(r.get("explanation", ""))} if r else {}


def eval_tool_calling(query: str, context: str) -> dict:
    if not context:
        return {}
    prompt = get_prompt("tool_calling", default_prompts.TOOL_CALLING)
    r = _openai_eval(prompt.format(query=query[:1000], context=context[:1000], response=""))
    return {"label": str(r.get("label", "inappropriate")), "score": float(r.get("score", 0.0)),
            "explanation": str(r.get("explanation", ""))} if r else {}


# ── Eval pipeline ─────────────────────────────────────────────────────────

TRACE_EVALS = {"qa_correctness", "banned_word", "tool_calling"}
SPAN_LLM_EVALS = {"hallucination", "citation"}
SPAN_RETRIEVER_EVALS = {"rag_relevance"}
ALL_ANNOTATIONS = TRACE_EVALS | SPAN_LLM_EVALS | SPAN_RETRIEVER_EVALS


def _run_trace_evals(
    root_id: str, query: str, response: str, context: str,
    missing: set[str], qa_eval: QAEvaluator, project: str,
    root_span_data: dict | None = None,
) -> None:
    """Trace-level evals on root span."""
    if "banned_word" in missing and response:
        r = eval_banned_word(response)
        phoenix_upload_annotation(root_id, "banned_word", "CODE", r["label"], r["score"], r.get("explanation", ""))

    if "qa_correctness" in missing and query and response:
        try:
            ref = context or response  # Use context if available, else self-reference
            df = pd.DataFrame([{"context.span_id": root_id, "input": query, "output": response, "reference": ref}]).set_index("context.span_id")
            (result,) = run_evals(evaluators=[qa_eval], dataframe=df[["input", "output", "reference"]], provide_explanation=True, concurrency=1)
            if result is not None and not result.empty:
                row = result.iloc[0]
                phoenix_upload_annotation(root_id, "qa_correctness", "LLM",
                    str(row.get("label", "")), float(row.get("score", 0)), str(row.get("explanation", "")))
        except Exception as e:
            logger.error("[%s] qa_correctness failed: %s", project, e)

    if "tool_calling" in missing and query and context:
        r = eval_tool_calling(query, context)
        if r:
            phoenix_upload_annotation(root_id, "tool_calling", "LLM", r["label"], r["score"], r.get("explanation", ""))

    # ── Custom evals (from dashboard) ──
    for eval_name in missing - BUILT_IN_EVALS:
        edef = get_eval_def(eval_name)
        if not edef:
            continue
        try:
            if edef.eval_type == "code_rule" and edef.rule_config:
                r = _eval_code_rule(edef.rule_config, query, response, context, root_span_data)
                if r:
                    phoenix_upload_annotation(root_id, eval_name, "CODE", r["label"], r["score"], r.get("explanation", ""))
            elif edef.eval_type == "llm_prompt" and edef.template:
                prompt = edef.template.format(
                    context=context[:2000] if context else "(no context)",
                    response=response[:2000] if response else "(no response)",
                    query=query[:1000] if query else "(no query)",
                )
                r = _openai_eval(prompt)
                if r:
                    phoenix_upload_annotation(root_id, eval_name, "LLM",
                        str(r.get("label", "")), float(r.get("score", 0)),
                        str(r.get("explanation", "")))
        except Exception as e:
            logger.error("[%s] custom eval '%s' failed: %s", project, eval_name, e)


def _run_llm_span_evals(
    span_id: str, response: str, context: str,
    missing: set[str], project: str,
) -> None:
    """Span-level evals on individual LLM spans."""
    if not context:
        return

    if "hallucination" in missing and response:
        r = eval_hallucination(response, context)
        if r:
            phoenix_upload_annotation(span_id, "hallucination", "LLM", r["label"], r["score"], r.get("explanation", ""))

    if "citation" in missing and response:
        r = eval_citation(response, context)
        if r:
            phoenix_upload_annotation(span_id, "citation", "LLM", r["label"], r["score"], r.get("explanation", ""))


def _run_retriever_span_evals(
    span_id: str, query: str, docs_output: str,
    missing: set[str], relevance_eval: RelevanceEvaluator, project: str,
) -> None:
    """Span-level evals on RETRIEVER spans."""
    if "rag_relevance" not in missing or not query or not docs_output:
        return
    try:
        docs = [d.strip() for d in docs_output.split("\n\n") if d.strip()][:5]
        if not docs:
            docs = [docs_output[:800]]
        rows = [{"idx": f"d{i}", "input": query, "reference": d[:800]} for i, d in enumerate(docs)]
        df = pd.DataFrame(rows).set_index("idx")
        (result,) = run_evals(evaluators=[relevance_eval], dataframe=df[["input", "reference"]], provide_explanation=False, concurrency=3)
        if result is not None and not result.empty:
            avg = float(result["score"].mean())
            n = int(result["score"].sum())
            phoenix_upload_annotation(span_id, "rag_relevance", "LLM",
                "relevant" if avg > 0.5 else "unrelated", avg, f"{n}/{len(result)} docs relevant")
    except Exception as e:
        logger.error("[%s] rag_relevance failed: %s", project, e)


def process_trace(
    trace_spans: list[dict], project: str,
    qa_eval: QAEvaluator, relevance_eval: RelevanceEvaluator,
) -> int:
    """Process one trace (group of spans with same trace_id). Returns eval count."""
    root = _find_root(trace_spans)
    if not root:
        return 0

    root_id = root["context"]["span_id"]
    root_input = str(root.get("attributes", {}).get("input.value", ""))
    root_output = str(root.get("attributes", {}).get("output.value", ""))

    query = _extract_query_from_input(root_input)
    response = _extract_text(root_output)

    if not query and not response:
        return 0

    # Aggregate all TOOL/RETRIEVER outputs as trace-level context
    trace_context = ""
    for s in trace_spans:
        kind = _get_span_kind(s)
        if kind in ("TOOL", "RETRIEVER") and s.get("attributes", {}).get("output.value"):
            out = _extract_text(str(s["attributes"]["output.value"]))
            if out:
                trace_context += out + "\n---\n"
    trace_context = trace_context.strip()

    # Also check for RAG-style injected context
    if not trace_context:
        trace_context = _extract_context_from_input(root_input)

    eval_count = 0

    # ── Level 1: Trace-level evals (on root span) ──
    existing = phoenix_get_annotations(project, [root_id])
    root_existing = existing.get(root_id, set())
    enabled = get_enabled_evals(project)
    # Custom evals run at trace level (on root span)
    custom_eval_names = enabled - BUILT_IN_EVALS
    trace_eval_set = (TRACE_EVALS | custom_eval_names) & enabled
    root_missing = (trace_eval_set - root_existing) | (REEVAL_ANNOTATIONS & trace_eval_set)

    if root_missing:
        logger.info("[%s] Trace eval %s (%d missing: %s)", project, root_id[:8], len(root_missing), ", ".join(root_missing))
        _run_trace_evals(root_id, query, response, trace_context, root_missing, qa_eval, project, root)
        eval_count += 1

    # ── Level 2: LLM span evals ──
    llm_spans = [s for s in trace_spans if _get_span_kind(s) == "LLM" and s.get("end_time")]
    # Prioritize: last LLM span first, then by context size
    llm_spans.sort(key=lambda s: s.get("end_time", ""), reverse=True)
    llm_budget = 0

    for span in llm_spans:
        if llm_budget >= MAX_LLM_EVALS_PER_TRACE:
            break

        sid = span["context"]["span_id"]
        span_output = _extract_text(str(span.get("attributes", {}).get("output.value", "")))
        if not span_output:
            continue

        # Determine context for this LLM span
        span_input = str(span.get("attributes", {}).get("input.value", ""))
        context = _extract_context_from_input(span_input)
        if not context:
            context = _aggregate_context_from_siblings(span, trace_spans)
        if not context:
            continue  # No context → skip hallucination/citation

        existing_span = phoenix_get_annotations(project, [sid])
        span_existing = existing_span.get(sid, set())
        span_missing = ((SPAN_LLM_EVALS & enabled) - span_existing) | (REEVAL_ANNOTATIONS & SPAN_LLM_EVALS)

        if span_missing:
            logger.info("[%s]   LLM span eval %s (%s)", project, sid[:8], ", ".join(span_missing))
            _run_llm_span_evals(sid, span_output, context, span_missing, project)
            llm_budget += 1
            eval_count += 1

    # ── Level 2: RETRIEVER span evals ──
    ret_spans = [s for s in trace_spans if _get_span_kind(s) == "RETRIEVER" and s.get("end_time")]

    for span in ret_spans:
        sid = span["context"]["span_id"]
        ret_input = str(span.get("attributes", {}).get("input.value", ""))
        ret_output = str(span.get("attributes", {}).get("output.value", ""))
        ret_query = _extract_text(ret_input) or query

        existing_ret = phoenix_get_annotations(project, [sid])
        ret_existing = existing_ret.get(sid, set())
        ret_missing = ((SPAN_RETRIEVER_EVALS & enabled) - ret_existing) | (REEVAL_ANNOTATIONS & SPAN_RETRIEVER_EVALS)

        if ret_missing and ret_output:
            logger.info("[%s]   RETRIEVER eval %s", project, sid[:8])
            _run_retriever_span_evals(sid, ret_query, _extract_text(ret_output), ret_missing, relevance_eval, project)
            eval_count += 1

    return eval_count


# ── Main loop ─────────────────────────────────────────────────────────────

def main() -> None:
    model = OpenAIModel(model="gpt-4o-mini", api_key=OPENAI_API_KEY)
    qa_eval = QAEvaluator(model)
    relevance_eval = RelevanceEvaluator(model)

    evaluated_traces: dict[str, set[str]] = {}  # project → set of trace_ids
    caches: dict[str, deque] = {}
    lookback = timedelta(days=30) if REEVAL_ANNOTATIONS else timedelta(minutes=5)
    last_checked = datetime.now(timezone.utc) - lookback

    logger.info("Eval worker started (phoenix=%s, interval=%ds, two-level eval)", PHOENIX_URL, POLL_INTERVAL)

    while True:
        time.sleep(POLL_INTERVAL)
        try:
            now = datetime.now(timezone.utc)
            projects = phoenix_get_projects()

            for project in projects:
                if project not in evaluated_traces:
                    evaluated_traces[project] = set()
                    caches[project] = deque(maxlen=MAX_CACHE)

                spans = phoenix_get_spans(project, last_checked - timedelta(seconds=30), now)
                if not spans:
                    continue

                # Filter completed spans only
                spans = [s for s in spans if s.get("end_time")]

                # Group by trace
                traces = _group_by_trace(spans)
                new_count = 0

                for trace_id, trace_spans in traces.items():
                    if trace_id in evaluated_traces[project]:
                        continue

                    # Only process if root span exists (trace is complete enough)
                    root = _find_root(trace_spans)
                    if not root or not root.get("end_time"):
                        continue

                    count = process_trace(trace_spans, project, qa_eval, relevance_eval)
                    if count > 0:
                        new_count += count

                    evaluated_traces[project].add(trace_id)
                    caches[project].append(trace_id)

                    if len(evaluated_traces[project]) > MAX_CACHE:
                        try:
                            evaluated_traces[project].discard(caches[project][0])
                        except IndexError:
                            pass

                if new_count > 0:
                    logger.info("[%s] Evaluated %d targets across traces", project, new_count)

            last_checked = now

        except Exception as e:
            logger.error("Eval loop error: %s", e, exc_info=True)


if __name__ == "__main__":
    if not OPENAI_API_KEY:
        logger.error("OPENAI_API_KEY is required")
        exit(1)
    main()
