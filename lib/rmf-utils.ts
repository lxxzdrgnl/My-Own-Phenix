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

export const MEASURE_METRICS: MeasureMetricDef[] = [
  {
    id: "hallucination_rate",
    label: "환각률",
    engLabel: "Hallucination Eval",
    description: "Rate of LLM generating information contradicting facts. Critical for finance/medical AI.",
    unit: "%",
    lowerIsBetter: true,
    threshold: {
      green: (v) => v < 5,
      yellow: (v) => v < 10,
    },
  },
  {
    id: "toxicity_rate",
    label: "독성률",
    engLabel: "Toxicity Eval",
    description: "Rate of harmful or biased content generation. Essential monitoring for consumer-facing AI.",
    unit: "%",
    lowerIsBetter: true,
    threshold: {
      green: (v) => v < 3,
      yellow: (v) => v < 5,
    },
  },
  {
    id: "qa_accuracy",
    label: "답변 정확도",
    engLabel: "QA Eval",
    description: "Answer accuracy for questions. Core quality metric.",
    unit: "%",
    lowerIsBetter: false,
    threshold: {
      green: (v) => v > 90,
      yellow: (v) => v > 80,
    },
  },
  {
    id: "retrieval_relevance",
    label: "검색 관련성",
    engLabel: "Relevance Eval",
    description: "Retrieved document relevance to query. Core RAG pipeline metric.",
    unit: "%",
    lowerIsBetter: false,
    threshold: {
      green: (v) => v > 85,
      yellow: (v) => v > 70,
    },
  },
  {
    id: "latency_p95",
    label: "응답 지연시간",
    engLabel: "Span Duration",
    description: "95th percentile response time. User experience and SLA compliance.",
    unit: "s",
    lowerIsBetter: true,
    threshold: {
      green: (v) => v < 2,
      yellow: (v) => v < 5,
    },
  },
  {
    id: "error_rate",
    label: "에러율",
    engLabel: "status_code",
    description: "API call failure rate. Directly impacts service reliability.",
    unit: "%",
    lowerIsBetter: true,
    threshold: {
      green: (v) => v < 3,
      yellow: (v) => v < 5,
    },
  },
  {
    id: "token_efficiency",
    label: "토큰 효율성",
    engLabel: "token_count",
    description: "Average tokens per call. Cost optimization metric.",
    unit: "avg",
    lowerIsBetter: true,
    threshold: {
      green: (v) => v < 1500,
      yellow: (v) => v < 3000,
    },
  },
  {
    id: "cost_tracking",
    label: "비용 추적",
    engLabel: "llm.cost.total",
    description: "Daily LLM API cost. Budget management essential.",
    unit: "$/day",
    lowerIsBetter: true,
    threshold: {
      green: (v) => v < 100,
      yellow: (v) => v < 200,
    },
  },
  {
    id: "user_frustration",
    label: "사용자 불만도",
    engLabel: "Frustration Eval",
    description: "Rate of responses receiving negative user feedback.",
    unit: "%",
    lowerIsBetter: true,
    threshold: {
      green: (v) => v < 5,
      yellow: (v) => v < 15,
    },
  },
  {
    id: "tool_calling_accuracy",
    label: "도구 호출 정확도",
    engLabel: "Tool Calling Eval",
    description: "Tool/function call success rate.",
    unit: "%",
    lowerIsBetter: false,
    threshold: {
      green: (v) => v > 60,
      yellow: (v) => v > 30,
    },
  },
  {
    id: "guardrail_trigger",
    label: "가드레일 트리거",
    engLabel: "GUARDRAIL span",
    description: "Rate of safety guardrail activations.",
    unit: "%",
    lowerIsBetter: true,
    threshold: {
      green: (v) => v < 3,
      yellow: (v) => v < 5,
    },
  },
  {
    id: "citation_accuracy",
    label: "인용 정확도",
    engLabel: "Citation Eval",
    description: "Accuracy of cited content in responses.",
    unit: "%",
    lowerIsBetter: false,
    threshold: {
      green: (v) => v > 85,
      yellow: (v) => v > 70,
    },
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

function formatValue(value: number, unit: string): string {
  switch (unit) {
    case "%":
      return `${value.toFixed(1)}%`;
    case "s":
      return `${value.toFixed(1)}s`;
    case "$/day":
      return `$${value.toFixed(2)}/day`;
    case "avg":
      return `${Math.round(value)} avg`;
    default:
      return `${value.toFixed(1)}`;
  }
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

  const rawValues: Record<string, number> = {
    hallucination_rate: annotationRate(annotations, "hallucination", "hallucinated"),
    toxicity_rate: annotationRate(annotations, "banned_word", "detected"),
    qa_accuracy: annotationAvgScore(annotations, "qa_correctness") * 100,
    retrieval_relevance: annotationAvgScore(annotations, "rag_relevance") * 100,
    latency_p95: percentile(llmSpans, 0.95) / 1000,
    error_rate: pct(errorCount(spans), spans.length),
    token_efficiency: avg(llmSpans.map((s) => s.totalTokens)),
    cost_tracking: sum(llmSpans.map((s) => calcCost(s))),
    user_frustration: feedbackStats
      ? pct(feedbackStats.downCount, feedbackStats.total)
      : 0,
    // Tool calling = RAG retrieval appropriateness (LLM eval)
    tool_calling_accuracy: annotationAvgScore(annotations, "tool_calling") * 100,
    // Guardrail: derived from banned_word + hallucination (not a standalone annotation)
    guardrail_trigger: (() => {
      const bw = annotations.filter((a) => a.name === "banned_word");
      const hal = annotations.filter((a) => a.name === "hallucination");
      if (bw.length === 0 && hal.length === 0) return 0;
      const total = Math.max(bw.length, hal.length);
      const triggered = new Set<string>();
      for (const a of bw) if (a.label === "detected") triggered.add(a.time);
      for (const a of hal) if (a.score > 0.5) triggered.add(a.time);
      return pct(triggered.size, total);
    })(),
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

// ─── Gap status ───

export function getGapStatus(gap: number): GapStatus {
  if (gap >= -5) return "NORMAL";
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
