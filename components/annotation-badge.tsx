"use client";

import { useEffect, useState, createContext, useContext } from "react";
import { Annotation } from "@/lib/phoenix";

// Fallback short names
const SHORT_NAME: Record<string, string> = {
  hallucination: "HAL",
  qa_correctness: "QA",
  banned_word: "BAN",
  rag_relevance: "RAG",
  citation: "CIT",
  tool_calling: "TOOL",
  user_feedback: "FB",
};

// Global badge label cache with subscribers for re-render
let _badgeLabels: Record<string, string> = {};
let _loaded = false;
const _subscribers = new Set<() => void>();

function subscribeBadgeLabels(cb: () => void) {
  _subscribers.add(cb);
  return () => { _subscribers.delete(cb); };
}

export function refreshBadgeLabels() {
  fetch("/api/eval-prompts")
    .then((r) => r.json())
    .then((data) => {
      const labels: Record<string, string> = {};
      for (const p of data.prompts ?? []) {
        if (p.badgeLabel) labels[p.name] = p.badgeLabel;
      }
      _badgeLabels = labels;
      _loaded = true;
      _subscribers.forEach((cb) => cb());
    })
    .catch(() => {});
}

function useBadgeLabels(): Record<string, string> {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (!_loaded) refreshBadgeLabels();
    return subscribeBadgeLabels(() => forceUpdate((n) => n + 1));
  }, []);
  return _badgeLabels;
}

function getShortName(name: string, labels: Record<string, string>): string {
  if (labels[name]) return labels[name];
  return SHORT_NAME[name] ?? name.slice(0, 3).toUpperCase();
}

const GOOD_LABELS = ["factual", "correct", "clean", "relevant", "faithful", "success", "positive", "appropriate", "pass", "true"];
const FAIL_LABELS = ["hallucinated", "incorrect", "detected", "irrelevant", "unfaithful", "fail", "false"];

// Score-based evals: score is 0-1 range, not just 0 or 1
function isScoreMode(a: Annotation): boolean {
  // If score is not exactly 0 or 1, it's clearly a score-based eval
  if (a.score !== 0 && a.score !== 1) return true;
  // Known score-based built-ins
  const KNOWN_SCORE = new Set(["rag_relevance", "citation", "tool_calling"]);
  return KNOWN_SCORE.has(a.name);
}

function isGood(a: Annotation): boolean {
  if (FAIL_LABELS.includes(a.label)) return false;
  if (GOOD_LABELS.includes(a.label)) return true;
  // Fallback: score > 0.5 is good
  return a.score > 0.5;
}

export interface AnnotationBadgeProps {
  annotation: Annotation;
  /** Override: force score or binary display. If not set, auto-detect from annotation data. */
  outputMode?: "score" | "binary";
  /** Score threshold below which to show as FAIL (default: 0, meaning only exactly 0 is fail) */
  failThreshold?: number;
  /** If provided, shows X button on hover to delete this annotation */
  onDelete?: () => void;
}

export function AnnotationBadge({ annotation, outputMode, failThreshold = 0, onDelete }: AnnotationBadgeProps) {
  const labels = useBadgeLabels();
  const showScore = outputMode === "score" || (outputMode === undefined && isScoreMode(annotation));
  const good = showScore
    ? annotation.score > failThreshold
    : isGood(annotation);
  const short = getShortName(annotation.name, labels);

  return (
    <span
      title={`${annotation.name}: ${annotation.label} (score: ${annotation.score})`}
      className={`group/badge relative inline-flex items-center rounded text-[9px] font-mono tabular-nums leading-none
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
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute -top-1.5 -right-1.5 hidden group-hover/badge:flex size-4 items-center justify-center rounded-full bg-foreground text-background text-[9px] font-bold shadow hover:bg-red-600 transition-colors"
          title={`Delete ${annotation.name} annotation`}
        >
          ×
        </button>
      )}
    </span>
  );
}

/** Annotations to hide from badge display */
const HIDDEN_ANNOTATIONS = new Set(["guardrail"]);
/** Labels that mean "no feedback" — hide the badge entirely */
const CANCELLED_LABELS = new Set(["cancelled"]);

export function AnnotationBadges({
  annotations,
  onDelete,
}: {
  annotations: Annotation[];
  onDelete?: (name: string) => void;
}) {
  const visible = annotations.filter(
    (a) => !HIDDEN_ANNOTATIONS.has(a.name) && !CANCELLED_LABELS.has(a.label),
  );
  if (!visible.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 py-0.5">
      {visible.map((a) => (
        <AnnotationBadge
          key={a.name}
          annotation={a}
          onDelete={onDelete ? () => onDelete(a.name) : undefined}
        />
      ))}
    </div>
  );
}
