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
    colorSlots: 7,
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
  token_usage:         { render: token.token_usage,         colorSlots: 2, viewModes: { modes: ["summary", "trend"], labels: { summary: "Summary", trend: "Daily" } } },
  token_cost:          { render: token.token_cost,          colorSlots: 1 },
  token_ratio:         { render: token.token_ratio,         colorSlots: 1 },
  avg_tokens_per_call: { render: token.avg_tokens_per_call, colorSlots: 1 },
  model_distribution:  { render: token.model_distribution,  colorSlots: 2 },

  // RMF
  rmf_overview:          { render: rmf.rmf_overview,          colorSlots: 1 },
  rmf_measure_grid:      { render: rmf.rmf_measure_grid,      colorSlots: 1 },
  rmf_user_frustration:  { render: rmf.rmf_user_frustration,  colorSlots: 2 },
  rmf_tool_calling:      { render: rmf.rmf_tool_calling,      colorSlots: 1 },
  rmf_guardrail_trigger: { render: rmf.rmf_guardrail_trigger, colorSlots: 2 },
  rmf_citation_accuracy: { render: rmf.rmf_citation_accuracy, colorSlots: 1 },
};

/**
 * Dynamic eval widget factory.
 * Widget types starting with "eval_" are rendered as generic annotation widgets.
 * e.g., "eval_test" reads annotations with name "test".
 */
import { StatCard } from "./stat-card";
import { HighchartWidget } from "./highchart-widget";
import { avg, round, dailyCategories, chartOpts } from "@/lib/dashboard-utils";

function createEvalWidget(annotationName: string): WidgetMeta {
  return {
    render: ({ annotations, viewMode, colors }: WidgetRenderProps) => {
      const data = annotations.filter((a) => a.name === annotationName);
      const scores = data.map((d) => d.score);
      const avgScore = scores.length > 0 ? avg(scores) : 0;

      if (viewMode === "summary") {
        return <StatCard value={`${(avgScore * 100).toFixed(1)}%`} label={`${annotationName} Score`} trend={`${scores.length} samples`} />;
      }

      if (viewMode === "trend") {
        const { daily, cats } = dailyCategories(data);
        return <HighchartWidget options={chartOpts({
          xAxis: { categories: cats },
          yAxis: { title: { text: "%" }, min: 0, max: 100 },
          series: [{ type: "area" as const, name: annotationName, data: daily.map(([, items]) => round(avg(items.map((i) => i.score)) * 100, 1)) }],
          colors,
        })} />;
      }

      // detail
      return <HighchartWidget options={chartOpts({
        xAxis: { categories: scores.map((_, i) => `#${i + 1}`) },
        yAxis: { title: { text: "Score" }, min: 0, max: 1 },
        series: [{ type: "line" as const, name: annotationName, data: scores }],
        colors,
      })} />;
    },
    colorSlots: 1,
  };
}

export function getWidget(type: string): WidgetMeta | undefined {
  if (widgetRegistry[type]) return widgetRegistry[type];
  // Dynamic eval widgets: "eval_xxx" → annotation name "xxx"
  if (type.startsWith("eval_")) {
    const name = type.slice(5);
    const meta = createEvalWidget(name);
    widgetRegistry[type] = meta; // Cache
    return meta;
  }
  return undefined;
}

export function getColorSlots(type: string): number {
  return getWidget(type)?.colorSlots ?? 2;
}

export function getViewModes(type: string) {
  return getWidget(type)?.viewModes;
}
