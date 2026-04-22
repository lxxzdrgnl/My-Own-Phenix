import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

export interface LlmRequest {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  responseFormat?: "json" | "text";
}

export interface LlmResponse {
  content: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

const MODEL_PROVIDER_MAP: Record<string, string> = {
  "gpt-": "openai",
  "o1": "openai",
  "o3": "openai",
  "o4": "openai",
  "claude-": "anthropic",
  "gemini-": "google",
  "grok-": "xai",
};

export function getProviderForModel(modelId: string): string {
  for (const [prefix, provider] of Object.entries(MODEL_PROVIDER_MAP)) {
    if (modelId.startsWith(prefix)) return provider;
  }
  return "openai";
}

async function getApiKey(provider: string): Promise<string> {
  const record = await prisma.llmProvider.findUnique({ where: { provider } });
  if (!record || !record.isActive) {
    throw new Error(`No active API key for provider "${provider}". Add one in Settings > Providers.`);
  }
  return decrypt(record.apiKey);
}

async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  req: LlmRequest,
): Promise<LlmResponse> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.7,
  };
  if (req.responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

  return {
    content: data.choices?.[0]?.message?.content ?? "",
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    },
  };
}

async function callAnthropic(apiKey: string, req: LlmRequest): Promise<LlmResponse> {
  const systemMsgs = req.messages.filter((m) => m.role === "system");
  const otherMsgs = req.messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: 4096,
    messages: otherMsgs.map((m) => ({ role: m.role, content: m.content })),
    temperature: req.temperature ?? 0.7,
  };
  if (systemMsgs.length > 0) {
    body.system = systemMsgs.map((m) => m.content).join("\n");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

  const content = data.content?.map((c: { text: string }) => c.text).join("") ?? "";
  return {
    content,
    usage: {
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
      totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
    },
  };
}

async function callGoogle(apiKey: string, req: LlmRequest): Promise<LlmResponse> {
  const systemMsgs = req.messages.filter((m) => m.role === "system");
  const otherMsgs = req.messages.filter((m) => m.role !== "system");

  const contents = otherMsgs.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { temperature: req.temperature ?? 0.7 },
  };
  if (systemMsgs.length > 0) {
    body.systemInstruction = { parts: [{ text: systemMsgs.map((m) => m.content).join("\n") }] };
  }
  if (req.responseFormat === "json") {
    (body.generationConfig as Record<string, unknown>).responseMimeType = "application/json";
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

  const content = data.candidates?.[0]?.content?.parts?.map((p: { text: string }) => p.text).join("") ?? "";
  return {
    content,
    usage: {
      promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
    },
  };
}

export async function callLlm(req: LlmRequest): Promise<LlmResponse> {
  const provider = getProviderForModel(req.model);
  const apiKey = await getApiKey(provider);

  switch (provider) {
    case "openai":
      return callOpenAICompatible("https://api.openai.com/v1", apiKey, req);
    case "anthropic":
      return callAnthropic(apiKey, req);
    case "google":
      return callGoogle(apiKey, req);
    case "xai":
      return callOpenAICompatible("https://api.x.ai/v1", apiKey, req);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export async function getActiveProviders(): Promise<string[]> {
  const providers = await prisma.llmProvider.findMany({
    where: { isActive: true },
    select: { provider: true },
  });
  return providers.map((p) => p.provider);
}
