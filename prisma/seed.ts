import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "prisma", "dev.db");
const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });

const BUILT_IN_EVALS = [
  {
    name: "hallucination",
    evalType: "llm_prompt",
    outputMode: "binary",
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
    template: "",
  },
  {
    name: "rag_relevance",
    evalType: "builtin",
    outputMode: "score",
    template: "",
  },
  {
    name: "banned_word",
    evalType: "code_rule",
    outputMode: "binary",
    template: "",
    ruleConfig: JSON.stringify({
      rules: [{ check: "response", op: "contains_any", value: "fuck, shit", caseSensitive: false }],
      logic: "any",
      match: { label: "detected", score: 1.0 },
      clean: { label: "clean", score: 0.0 },
    }),
  },
];

async function main() {
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
          isCustom: false,
        },
      });
      console.log(`Created built-in eval: ${eval_.name}`);
    } else {
      console.log(`Skipped (already exists): ${eval_.name}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
