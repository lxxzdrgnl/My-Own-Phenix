import { Annotation } from "@/lib/phoenix";

const SHORT_NAME: Record<string, string> = {
  hallucination: "HAL",
  qa_correctness: "QA",
  banned_word: "BAN",
  rag_relevance: "RAG",
};

const GOOD_LABELS = ["factual", "correct", "clean", "relevant"];
const SCORE_TYPES = new Set(["rag_relevance"]);

function isGood(a: Annotation): boolean {
  if (SCORE_TYPES.has(a.name)) return a.score > 0;
  return GOOD_LABELS.includes(a.label);
}

export function AnnotationBadge({ annotation }: { annotation: Annotation }) {
  const good = isGood(annotation);
  const short = SHORT_NAME[annotation.name] ?? annotation.name.slice(0, 3).toUpperCase();
  const showScore = SCORE_TYPES.has(annotation.name);

  return (
    <span
      title={`${annotation.name}: ${annotation.label} (score: ${annotation.score})`}
      className={`inline-flex items-center overflow-hidden rounded text-[9px] font-mono tabular-nums leading-none
        ${good ? "border border-foreground/15" : "border-2 border-foreground"}`}
    >
      <span className={`px-1.5 py-1 ${good ? "bg-foreground/5 text-foreground/50" : "bg-foreground/10 text-foreground font-semibold"}`}>
        {short}
      </span>
      {showScore ? (
        <span className={`px-1.5 py-1 font-bold ${
          good ? "bg-foreground/10 text-foreground/70" : "bg-foreground text-background"
        }`}>
          {(annotation.score * 100).toFixed(0)}%
        </span>
      ) : good ? (
        <span className="bg-foreground/10 px-1.5 py-1 font-bold text-foreground/70">
          PASS
        </span>
      ) : (
        <span className="bg-foreground px-1.5 py-1 font-bold text-background">
          FAIL
        </span>
      )}
    </span>
  );
}

export function AnnotationBadges({ annotations }: { annotations: Annotation[] }) {
  if (!annotations.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {annotations.map((a) => (
        <AnnotationBadge key={a.name} annotation={a} />
      ))}
    </div>
  );
}
