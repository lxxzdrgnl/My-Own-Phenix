"use client";

import { StatCard } from "./stat-card";
import { HighchartWidget } from "./highchart-widget";
import {
  type AnnotationData,
  type SpanData,
  avg, pct, round,
  dailyCategories,
  PCT_AXIS,
  chartOpts,
  isAnnotationPass,
  ANNOTATION_ORDER,
} from "@/lib/dashboard-utils";
import type { WidgetViewMode, WidgetColors } from "../widget-grid";

interface RenderProps {
  annotations: AnnotationData[];
  spans: SpanData[];
  viewMode: WidgetViewMode;
  gridW: number;
  gridH: number;
  colors: WidgetColors; // string[]
}

/** Render chart with widget colors applied */
const ch = (opts: Highcharts.Options, colors: WidgetColors) =>
  <HighchartWidget options={chartOpts({ ...opts, colors })} />;

// ── Score-based widget (hallucination, qa_correctness) ──

function renderScoreWidget(
  annotations: AnnotationData[],
  name: string,
  label: string,
  viewMode: WidgetViewMode,
  colors: WidgetColors,
) {
  const data = annotations.filter((a) => a.name === name);
  const scores = data.map((d) => d.score);
  const avgScore = avg(scores);

  if (viewMode === "summary")
    return <StatCard value={`${(avgScore * 100).toFixed(1)}%`} label={`${label} Avg`} trend={`Based on ${scores.length} samples`} />;

  if (viewMode === "trend") {
    const { daily, cats } = dailyCategories(data);
    return ch({
      xAxis: { categories: cats },
      yAxis: PCT_AXIS,
      tooltip: { valueSuffix: "%" },
      series: [{ type: "area", name: `${label} (Daily Avg)`, data: daily.map(([, items]) => round(avg(items.map((i) => i.score)) * 100, 1)) }],
    }, colors);
  }

  return ch({
    xAxis: { categories: scores.map((_, i) => `#${i + 1}`) },
    yAxis: PCT_AXIS,
    tooltip: { valueSuffix: "%" },
    series: [{ type: "line", name: label, data: scores.map((s) => round(s * 100, 1)) }],
  }, colors);
}

// ── Category-based widget (rag_relevance, banned_word) ──

function renderCategoryWidget(
  annotations: AnnotationData[],
  name: string,
  label: string,
  cats: [string, string],
  viewMode: WidgetViewMode,
  colors: WidgetColors,
) {
  const data = annotations.filter((a) => a.name === name);
  const c0 = data.filter((d) => d.label === cats[0].toLowerCase()).length;
  const c1 = data.filter((d) => d.label === cats[1].toLowerCase()).length;

  if (viewMode === "summary")
    return <StatCard value={`${pct(c0, c0 + c1)}%`} label={`${cats[0]} Rate`} trend={`Total ${c0 + c1} samples`} />;

  if (viewMode === "trend") {
    const { daily, cats: dateCats } = dailyCategories(data);
    return ch({
      chart: { type: "column" },
      xAxis: { categories: dateCats },
      yAxis: { title: { text: "Count" } },
      plotOptions: { column: { stacking: "normal" } },
      series: [
        { type: "column", name: cats[0], data: daily.map(([, items]) => items.filter((i) => i.label === cats[0].toLowerCase()).length) },
        { type: "column", name: cats[1], data: daily.map(([, items]) => items.filter((i) => i.label === cats[1].toLowerCase()).length) },
      ],
    }, colors);
  }

  return <HighchartWidget options={chartOpts({
    chart: { type: "pie" },
    series: [{
      type: "pie", name: label,
      data: [
        { name: cats[0], y: c0, color: colors[0] },
        { name: cats[1], y: c1, color: colors[1] },
      ].filter((d) => d.y > 0),
    }],
  })} />;
}

// ── Exports ──

export function hallucination({ annotations, viewMode, colors }: RenderProps) {
  return renderScoreWidget(annotations, "hallucination", "Hallucination", viewMode, colors);
}

export function qa_correctness({ annotations, viewMode, colors }: RenderProps) {
  return renderScoreWidget(annotations, "qa_correctness", "QA Correctness", viewMode, colors);
}

export function rag_relevance({ annotations, viewMode, colors }: RenderProps) {
  return renderCategoryWidget(annotations, "rag_relevance", "Documents", ["Relevant", "Unrelated"], viewMode, colors);
}

export function banned_word({ annotations, viewMode, colors }: RenderProps) {
  return renderCategoryWidget(annotations, "banned_word", "Messages", ["Clean", "Detected"], viewMode, colors);
}

export function score_comparison({ annotations, viewMode, colors }: RenderProps) {
  const names = ["hallucination", "qa_correctness", "rag_relevance"];
  const labels = ["Hallucination", "QA Correct", "RAG Relevance"];
  const avgs = names.map((name) => {
    const scores = annotations.filter((a) => a.name === name).map((d) => d.score);
    return scores.length > 0 ? round(avg(scores), 3) : 0;
  });

  if (viewMode === "summary") {
    const valid = avgs.filter((a) => a > 0);
    return <StatCard value={`${valid.length > 0 ? round(avg(valid) * 100, 1) : 0}%`} label="Overall Avg Score" />;
  }

  if (viewMode === "trend") {
    const allDates = [...new Set(annotations.filter((a) => names.includes(a.name)).map((a) => new Date(a.time).toISOString().slice(0, 10)))].sort();
    return ch({
      xAxis: { categories: allDates.map((d) => d.slice(5)) },
      yAxis: PCT_AXIS,
      tooltip: { valueSuffix: "%" },
      series: names.map((name, idx) => ({
        type: "line" as const, name: labels[idx],
        data: allDates.map((d) => {
          const scores = annotations.filter((a) => a.name === name && new Date(a.time).toISOString().slice(0, 10) === d).map((a) => a.score);
          return scores.length > 0 ? round(avg(scores) * 100, 1) : 0;
        }),
      })),
    }, colors);
  }

  return ch({
    chart: { type: "column" },
    xAxis: { categories: labels },
    yAxis: PCT_AXIS,
    tooltip: { valueSuffix: "%" },
    series: [{ type: "column", name: "Score", data: avgs.map((a) => round(a * 100, 1)) }],
  }, colors);
}

// ── Annotation Scores (avg / pass-fail count) ──

export function annotation_scores({ annotations, colors, viewMode }: RenderProps) {
  const byName: Record<string, AnnotationData[]> = {};
  for (const a of annotations) {
    (byName[a.name] ??= []).push(a);
  }

  const categories = ANNOTATION_ORDER.filter((n) => byName[n]);
  const isCount = viewMode === "detail";

  if (isCount) {
    const passData = categories.map((name, i) => ({
      y: byName[name].filter(isAnnotationPass).length,
      color: colors[i] ?? colors[0],
    }));
    const failData = categories.map(() => ({
      y: 0,
      color: colors[4] ?? "oklch(0.55 0.12 15)",
    }));
    categories.forEach((name, i) => {
      failData[i].y = byName[name].filter((a) => !isAnnotationPass(a)).length;
    });

    return <HighchartWidget options={chartOpts({
      chart: { type: "column" },
      title: { text: "Pass / Fail by Annotation", style: { fontSize: "14px" } },
      xAxis: { categories },
      yAxis: { title: { text: "Count" }, min: 0, max: null, reversedStacks: false },
      plotOptions: { column: { stacking: "normal" } },
      series: [
        { type: "column", name: "Pass", data: passData, colorByPoint: true },
        { type: "column", name: "Fail", data: failData, colorByPoint: true },
      ],
    })} />;
  }

  const data = categories.map((name, i) => ({
    y: round(avg(byName[name].map((a) => a.score)), 2),
    color: colors[i] ?? colors[0],
  }));

  return <HighchartWidget options={chartOpts({
    chart: { type: "column" },
    title: { text: "Avg Score by Annotation", style: { fontSize: "14px" } },
    xAxis: { categories },
    yAxis: { title: { text: "Score" }, min: 0, max: 1 },
    series: [{ type: "column", name: "Avg Score", data, colorByPoint: true }],
    legend: { enabled: false },
  })} />;
}
