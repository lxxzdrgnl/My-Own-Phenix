export interface Trace {
  spanId: string;
  traceId: string;
  time: string;
  latency: number;
  query: string;
  context: string;
  response: string;
  annotations: Annotation[];
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
  return (data.data ?? []).map((p: any) => ({ id: p.name, name: p.name }));
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

export async function fetchTraces(projectName: string): Promise<Trace[]> {
  // 1. Get all spans
  const spansRes = await fetch(
    `/api/phoenix?path=/v1/projects/${encodeURIComponent(projectName)}/spans?limit=1000`,
  );
  const spansData = await spansRes.json();
  const allSpans: any[] = spansData.data ?? [];

  // 2. Find LLM spans with <context>/<question>
  const llmSpans = allSpans.filter((s) => {
    if (s.span_kind !== "LLM") return false;
    const input = s.attributes?.["input.value"] ?? "";
    return input.includes("<context>") && input.includes("<question>");
  });

  // 3. Find root spans (parent_id null) and build traceId -> rootSpanId map
  const rootMap: Record<string, string> = {};
  for (const s of allSpans) {
    if (s.parent_id === null) {
      rootMap[s.context.trace_id] = s.context.span_id;
    }
  }

  // 4. Build traces, fetch annotations per span individually
  const results: Trace[] = [];

  for (const s of llmSpans) {
    const sid = s.context.span_id;
    const rid = rootMap[s.context.trace_id];
    const input = s.attributes?.["input.value"] ?? "";
    const output = s.attributes?.["output.value"] ?? "";

    // Fetch LLM span annotations
    const annRes = await fetch(
      `/api/phoenix?path=/v1/projects/${encodeURIComponent(projectName)}/span_annotations&span_ids=${sid}`,
    );
    const annData = await annRes.json();
    const spanAnns: Annotation[] = (annData.data ?? []).map((a: any) => ({
      name: a.name,
      label: a.result?.label ?? "",
      score: a.result?.score ?? 0,
    }));

    // Fetch root span annotations (for rag_relevance etc)
    let rootAnns: Annotation[] = [];
    if (rid && rid !== sid) {
      const rootRes = await fetch(
        `/api/phoenix?path=/v1/projects/${encodeURIComponent(projectName)}/span_annotations&span_ids=${rid}`,
      );
      const rootData = await rootRes.json();
      rootAnns = (rootData.data ?? []).map((a: any) => ({
        name: a.name,
        label: a.result?.label ?? "",
        score: a.result?.score ?? 0,
      }));
    }

    // Merge: span first, then root-only
    const spanNames = new Set(spanAnns.map((a) => a.name));
    const merged = [...spanAnns, ...rootAnns.filter((a) => !spanNames.has(a.name))];

    results.push({
      spanId: sid,
      traceId: s.context.trace_id,
      time: s.start_time,
      latency: s.end_time
        ? new Date(s.end_time).getTime() - new Date(s.start_time).getTime()
        : 0,
      query: extractTag(input, "question"),
      context: extractTag(input, "context"),
      response: extractResponse(output),
      annotations: merged,
    });
  }

  return results;
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
): Promise<void> {
  const res = await fetch("/api/phoenix?path=/v1/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: { name, description },
      version: {
        description: "v1",
        model_provider: "OPENAI",
        model_name: "gpt-4o-mini",
        template_type: "CHAT",
        template: {
          type: "chat",
          messages: [
            { role: "system", content: systemContent },
            { role: "user", content: userContent },
          ],
        },
        template_format: "MUSTACHE",
        invocation_parameters: { type: "openai", openai: { temperature: 0.7 } },
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
): Promise<void> {
  const res = await fetch("/api/phoenix?path=/v1/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: { name, description },
      version: {
        description: versionDesc,
        model_provider: "OPENAI",
        model_name: "gpt-4o-mini",
        template_type: "CHAT",
        template: {
          type: "chat",
          messages: [
            { role: "system", content: systemContent },
            { role: "user", content: userContent },
          ],
        },
        template_format: "MUSTACHE",
        invocation_parameters: { type: "openai", openai: { temperature: 0.7 } },
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
  const res = await fetch(
    `/api/phoenix?path=/v1/traces/${encodeURIComponent(traceId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
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
