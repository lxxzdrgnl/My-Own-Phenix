import { NextRequest, NextResponse } from "next/server";

const PHOENIX_URL = process.env.PHOENIX_URL ?? process.env.PHOENIX_COLLECTOR_ENDPOINT ?? "http://localhost:6006";

/**
 * POST /api/langsmith/runs/batch
 *
 * Receives LangSmith-format run data and converts to Phoenix span annotations.
 * This allows any LangChain app with LANGSMITH_TRACING=true to send traces
 * to Phoenix without code changes — just point LANGSMITH_ENDPOINT here.
 *
 * LangSmith run format:
 * { post: [...runs], patch: [...runs] }
 * Each run: { id, name, run_type, inputs, outputs, start_time, end_time,
 *             parent_run_id, session_name, extra, ... }
 */

interface LangSmithRun {
  id: string;
  name?: string;
  run_type?: string; // "llm" | "chain" | "tool" | "retriever"
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  start_time?: string;
  end_time?: string;
  parent_run_id?: string | null;
  session_name?: string; // = project name
  extra?: {
    metadata?: Record<string, unknown>;
    runtime?: Record<string, unknown>;
  };
  trace_id?: string; // Root run ID — all runs in same execution share this
  dotted_order?: string;
  error?: string;
  tags?: string[];
  serialized?: Record<string, unknown>;
  // Token usage fields
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

function extractTokens(run: LangSmithRun): { prompt: number; completion: number; total: number } {
  // Try direct fields
  if (run.prompt_tokens || run.completion_tokens || run.total_tokens) {
    return {
      prompt: run.prompt_tokens ?? 0,
      completion: run.completion_tokens ?? 0,
      total: run.total_tokens ?? 0,
    };
  }
  // Try outputs.llm_output.token_usage
  const llmOutput = (run.outputs as Record<string, unknown>)?.llm_output as Record<string, unknown> | undefined;
  const tokenUsage = llmOutput?.token_usage as Record<string, number> | undefined;
  if (tokenUsage) {
    return {
      prompt: tokenUsage.prompt_tokens ?? 0,
      completion: tokenUsage.completion_tokens ?? 0,
      total: tokenUsage.total_tokens ?? 0,
    };
  }
  return { prompt: 0, completion: 0, total: 0 };
}

function extractInput(run: LangSmithRun): string {
  if (!run.inputs) return "";
  // LangChain messages format
  const msgs = run.inputs.messages ?? run.inputs.input;
  if (Array.isArray(msgs)) {
    const last = msgs[msgs.length - 1];
    if (typeof last === "string") return last;
    if (last?.content) return String(last.content);
    if (Array.isArray(last) && last.length > 0) {
      const msg = last[last.length - 1];
      return msg?.content ?? msg?.kwargs?.content ?? JSON.stringify(msg).slice(0, 2000);
    }
  }
  if (run.inputs.prompt) return String(run.inputs.prompt);
  if (run.inputs.input) return String(run.inputs.input);
  return JSON.stringify(run.inputs).slice(0, 2000);
}

function extractOutput(run: LangSmithRun): string {
  if (!run.outputs) return "";
  const gen = run.outputs.generations;
  if (Array.isArray(gen) && gen.length > 0) {
    const first = Array.isArray(gen[0]) ? gen[0][0] : gen[0];
    if (first?.text) return String(first.text);
    if (first?.message?.content) return String(first.message.content);
  }
  if (run.outputs.output) return String(run.outputs.output);
  if (run.outputs.content) return String(run.outputs.content);
  return JSON.stringify(run.outputs).slice(0, 2000);
}

function runTypeToSpanKind(runType?: string): string {
  switch (runType) {
    case "llm": return "LLM";
    case "retriever": return "RETRIEVER";
    case "tool": return "TOOL";
    case "chain": return "CHAIN";
    default: return "CHAIN";
  }
}

function extractModelName(run: LangSmithRun): string {
  const serialized = run.serialized ?? run.extra?.metadata;
  if (serialized) {
    const model = (serialized as Record<string, unknown>).model_name
      ?? (serialized as Record<string, unknown>).model
      ?? (serialized as Record<string, unknown>).ls_model_name;
    if (model) return String(model);
  }
  // Try extra.invocation_params
  const invocation = (run.extra as Record<string, unknown>)?.invocation_params as Record<string, unknown> | undefined;
  if (invocation?.model) return String(invocation.model);
  if (invocation?.model_name) return String(invocation.model_name);
  return "";
}

async function sendToPhoenix(runs: LangSmithRun[]) {
  // Group by session_name (project)
  const byProject: Record<string, LangSmithRun[]> = {};
  for (const run of runs) {
    const project = run.session_name ?? "default";
    (byProject[project] ??= []).push(run);
  }

  for (const [project, projectRuns] of Object.entries(byProject)) {
    const spans = projectRuns.map((run) => {
      const spanKind = runTypeToSpanKind(run.run_type);
      const tokens = extractTokens(run);
      const input = extractInput(run);
      const output = extractOutput(run);
      const model = extractModelName(run);
      const runId = run.id.replace(/-/g, "");
      const parentId = run.parent_run_id?.replace(/-/g, "") ?? null;
      // trace_id from LangSmith SDK = root run ID, shared by all runs in one execution
      const traceId = (run.trace_id ?? run.id).replace(/-/g, "");

      return {
        name: run.name ?? run.run_type ?? "unknown",
        span_kind: spanKind,
        start_time: run.start_time ?? new Date().toISOString(),
        end_time: run.end_time ?? run.start_time ?? new Date().toISOString(),
        status_code: run.error ? "ERROR" : "OK",
        status_message: run.error ?? "",
        context: {
          span_id: runId.slice(0, 16),
          trace_id: traceId.slice(0, 16).padStart(32, "0"),
        },
        parent_id: parentId ? parentId.slice(0, 16) : null,
        attributes: {
          "openinference.span.kind": spanKind,
          "input.value": input,
          "output.value": output,
          ...(model && { "llm.model_name": model }),
          ...(tokens.prompt && { "llm.token_count.prompt": tokens.prompt }),
          ...(tokens.completion && { "llm.token_count.completion": tokens.completion }),
          ...(tokens.total && { "llm.token_count.total": tokens.total }),
        },
        events: [],
      };
    });

    try {
      const res = await fetch(`${PHOENIX_URL}/v1/projects/${encodeURIComponent(project)}/spans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: spans }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`[langsmith-proxy] Phoenix ${res.status}: ${text}`);
      }
    } catch (e) {
      console.error(`[langsmith-proxy] Failed to send to Phoenix:`, e);
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const postRuns: LangSmithRun[] = body.post ?? [];
    const patchRuns: LangSmithRun[] = body.patch ?? [];

    // Process in background, return 200 immediately
    const allRuns = [...postRuns, ...patchRuns];
    if (allRuns.length > 0) {
      // Fire and forget
      sendToPhoenix(allRuns).catch((e) =>
        console.error("[langsmith-proxy] Error:", e),
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[langsmith-proxy] Parse error:", e);
    return NextResponse.json({ success: true }); // Don't fail the SDK
  }
}
