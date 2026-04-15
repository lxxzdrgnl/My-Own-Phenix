"use client";

import { StatCard } from "./stat-card";
import { HighchartWidget } from "./highchart-widget";
import {
  type AnnotationData,
  type SpanData,
  sum, avg, round,
  llmFilter, tokenStats, modelCounts, calcCost,
  chartOpts, dailyTrendOpts, stackedColumnOpts, indexedSeriesOpts,
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

// ── Token Usage Summary (responsive) ──

const TOKEN_STYLES: Record<number, { value: string; label: string; sub: string; gap: string; px: string; footer: string }> = {
  0: { value: "text-xs",  label: "text-[7px]",  sub: "text-[6px]", gap: "gap-0.5", px: "px-1.5 py-0.5", footer: "text-[6px]" },
  1: { value: "text-base", label: "text-[9px]",  sub: "text-[8px]", gap: "gap-1",   px: "px-2 py-1",     footer: "text-[8px]" },
  2: { value: "text-xl",  label: "text-[10px]", sub: "text-[9px]", gap: "gap-2",   px: "px-3 py-1.5",   footer: "text-[9px]" },
  3: { value: "text-4xl", label: "text-sm",     sub: "text-sm",    gap: "gap-4",   px: "px-6 py-3",     footer: "text-sm" },
  4: { value: "text-5xl", label: "text-base",   sub: "text-base",  gap: "gap-5",   px: "px-8 py-4",     footer: "text-base" },
  5: { value: "text-6xl", label: "text-lg",     sub: "text-lg",    gap: "gap-6",   px: "px-10 py-5",    footer: "text-lg" },
};

function getTokenStyle(gridW: number, gridH: number) {
  let scale: number;
  if (gridH <= 1) scale = gridW <= 1 ? 0 : 1;
  else scale = Math.max(gridW, gridH);
  return TOKEN_STYLES[Math.min(scale, 5)];
}

function TokenUsageSummary({ total, prompt, completion, avgTotal, avgPrompt, avgCompletion, count, gridW, gridH }: {
  total: number; prompt: number; completion: number; avgTotal: number; avgPrompt: number; avgCompletion: number; count: number;
  gridW: number; gridH: number;
}) {
  const s = getTokenStyle(gridW, gridH);
  const showSub = gridW >= 2;

  return (
    <div className={`flex h-full flex-col justify-center ${s.gap} overflow-hidden ${s.px}`} style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace" }}>
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <span className={`shrink-0 ${s.label} font-semibold uppercase tracking-widest text-muted-foreground/60`}>Total</span>
        <div className="flex items-baseline gap-2 min-w-0 overflow-hidden">
          <span className={`${s.value} font-black tabular-nums truncate`}>{total.toLocaleString()}</span>
          {showSub && <span className={`${s.sub} text-muted-foreground truncate`}>
            in <span className="font-bold text-foreground/80">{prompt.toLocaleString()}</span> · out <span className="font-bold text-foreground/80">{completion.toLocaleString()}</span>
          </span>}
        </div>
      </div>
      <div className="h-px bg-border/40" />
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <span className={`shrink-0 ${s.label} font-semibold uppercase tracking-widest text-muted-foreground/60`}>Average</span>
        <div className="flex items-baseline gap-2 min-w-0 overflow-hidden">
          <span className={`${s.value} font-black tabular-nums truncate`}>{avgTotal.toLocaleString()}</span>
          {showSub && <span className={`${s.sub} text-muted-foreground truncate`}>
            in <span className="font-bold text-foreground/80">{avgPrompt.toLocaleString()}</span> · out <span className="font-bold text-foreground/80">{avgCompletion.toLocaleString()}</span>
          </span>}
        </div>
      </div>
      <div className={`mt-auto text-right ${s.footer} tabular-nums text-muted-foreground/50`}>{count} calls</div>
    </div>
  );
}

// ── Exports ──

export function token_usage({ spans, viewMode, gridW, gridH, colors }: RenderProps) {
  const llm = llmFilter(spans);
  const t = tokenStats(llm);

  if (viewMode === "summary") {
    return <TokenUsageSummary total={t.total} prompt={t.prompt} completion={t.completion} avgTotal={t.avgTotal} avgPrompt={t.avgPrompt} avgCompletion={t.avgCompletion} count={t.count} gridW={gridW} gridH={gridH} />;
  }

  // trend (also used as default/detail)
  return ch({ ...stackedColumnOpts(llm, [
    { name: "Prompt", mapFn: (items) => sum(items.map((s) => s.promptTokens)) },
    { name: "Completion", mapFn: (items) => sum(items.map((s) => s.completionTokens)) },
  ], "Tokens") }, colors);
}

export function token_cost({ spans, viewMode, colors }: RenderProps) {
  const llm = llmFilter(spans);
  const totalCost = sum(llm.map(calcCost));
  if (viewMode === "summary") return <StatCard value={`$${totalCost.toFixed(4)}`} label="Estimated Cost" trend={`${llm.length} calls`} />;
  if (viewMode === "trend")
    return ch({ ...dailyTrendOpts(llm, "area", "Daily Cost", (items) => round(sum(items.map(calcCost)), 4), "$") }, colors);
  const costs = llm.slice(-50).map((s) => round(calcCost(s), 6));
  return ch({ ...indexedSeriesOpts(costs, "column", "Cost per call", "$") }, colors);
}


export function token_ratio({ spans, viewMode, colors }: RenderProps) {
  const llm = llmFilter(spans);
  const t = tokenStats(llm);
  const ratio = t.completion > 0 ? (t.prompt / t.completion).toFixed(2) : "N/A";
  if (viewMode === "summary") return <StatCard value={`${ratio}x`} label="Input / Output Ratio" trend={`In: ${t.prompt.toLocaleString()} / Out: ${t.completion.toLocaleString()}`} />;
  if (viewMode === "trend")
    return ch({ ...dailyTrendOpts(llm, "line", "Input/Output Ratio", (items) => {
      const p = sum(items.map((s) => s.promptTokens));
      const c = sum(items.map((s) => s.completionTokens));
      return c > 0 ? round(p / c, 2) : 0;
    }, "Ratio") }, colors);
  const ratios = llm.slice(-50).map((s) => s.completionTokens > 0 ? round(s.promptTokens / s.completionTokens, 2) : 0);
  return ch({ ...indexedSeriesOpts(ratios, "line", "Input/Output", "Ratio") }, colors);
}

export function model_distribution({ spans, viewMode, colors }: RenderProps) {
  const modelSpans = spans.filter((s) => s.model);
  const models = modelCounts(modelSpans);
  if (viewMode === "summary") {
    const top = models[0];
    return <StatCard value={top ? top[0] : "N/A"} label="Top Model" trend={top ? `${top[1]} calls (${models.length} models)` : ""} />;
  }
  if (viewMode === "trend")
    return ch({ ...stackedColumnOpts(
      modelSpans,
      models.slice(0, 5).map(([model]) => ({ name: model, mapFn: (items: SpanData[]) => items.filter((s) => s.model === model).length })),
      "Calls",
    ) }, colors);
  return ch({
    chart: { type: "pie" },
    series: [{ type: "pie", name: "Model", data: models.map(([name, y]) => ({ name, y })) }],
  }, colors);
}

export function avg_tokens_per_call({ spans, viewMode, colors }: RenderProps) {
  const llm = llmFilter(spans);
  const t = tokenStats(llm);
  if (viewMode === "summary") return <StatCard value={`${t.avgTotal}`} label="Avg Tokens/Call" trend={`In: ${t.avgPrompt} / Out: ${t.avgCompletion}`} />;
  if (viewMode === "trend")
    return ch({ ...stackedColumnOpts(llm, [
      { name: "Avg Prompt", mapFn: (items) => Math.round(avg(items.map((s) => s.promptTokens))) },
      { name: "Avg Completion", mapFn: (items) => Math.round(avg(items.map((s) => s.completionTokens))) },
    ], "Tokens") }, colors);
  const perCall = llm.slice(-50);
  return ch({
    chart: { type: "column" },
    xAxis: { categories: perCall.map((_, i) => `#${i + 1}`) },
    yAxis: { title: { text: "Tokens" } },
    plotOptions: { column: { stacking: "normal" } },
    series: [
      { type: "column", name: "Prompt", data: perCall.map((s) => s.promptTokens) },
      { type: "column", name: "Completion", data: perCall.map((s) => s.completionTokens) },
    ],
  }, colors);
}
