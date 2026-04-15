import type { ReactNode } from "react";
import type { AnnotationData, SpanData } from "@/lib/dashboard-utils";
import type { WidgetViewMode, WidgetColors } from "../widget-grid";

import * as evaluation from "./evaluation-widgets";
import * as performance from "./performance-widgets";
import * as token from "./token-widgets";
import * as rmf from "./rmf-widgets";

export interface WidgetRenderProps {
  annotations: AnnotationData[];
  spans: SpanData[];
  viewMode: WidgetViewMode;
  gridW: number;
  gridH: number;
  colors: WidgetColors;
}

type WidgetRenderer = (props: WidgetRenderProps) => ReactNode;

export interface WidgetMeta {
  render: WidgetRenderer;
  /** Number of color slots this widget uses */
  colorSlots: number;
  /** Custom view modes. undefined = standard summary/trend/detail */
  viewModes?: { modes: WidgetViewMode[]; labels: Record<string, string> };
}

export const widgetRegistry: Record<string, WidgetMeta> = {
  // Evaluation
  hallucination:     { render: evaluation.hallucination,     colorSlots: 1 },
  qa_correctness:    { render: evaluation.qa_correctness,    colorSlots: 1 },
  rag_relevance:     { render: evaluation.rag_relevance,     colorSlots: 2 },
  banned_word:       { render: evaluation.banned_word,       colorSlots: 2 },
  score_comparison:  { render: evaluation.score_comparison,  colorSlots: 4 },
  annotation_scores: {
    render: evaluation.annotation_scores,
    colorSlots: 5,
    viewModes: { modes: ["summary", "detail"], labels: { summary: "Average", detail: "Count" } },
  },

  // Performance
  total_queries:        { render: performance.total_queries,        colorSlots: 1 },
  avg_latency:          { render: performance.avg_latency,          colorSlots: 1 },
  error_rate:           { render: performance.error_rate,           colorSlots: 1 },
  latency_distribution: { render: performance.latency_distribution, colorSlots: 2 },
  queries_timeline:     { render: performance.queries_timeline,     colorSlots: 1 },
  throughput:           { render: performance.throughput,            colorSlots: 1 },

  // Tokens & Cost
  token_usage:         { render: token.token_usage,         colorSlots: 2 },
  token_cost:          { render: token.token_cost,          colorSlots: 1 },
  token_ratio:         { render: token.token_ratio,         colorSlots: 1 },
  avg_tokens_per_call: { render: token.avg_tokens_per_call, colorSlots: 1 },
  model_distribution:  { render: token.model_distribution,  colorSlots: 2 },

  // RMF
  rmf_overview:      { render: rmf.rmf_overview,      colorSlots: 1 },
  rmf_measure_grid:  { render: rmf.rmf_measure_grid,  colorSlots: 1 },
};

export function getColorSlots(type: string): number {
  return widgetRegistry[type]?.colorSlots ?? 2;
}

export function getViewModes(type: string) {
  return widgetRegistry[type]?.viewModes;
}
