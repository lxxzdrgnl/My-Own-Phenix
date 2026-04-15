"use client";

import { MeasureGrid } from "./measure-grid";
import { RmfFunctionCards } from "./rmf-function-card";
import { computeMetrics } from "@/lib/rmf-utils";
import { StatCard } from "./stat-card";
import { HighchartWidget } from "./highchart-widget";
import {
  avg, pct, round,
  dailyCategories,
  chartOpts,
  PCT_AXIS,
} from "@/lib/dashboard-utils";
import type { WidgetRenderProps } from "./registry";
import type { WidgetColors } from "../widget-grid";

const ch = (opts: Highcharts.Options, colors: WidgetColors) =>
  <HighchartWidget options={chartOpts({ ...opts, colors })} />;

export function rmf_overview({ annotations, spans }: WidgetRenderProps) {
  const metrics = computeMetrics(spans, annotations);
  const greenCount = metrics.filter((m) => m.status === "green").length;
  const measureScore = Math.round((greenCount / metrics.length) * 100) || 0;
  return <RmfFunctionCards measureScore={measureScore} />;
}

export function rmf_measure_grid({ annotations, spans }: WidgetRenderProps) {
  const metrics = computeMetrics(spans, annotations);
  return <MeasureGrid metrics={metrics} />;
}

// ── Annotation rate helper (label match → %) ──

function annotationRateWidget(
  { annotations, viewMode, colors }: WidgetRenderProps,
  annotationName: string,
  targetLabel: string,
  widgetLabel: string,
) {
  const data = annotations.filter((a) => a.name === annotationName);
  const hits = data.filter((d) => d.label === targetLabel).length;
  const rate = pct(hits, data.length);

  if (viewMode === "summary")
    return <StatCard value={`${rate}%`} label={widgetLabel} trend={`${hits} / ${data.length} samples`} />;

  if (viewMode === "trend") {
    const { daily, cats } = dailyCategories(data);
    return ch({
      xAxis: { categories: cats },
      yAxis: PCT_AXIS,
      tooltip: { valueSuffix: "%" },
      series: [{ type: "area", name: widgetLabel, data: daily.map(([, items]) => pct(items.filter((i) => i.label === targetLabel).length, items.length)) }],
    }, colors);
  }

  const { daily, cats } = dailyCategories(data);
  return ch({
    chart: { type: "column" },
    xAxis: { categories: cats },
    yAxis: { title: { text: "Count" } },
    plotOptions: { column: { stacking: "normal" } },
    series: [
      { type: "column", name: targetLabel, data: daily.map(([, items]) => items.filter((i) => i.label === targetLabel).length) },
      { type: "column", name: "other", data: daily.map(([, items]) => items.filter((i) => i.label !== targetLabel).length) },
    ],
  }, colors);
}

// ── Annotation avg-score helper (score * 100 → %) ──

function annotationScoreWidget(
  { annotations, viewMode, colors }: WidgetRenderProps,
  annotationName: string,
  widgetLabel: string,
) {
  const data = annotations.filter((a) => a.name === annotationName);
  const scores = data.map((d) => d.score);
  const avgScore = avg(scores);

  if (viewMode === "summary")
    return <StatCard value={`${round(avgScore * 100, 1)}%`} label={widgetLabel} trend={`Based on ${scores.length} samples`} />;

  if (viewMode === "trend") {
    const { daily, cats } = dailyCategories(data);
    return ch({
      xAxis: { categories: cats },
      yAxis: PCT_AXIS,
      tooltip: { valueSuffix: "%" },
      series: [{ type: "area", name: `${widgetLabel} (Daily Avg)`, data: daily.map(([, items]) => round(avg(items.map((i) => i.score)) * 100, 1)) }],
    }, colors);
  }

  return ch({
    xAxis: { categories: scores.map((_, i) => `#${i + 1}`) },
    yAxis: PCT_AXIS,
    tooltip: { valueSuffix: "%" },
    series: [{ type: "line", name: widgetLabel, data: scores.map((s) => round(s * 100, 1)) }],
  }, colors);
}

// ── 4 NEW RMF widgets (no existing equivalent in other categories) ──

export function rmf_user_frustration({ annotations, spans, viewMode, colors }: WidgetRenderProps) {
  const feedback = annotations.filter((a) => a.name === "user_feedback" && a.label !== "cancelled");
  const negative = feedback.filter((a) => a.label === "negative").length;
  const totalFeedback = feedback.length;
  const totalResponses = spans.length; // all spans as proxy for total responses

  if (viewMode === "summary") {
    // B: negative / total responses
    const rate = totalResponses > 0 ? pct(negative, totalResponses) : 0;
    return <StatCard value={`${rate.toFixed(1)}%`} label="Frustration (All Responses)" trend={`${negative} negative / ${totalResponses} responses`} />;
  }

  if (viewMode === "trend") {
    return ch({
      chart: { type: "column" },
      xAxis: { categories: ["All Responses", "Feedback Only"] },
      yAxis: { title: { text: "%" }, min: 0, max: 100 },
      tooltip: { valueSuffix: "%" },
      series: [{
        type: "column" as const,
        name: "Frustration Rate",
        data: [
          totalResponses > 0 ? round(pct(negative, totalResponses), 1) : 0,
          totalFeedback > 0 ? round(pct(negative, totalFeedback), 1) : 0,
        ],
      }],
    }, colors);
  }

  // detail: A: negative / total feedback
  const rate = totalFeedback > 0 ? pct(negative, totalFeedback) : 0;
  return <StatCard value={`${rate.toFixed(1)}%`} label="Frustration (Feedback Only)" trend={`${negative} negative / ${totalFeedback} feedback`} />;
}

export function rmf_tool_calling(props: WidgetRenderProps) {
  return annotationScoreWidget(props, "tool_calling", "Tool Calling Score");
}

export function rmf_guardrail_trigger(props: WidgetRenderProps) {
  return annotationRateWidget(props, "guardrail", "triggered", "Guardrail Trigger Rate");
}

export function rmf_citation_accuracy(props: WidgetRenderProps) {
  return annotationScoreWidget(props, "citation", "Citation Accuracy");
}
