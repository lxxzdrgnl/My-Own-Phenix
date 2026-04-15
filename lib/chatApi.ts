import { Client, ThreadState } from "@langchain/langgraph-sdk";
import {
  LangChainMessage,
  LangGraphCommand,
} from "@assistant-ui/react-langgraph";

// ── LangGraph adapter ────────────────────────────────────────────────────

const createClient = (endpoint?: string) => {
  const apiUrl =
    endpoint ||
    process.env["NEXT_PUBLIC_LANGGRAPH_API_URL"] ||
    new URL("/api", window.location.href).href;
  return new Client({ apiUrl });
};

export const createThread = async (endpoint?: string) => {
  const client = createClient(endpoint);
  return client.threads.create();
};

export const getThreadState = async (
  threadId: string,
): Promise<ThreadState<{ messages: LangChainMessage[] }>> => {
  const client = createClient();
  return client.threads.getState(threadId);
};

export const sendMessage = async (params: {
  threadId: string;
  messages?: LangChainMessage[];
  command?: LangGraphCommand | undefined;
  project?: string;
  endpoint?: string;
  assistantId?: string;
}) => {
  const client = createClient(params.endpoint);
  const aid =
    params.assistantId || process.env["NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID"];

  if (!aid) {
    throw new Error(
      "Missing assistant ID. Set NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID or configure it per-project in Agent Settings.",
    );
  }

  return client.runs.stream(
    params.threadId,
    aid,
    {
      input: params.messages?.length
        ? { messages: params.messages }
        : null,
      command: params.command,
      streamMode: ["messages"],
      ...(params.project && params.project !== "default"
        ? { config: { configurable: { project_name: params.project } }, metadata: { project_name: params.project } }
        : {}),
    },
  );
};

// ── REST SSE adapter ─────────────────────────────────────────────────────

export const createThreadRest = async () => {
  // REST agents don't have server-side threads — generate a local ID
  return { thread_id: `rest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
};

/**
 * Send a message to a REST SSE agent and return an async generator
 * that yields events in the same format as LangGraph SDK.
 */
export async function* sendMessageRest(params: {
  endpoint: string;
  threadId: string;
  messages?: LangChainMessage[];
  project?: string;
}): AsyncGenerator<{ event: string; data: unknown }> {
  const lastMsg = params.messages?.[params.messages.length - 1];
  const userContent =
    typeof lastMsg?.content === "string"
      ? lastMsg.content
      : "";

  const response = await fetch(`${params.endpoint}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: (params.messages ?? []).map((m) => ({
        role: "type" in m ? (m.type === "human" ? "user" : "assistant") : "user",
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      })),
      thread_id: params.threadId,
      project: params.project,
    }),
  });

  if (!response.ok) {
    throw new Error(`Agent returned ${response.status}: ${await response.text()}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;

      try {
        const parsed = JSON.parse(raw);

        // Handle different SSE formats from agents
        if (parsed.event === "messages/partial" || parsed.event === "messages/complete") {
          // Already in LangGraph format
          yield parsed;
          continue;
        }

        // Generic format: { content: "chunk" } or { delta: "chunk" }
        const chunk = parsed.content ?? parsed.delta ?? parsed.text ?? "";
        if (chunk) {
          fullContent += chunk;
          yield {
            event: "messages/partial",
            data: [{ type: "ai", content: fullContent }],
          };
        }

        // Done event
        if (parsed.event === "done" || parsed.done === true) {
          yield {
            event: "messages/complete",
            data: [{ type: "ai", content: fullContent }],
          };
        }
      } catch {
        // Non-JSON line, try as plain text chunk
        if (raw) {
          fullContent += raw;
          yield {
            event: "messages/partial",
            data: [{ type: "ai", content: fullContent }],
          };
        }
      }
    }
  }

  // Ensure a final complete event
  if (fullContent) {
    yield {
      event: "messages/complete",
      data: [{ type: "ai", content: fullContent }],
    };
  }
}
