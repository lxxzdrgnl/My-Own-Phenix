import {
  SpanData,
  AnnotationData,
  avg,
  pct,
  percentile,
  errorCount,
  llmFilter,
  calcCost,
  sum,
} from "@/lib/dashboard-utils";

// ─── Types ───

export type StatusLevel = "green" | "yellow" | "red";
export type GapStatus = "NORMAL" | "WARNING" | "CRITICAL";

export interface MeasureMetricDef {
  id: string;
  label: string;
  engLabel: string;
  description: string;
  unit: string;
  lowerIsBetter: boolean;
  threshold: {
    green: (v: number) => boolean;
    yellow: (v: number) => boolean;
  };
}

export interface MetricValue {
  id: string;
  value: number;
  formatted: string;
  status: StatusLevel;
}

// ─── Metric definitions ───

// All metrics unified: higher = better (0-100%)
export const MEASURE_METRICS: MeasureMetricDef[] = [
  {
    id: "factual_rate",
    label: "Factual Rate",
    engLabel: "Hallucination Eval",
    description: "Rate of factually accurate responses. 100% = no hallucinations.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 95, yellow: (v) => v > 90 },
  },
  {
    id: "safety_rate",
    label: "Safety Rate",
    engLabel: "Toxicity Eval",
    description: "Rate of safe, non-toxic responses. 100% = no toxic content.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 97, yellow: (v) => v > 95 },
  },
  {
    id: "qa_accuracy",
    label: "QA Accuracy",
    engLabel: "QA Eval",
    description: "Answer accuracy for questions. Core quality metric.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 90, yellow: (v) => v > 80 },
  },
  {
    id: "retrieval_relevance",
    label: "Retrieval Relevance",
    engLabel: "Relevance Eval",
    description: "Retrieved document relevance to query.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 85, yellow: (v) => v > 70 },
  },
  {
    id: "latency_score",
    label: "Latency Score",
    engLabel: "Span Duration",
    description: "Response speed score. 100% = under 5s, 0% = over 30s.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 80, yellow: (v) => v > 50 },
  },
  {
    id: "success_rate",
    label: "Success Rate",
    engLabel: "status_code",
    description: "API call success rate. 100% = no errors.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 97, yellow: (v) => v > 95 },
  },
  {
    id: "token_score",
    label: "Token Score",
    engLabel: "token_count",
    description: "Token efficiency. 100% = under 500 avg, 0% = over 5000.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 70, yellow: (v) => v > 40 },
  },
  {
    id: "cost_score",
    label: "Cost Score",
    engLabel: "llm.cost.total",
    description: "Cost efficiency. 100% = $0/day, 0% = over $200/day.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 50, yellow: (v) => v > 20 },
  },
  {
    id: "user_satisfaction",
    label: "User Satisfaction",
    engLabel: "Feedback Eval",
    description: "Rate of positive user feedback. 100% = all positive.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 95, yellow: (v) => v > 85 },
  },
  {
    id: "tool_calling_accuracy",
    label: "Tool Accuracy",
    engLabel: "Tool Calling Eval",
    description: "Tool/function call appropriateness rate.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 60, yellow: (v) => v > 30 },
  },
  {
    id: "guardrail_pass",
    label: "Guardrail Pass",
    engLabel: "Guardrail Eval",
    description: "Rate of responses passing all safety guardrails.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 97, yellow: (v) => v > 95 },
  },
  {
    id: "citation_accuracy",
    label: "Citation Accuracy",
    engLabel: "Citation Eval",
    description: "Accuracy of cited content in responses.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 85, yellow: (v) => v > 70 },
  },
];

// ─── Status helpers ───

export function getStatus(metric: MeasureMetricDef, value: number): StatusLevel {
  if (metric.threshold.green(value)) return "green";
  if (metric.threshold.yellow(value)) return "yellow";
  return "red";
}

export const STATUS_COLORS: Record<StatusLevel, string> = {
  green: "#10b981",
  yellow: "#f59e0b",
  red: "#ef4444",
};

// ─── Format helpers ───

function formatValue(value: number, _unit: string): string {
  return `${value.toFixed(1)}%`;
}

// ─── Annotation rate helper ───

function annotationRate(
  annotations: AnnotationData[],
  name: string,
  label: string,
): number {
  const matching = annotations.filter((a) => a.name === name);
  if (matching.length === 0) return 0;
  const triggered = matching.filter((a) => a.label === label).length;
  return pct(triggered, matching.length);
}

function annotationAvgScore(annotations: AnnotationData[], name: string): number {
  const matching = annotations.filter((a) => a.name === name);
  return avg(matching.map((a) => a.score));
}

// ─── Compute metrics ───

export interface FeedbackStats {
  downCount: number;
  total: number;
}

export function computeMetrics(
  spans: SpanData[],
  annotations: AnnotationData[],
  feedbackStats?: FeedbackStats,
): MetricValue[] {
  const llmSpans = llmFilter(spans);

  // Helper: clamp 0-100
  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  // All values normalized to 0-100, higher = better
  const rawValues: Record<string, number> = {
    // 100 - hallucination rate
    factual_rate: clamp(100 - annotationRate(annotations, "hallucination", "hallucinated")),
    // 100 - toxicity rate
    safety_rate: clamp(100 - annotationRate(annotations, "banned_word", "detected")),
    // Direct: higher = better
    qa_accuracy: annotationAvgScore(annotations, "qa_correctness") * 100,
    retrieval_relevance: annotationAvgScore(annotations, "rag_relevance") * 100,
    // Latency: 100% if p95 < 5s, 0% if > 30s
    latency_score: clamp((() => {
      const p95 = percentile(llmSpans, 0.95) / 1000;
      if (p95 <= 0) return 100;
      return 100 - ((p95 - 5) / 25) * 100; // 5s=100%, 30s=0%
    })()),
    // 100 - error rate
    success_rate: clamp(100 - pct(errorCount(spans), spans.length)),
    // Token: 100% if < 1000, 0% if > 10000
    token_score: clamp((() => {
      const avgTokens = avg(llmSpans.map((s) => s.totalTokens));
      if (avgTokens <= 0) return 100;
      if (avgTokens <= 1000) return 100;
      return 100 - ((avgTokens - 1000) / 9000) * 100;
    })()),
    // Cost: 100% if < $1/day, 0% if > $50/day
    cost_score: clamp((() => {
      const totalCost = sum(llmSpans.map((s) => calcCost(s)));
      if (totalCost <= 1) return 100;
      return 100 - ((totalCost - 1) / 49) * 100;
    })()),
    // 100 - frustration rate
    user_satisfaction: feedbackStats
      ? clamp(100 - pct(feedbackStats.downCount, feedbackStats.total))
      : 100,
    // Direct: higher = better
    tool_calling_accuracy: annotationAvgScore(annotations, "tool_calling") * 100,
    // 100 - guardrail trigger rate
    guardrail_pass: clamp(100 - (() => {
      const bw = annotations.filter((a) => a.name === "banned_word");
      const hal = annotations.filter((a) => a.name === "hallucination");
      if (bw.length === 0 && hal.length === 0) return 0;
      const total = Math.max(bw.length, hal.length);
      const triggered = new Set<string>();
      for (const a of bw) if (a.label === "detected") triggered.add(a.time);
      for (const a of hal) if (a.score > 0.5) triggered.add(a.time);
      return pct(triggered.size, total);
    })()),
    // Direct: higher = better
    citation_accuracy: annotationAvgScore(annotations, "citation") * 100,
  };

  return MEASURE_METRICS.map((metric) => {
    const value = rawValues[metric.id] ?? 0;
    return {
      id: metric.id,
      value,
      formatted: formatValue(value, metric.unit),
      status: getStatus(metric, value),
    };
  });
}

// ─── RMF Function Scores ───

export interface RmfScores {
  govern: number;  // 0-100
  map: number;     // 0-100
  measure: number; // 0-100
  manage: number;  // 0-100
}

/** GOVERN: How well is AI governance configured for this project? */
export function computeGovernScore(enabledEvalCount: number, totalEvalCount: number, hasCustomEvals: boolean): number {
  if (totalEvalCount === 0) return 0;
  // Built-in only = baseline 40%, need custom evals + more coverage to go higher
  let score = 20;
  // Each enabled eval adds points (max 40 from evals)
  score += Math.min(40, (enabledEvalCount / totalEvalCount) * 40);
  // Custom evals show proactive governance (+20)
  if (hasCustomEvals) score += 20;
  // Having 5+ evals shows comprehensive coverage (+20)
  if (enabledEvalCount >= 5) score += 10;
  if (enabledEvalCount >= 8) score += 10;
  return Math.min(100, Math.round(score));
}

/** MAP: How well are risks identified? Only count categories with green/yellow status */
export function computeMapScore(metrics: MetricValue[]): number {
  if (metrics.length === 0) return 0;
  const categories = [
    { ids: ["factual_rate"], name: "Accuracy" },
    { ids: ["safety_rate", "guardrail_pass"], name: "Safety" },
    { ids: ["qa_accuracy"], name: "Quality" },
    { ids: ["retrieval_relevance"], name: "Retrieval" },
    { ids: ["citation_accuracy"], name: "Citation" },
    { ids: ["latency_score", "success_rate"], name: "Performance" },
    { ids: ["token_score", "cost_score"], name: "Cost" },
    { ids: ["tool_calling_accuracy"], name: "Tool Usage" },
  ];
  // Only count categories where at least one metric is green
  const covered = categories.filter((cat) =>
    cat.ids.some((id) => {
      const m = metrics.find((met) => met.id === id);
      return m && m.status === "green";
    })
  ).length;
  return Math.round((covered / categories.length) * 100);
}

/** MEASURE: Average of all metric values (0-100) */
export function computeMeasureScore(metrics: MetricValue[]): number {
  if (metrics.length === 0) return 0;
  const total = metrics.reduce((sum, m) => sum + m.value, 0);
  return Math.round(total / metrics.length);
}

/** MANAGE: Risk mitigation coverage. No data = 0 (not configured) */
export function computeManageScore(totalRisks: number, mitigatedRisks: number, openIncidents: number): number {
  if (totalRisks === 0 && openIncidents === 0) return 0; // Not configured
  if (totalRisks === 0) return Math.max(0, 50 - openIncidents * 10);
  const mitigationRate = (mitigatedRisks / totalRisks) * 100;
  const incidentPenalty = Math.min(30, openIncidents * 10);
  return Math.max(0, Math.round(mitigationRate - incidentPenalty));
}

// ─── Gap status ───

export function getGapStatus(gap: number): GapStatus {
  if (gap > -5) return "NORMAL";
  if (gap >= -15) return "WARNING";
  return "CRITICAL";
}

export const GAP_STATUS_COLORS: Record<GapStatus, string> = {
  NORMAL: "#10b981",
  WARNING: "#f59e0b",
  CRITICAL: "#ef4444",
};

export function getRecommendedAction(status: GapStatus): string {
  switch (status) {
    case "NORMAL":
      return "Maintain current level. Continue regular monitoring.";
    case "WARNING":
      return "Metrics are drifting from target. Identify root cause and establish an improvement plan.";
    case "CRITICAL":
      return "Immediate action required. Escalate to relevant teams and initiate emergency response process.";
  }
}
