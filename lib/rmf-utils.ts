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
    description: "LLM이 사실과 다른 정보를 생성하는 비율. 금융/의료 AI에서 가장 위험한 지표.",
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
    description: "유해하거나 편향된 콘텐츠 생성 비율. 소비자 대면 AI에서 필수 모니터링.",
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
    description: "질문에 대한 답변의 정확성. 핵심 품질 지표.",
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
    description: "검색된 문서의 질문 관련성. RAG 파이프라인 핵심.",
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
    description: "95번째 백분위 응답 시간. 사용자 경험과 SLA 준수 기준.",
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
    description: "API 호출 실패 비율. 서비스 안정성과 직결.",
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
    description: "호출당 평균 토큰 수. 비용 최적화 지표.",
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
    description: "일일 LLM API 비용. 예산 관리 핵심.",
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
    description: "사용자가 싫어요를 누른 응답 비율.",
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
    description: "도구/함수 호출의 성공률.",
    unit: "%",
    lowerIsBetter: false,
    threshold: {
      green: (v) => v > 90,
      yellow: (v) => v > 80,
    },
  },
  {
    id: "guardrail_trigger",
    label: "가드레일 트리거",
    engLabel: "GUARDRAIL span",
    description: "안전 가드레일이 작동한 비율.",
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
    description: "응답에서 인용한 내용의 정확성.",
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
    tool_calling_accuracy: annotationAvgScore(annotations, "tool_calling") * 100,
    guardrail_trigger: annotationRate(annotations, "guardrail", "triggered"),
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
      return "현재 수준을 유지하세요. 정기적인 모니터링을 계속하세요.";
    case "WARNING":
      return "지표가 목표에서 벗어나고 있습니다. 원인을 파악하고 개선 계획을 수립하세요.";
    case "CRITICAL":
      return "즉각적인 조치가 필요합니다. 관련 팀에 에스컬레이션하고 긴급 대응 프로세스를 시작하세요.";
  }
}
