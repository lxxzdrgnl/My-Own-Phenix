import { Client, ThreadState } from "@langchain/langgraph-sdk";
import {
  LangChainMessage,
  LangGraphCommand,
} from "@assistant-ui/react-langgraph";

const createClient = (endpoint?: string) => {
  const apiUrl =
    endpoint ||
    process.env["NEXT_PUBLIC_LANGGRAPH_API_URL"] ||
    new URL("/api", window.location.href).href;
  return new Client({
    apiUrl,
  });
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
        ? {
            messages: params.messages,
          }
        : null,
      command: params.command,
      streamMode: ["messages"],
      ...(params.project && params.project !== "default"
        ? { config: { configurable: { project_name: params.project } }, metadata: { project_name: params.project } }
        : {}),
    },
  );
};
