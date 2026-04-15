// ─── Shared data types ───

export interface AnnotationData {
  name: string;
  label: string;
  score: number;
  time: string;
}

export interface SpanData {
  latency: number;
  status: string;
  time: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  spanKind: string;
}

// ─── Array helpers ───

export const sum = (nums: number[]) => nums.reduce((a, b) => a + b, 0);
export const avg = (nums: number[]) => (nums.length > 0 ? sum(nums) / nums.length : 0);
export const pct = (n: number, d: number) => (d > 0 ? +((n / d) * 100).toFixed(1) : 0);
export const round = (n: number, decimals = 0) => +n.toFixed(decimals);

// ─── Date grouping ───

export function groupByDate<T extends { time: string }>(items: T[]) {
  const map: Record<string, T[]> = {};
  for (const item of items) {
    const d = new Date(item.time).toISOString().slice(0, 10);
    (map[d] ??= []).push(item);
  }
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
}

export function dailyCategories<T extends { time: string }>(items: T[]) {
  const daily = groupByDate(items);
  return { daily, cats: daily.map(([d]) => d.slice(5)) };
}

// ─── Span selectors ───

export const llmFilter = (spans: SpanData[]) => spans.filter((s) => s.totalTokens > 0);
export const errorCount = (spans: SpanData[]) => spans.filter((s) => s.status === "ERROR").length;

export function percentile(items: SpanData[], p: number) {
  const sorted = [...items].sort((a, b) => a.latency - b.latency);
  return sorted.length > 0 ? sorted[Math.floor(sorted.length * p)].latency : 0;
}

export function tokenStats(spans: SpanData[]) {
  const prompt = sum(spans.map((s) => s.promptTokens));
  const completion = sum(spans.map((s) => s.completionTokens));
  const total = sum(spans.map((s) => s.totalTokens));
  const count = spans.length;
  return {
    prompt,
    completion,
    total,
    count,
    avgPrompt: count > 0 ? Math.round(prompt / count) : 0,
    avgCompletion: count > 0 ? Math.round(completion / count) : 0,
    avgTotal: count > 0 ? Math.round(total / count) : 0,
  };
}

export function modelCounts(spans: SpanData[]) {
  const counts: Record<string, number> = {};
  for (const s of spans) if (s.model) counts[s.model] = (counts[s.model] ?? 0) + 1;
  return Object.entries(counts).sort(([, a], [, b]) => b - a);
}

export function hourlyBuckets(spans: SpanData[]) {
  const byHour: Record<string, number> = {};
  for (const s of spans) {
    const h = new Date(s.time).toISOString().slice(0, 13);
    byHour[h] = (byHour[h] ?? 0) + 1;
  }
  return Object.entries(byHour).sort(([a], [b]) => a.localeCompare(b));
}

// ─── Cost calculation ───

const COST_PER_1K: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4": { input: 0.03, output: 0.06 },
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
  "claude-3-opus": { input: 0.015, output: 0.075 },
  "claude-3-sonnet": { input: 0.003, output: 0.015 },
  "claude-3-haiku": { input: 0.00025, output: 0.00125 },
};

export function calcCost(s: SpanData) {
  const key = Object.keys(COST_PER_1K).find((k) => s.model.toLowerCase().includes(k));
  const rate = key ? COST_PER_1K[key] : { input: 0.002, output: 0.008 };
  return (s.promptTokens / 1000) * rate.input + (s.completionTokens / 1000) * rate.output;
}

// ─── Annotation helpers ───

const GOOD_LABELS = new Set(["factual", "correct", "clean", "relevant", "faithful", "success", "positive", "appropriate"]);
const SCORE_TYPES = new Set(["rag_relevance", "citation"]);

/** Matches annotation-badge.tsx logic */
export function isAnnotationPass(a: AnnotationData): boolean {
  if (SCORE_TYPES.has(a.name)) return a.score > 0;
  return GOOD_LABELS.has(a.label);
}

/** Default annotation display order */
export const ANNOTATION_ORDER = ["rag_relevance", "qa_correctness", "hallucination", "banned_word", "citation", "tool_calling", "user_feedback"];

/** Default fail color */
export const FAIL_COLOR_DEFAULT = "oklch(0.55 0.12 15)";

// ─── Chart option builders ───

const C = "column" as const;
const L = "line" as const;
const A = "area" as const;
const P = "pie" as const;

export const PIE_COLORS = {
  positive: "oklch(0.70 0.12 195)",
  negative: "oklch(0.55 0.15 250)",
  empty: "oklch(0.85 0.02 250)",
};

export const PCT_AXIS: Partial<Highcharts.YAxisOptions> = {
  title: { text: undefined }, min: 0, max: 100, labels: { format: "{value}%" },
};

export function makePieData(entries: { name: string; y: number; positive?: boolean }[]) {
  const data = entries
    .filter((e) => e.y > 0)
    .map((e) => ({ name: e.name, y: e.y, color: e.positive !== false ? PIE_COLORS.positive : PIE_COLORS.negative }));
  if (data.length === 0) data.push({ name: "No Data", y: 1, color: PIE_COLORS.empty });
  return data;
}

/** Shorthand: wrap Highcharts options with no title */
export function chartOpts(opts: Highcharts.Options): Highcharts.Options {
  return { title: { text: undefined }, ...opts };
}

export function pieOpts(name: string, entries: { name: string; y: number; positive?: boolean }[]): Highcharts.Options {
  return chartOpts({ chart: { type: "pie" }, series: [{ type: P, name, data: makePieData(entries) }] });
}

export function dailyTrendOpts<T extends { time: string }>(
  items: T[],
  seriesType: "column" | "area" | "line",
  seriesName: string,
  mapFn: (dayItems: T[]) => number,
  yTitle: string,
  extra?: Partial<Highcharts.Options>,
): Highcharts.Options {
  const { daily, cats } = dailyCategories(items);
  return chartOpts({
    xAxis: { categories: cats },
    yAxis: { title: { text: yTitle } },
    series: [{ type: seriesType, name: seriesName, data: daily.map(([, items]) => mapFn(items)) }],
    ...extra,
  });
}

export function stackedColumnOpts<T extends { time: string }>(
  items: T[],
  series: { name: string; mapFn: (dayItems: T[]) => number }[],
  yTitle: string,
): Highcharts.Options {
  const { daily, cats } = dailyCategories(items);
  return chartOpts({
    chart: { type: C },
    xAxis: { categories: cats },
    yAxis: { title: { text: yTitle } },
    plotOptions: { column: { stacking: "normal" } },
    series: series.map((s) => ({
      type: C, name: s.name, data: daily.map(([, items]) => s.mapFn(items)),
    })),
  });
}

export function indexedSeriesOpts(
  data: number[],
  seriesType: "column" | "area" | "line",
  seriesName: string,
  yTitle: string,
  extra?: Partial<Highcharts.Options>,
): Highcharts.Options {
  return chartOpts({
    xAxis: { categories: data.map((_, i) => `#${i + 1}`) },
    yAxis: { title: { text: yTitle } },
    series: [{ type: seriesType, name: seriesName, data }],
    ...extra,
  });
}
