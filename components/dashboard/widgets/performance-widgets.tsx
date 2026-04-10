"use client";

import { StatCard } from "./stat-card";
import { HighchartWidget } from "./highchart-widget";
import {
  type AnnotationData,
  type SpanData,
  avg, pct,
  dailyCategories, errorCount, percentile, hourlyBuckets,
  chartOpts, dailyTrendOpts, indexedSeriesOpts,
} from "@/lib/dashboard-utils";
import type { WidgetViewMode, WidgetColors } from "../widget-grid";

interface RenderProps {
  annotations: AnnotationData[];
  spans: SpanData[];
  viewMode: WidgetViewMode;
  gridW: number;
  gridH: number;
  colors: WidgetColors;
}

const ch = (opts: Highcharts.Options, colors: WidgetColors) =>
  <HighchartWidget options={chartOpts({ ...opts, colors })} />;

export function total_queries({ spans, viewMode, colors }: RenderProps) {
  if (viewMode === "summary") return <StatCard value={spans.length} label="Total Spans" />;
  if (viewMode === "trend")
    return ch({ ...dailyTrendOpts(spans, "column", "Daily Queries", (items) => items.length, "Queries") }, colors);
  const ok = spans.length - errorCount(spans);
  return <HighchartWidget options={chartOpts({ chart: { type: "pie" }, series: [{ type: "pie", name: "Status", data: [{ name: "OK", y: ok, color: colors[0] }, { name: "Error", y: spans.length - ok, color: "oklch(0.55 0.12 15)" }].filter((d) => d.y > 0) }] })} />;
}

export function avg_latency({ spans, viewMode, colors }: RenderProps) {
  const avgMs = Math.round(avg(spans.map((s) => s.latency)));
  if (viewMode === "summary") return <StatCard value={`${avgMs}ms`} label="Avg Latency" />;
  if (viewMode === "trend")
    return ch({ ...dailyTrendOpts(spans, "area", "Daily Avg Latency", (items) => Math.round(avg(items.map((s) => s.latency))), "ms") }, colors);
  return ch({ ...indexedSeriesOpts(spans.slice(-50).map((s) => s.latency), "line", "Latency", "ms") }, colors);
}

export function error_rate({ spans, viewMode, colors }: RenderProps) {
  const errs = errorCount(spans);
  if (viewMode === "summary") return <StatCard value={`${pct(errs, spans.length)}%`} label="Error Rate" trend={`${errs} / ${spans.length}`} />;
  if (viewMode === "trend")
    return ch({ ...dailyTrendOpts(spans, "area", "Daily Error Rate", (items) => pct(errorCount(items), items.length), "Error %", { yAxis: { min: 0 } }) }, colors);
  return <HighchartWidget options={chartOpts({ chart: { type: "pie" }, series: [{ type: "pie", name: "Status", data: [{ name: "OK", y: spans.length - errs, color: colors[0] }, { name: "Error", y: errs, color: "oklch(0.55 0.12 15)" }].filter((d) => d.y > 0) }] })} />;
}

export function latency_distribution({ spans, viewMode, colors }: RenderProps) {
  const buckets = [0, 100, 300, 500, 1000, 2000, 5000];
  const labels = buckets.map((b, i) => (i < buckets.length - 1 ? `${b}-${buckets[i + 1]}` : `${b}+`));
  const counts = buckets.map((b, i) => spans.filter((s) => s.latency >= b && s.latency < (buckets[i + 1] ?? Infinity)).length);

  if (viewMode === "summary") {
    const p50 = percentile(spans, 0.5);
    return <StatCard value={`${p50}ms`} label="P50 Latency" trend={`P95: ${percentile(spans, 0.95)}ms`} />;
  }
  if (viewMode === "trend") {
    const { daily, cats } = dailyCategories(spans);
    return ch({
      xAxis: { categories: cats }, yAxis: { title: { text: "ms" } },
      series: [
        { type: "line", name: "P50", data: daily.map(([, items]) => percentile(items, 0.5)) },
        { type: "line", name: "P95", data: daily.map(([, items]) => percentile(items, 0.95)) },
      ],
    }, colors);
  }
  return ch({
    chart: { type: "column" },
    xAxis: { categories: labels, title: { text: "ms" } },
    yAxis: { title: { text: "Count" } },
    series: [{ type: "column", name: "Spans", data: counts }],
  }, colors);
}

export function queries_timeline({ spans, viewMode, colors }: RenderProps) {
  const hourly = hourlyBuckets(spans);
  if (viewMode === "summary") return <StatCard value={hourly.length} label="Active Hours" trend={`${spans.length} total queries`} />;
  if (viewMode === "trend")
    return ch({ ...dailyTrendOpts(spans, "area", "Daily Queries", (items) => items.length, "Queries") }, colors);
  return ch({
    xAxis: { categories: hourly.map(([h]) => h.slice(5) + "h") },
    yAxis: { title: { text: "Queries" } },
    series: [{ type: "column", name: "Queries by Hour", data: hourly.map(([, v]) => v) }],
  }, colors);
}

export function throughput({ spans, viewMode, colors }: RenderProps) {
  const tpSpans = spans.filter((s) => s.totalTokens > 0 && s.latency > 0);
  const tps = tpSpans.map((s) => +(s.totalTokens / (s.latency / 1000)).toFixed(1));
  if (viewMode === "summary") return <StatCard value={`${Math.round(avg(tps))}`} label="Avg Tokens/sec" trend={`Based on ${tpSpans.length} calls`} />;
  if (viewMode === "trend")
    return ch({ ...dailyTrendOpts(tpSpans, "line", "Daily Avg Throughput", (items) => {
      const t = items.map((s) => s.totalTokens / (s.latency / 1000));
      return Math.round(avg(t));
    }, "tok/s") }, colors);
  return ch({ ...indexedSeriesOpts(tps.slice(-50), "area", "Tokens/sec", "tok/s") }, colors);
}
