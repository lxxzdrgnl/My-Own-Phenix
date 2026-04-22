// Pass/fail label classification
export const PASS_LABELS = new Set([
  "pass", "true", "yes", "correct", "factual", "faithful",
  "appropriate", "clean", "relevant", "positive", "success",
]);

export const FAIL_LABELS = new Set([
  "fail", "false", "no", "incorrect", "hallucinated", "detected",
  "irrelevant", "unfaithful", "negative",
]);

// Agent types
export const AGENT_TYPES = [
  { value: "langgraph", label: "LangGraph" },
  { value: "rest", label: "REST SSE" },
] as const;

// Default URLs
export const DEFAULT_PHOENIX_URL = "http://localhost:6006";
export const DEFAULT_LANGGRAPH_ENDPOINT = "http://localhost:2024";

// Chat starter questions
export interface ChatSuggestion {
  title: string;
  label: string;
  prompt: string;
}

export const DEFAULT_CHAT_SUGGESTIONS: ChatSuggestion[] = [];

export const MAX_CHAT_SUGGESTIONS = 4;

export function parseChatSuggestions(json: string | undefined): ChatSuggestion[] {
  if (!json) return DEFAULT_CHAT_SUGGESTIONS;
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return DEFAULT_CHAT_SUGGESTIONS;
    return parsed.filter(
      (s: any) => typeof s.title === "string" && typeof s.prompt === "string" && typeof s.label === "string",
    );
  } catch {
    return DEFAULT_CHAT_SUGGESTIONS;
  }
}
