export interface Trace {
  spanId: string;
  traceId: string;
  time: string;
  latency: number;
  query: string;
  context: string;
  response: string;
  annotations: Annotation[];
  // Span metadata for MEASURE metrics
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  status: string;
  spanKind: string;
}

export interface Annotation {
  name: string;
  label: string;
  score: number;
}

export interface PromptVersion {
  id: string;
  description: string;
  model_provider: string;
  model_name: string;
  template: {
    type: string;
    messages: { role: string; content: string | { type: string; text: string }[] }[];
  };
  template_format: string;
  invocation_parameters: {
    type: string;
    openai?: { temperature?: number };
  };
}

/** Normalize content that can be string or [{type, text}] array */
export function normalizeContent(content: string | { type: string; text: string }[]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => c.text).join("\n");
  return String(content ?? "");
}

export interface PromptInfo {
  id: string;
  name: string;
  description: string;
}

export interface ComparisonResult {
  label: string;
  text: string;
  tokens: number;
  loading: boolean;
  error?: string;
}

export interface Project {
  id: string;
  name: string;
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch("/api/phoenix?path=/v1/projects");
  const data = await res.json();
  const projects = (data.data ?? []).map((p: any) => ({ id: p.name, name: p.name }));

  // Apply saved order from localStorage (client-side only)
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("project_order");
      if (saved) {
        const order: string[] = JSON.parse(saved);
        projects.sort((a: Project, b: Project) => {
          const ai = order.indexOf(a.name);
          const bi = order.indexOf(b.name);
          if (ai === -1 && bi === -1) return 0;
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
      }
    } catch {}
  }
  return projects;
}

function extractTag(input: string, tag: string): string {
  try {
    const data = JSON.parse(input);
    for (const msg of data.messages?.[0] ?? []) {
      const content = msg.kwargs?.content ?? "";
      const m = content.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
      if (m) return m[1].trim();
    }
  } catch {}
  return "";
}

function extractResponse(output: string): string {
  try {
    return JSON.parse(output).generations[0][0].text;
  } catch {}
  return "";
}

// ─── Shared: fetch spans + annotations ─────────────────────────────────────

async function fetchSpansAndAnnotations(
  projectName: string,
  startTime?: string,
  endTime?: string,
): Promise<{ allSpans: any[]; annMap: Record<string, Annotation[]> }> {
  let spansUrl = `/api/phoenix?path=/v1/projects/${encodeURIComponent(projectName)}/spans&limit=1000`;
  if (startTime) spansUrl += `&start_time=${encodeURIComponent(startTime)}`;
  if (endTime) spansUrl += `&end_time=${encodeURIComponent(endTime)}`;

  const spansRes = await fetch(spansUrl);
  const spansData = await spansRes.json();
  const allSpans: any[] = spansData.data ?? [];

  // Fetch annotations in batches of 50
  const allIds = allSpans.map((s) => s.context?.span_id).filter(Boolean) as string[];
  const annMap: Record<string, Annotation[]> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < allIds.length; i += 50) chunks.push(allIds.slice(i, i + 50));

  await Promise.all(
    chunks.map((ids) => {
      const params = ids.map((id) => `span_ids=${id}`).join("&");
      return fetch(
        `/api/phoenix?path=/v1/projects/${encodeURIComponent(projectName)}/span_annotations&${params}&limit=1000`,
      )
        .then((r) => r.json())
        .then((data) => {
          for (const a of data.data ?? []) {
            if (!annMap[a.span_id]) annMap[a.span_id] = [];
            annMap[a.span_id].push({
              name: a.name,
              label: a.result?.label ?? "",
              score: a.result?.score ?? 0,
            });
          }
        })
        .catch(() => {});
    }),
  );

  return { allSpans, annMap };
}

/** Merge all annotations from a trace's spans into one list (deduped by name) */
function mergeTraceAnnotations(traceId: string, allSpans: any[], annMap: Record<string, Annotation[]>): Annotation[] {
  const traceSpanIds = allSpans
    .filter((s) => s.context?.trace_id === traceId)
    .sort((a, b) => (a.parent_id === null ? -1 : 1)) // root first
    .map((s) => s.context.span_id as string);

  const merged: Annotation[] = [];
  const seen = new Set<string>();
  for (const sid of traceSpanIds) {
    for (const ann of annMap[sid] ?? []) {
      if (!seen.has(ann.name)) {
        merged.push(ann);
        seen.add(ann.name);
      }
    }
  }
  return merged;
}

// ─── fetchTraces (flat list for stats/filters) ─────────────────────────────

export async function fetchTraces(
  projectName: string,
  spanKinds?: string,
  contentFilter?: string,
  startTime?: string,
  endTime?: string,
): Promise<Trace[]> {
  const { allSpans, annMap } = await fetchSpansAndAnnotations(projectName, startTime, endTime);

  // Default: only root spans (no parent). With explicit spanKinds, filter all spans.
  const kinds = spanKinds?.split(",").filter(Boolean) ?? [];
  let filtered = kinds.length > 0 && !kinds.includes("ALL")
    ? allSpans.filter((s) => kinds.includes(s.span_kind))
    : allSpans.filter((s) => s.parent_id === null);

  // Filter by content type
  if (contentFilter === "RAG") {
    filtered = filtered.filter((s) => {
      const input = s.attributes?.["input.value"] ?? "";
      return input.includes("<context>") && input.includes("<question>");
    });
  } else if (contentFilter === "PLAYGROUND") {
    filtered = filtered.filter((s) =>
      (s.attributes?.["metadata.source"] ?? "") === "playground"
    );
  }

  // Build root span lookup
  const rootByTrace: Record<string, any> = {};
  for (const s of allSpans) {
    if (s.parent_id === null) rootByTrace[s.context.trace_id] = s;
  }

  // Deduplicate by trace — if multiple spans from same trace, use root
  const seenTraces = new Set<string>();
  const results: Trace[] = [];

  for (const s of filtered) {
    const traceId = s.context.trace_id;
    if (seenTraces.has(traceId)) continue;
    seenTraces.add(traceId);

    // Use root span for query/response extraction when available
    const root = rootByTrace[traceId] ?? s;
    const sid = root.context.span_id;
    const input = root.attributes?.["input.value"] ?? "";
    const output = root.attributes?.["output.value"] ?? "";
    const isRAG = input.includes("<context>") && input.includes("<question>");

    let query: string;
    let context: string;
    let response: string;

    if (isRAG) {
      query = extractTag(input, "question");
      context = extractTag(input, "context");
      response = extractResponse(output);
    } else {
      // ── Extract query ──
      query = "";

      // 1. Plain text "Query: ..." format (dexter-style)
      const queryLineMatch = input.match(/^Query:\s*(.+)/m);
      if (queryLineMatch) {
        query = queryLineMatch[1].trim();
      }

      // 2. JSON formats
      if (!query) {
        try {
          const parsed = JSON.parse(input);
          // { messages: [{ type: "human", content }] } (LangGraph)
          if (Array.isArray(parsed?.messages)) {
            for (const msg of parsed.messages) {
              if ((msg?.type === "human" || msg?.role === "user") && msg?.content) {
                query = String(msg.content);
                break;
              }
              if (Array.isArray(msg)) {
                for (const m of msg) {
                  if (m?.id?.includes?.("HumanMessage") || m?.type === "human") {
                    query = m?.kwargs?.content || m?.content || "";
                    break;
                  }
                }
                if (query) break;
              }
            }
          }
          // [{ role: "user", content }] (OpenAI)
          if (!query && Array.isArray(parsed)) {
            const userMsg = parsed.find((m: any) => m.role === "user" || m.type === "human");
            if (userMsg?.content) query = String(userMsg.content);
          }
          // { input: "..." } or { query: "..." }
          if (!query && parsed?.input) query = String(parsed.input);
          if (!query && parsed?.query) query = String(parsed.query);
        } catch {}
      }

      if (!query) query = root.attributes?.["metadata.prompt_label"] || root.name || "(unknown)";

      // ── Extract context ──
      // 1. From plain text "Data retrieved from tool calls:" section
      context = "";
      const toolDataMarker = "Data retrieved from tool calls:";
      const toolIdx = input.indexOf(toolDataMarker);
      if (toolIdx >= 0) {
        let raw = input.slice(toolIdx + toolDataMarker.length).trim();
        // Cut off metadata sections
        const metaCut = raw.indexOf("## Tool Usage");
        if (metaCut >= 0) raw = raw.slice(0, metaCut).trim();
        context = raw;
      }

      // 2. From sibling TOOL/RETRIEVER spans
      if (!context) {
        const traceSpans = allSpans.filter((ts) => ts.context?.trace_id === traceId);
        const contextParts: string[] = [];
        for (const ts of traceSpans) {
          const kind = String(ts.attributes?.["openinference.span.kind"] ?? ts.span_kind ?? "").toUpperCase();
          if ((kind === "TOOL" || kind === "RETRIEVER") && ts.attributes?.["output.value"]) {
            const out = String(ts.attributes["output.value"]);
            if (out && out.length > 10) contextParts.push(out.slice(0, 2000));
          }
        }
        context = contextParts.join("\n---\n");
      }

      // ── Extract response ──
      response = "";
      try {
        const parsed = JSON.parse(output);
        // LangGraph output: { messages: [{ type: "ai", content: "..." }], docs: [...] }
        if (Array.isArray(parsed?.messages)) {
          const aiMsg = parsed.messages.find((m: any) => m.type === "ai" || m.role === "assistant");
          if (aiMsg?.content) response = String(aiMsg.content);
          // Also extract context from docs if available and context is empty
          if (!context && Array.isArray(parsed.docs)) {
            context = parsed.docs.map((d: any) => d.page_content ?? "").filter(Boolean).join("\n---\n");
          }
          // Also extract query from search_query
          if ((!query || query === root.name) && parsed.search_query) {
            query = String(parsed.search_query);
          }
        }
        // LangChain AIMessage: { kwargs: { content: "..." } }
        if (!response) {
          response = parsed?.kwargs?.content
            || parsed?.generations?.[0]?.[0]?.text
            || parsed?.output
            || parsed?.content
            || "";
        }
      } catch {}
      if (!response && output && !output.startsWith("{")) response = output;
      if (!response) response = output;
    }

    if (!query && !response) continue;

    results.push({
      spanId: sid,
      traceId,
      time: root.start_time,
      latency: root.end_time
        ? new Date(root.end_time).getTime() - new Date(root.start_time).getTime()
        : 0,
      query,
      context,
      response,
      annotations: mergeTraceAnnotations(traceId, allSpans, annMap),
      promptTokens: Number(root.attributes?.["llm.token_count.prompt"] ?? 0),
      completionTokens: Number(root.attributes?.["llm.token_count.completion"] ?? 0),
      totalTokens: Number(root.attributes?.["llm.token_count.total"] ?? 0),
      model: String(root.attributes?.["llm.model_name"] ?? ""),
      status: String(root.status_code ?? "OK"),
      spanKind: String(root.span_kind ?? ""),
    });
  }

  return results;
}

// ─── Raw Span Tree (for SpanTreeView) ───────────────────────────────────────

export interface RawSpan {
  spanId: string;
  traceId: string;
  parentId: string | null;
  name: string;
  spanKind: string;
  status: string;
  latency: number;
  input: string;
  output: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  annotations: Annotation[];
  children: RawSpan[];
}

export interface TraceTree {
  traceId: string;
  rootSpan: RawSpan;
  spanCount: number;
  latency: number;
  time: string;
}

function buildSpanTree(rawSpans: any[], annMap: Record<string, Annotation[]>): RawSpan[] {
  const spanMap = new Map<string, RawSpan>();
  const roots: RawSpan[] = [];

  // Create RawSpan objects
  for (const s of rawSpans) {
    const sid = s.context?.span_id ?? "";
    const attrs = s.attributes ?? {};
    const promptTokens = Number(attrs["llm.token_count.prompt"] ?? 0);
    const completionTokens = Number(attrs["llm.token_count.completion"] ?? 0);
    const totalTokens = Number(attrs["llm.token_count.total"] ?? 0);

    const span: RawSpan = {
      spanId: sid,
      traceId: s.context?.trace_id ?? "",
      parentId: s.parent_id ?? null,
      name: s.name ?? "",
      spanKind: String(attrs["openinference.span.kind"] ?? s.span_kind ?? ""),
      status: String(s.status_code ?? "OK"),
      latency: s.end_time && s.start_time
        ? new Date(s.end_time).getTime() - new Date(s.start_time).getTime()
        : 0,
      input: String(attrs["input.value"] ?? ""),
      output: String(attrs["output.value"] ?? ""),
      model: String(attrs["llm.model_name"] ?? ""),
      promptTokens,
      completionTokens,
      totalTokens,
      cost: 0,
      annotations: annMap[sid] ?? [],
      children: [],
    };
    spanMap.set(sid, span);
  }

  // Build tree
  for (const span of spanMap.values()) {
    if (span.parentId && spanMap.has(span.parentId)) {
      spanMap.get(span.parentId)!.children.push(span);
    } else {
      roots.push(span);
    }
  }

  // Merge all descendant annotations into root spans
  for (const root of roots) {
    const existing = new Set(root.annotations.map((a) => a.name));
    function collectAnnotations(node: RawSpan) {
      for (const ann of node.annotations) {
        if (!existing.has(ann.name)) {
          root.annotations.push(ann);
          existing.add(ann.name);
        }
      }
      for (const child of node.children) collectAnnotations(child);
    }
    for (const child of root.children) collectAnnotations(child);
  }

  return roots;
}

export async function fetchTraceTrees(
  projectName: string,
  startTime?: string,
  endTime?: string,
): Promise<TraceTree[]> {
  const { allSpans, annMap } = await fetchSpansAndAnnotations(projectName, startTime, endTime);

  // Group by trace
  const traceGroups: Record<string, any[]> = {};
  for (const s of allSpans) {
    const tid = s.context?.trace_id;
    if (tid) {
      if (!traceGroups[tid]) traceGroups[tid] = [];
      traceGroups[tid].push(s);
    }
  }

  // Build trees
  const trees: TraceTree[] = [];
  for (const [traceId, spans] of Object.entries(traceGroups)) {
    const roots = buildSpanTree(spans, annMap);
    if (roots.length === 0) continue;

    // Find the actual root (no parent)
    const root = roots.find((r) => r.parentId === null) ?? roots[0];
    const rootStart = spans.find((s) => s.parent_id === null)?.start_time;

    trees.push({
      traceId,
      rootSpan: root,
      spanCount: spans.length,
      latency: root.latency,
      time: rootStart ?? spans[0]?.start_time ?? "",
    });
  }

  // Sort by time descending
  trees.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return trees;
}

export async function fetchPrompts(): Promise<PromptInfo[]> {
  const res = await fetch("/api/phoenix?path=/v1/prompts");
  const data = await res.json();
  return data.data ?? [];
}

export async function fetchPromptVersions(
  name: string,
): Promise<PromptVersion[]> {
  const res = await fetch(
    `/api/phoenix?path=/v1/prompts/${encodeURIComponent(name)}/versions`,
  );
  const data = await res.json();
  return data.data ?? [];
}

// --- Prompt Tags ---

export interface PromptTag {
  name: string;
}

export async function fetchPromptVersionTags(
  versionId: string,
): Promise<PromptTag[]> {
  const res = await fetch(
    `/api/phoenix?path=/v1/prompt_versions/${encodeURIComponent(versionId)}/tags`,
  );
  const data = await res.json();
  return data.data ?? [];
}

export async function addPromptVersionTag(
  versionId: string,
  tagName: string,
): Promise<void> {
  const res = await fetch(
    `/api/phoenix?path=/v1/prompt_versions/${encodeURIComponent(versionId)}/tags`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: tagName }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
}

export async function deletePromptVersionTag(
  versionId: string,
  tagName: string,
): Promise<void> {
  const res = await fetch(
    `/api/phoenix?path=/v1/prompt_versions/${encodeURIComponent(versionId)}/tags/${encodeURIComponent(tagName)}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
}

// --- Prompt CRUD ---

export async function createPrompt(
  name: string,
  description: string,
  systemContent: string,
  userContent: string,
  modelName: string = "gpt-4o-mini",
  temperature: number = 0.7,
): Promise<void> {
  const res = await fetch("/api/phoenix?path=/v1/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: { name, description },
      version: {
        description: "v1",
        model_provider: "OPENAI",
        model_name: modelName,
        template_type: "CHAT",
        template: {
          type: "chat",
          messages: [
            { role: "system", content: systemContent },
            { role: "user", content: userContent },
          ],
        },
        template_format: "MUSTACHE",
        invocation_parameters: { type: "openai", openai: { temperature } },
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(JSON.stringify(err.detail ?? err));
  }
}

export async function updatePrompt(
  name: string,
  description: string,
  versionDesc: string,
  systemContent: string,
  userContent: string,
  modelName: string = "gpt-4o-mini",
  temperature: number = 0.7,
): Promise<void> {
  const res = await fetch("/api/phoenix?path=/v1/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: { name, description },
      version: {
        description: versionDesc,
        model_provider: "OPENAI",
        model_name: modelName,
        template_type: "CHAT",
        template: {
          type: "chat",
          messages: [
            { role: "system", content: systemContent },
            { role: "user", content: userContent },
          ],
        },
        template_format: "MUSTACHE",
        invocation_parameters: { type: "openai", openai: { temperature } },
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(JSON.stringify(err.detail ?? err));
  }
}

export async function deletePrompt(name: string): Promise<void> {
  const res = await fetch(
    `/api/phoenix?path=/v1/prompts/${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
}

export async function deleteTrace(traceId: string): Promise<void> {
  await fetch(
    `/api/phoenix?path=/v1/traces/${encodeURIComponent(traceId)}`,
    { method: "DELETE" },
  );
}

export async function callLLM(
  version: PromptVersion,
  query: string,
  context: string,
): Promise<{ text: string; tokens: number }> {
  const messages = (version.template?.messages ?? []).map((m) => ({
    role: m.role,
    content: normalizeContent(m.content)
      .replace(/\{\{query\}\}/g, query)
      .replace(/\{\{context\}\}/g, context),
  }));

  const params = version.invocation_parameters?.openai ?? {};

  const res = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: version.model_name || "gpt-4o-mini",
      messages,
      temperature: params.temperature ?? 0.7,
      promptLabel: version.description || version.id,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  return {
    text: data.choices[0].message.content,
    tokens: data.usage?.total_tokens ?? 0,
  };
}
