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

const PROJECT_ID = "UHJvamVjdDox";

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

export async function fetchTraces(): Promise<Trace[]> {
  const query = `{
    node(id: "${PROJECT_ID}") {
      ... on Project {
        spans(first: 50, sort: { col: startTime, dir: desc }, filterCondition: "span_kind == \\"LLM\\"") {
          edges {
            node {
              name
              context { spanId traceId }
              parentId
              startTime
              latencyMs
              input { value }
              output { value }
              spanAnnotations { name label score }
            }
          }
        }
      }
    }
  }`;

  const res = await fetch("/api/phoenix?path=/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  const spans = data.data?.node?.spans?.edges?.map((e: any) => e.node) ?? [];

  return spans
    .filter((s: any) => {
      const input = s.input?.value ?? "";
      return input.includes("<context>") && input.includes("<question>");
    })
    .map((s: any) => ({
      spanId: s.context.spanId,
      traceId: s.context.traceId,
      time: s.startTime,
      latency: s.latencyMs,
      query: extractTag(s.input?.value ?? "", "question"),
      context: extractTag(s.input?.value ?? "", "context"),
      response: extractResponse(s.output?.value ?? ""),
      annotations: s.spanAnnotations ?? [],
    }));
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
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  return {
    text: data.choices[0].message.content,
    tokens: data.usage?.total_tokens ?? 0,
  };
}
