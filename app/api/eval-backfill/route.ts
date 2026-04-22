import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { callLlm } from "@/lib/llm-providers";
import { requireAuth } from "@/lib/auth-server";
import { PASS_LABELS } from "@/lib/constants";

const PHOENIX = process.env.PHOENIX_URL ?? "http://localhost:6006";

// ── Helpers ──

async function phoenixGetSpans(project: string, startTime: string, endTime: string) {
  const params = new URLSearchParams({ limit: "200", start_time: startTime, end_time: endTime });
  const res = await fetch(`${PHOENIX}/v1/projects/${project}/spans?${params}`, { signal: AbortSignal.timeout(15000) });
  const data = await res.json();
  return (data.data ?? []) as Record<string, unknown>[];
}

async function phoenixGetAnnotations(project: string, spanIds: string[]): Promise<Record<string, Set<string>>> {
  if (!spanIds.length) return {};
  const params = new URLSearchParams();
  spanIds.slice(0, 100).forEach((id) => params.append("span_ids", id));
  params.set("limit", "1000");
  const res = await fetch(`${PHOENIX}/v1/projects/${project}/span_annotations?${params}`, { signal: AbortSignal.timeout(10000) });
  const data = await res.json();
  const result: Record<string, Set<string>> = {};
  for (const a of data.data ?? []) {
    if (!result[a.span_id]) result[a.span_id] = new Set();
    result[a.span_id].add(a.name);
  }
  return result;
}

async function phoenixUploadAnnotation(spanId: string, name: string, kind: string, label: string, score: number, explanation: string) {
  await fetch(`${PHOENIX}/v1/span_annotations?sync=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [{ span_id: spanId, name, annotator_kind: kind, result: { label, score, explanation } }],
    }),
    signal: AbortSignal.timeout(10000),
  });
}

async function llmEval(messages: { role: string; content: string }[], model: string): Promise<Record<string, unknown>> {
  try {
    const result = await callLlm({
      model,
      messages,
      temperature: 0,
      responseFormat: "json",
    });
    return JSON.parse(result.content || "{}");
  } catch {
    return {};
  }
}

function extractText(raw: string): string {
  if (!raw) return "";
  try {
    const data = JSON.parse(raw);
    if (data.generations) return data.generations[0]?.[0]?.text ?? "";
    if (data.messages) {
      const msgs = Array.isArray(data.messages[0]) ? data.messages[0] : data.messages;
      for (const m of msgs) {
        const c = m?.kwargs?.content || m?.content;
        if (c) return String(c).slice(0, 3000);
      }
    }
    if (data.content) return String(data.content).slice(0, 3000);
    if (data.output) return String(data.output).slice(0, 3000);
  } catch { /* not JSON */ }
  return raw.slice(0, 3000);
}

function extractQuery(raw: string): string {
  try {
    const data = JSON.parse(raw);
    const msgs = data.messages;
    if (Array.isArray(msgs)) {
      const flat = Array.isArray(msgs[0]) ? msgs[0] : msgs;
      for (const m of flat) {
        const role = m?.role || m?.type || "";
        const id = String(m?.id ?? "");
        if (role === "user" || role === "human" || id.includes("HumanMessage")) {
          return (m?.kwargs?.content || m?.content || "").slice(0, 2000);
        }
      }
    }
    if (data.input) return String(data.input).slice(0, 2000);
  } catch { /* not JSON */ }
  return raw.slice(0, 2000);
}

function extractContext(raw: string): string {
  try {
    const data = JSON.parse(raw);
    const msgs = data.messages;
    if (Array.isArray(msgs)) {
      const flat = Array.isArray(msgs[0]) ? msgs[0] : msgs;
      for (const m of flat) {
        const content = m?.kwargs?.content || m?.content || "";
        const ctxMatch = content.match(/<context>([\s\S]*?)<\/context>/);
        if (ctxMatch) return ctxMatch[1].trim();
      }
    }
  } catch { /* not JSON */ }
  return "";
}

function splitPromptForSystem(template: string): { system: string | null; user: string } {
  const lines = template.split("\n");
  const dataStart = lines.findIndex((l) => ["CONTEXT:", "QUERY:", "RESPONSE:"].includes(l.trim()));
  if (dataStart <= 0) return { system: null, user: template };
  return { system: lines.slice(0, dataStart).join("\n").trim(), user: lines.slice(dataStart).join("\n").trim() };
}

// ── POST /api/eval-backfill ──

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { projectId, evalName, startDate, endDate } = (await req.json()) as {
    projectId: string;
    evalName: string;
    startDate: string;
    endDate: string;
  };

  if (!projectId || !evalName || !startDate || !endDate) {
    return NextResponse.json({ error: "projectId, evalName, startDate, endDate required" }, { status: 400 });
  }
  // Load eval definition
  const evalPrompt = await prisma.evalPrompt.findFirst({
    where: { name: evalName, OR: [{ projectId: null }, { projectId: "" }, { projectId }] },
  });
  if (!evalPrompt || !evalPrompt.template) {
    return NextResponse.json({ error: `Eval "${evalName}" not found or has no template` }, { status: 404 });
  }

  const startTime = new Date(startDate).toISOString();
  const endTime = new Date(endDate + "T23:59:59Z").toISOString();
  const outputMode = evalPrompt.outputMode ?? "score";

  // Fetch spans
  const spans = await phoenixGetSpans(projectId, startTime, endTime);
  if (!spans.length) {
    return NextResponse.json({ evaluated: 0, skipped: 0, message: "No spans found in date range" });
  }

  // Group by trace, find root spans
  const traces: Record<string, Record<string, unknown>[]> = {};
  for (const s of spans) {
    const tid = (s.context as Record<string, string>)?.trace_id;
    if (tid) {
      if (!traces[tid]) traces[tid] = [];
      traces[tid].push(s);
    }
  }

  // Get existing annotations for root spans
  const rootSpans: Record<string, Record<string, unknown>> = {};
  for (const [tid, tspans] of Object.entries(traces)) {
    const root = tspans.find((s) => s.parent_id === null || s.parent_id === undefined);
    if (root) rootSpans[tid] = root;
  }
  const rootIds = Object.values(rootSpans).map((s) => (s.context as Record<string, string>).span_id);
  const existing = await phoenixGetAnnotations(projectId, rootIds);

  let evaluated = 0;
  let skipped = 0;

  for (const [tid, root] of Object.entries(rootSpans)) {
    const spanId = (root.context as Record<string, string>).span_id;
    const existingAnns = existing[spanId];
    if (existingAnns?.has(evalName)) {
      skipped++;
      continue;
    }

    const attrs = (root.attributes ?? {}) as Record<string, unknown>;
    const rawInput = String(attrs["input.value"] ?? "");
    const rawOutput = String(attrs["output.value"] ?? "");
    const query = extractQuery(rawInput);
    const response = extractText(rawOutput);

    if (!query && !response) {
      skipped++;
      continue;
    }

    // Aggregate context from sibling TOOL/RETRIEVER spans
    let context = extractContext(rawInput);
    if (!context) {
      const siblings = traces[tid] ?? [];
      const parts: string[] = [];
      for (const s of siblings) {
        const kind = String((s.attributes as Record<string, unknown>)?.["openinference.span.kind"] ?? s.span_kind ?? "").toUpperCase();
        if (kind === "TOOL" || kind === "RETRIEVER") {
          const out = String((s.attributes as Record<string, unknown>)?.["output.value"] ?? "");
          if (out) parts.push(extractText(out));
        }
      }
      context = parts.join("\n---\n");
    }

    // Run eval
    try {
      const filled = evalPrompt.template
        .replace(/\{context\}/g, context?.slice(0, 2000) || "(no context)")
        .replace(/\{response\}/g, response?.slice(0, 2000) || "(no response)")
        .replace(/\{query\}/g, query?.slice(0, 1000) || "(no query)");

      const { system, user } = splitPromptForSystem(filled);
      const messages: { role: string; content: string }[] = [];
      if (system) messages.push({ role: "system", content: system });
      messages.push({ role: "user", content: user });

      const r = await llmEval(messages, evalPrompt.model ?? "gpt-4o-mini");
      if (r && r.label) {
        const label = String(r.label);
        let score: number;
        if (outputMode === "binary" || r.score === undefined) {
          score = PASS_LABELS.has(label.toLowerCase()) ? 1.0 : 0.0;
        } else {
          score = Number(r.score) || 0;
        }
        await phoenixUploadAnnotation(spanId, evalName, "LLM", label, score, String(r.explanation ?? ""));
        evaluated++;
      } else {
        skipped++;
      }
    } catch (e) {
      console.error(`Backfill eval "${evalName}" failed for span ${spanId}:`, e);
      skipped++;
    }
  }

  return NextResponse.json({ evaluated, skipped, total: Object.keys(rootSpans).length });
}
