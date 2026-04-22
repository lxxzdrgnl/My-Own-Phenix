import { prisma } from "@/lib/prisma";

const BUILT_IN_EVALS = [
  {
    name: "hallucination",
    evalType: "llm_prompt",
    outputMode: "binary",
    badgeLabel: "HAL",
    template: `You are an expert at detecting factual errors and fabricated information in AI responses.

Determine whether the RESPONSE contains **factually incorrect or fabricated information**.

CONTEXT:
{context}

RESPONSE:
{response}

Important distinctions:
- Information beyond the CONTEXT is NOT automatically hallucination.
- Only flag if the RESPONSE states something **factually wrong**, **invents non-existent specifics**, or **directly contradicts** the CONTEXT.

Answer "factual" or "hallucinated" only.

Respond with JSON only: {{"label": "factual" or "hallucinated", "explanation": "one line"}}`,
  },
  {
    name: "citation",
    evalType: "llm_prompt",
    outputMode: "score",
    badgeLabel: "CIT",
    template: `You are an expert at evaluating context faithfulness.

Determine whether all claims in the RESPONSE are grounded in the CONTEXT.

CONTEXT:
{context}

RESPONSE:
{response}

Scoring:
- 1.0: Fully grounded
- 0.7-0.9: Mostly grounded
- 0.4-0.6: Partially grounded
- 0.0-0.3: Mostly ungrounded

Respond with JSON only: {{"label": "faithful" or "unfaithful", "score": 0.0-1.0, "explanation": "one line"}}`,
  },
  {
    name: "tool_calling",
    evalType: "llm_prompt",
    outputMode: "score",
    badgeLabel: "TOOL",
    template: `You are an expert at evaluating tool usage appropriateness.

User query:
{query}

Retrieved context:
{context}

Scoring:
- 1.0: Clearly relevant query — retrieval appropriate
- 0.7: Related but indirect
- 0.3: Tangentially related
- 0.0: Completely unrelated

Respond with JSON only: {{"label": "appropriate" or "inappropriate", "score": 0.0-1.0, "explanation": "one line"}}`,
  },
  {
    name: "qa_correctness",
    evalType: "builtin",
    outputMode: "binary",
    badgeLabel: "QA",
    template: "",
  },
  {
    name: "rag_relevance",
    evalType: "builtin",
    outputMode: "score",
    badgeLabel: "RAG",
    template: "",
  },
  {
    name: "banned_word",
    evalType: "code_rule",
    outputMode: "binary",
    badgeLabel: "BAN",
    template: "",
    ruleConfig: JSON.stringify({
      rules: [{ check: "response", op: "contains_any", value: "fuck, shit", caseSensitive: false }],
      logic: "any",
      match: { label: "detected", score: 1.0 },
      clean: { label: "clean", score: 0.0 },
    }),
  },
];

let seeded = false;

export async function ensureBuiltInEvals() {
  if (seeded) return;
  seeded = true;

  for (const eval_ of BUILT_IN_EVALS) {
    const existing = await prisma.evalPrompt.findFirst({
      where: { name: eval_.name, OR: [{ projectId: null }, { projectId: "" }] },
    });
    if (!existing) {
      await prisma.evalPrompt.create({
        data: {
          name: eval_.name,
          projectId: null,
          evalType: eval_.evalType,
          outputMode: eval_.outputMode,
          template: eval_.template,
          ruleConfig: eval_.ruleConfig ?? "{}",
          badgeLabel: eval_.badgeLabel ?? "",
          isCustom: false,
        },
      });
    }
  }
}
