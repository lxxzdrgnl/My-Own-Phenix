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

export async function fetchTraces(
  projectName: string,
  spanKinds?: string,
  contentFilter?: string,
): Promise<Trace[]> {
  // 1. Get all spans
  const spansRes = await fetch(
    `/api/phoenix?path=/v1/projects/${encodeURIComponent(projectName)}/spans&limit=1000`,
  );
  const spansData = await spansRes.json();
  const allSpans: any[] = spansData.data ?? [];

  // 2. Filter by span kind(s) - comma-separated for multi-select
  const kinds = spanKinds?.split(",").filter(Boolean) ?? [];
  let filtered = kinds.length > 0 && !kinds.includes("ALL")
    ? allSpans.filter((s) => kinds.includes(s.span_kind))
    : allSpans;

  // 3. Filter by content type
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

  // 3. Find root spans (parent_id null) and build traceId -> rootSpanId map
  const rootMap: Record<string, string> = {};
  for (const s of allSpans) {
    if (s.parent_id === null) {
      rootMap[s.context.trace_id] = s.context.span_id;
    }
  }

  // 4. Collect all span IDs we need annotations for
  const allIds = new Set<string>();
  for (const s of filtered) {
    allIds.add(s.context.span_id);
    const rid = rootMap[s.context.trace_id];
    if (rid) allIds.add(rid);
  }

  // 5. Fetch annotations per span in parallel
  const annMap: Record<string, Annotation[]> = {};
  await Promise.all(
    [...allIds].map((sid) =>
      fetch(
        `/api/phoenix?path=/v1/projects/${encodeURIComponent(projectName)}/span_annotations&span_ids=${sid}`,
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
        .catch(() => {}),
    ),
  );

  // 6. Build traces
  const results: Trace[] = [];

  for (const s of filtered) {
    const sid = s.context.span_id;
    const rid = rootMap[s.context.trace_id];
    const input = s.attributes?.["input.value"] ?? "";
    const output = s.attributes?.["output.value"] ?? "";
    const isRAG = input.includes("<context>") && input.includes("<question>");

    let query: string;
    let context: string;
    let response: string;

    if (isRAG) {
      query = extractTag(input, "question");
      context = extractTag(input, "context");
      response = extractResponse(output);
    } else {
      try {
        const msgs = JSON.parse(input);
        const userMsg = Array.isArray(msgs)
          ? msgs.find((m: any) => m.role === "user")?.content ?? ""
          : "";
        query = userMsg || s.attributes?.["metadata.prompt_label"] || s.name || "(unknown)";
      } catch {
        query = s.attributes?.["metadata.prompt_label"] || s.name || "(unknown)";
      }
      context = "";
      response = typeof output === "string" && !output.startsWith("{") ? output : (() => {
        try { return JSON.parse(output)?.generations?.[0]?.[0]?.text ?? output; } catch { return output; }
      })();
    }

    if (!query && !response) continue;

    const spanAnns = annMap[sid] ?? [];
    const rootAnns = rid ? (annMap[rid] ?? []) : [];
    const spanNames = new Set(spanAnns.map((a) => a.name));
    const merged = [...spanAnns, ...rootAnns.filter((a) => !spanNames.has(a.name))];

    results.push({
      spanId: sid,
      traceId: s.context.trace_id,
      time: s.start_time,
      latency: s.end_time
        ? new Date(s.end_time).getTime() - new Date(s.start_time).getTime()
        : 0,
      query,
      context,
      response,
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
