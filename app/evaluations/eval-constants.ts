// ─── Eval Constants ────────────────────────────────────────────────────────

export interface BuiltInEvalDef {
  name: string;
  description: string;
  defaultType: string; // "llm_prompt" | "builtin" | "code_rule"
}

export const BUILT_IN_EVAL_DEFS: BuiltInEvalDef[] = [
  { name: "hallucination", description: "Detects fabricated or factually wrong information", defaultType: "llm_prompt" },
  { name: "citation", description: "Checks if response is grounded in context", defaultType: "llm_prompt" },
  { name: "tool_calling", description: "Evaluates tool/retrieval usage appropriateness", defaultType: "llm_prompt" },
  { name: "qa_correctness", description: "Evaluates answer accuracy (Phoenix built-in, overridable)", defaultType: "builtin" },
  { name: "rag_relevance", description: "Measures retrieved document relevance (Phoenix built-in, overridable)", defaultType: "builtin" },
  { name: "banned_word", description: "Detects toxic or banned content (keyword matching)", defaultType: "code_rule" },
];

export const BUILT_IN_EVALS = BUILT_IN_EVAL_DEFS.map((e) => e.name);

export const EVAL_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  BUILT_IN_EVAL_DEFS.map((e) => [e.name, e.description]),
);

export const BUILT_IN_TYPES: Record<string, string> = Object.fromEntries(
  BUILT_IN_EVAL_DEFS.map((e) => [e.name, e.defaultType]),
);

export const NEW_EVAL_TEMPLATE = `You are an expert AI response evaluator.

Evaluate the quality of the RESPONSE based on the given CONTEXT and QUERY.
Consider accuracy, relevance, completeness, and faithfulness to the provided context.

CONTEXT:
{context}

QUERY:
{query}

RESPONSE:
{response}

Scoring:
- 1.0: Excellent — accurate, relevant, complete, and well-grounded
- 0.7-0.9: Good — mostly accurate with minor issues
- 0.4-0.6: Fair — partially correct but has notable gaps or inaccuracies
- 0.1-0.3: Poor — mostly incorrect or irrelevant
- 0.0: Completely wrong or off-topic

Respond with JSON only: {{"label": "pass" or "fail", "score": 0.0-1.0, "explanation": "one line"}}`;
