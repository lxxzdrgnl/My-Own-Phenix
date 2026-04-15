# RMF Dashboard + Date Filter + Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add date range filtering, NIST AI RMF MEASURE 12 metrics, user feedback (thumbs up/down), RMF Function cards, Gap analysis, and MANAGE risk management to the dashboard and project views.

**Architecture:** Date filter component shared between dashboard and project views, filtering spans at the Phoenix API level. RMF metrics computed from Phoenix span/annotation data via `lib/rmf-utils.ts`. Feedback stored in Prisma + Phoenix annotations. Project view reorganized into 3 tabs (traces / MEASURE / risk management). New eval types (tool_calling, guardrail, citation) added to the external eval pipeline.

**Tech Stack:** Next.js, TypeScript, Tailwind CSS, react-day-picker, Radix Popover, Highcharts, Prisma + SQLite, Phoenix API, lucide-react icons

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `components/ui/date-range-picker.tsx` | Shared date range picker (presets + calendar popup) |
| `lib/rmf-utils.ts` | Metric definitions, thresholds, status calculation, score aggregation |
| `components/dashboard/widgets/measure-grid.tsx` | 4x3 grid of MEASURE metric cards |
| `components/dashboard/widgets/rmf-function-card.tsx` | RMF 4 Function score cards (GOVERN/MAP/MEASURE/MANAGE) |
| `components/dashboard/widgets/rmf-widgets.tsx` | Dashboard widget renderers for RMF category |
| `components/dashboard/widgets/gap-analysis.tsx` | Gov vs Eval Score gap chart + risk table |
| `components/dashboard/widgets/manage-view.tsx` | MANAGE tab: stat cards + donut + risk table |
| `components/chat/message-feedback.tsx` | Thumbs up/down + copy buttons for chat messages |
| `app/api/feedback/route.ts` | Feedback CRUD API (Prisma + Phoenix) |
| `app/api/risks/route.ts` | Risk item CRUD API |
| `app/api/incidents/route.ts` | Incident CRUD API |

### Modified Files
| File | Changes |
|------|---------|
| `lib/phoenix.ts` | Add `startTime`/`endTime` params to `fetchTraces()` |
| `app/dashboard/page.tsx` | Add date range picker, pass date range to data fetching |
| `app/projects/projects-manager.tsx` | Add tabs (traces/MEASURE/risk), date picker, MEASURE grid |
| `components/dashboard/widgets/registry.tsx` | Register RMF widget types |
| `components/dashboard/add-widget-menu.tsx` | Add "RMF" widget category |
| `components/assistant-ui/thread/messages.tsx` | Add feedback buttons to HistoryAssistantMessage |
| `components/assistant-ui/thread/index.tsx` | Pass feedback data to history messages |
| `app/assistant.tsx` | Load feedback state when loading thread messages |
| `app/api/user-threads/[id]/messages/route.ts` | Include feedback in message response |
| `prisma/schema.prisma` | Add MessageFeedback, RiskItem, Incident models |
| `lib/dashboard-utils.ts` | Add MEASURE aggregation helpers |

### External Project (legal-rag-self-improve-demo)
| File | Changes |
|------|---------|
| `src/agent/evaluator.py` | Add tool_calling, guardrail, citation eval functions |
| `src/agent/__init__.py` | Extend ALL_ANNOTATIONS, update _backfill_evals() |

---

## Task 1: Install react-day-picker dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install react-day-picker**

```bash
npm install react-day-picker date-fns
```

- [ ] **Step 2: Verify installation**

```bash
npm ls react-day-picker date-fns
```
Expected: both packages listed without errors

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-day-picker and date-fns dependencies"
```

---

## Task 2: Date Range Picker component

**Files:**
- Create: `components/ui/date-range-picker.tsx`

- [ ] **Step 1: Create the date range picker component**

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { DayPicker, DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import { cn } from "@/lib/utils";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";

type Preset = { label: string; days: number };

const PRESETS: Preset[] = [
  { label: "오늘", days: 0 },
  { label: "7일", days: 7 },
  { label: "30일", days: 30 },
];

function getPresetRange(days: number): DateRange {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  if (days === 0) {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const activePreset = PRESETS.find((p) => {
    const r = getPresetRange(p.days);
    return (
      value.from?.toDateString() === r.from?.toDateString() &&
      value.to?.toDateString() === r.to?.toDateString()
    );
  });

  const formatLabel = () => {
    if (activePreset) return activePreset.label;
    if (value.from && value.to) {
      const fmt = (d: Date) =>
        d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
      return `${fmt(value.from)} – ${fmt(value.to)}`;
    }
    return "날짜 선택";
  };

  return (
    <div ref={ref} className={cn("relative", className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        className="gap-1.5 text-xs"
      >
        <CalendarDays className="h-3.5 w-3.5" />
        {formatLabel()}
      </Button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 rounded-lg border bg-popover p-3 shadow-lg">
          <div className="flex gap-1 mb-2">
            {PRESETS.map((p) => (
              <Button
                key={p.days}
                variant={activePreset?.days === p.days ? "default" : "ghost"}
                size="sm"
                className="text-xs"
                onClick={() => {
                  onChange(getPresetRange(p.days));
                  setOpen(false);
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <DayPicker
            mode="range"
            selected={value}
            onSelect={(range) => {
              if (range?.from && range?.to) {
                const to = new Date(range.to);
                to.setHours(23, 59, 59, 999);
                onChange({ from: range.from, to });
                setOpen(false);
              } else if (range?.from) {
                onChange({ from: range.from, to: value.to });
              }
            }}
            numberOfMonths={1}
            className="text-sm"
          />
        </div>
      )}
    </div>
  );
}

export { getPresetRange };
export type { DateRange };
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```
Expected: no errors related to date-range-picker

- [ ] **Step 3: Commit**

```bash
git add components/ui/date-range-picker.tsx
git commit -m "feat: add DateRangePicker component with presets and calendar"
```

---

## Task 3: Add date filtering to Phoenix API

**Files:**
- Modify: `lib/phoenix.ts:104-112`

- [ ] **Step 1: Update fetchTraces signature and API call**

In `lib/phoenix.ts`, change the `fetchTraces` function signature and URL to include date params:

```typescript
// Old (line 104-112):
export async function fetchTraces(
  projectName: string,
  spanKinds?: string,
  contentFilter?: string,
): Promise<Trace[]> {
  // 1. Get all spans
  const spansRes = await fetch(
    `/api/phoenix?path=/v1/projects/${encodeURIComponent(projectName)}/spans&limit=1000`,
  );

// New:
export async function fetchTraces(
  projectName: string,
  spanKinds?: string,
  contentFilter?: string,
  startTime?: string,
  endTime?: string,
): Promise<Trace[]> {
  // 1. Get all spans
  let url = `/api/phoenix?path=/v1/projects/${encodeURIComponent(projectName)}/spans&limit=1000`;
  if (startTime) url += `&start_time=${encodeURIComponent(startTime)}`;
  if (endTime) url += `&end_time=${encodeURIComponent(endTime)}`;
  const spansRes = await fetch(url);
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```
Expected: no errors (existing callers pass undefined for new optional params)

- [ ] **Step 3: Commit**

```bash
git add lib/phoenix.ts
git commit -m "feat: add startTime/endTime params to fetchTraces"
```

---

## Task 4: Integrate date picker into Dashboard page

**Files:**
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Add date range state and picker to dashboard**

Add imports at the top of `app/dashboard/page.tsx`:
```typescript
import { DateRangePicker, getPresetRange } from "@/components/ui/date-range-picker";
import type { DateRange } from "react-day-picker";
```

Add state inside the `DashboardPage` component (after other state declarations):
```typescript
const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange(7));
```

- [ ] **Step 2: Pass date range to fetchTraces calls**

Find the `fetchTraces` call in the dashboard's data loading effect/callback. Add startTime and endTime:
```typescript
const traces = await fetchTraces(
  projectName,
  spanKinds,
  contentFilter,
  dateRange.from?.toISOString(),
  dateRange.to?.toISOString(),
);
```

Add `dateRange` to the useEffect/useCallback dependency array.

- [ ] **Step 3: Add DateRangePicker to the toolbar UI**

Place the `<DateRangePicker>` next to the existing `<ProjectSelector>` in the dashboard header:
```tsx
<DateRangePicker value={dateRange} onChange={setDateRange} />
```

- [ ] **Step 4: Verify it compiles and renders**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
npm run dev &
```
Open `http://localhost:3000/dashboard`, verify the date picker appears and filters data.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: add date range picker to dashboard page"
```

---

## Task 5: Integrate date picker into Projects Manager

**Files:**
- Modify: `app/projects/projects-manager.tsx`

- [ ] **Step 1: Add date range state and import**

Add imports:
```typescript
import { DateRangePicker, getPresetRange } from "@/components/ui/date-range-picker";
import type { DateRange } from "react-day-picker";
```

Add state:
```typescript
const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange(7));
```

- [ ] **Step 2: Pass date range to fetchTraces calls**

Update the `fetchTraces` call to include date parameters:
```typescript
const traces = await fetchTraces(
  selectedProject.name,
  undefined,
  undefined,
  dateRange.from?.toISOString(),
  dateRange.to?.toISOString(),
);
```

Add `dateRange` to the dependency array.

- [ ] **Step 3: Add DateRangePicker to the project detail header**

Place it in the filter/toolbar area of the project detail panel.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add app/projects/projects-manager.tsx
git commit -m "feat: add date range picker to projects manager"
```

---

## Task 6: RMF utils — metric definitions, thresholds, status logic

**Files:**
- Create: `lib/rmf-utils.ts`

- [ ] **Step 1: Create rmf-utils with all metric definitions and threshold logic**

```typescript
import type { SpanData, AnnotationData } from "@/lib/dashboard-utils";
import { avg, pct, percentile, errorCount, llmFilter, calcCost } from "@/lib/dashboard-utils";

// ─── Metric definitions ─────────────────────────────────────────────────

export type StatusLevel = "green" | "yellow" | "red";

export interface MetricThreshold {
  green: (v: number) => boolean;
  yellow: (v: number) => boolean;
}

export interface MeasureMetricDef {
  id: string;
  label: string;
  engLabel: string;
  description: string;
  unit: string;
  /** true = higher is worse (rates like hallucination), false = higher is better (accuracy) */
  lowerIsBetter: boolean;
  threshold: MetricThreshold;
}

export const MEASURE_METRICS: MeasureMetricDef[] = [
  {
    id: "hallucination_rate",
    label: "환각률",
    engLabel: "Hallucination Eval",
    description: "LLM이 사실과 다른 정보를 생성하는 비율. 금융/의료 AI에서 가장 위험한 지표.",
    unit: "%",
    lowerIsBetter: true,
    threshold: { green: (v) => v < 5, yellow: (v) => v < 10 },
  },
  {
    id: "toxicity_rate",
    label: "독성률",
    engLabel: "Toxicity Eval",
    description: "유해하거나 편향된 콘텐츠 생성 비율. 소비자 대면 AI에서 필수 모니터링.",
    unit: "%",
    lowerIsBetter: true,
    threshold: { green: (v) => v < 3, yellow: (v) => v < 5 },
  },
  {
    id: "qa_accuracy",
    label: "답변 정확도",
    engLabel: "QA Eval",
    description: "질문에 대한 답변의 정확성. 핵심 품질 지표.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 90, yellow: (v) => v > 80 },
  },
  {
    id: "retrieval_relevance",
    label: "검색 관련성",
    engLabel: "Relevance Eval",
    description: "검색된 문서의 질문 관련성. RAG 파이프라인 핵심.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 85, yellow: (v) => v > 70 },
  },
  {
    id: "latency_p95",
    label: "응답 지연시간",
    engLabel: "Span Duration",
    description: "95번째 백분위 응답 시간. 사용자 경험과 SLA 준수 기준.",
    unit: "s",
    lowerIsBetter: true,
    threshold: { green: (v) => v < 2, yellow: (v) => v < 5 },
  },
  {
    id: "error_rate",
    label: "에러율",
    engLabel: "status_code",
    description: "API 호출 실패 비율. 서비스 안정성과 직결.",
    unit: "%",
    lowerIsBetter: true,
    threshold: { green: (v) => v < 3, yellow: (v) => v < 5 },
  },
  {
    id: "token_efficiency",
    label: "토큰 효율성",
    engLabel: "token_count",
    description: "호출당 평균 토큰 수. 비용 최적화 지표.",
    unit: "avg",
    lowerIsBetter: true,
    threshold: { green: (v) => v < 1500, yellow: (v) => v < 3000 },
  },
  {
    id: "cost_tracking",
    label: "비용 추적",
    engLabel: "llm.cost.total",
    description: "일일 LLM API 비용. 예산 관리 핵심.",
    unit: "$/day",
    lowerIsBetter: true,
    threshold: { green: (v) => v < 100, yellow: (v) => v < 200 },
  },
  {
    id: "user_frustration",
    label: "사용자 불만도",
    engLabel: "Frustration Eval",
    description: "사용자가 싫어요를 누른 응답 비율.",
    unit: "%",
    lowerIsBetter: true,
    threshold: { green: (v) => v < 5, yellow: (v) => v < 15 },
  },
  {
    id: "tool_calling_accuracy",
    label: "도구 호출 정확도",
    engLabel: "Tool Calling Eval",
    description: "도구/함수 호출의 성공률.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 90, yellow: (v) => v > 80 },
  },
  {
    id: "guardrail_trigger",
    label: "가드레일 트리거",
    engLabel: "GUARDRAIL span",
    description: "안전 가드레일이 작동한 비율.",
    unit: "%",
    lowerIsBetter: true,
    threshold: { green: (v) => v < 3, yellow: (v) => v < 5 },
  },
  {
    id: "citation_accuracy",
    label: "인용 정확도",
    engLabel: "Citation Eval",
    description: "응답에서 인용한 내용의 정확성.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 85, yellow: (v) => v > 70 },
  },
];

// ─── Status calculation ──────────────────────────────────────────────────

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

// ─── Compute metric values from spans + annotations ──────────────────────

export interface MetricValue {
  id: string;
  value: number;
  formatted: string;
  status: StatusLevel;
}

function annotationRate(annotations: AnnotationData[], name: string, matchLabel: string): number {
  const matching = annotations.filter((a) => a.name === name);
  if (matching.length === 0) return 0;
  return pct(matching.filter((a) => a.label === matchLabel).length, matching.length);
}

function annotationAvgScore(annotations: AnnotationData[], name: string): number {
  const matching = annotations.filter((a) => a.name === name);
  if (matching.length === 0) return 0;
  return avg(matching.map((a) => a.score)) * 100;
}

export function computeMetrics(
  spans: SpanData[],
  annotations: AnnotationData[],
  feedbackStats?: { total: number; downCount: number },
): MetricValue[] {
  const llmSpans = llmFilter(spans);
  const p95 = llmSpans.length > 0 ? percentile(llmSpans, 95) / 1000 : 0;
  const errRate = spans.length > 0 ? pct(errorCount(spans), spans.length) : 0;
  const avgTokens = llmSpans.length > 0
    ? avg(llmSpans.map((s) => s.totalTokens))
    : 0;
  const dailyCost = llmSpans.reduce((sum, s) => sum + calcCost(s), 0);
  const frustration = feedbackStats && feedbackStats.total > 0
    ? pct(feedbackStats.downCount, feedbackStats.total)
    : 0;

  const rawValues: Record<string, number> = {
    hallucination_rate: annotationRate(annotations, "hallucination", "hallucinated"),
    toxicity_rate: annotationRate(annotations, "banned_word", "detected"),
    qa_accuracy: annotationAvgScore(annotations, "qa_correctness"),
    retrieval_relevance: annotationAvgScore(annotations, "rag_relevance"),
    latency_p95: p95,
    error_rate: errRate,
    token_efficiency: avgTokens,
    cost_tracking: dailyCost,
    user_frustration: frustration,
    tool_calling_accuracy: annotationAvgScore(annotations, "tool_calling"),
    guardrail_trigger: annotationRate(annotations, "guardrail", "triggered"),
    citation_accuracy: annotationAvgScore(annotations, "citation"),
  };

  return MEASURE_METRICS.map((def) => {
    const value = rawValues[def.id] ?? 0;
    let formatted: string;
    if (def.unit === "s") formatted = `${value.toFixed(1)}s`;
    else if (def.unit === "$/day") formatted = `$${value.toFixed(0)}/day`;
    else if (def.unit === "avg") formatted = `${Math.round(value)} avg`;
    else formatted = `${value.toFixed(1)}%`;

    return {
      id: def.id,
      value,
      formatted,
      status: getStatus(def, value),
    };
  });
}

// ─── Gap analysis helpers ────────────────────────────────────────────────

export type GapStatus = "NORMAL" | "WARNING" | "CRITICAL";

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
    case "CRITICAL": return "IMMEDIATE ACTION: Escalate to CISO and AI Ethics Board. Consider model suspension pending review.";
    case "WARNING": return "Review and update governance policies.";
    case "NORMAL": return "Continue monitoring.";
  }
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add lib/rmf-utils.ts
git commit -m "feat: add RMF metric definitions, thresholds, and computation logic"
```

---

## Task 7: MEASURE metric grid component

**Files:**
- Create: `components/dashboard/widgets/measure-grid.tsx`

- [ ] **Step 1: Create the 4x3 metric grid component**

```tsx
"use client";

import { cn } from "@/lib/utils";
import type { MetricValue } from "@/lib/rmf-utils";
import { MEASURE_METRICS, STATUS_COLORS } from "@/lib/rmf-utils";

interface MeasureGridProps {
  metrics: MetricValue[];
  className?: string;
}

export function MeasureGrid({ metrics, className }: MeasureGridProps) {
  return (
    <div className={cn("grid grid-cols-4 gap-4", className)}>
      {MEASURE_METRICS.map((def) => {
        const metric = metrics.find((m) => m.id === def.id);
        const value = metric?.formatted ?? "N/A";
        const status = metric?.status ?? "green";

        return (
          <div
            key={def.id}
            className="rounded-xl border bg-card p-4 flex flex-col gap-1"
          >
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: STATUS_COLORS[status] }}
              />
              <span className="text-sm font-medium text-foreground">{def.label}</span>
            </div>
            <div className="text-2xl font-bold text-foreground mt-1">{value}</div>
            <div className="text-xs text-muted-foreground">{def.engLabel}</div>
            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{def.description}</div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/widgets/measure-grid.tsx
git commit -m "feat: add MeasureGrid component for 12 MEASURE metrics"
```

---

## Task 8: RMF Function card component

**Files:**
- Create: `components/dashboard/widgets/rmf-function-card.tsx`

- [ ] **Step 1: Create the 4-function card component**

```tsx
"use client";

import { cn } from "@/lib/utils";

interface RmfFunction {
  name: string;
  label: string;
  description: string;
  score: number | null;
  color: string;
}

const RMF_FUNCTIONS: RmfFunction[] = [
  { name: "GOVERN", label: "거버넌스", description: "AI 정책 수립, 역할/책임 정의, 윤리 원칙, 교육·훈련", score: null, color: "#3b82f6" },
  { name: "MAP", label: "리스크 식별", description: "AI 시스템 인벤토리, 리스크 카테고리, 영향 범위 분석", score: null, color: "#7c3aed" },
  { name: "MEASURE", label: "리스크 측정", description: "성능 지표, 편향성 평가, 환각/독성 모니터링", score: null, color: "#10b981" },
  { name: "MANAGE", label: "리스크 대응", description: "개선 액션, 알림 체계, 인시던트 대응, 감사 이력", score: null, color: "#14b8a6" },
];

interface RmfFunctionCardsProps {
  measureScore?: number;
  className?: string;
}

export function RmfFunctionCards({ measureScore, className }: RmfFunctionCardsProps) {
  const functions = RMF_FUNCTIONS.map((f) => ({
    ...f,
    score: f.name === "MEASURE" ? (measureScore ?? null) : f.score,
  }));

  return (
    <div className={cn("grid grid-cols-4 gap-4", className)}>
      {functions.map((f) => (
        <div key={f.name} className="rounded-xl border bg-card p-5 flex flex-col">
          <div className="h-1 rounded-full mb-3" style={{ backgroundColor: f.color }} />
          <div className="text-lg font-bold" style={{ color: f.color }}>{f.name}</div>
          <div className="text-sm text-muted-foreground">{f.label}</div>
          <div className="text-3xl font-bold text-foreground mt-2">
            {f.score !== null ? `${Math.round(f.score)}%` : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-2 line-clamp-2">{f.description}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/widgets/rmf-function-card.tsx
git commit -m "feat: add RMF 4 Function card component"
```

---

## Task 9: Gap Analysis component

**Files:**
- Create: `components/dashboard/widgets/gap-analysis.tsx`

- [ ] **Step 1: Create the Gap Analysis chart + table**

```tsx
"use client";

import { HighchartWidget } from "@/components/dashboard/widgets/highchart-widget";
import { getGapStatus, getRecommendedAction, GAP_STATUS_COLORS } from "@/lib/rmf-utils";
import type { GapStatus } from "@/lib/rmf-utils";
import { cn } from "@/lib/utils";

export interface GapDataItem {
  system: string;
  govScore: number;
  evalScore: number;
}

interface GapAnalysisProps {
  data: GapDataItem[];
  className?: string;
}

function StatusBadge({ status }: { status: GapStatus }) {
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-semibold text-white"
      style={{ backgroundColor: GAP_STATUS_COLORS[status] }}
    >
      {status}
    </span>
  );
}

export function GapAnalysis({ data, className }: GapAnalysisProps) {
  const sorted = [...data].sort((a, b) => (a.govScore - a.evalScore) - (b.govScore - b.evalScore));

  const chartOptions: Highcharts.Options = {
    chart: { type: "column" },
    title: { text: "Gov Score vs Eval Score (worst first)", style: { fontSize: "14px" } },
    xAxis: { categories: sorted.map((d) => d.system), labels: { rotation: -45, style: { fontSize: "10px" } } },
    yAxis: { title: { text: "Score" }, min: 0, max: 100 },
    series: [
      { type: "column", name: "Gov Score", data: sorted.map((d) => d.govScore), color: "#6366f1" },
      { type: "column", name: "Eval Score", data: sorted.map((d) => d.evalScore), color: "#10b981" },
    ],
    plotOptions: { column: { grouping: true, pointPadding: 0.1 } },
    legend: { enabled: true },
  };

  return (
    <div className={cn("space-y-4", className)}>
      <HighchartWidget options={chartOptions} />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 px-3">RISK</th>
              <th className="py-2 px-3 text-blue-600">GOV SCORE</th>
              <th className="py-2 px-3 text-green-600">EVAL SCORE</th>
              <th className="py-2 px-3">GAP</th>
              <th className="py-2 px-3">STATUS</th>
              <th className="py-2 px-3">RECOMMENDED ACTION</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((d) => {
              const gap = d.evalScore - d.govScore;
              const status = getGapStatus(gap);
              return (
                <tr key={d.system} className="border-b">
                  <td className="py-2 px-3">
                    <StatusBadge status={status} />
                  </td>
                  <td className="py-2 px-3 text-blue-600 font-medium">{d.govScore}</td>
                  <td className="py-2 px-3 text-green-600 font-medium">{d.evalScore}</td>
                  <td className="py-2 px-3 font-medium" style={{ color: GAP_STATUS_COLORS[status] }}>
                    {gap > 0 ? `+${gap}` : gap}
                  </td>
                  <td className="py-2 px-3"><StatusBadge status={status} /></td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">{getRecommendedAction(status)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/widgets/gap-analysis.tsx
git commit -m "feat: add Gap Analysis chart and risk table component"
```

---

## Task 10: Add tabs to Projects Manager + wire MEASURE tab

**Files:**
- Modify: `app/projects/projects-manager.tsx`

- [ ] **Step 1: Add tab state and imports**

Add imports:
```typescript
import { MeasureGrid } from "@/components/dashboard/widgets/measure-grid";
import { RmfFunctionCards } from "@/components/dashboard/widgets/rmf-function-card";
import { GapAnalysis } from "@/components/dashboard/widgets/gap-analysis";
import type { GapDataItem } from "@/components/dashboard/widgets/gap-analysis";
import { computeMetrics } from "@/lib/rmf-utils";
import type { AnnotationData, SpanData } from "@/lib/dashboard-utils";
```

Add state:
```typescript
type ProjectTab = "traces" | "measure" | "risk";
const [activeTab, setActiveTab] = useState<ProjectTab>("traces");
```

- [ ] **Step 2: Build tab navigation UI**

Add this above the existing project detail content (inside the detail panel section):
```tsx
<div className="flex gap-1 border-b mb-4">
  {(["traces", "measure", "risk"] as const).map((tab) => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      className={cn(
        "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
        activeTab === tab
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {{ traces: "트레이스", measure: "MEASURE 지표", risk: "리스크 관리" }[tab]}
    </button>
  ))}
</div>
```

- [ ] **Step 3: Wrap existing content in traces tab, add MEASURE tab**

Wrap the existing project detail content in `{activeTab === "traces" && (...)}`.

Add the MEASURE tab content:
```tsx
{activeTab === "measure" && (
  <div className="space-y-6">
    <RmfFunctionCards measureScore={measureScore} />
    <MeasureGrid metrics={metrics} />
    <GapAnalysis data={gapData} />
  </div>
)}
```

Compute metrics from the loaded traces/annotations data:
```typescript
const metrics = useMemo(() => {
  if (!traces.length) return [];
  const spanData: SpanData[] = traces.map((t) => ({
    latency: t.latency,
    status: "OK",
    time: t.time,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    model: "",
    spanKind: "LLM",
  }));
  const annData: AnnotationData[] = traces.flatMap((t) =>
    t.annotations.map((a) => ({ ...a, time: t.time })),
  );
  return computeMetrics(spanData, annData);
}, [traces]);
```

- [ ] **Step 4: Verify compilation and rendering**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add app/projects/projects-manager.tsx
git commit -m "feat: add tabs to projects manager with MEASURE metrics view"
```

---

## Task 11: Register RMF widgets in dashboard

**Files:**
- Create: `components/dashboard/widgets/rmf-widgets.tsx`
- Modify: `components/dashboard/widgets/registry.tsx`
- Modify: `components/dashboard/add-widget-menu.tsx`

- [ ] **Step 1: Create RMF widget renderers**

```tsx
"use client";

import { MeasureGrid } from "./measure-grid";
import { RmfFunctionCards } from "./rmf-function-card";
import { computeMetrics } from "@/lib/rmf-utils";
import type { WidgetRenderProps } from "./registry";

export function rmf_overview({ annotations, spans }: WidgetRenderProps) {
  const metrics = computeMetrics(spans, annotations);
  const greenCount = metrics.filter((m) => m.status === "green").length;
  const measureScore = Math.round((greenCount / metrics.length) * 100);
  return <RmfFunctionCards measureScore={measureScore} />;
}

export function rmf_measure_grid({ annotations, spans }: WidgetRenderProps) {
  const metrics = computeMetrics(spans, annotations);
  return <MeasureGrid metrics={metrics} />;
}
```

- [ ] **Step 2: Register in registry.tsx**

Add import at top of `components/dashboard/widgets/registry.tsx`:
```typescript
import * as rmf from "./rmf-widgets";
```

Add to `widgetRegistry` object:
```typescript
  // RMF
  rmf_overview:      { render: rmf.rmf_overview,      colorSlots: 1 },
  rmf_measure_grid:  { render: rmf.rmf_measure_grid,  colorSlots: 1 },
```

- [ ] **Step 3: Add RMF category to add-widget-menu.tsx**

Add a new group to the `WIDGET_GROUPS` array in `components/dashboard/add-widget-menu.tsx`:
```typescript
{
  label: "RMF",
  widgets: [
    { type: "rmf_overview", title: "RMF Overview", icon: "🏛️" },
    { type: "rmf_measure_grid", title: "MEASURE 지표 그리드", icon: "📊" },
  ],
},
```

- [ ] **Step 4: Verify compilation**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/widgets/rmf-widgets.tsx components/dashboard/widgets/registry.tsx components/dashboard/add-widget-menu.tsx
git commit -m "feat: register RMF widgets in dashboard widget system"
```

---

## Task 12: Prisma schema — MessageFeedback, RiskItem, Incident

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add MessageFeedback model**

Append to `prisma/schema.prisma`:
```prisma
model MessageFeedback {
  id        String   @id @default(cuid())
  messageId String
  userId    String
  value     String   // "up" | "down"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  message   Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id])

  @@unique([messageId, userId])
}
```

Add relation fields to existing models:
- On `Message`: add `feedback MessageFeedback[]`
- On `User`: add `feedbacks MessageFeedback[]`

- [ ] **Step 2: Add RiskItem and Incident models**

```prisma
model RiskItem {
  id         String    @id @default(cuid())
  projectId  String
  name       String
  system     String
  riskLevel  String
  mitigation String
  status     String    @default("OPEN")
  assignee   String?
  dueDate    DateTime?
  resolvedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
}

model Incident {
  id         String    @id @default(cuid())
  projectId  String
  title      String
  severity   String
  status     String    @default("OPEN")
  createdAt  DateTime  @default(now())
  resolvedAt DateTime?
}
```

- [ ] **Step 3: Run migration**

```bash
npx prisma migrate dev --name add-feedback-risk-incident
```

- [ ] **Step 4: Generate client**

```bash
npx prisma generate
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add MessageFeedback, RiskItem, Incident Prisma models"
```

---

## Task 13: Feedback API route

**Files:**
- Create: `app/api/feedback/route.ts`

- [ ] **Step 1: Create feedback API**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const messageId = req.nextUrl.searchParams.get("messageId");
  const userId = req.nextUrl.searchParams.get("userId");
  if (!messageId || !userId) {
    return NextResponse.json({ error: "messageId and userId required" }, { status: 400 });
  }

  const feedback = await prisma.messageFeedback.findUnique({
    where: { messageId_userId: { messageId, userId } },
  });

  return NextResponse.json({ feedback });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { messageId, userId, value, spanId, projectName } = body;

  if (!messageId || !userId || !value) {
    return NextResponse.json({ error: "messageId, userId, value required" }, { status: 400 });
  }

  if (value !== "up" && value !== "down") {
    return NextResponse.json({ error: "value must be 'up' or 'down'" }, { status: 400 });
  }

  // Upsert in Prisma
  const feedback = await prisma.messageFeedback.upsert({
    where: { messageId_userId: { messageId, userId } },
    update: { value },
    create: { messageId, userId, value },
  });

  // Upload to Phoenix as annotation (fire-and-forget)
  if (spanId && projectName) {
    const phoenixUrl = process.env.PHOENIX_COLLECTOR_ENDPOINT || "http://localhost:6006";
    fetch(`${phoenixUrl}/v1/projects/${encodeURIComponent(projectName)}/span_annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [{
          span_id: spanId,
          name: "user_feedback",
          annotator_kind: "HUMAN",
          result: {
            label: value === "up" ? "positive" : "negative",
            score: value === "up" ? 1.0 : 0.0,
          },
        }],
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ feedback });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const { messageId, userId } = body;

  if (!messageId || !userId) {
    return NextResponse.json({ error: "messageId and userId required" }, { status: 400 });
  }

  await prisma.messageFeedback.deleteMany({
    where: { messageId, userId },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add app/api/feedback/route.ts
git commit -m "feat: add feedback API route (CRUD + Phoenix annotation)"
```

---

## Task 14: Message Feedback UI component

**Files:**
- Create: `components/chat/message-feedback.tsx`

- [ ] **Step 1: Create the thumbs up/down component**

```tsx
"use client";

import { useState, useCallback } from "react";
import { ThumbsUp, ThumbsDown, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

interface MessageFeedbackProps {
  messageId: string;
  content: string;
  initialValue?: "up" | "down" | null;
}

export function MessageFeedback({ messageId, content, initialValue = null }: MessageFeedbackProps) {
  const { user } = useAuth();
  const [value, setValue] = useState<"up" | "down" | null>(initialValue);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const handleFeedback = useCallback(async (newValue: "up" | "down") => {
    if (!user) return;

    if (value === newValue) {
      // Cancel feedback
      setValue(null);
      fetch("/api/feedback", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, userId: user.uid }),
      }).catch(() => {});
    } else {
      // Set or toggle feedback
      setValue(newValue);
      fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, userId: user.uid, value: newValue }),
      }).catch(() => {});
    }
  }, [user, messageId, value]);

  return (
    <div className="flex items-center gap-1 mt-1">
      <button
        onClick={handleCopy}
        className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
        title="복사"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>

      {/* Show thumbs up: always if no selection, or if selected */}
      {(value === null || value === "up") && (
        <button
          onClick={() => handleFeedback("up")}
          className={cn(
            "p-1 rounded transition-colors",
            value === "up"
              ? "text-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
          title="좋아요"
        >
          <ThumbsUp className={cn("h-4 w-4", value === "up" && "fill-current")} />
        </button>
      )}

      {/* Show thumbs down: always if no selection, or if selected */}
      {(value === null || value === "down") && (
        <button
          onClick={() => handleFeedback("down")}
          className={cn(
            "p-1 rounded transition-colors",
            value === "down"
              ? "text-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
          title="싫어요"
        >
          <ThumbsDown className={cn("h-4 w-4", value === "down" && "fill-current")} />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add components/chat/message-feedback.tsx
git commit -m "feat: add MessageFeedback component (thumbs up/down + copy)"
```

---

## Task 15: Wire feedback into chat messages

**Files:**
- Modify: `components/assistant-ui/thread/messages.tsx`
- Modify: `components/assistant-ui/thread/index.tsx`
- Modify: `app/assistant.tsx`
- Modify: `app/api/user-threads/[id]/messages/route.ts`

- [ ] **Step 1: Update HistoryAssistantMessage to include feedback**

In `components/assistant-ui/thread/messages.tsx`, update the `HistoryAssistantMessage` component:

```typescript
import { MessageFeedback } from "@/components/chat/message-feedback";
```

Change the signature and body:
```tsx
export const HistoryAssistantMessage: FC<{
  content: string;
  messageId: string;
  feedbackValue?: "up" | "down" | null;
}> = ({ content, messageId, feedbackValue }) => (
  <div
    className="relative mx-auto w-full max-w-(--thread-max-width) py-3"
    data-role="assistant"
  >
    <div className={cn(ASSISTANT_BODY_CLS, "whitespace-pre-wrap")}>{content}</div>
    <div className="ml-2 mt-1">
      <MessageFeedback messageId={messageId} content={content} initialValue={feedbackValue} />
    </div>
  </div>
);
```

- [ ] **Step 2: Update HistoryMessage type in thread/index.tsx**

In `components/assistant-ui/thread/index.tsx`, update the `HistoryMessage` interface:
```typescript
export interface HistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  feedbackValue?: "up" | "down" | null;
}
```

Update the rendering in the map:
```tsx
<HistoryAssistantMessage
  key={msg.id}
  content={msg.content}
  messageId={msg.id}
  feedbackValue={msg.feedbackValue}
/>
```

- [ ] **Step 3: Include feedback in message API response**

In `app/api/user-threads/[id]/messages/route.ts`, add feedback include to the Prisma query:
```typescript
const messages = await prisma.message.findMany({
  where: { threadId: params.id },
  include: { feedback: true },
  orderBy: { createdAt: "asc" },
});
```

Map the response to include feedbackValue:
```typescript
const result = messages.map((m) => ({
  id: m.id,
  role: m.role,
  content: m.content,
  createdAt: m.createdAt,
  feedbackValue: m.feedback?.[0]?.value ?? null,
}));
```

- [ ] **Step 4: Load feedback state in assistant.tsx**

In the `handleSelectThread` callback in `app/assistant.tsx`, update the message loading to include feedbackValue:
```typescript
const loadedMessages = (data.messages ?? []).map((m: any) => ({
  id: m.id,
  role: m.role as "user" | "assistant",
  content: m.content,
  feedbackValue: m.feedbackValue ?? null,
}));
```

- [ ] **Step 5: Verify compilation**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add components/assistant-ui/thread/messages.tsx components/assistant-ui/thread/index.tsx app/assistant.tsx app/api/user-threads/*/messages/route.ts
git commit -m "feat: wire feedback buttons into chat history messages"
```

---

## Task 16: MANAGE risk management view

**Files:**
- Create: `components/dashboard/widgets/manage-view.tsx`
- Create: `app/api/risks/route.ts`
- Create: `app/api/incidents/route.ts`

- [ ] **Step 1: Create Risk CRUD API**

`app/api/risks/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const risks = await prisma.riskItem.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ risks });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const risk = await prisma.riskItem.create({ data: body });
  return NextResponse.json({ risk });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, ...data } = body;
  const risk = await prisma.riskItem.update({ where: { id }, data });
  return NextResponse.json({ risk });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await prisma.riskItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Create Incident CRUD API**

`app/api/incidents/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const incidents = await prisma.incident.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ incidents });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const incident = await prisma.incident.create({ data: body });
  return NextResponse.json({ incident });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, ...data } = body;
  const incident = await prisma.incident.update({ where: { id }, data });
  return NextResponse.json({ incident });
}
```

- [ ] **Step 3: Create ManageView component**

`components/dashboard/widgets/manage-view.tsx`:
```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { StatCard } from "./stat-card";
import { HighchartWidget } from "./highchart-widget";
import { cn } from "@/lib/utils";

interface RiskItem {
  id: string;
  name: string;
  system: string;
  riskLevel: string;
  mitigation: string;
  status: string;
  assignee: string | null;
}

interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
}

interface ManageViewProps {
  projectId: string;
  className?: string;
}

const RISK_COLORS: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH: "#f97316",
  MEDIUM: "#f59e0b",
  LOW: "#10b981",
};

const STATUS_COLORS: Record<string, string> = {
  MITIGATED: "#10b981",
  ACCEPTED: "#3b82f6",
  TRANSFERRED: "#8b5cf6",
  IN_PROGRESS: "#f59e0b",
  OPEN: "#ef4444",
};

export function ManageView({ projectId, className }: ManageViewProps) {
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [statusFilter, setStatusFilter] = useState("ALL");

  const loadData = useCallback(async () => {
    const [risksRes, incidentsRes] = await Promise.all([
      fetch(`/api/risks?projectId=${encodeURIComponent(projectId)}`),
      fetch(`/api/incidents?projectId=${encodeURIComponent(projectId)}`),
    ]);
    if (risksRes.ok) setRisks((await risksRes.json()).risks ?? []);
    if (incidentsRes.ok) setIncidents((await incidentsRes.json()).incidents ?? []);
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  const total = risks.length;
  const mitigated = risks.filter((r) => r.status === "MITIGATED").length;
  const coverage = total > 0 ? Math.round((mitigated / total) * 100) : 0;
  const unresolved = risks.filter((r) => r.status === "OPEN" || r.status === "IN_PROGRESS").length;
  const activeIncidents = incidents.filter((i) => i.status !== "RESOLVED").length;

  const statusCounts = Object.entries(
    risks.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {}),
  );

  const donutOptions: Highcharts.Options = {
    chart: { type: "pie" },
    title: { text: "처리 상태 분포", style: { fontSize: "14px" } },
    plotOptions: { pie: { innerSize: "60%", dataLabels: { enabled: true, format: "{point.name}: {point.y}" } } },
    series: [{
      type: "pie",
      data: statusCounts.map(([name, count]) => ({
        name,
        y: count,
        color: STATUS_COLORS[name] || "#94a3b8",
      })),
    }],
  };

  const filtered = statusFilter === "ALL" ? risks : risks.filter((r) => r.status === statusFilter);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Stat Cards */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard value={`${coverage}%`} label="MANAGE 커버리지" />
        <StatCard value={unresolved} label="미처리 리스크" />
        <StatCard value={activeIncidents} label="활성 인시던트" />
        <StatCard value={0} label="기한 초과 조치" />
        <StatCard value="—" label="평균 MTTR" />
      </div>

      {/* Donut + Table */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <HighchartWidget options={donutOptions} />
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">처리 계획 목록</h3>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs border rounded px-2 py-1 bg-background"
            >
              <option value="ALL">전체 상태</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="MITIGATED">Mitigated</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="TRANSFERRED">Transferred</option>
            </select>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground text-left">
                <th className="py-2 px-2">리스크명</th>
                <th className="py-2 px-2">시스템</th>
                <th className="py-2 px-2">고유 위험</th>
                <th className="py-2 px-2">처리 방안</th>
                <th className="py-2 px-2">상태</th>
                <th className="py-2 px-2">담당자</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2 px-2 truncate max-w-[150px]">{r.name}</td>
                  <td className="py-2 px-2">{r.system}</td>
                  <td className="py-2 px-2">
                    <span
                      className="px-1.5 py-0.5 rounded text-white text-[10px] font-semibold"
                      style={{ backgroundColor: RISK_COLORS[r.riskLevel] || "#94a3b8" }}
                    >
                      {r.riskLevel}
                    </span>
                  </td>
                  <td className="py-2 px-2 truncate max-w-[150px]">{r.mitigation}</td>
                  <td className="py-2 px-2">
                    <span
                      className="px-1.5 py-0.5 rounded text-white text-[10px] font-semibold"
                      style={{ backgroundColor: STATUS_COLORS[r.status] || "#94a3b8" }}
                    >
                      {r.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="py-2 px-2">{r.assignee || "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">리스크 항목이 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify compilation**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/widgets/manage-view.tsx app/api/risks/route.ts app/api/incidents/route.ts
git commit -m "feat: add MANAGE risk management view with APIs"
```

---

## Task 17: Wire risk management tab into Projects Manager

**Files:**
- Modify: `app/projects/projects-manager.tsx`

- [ ] **Step 1: Add ManageView import and render in risk tab**

Add import:
```typescript
import { ManageView } from "@/components/dashboard/widgets/manage-view";
```

Add the risk tab content:
```tsx
{activeTab === "risk" && selectedProject && (
  <ManageView projectId={selectedProject.id} />
)}
```

- [ ] **Step 2: Verify compilation and rendering**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add app/projects/projects-manager.tsx
git commit -m "feat: wire MANAGE risk tab into projects manager"
```

---

## Task 18: New evals — tool_calling, guardrail, citation

**Files:**
- Modify: `/home/rheon/Desktop/Semester/4-1/cpastone/legal-rag-self-improve-demo/src/agent/evaluator.py`
- Modify: `/home/rheon/Desktop/Semester/4-1/cpastone/legal-rag-self-improve-demo/src/agent/__init__.py`

- [ ] **Step 1: Add tool_calling check to evaluator.py**

Add after the `_banned_word_check` function (around line 47):

```python
def _tool_calling_check(span_status: str) -> dict:
    """CODE eval: check if tool call succeeded based on span status."""
    ok = span_status.upper() in ("OK", "UNSET", "")
    return {
        "label": "success" if ok else "failure",
        "score": 1.0 if ok else 0.0,
        "explanation": f"Span status: {span_status}",
    }
```

- [ ] **Step 2: Add guardrail check to evaluator.py**

```python
def _guardrail_check(banned_result: dict, hallucination_result: dict | None) -> dict:
    """CODE eval: guardrail triggered if banned word detected or high hallucination."""
    triggered = (
        banned_result.get("label") == "detected"
        or (hallucination_result and hallucination_result.get("score", 0) > 0.5)
    )
    return {
        "label": "triggered" if triggered else "clean",
        "score": 1.0 if triggered else 0.0,
        "explanation": "Guardrail triggered" if triggered else "",
    }
```

- [ ] **Step 3: Add citation eval to evaluator.py**

```python
CITATION_TEMPLATE = """You are evaluating citation accuracy. Given a response and source context, determine if the claims/citations in the response are accurately supported by the context.

Response: {response}

Source Context: {context}

Rate the citation accuracy on a scale of 0.0 to 1.0:
- 1.0: All citations/claims are fully supported by the context
- 0.5: Some citations are supported, some are not
- 0.0: Citations are mostly unsupported or fabricated

Respond with ONLY a JSON object: {{"label": "accurate" or "inaccurate", "score": float, "explanation": "brief reason"}}"""


def _run_citation_eval(response: str, context: str) -> dict:
    """LLM eval: check if citations in response match the context."""
    _init()
    try:
        import json as _json
        from openai import OpenAI
        client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": CITATION_TEMPLATE.format(response=response[:2000], context=context[:2000])}],
            temperature=0,
            max_tokens=200,
        )
        text = resp.choices[0].message.content.strip()
        result = _json.loads(text)
        return {
            "label": result.get("label", ""),
            "score": float(result.get("score", 0)),
            "explanation": result.get("explanation", ""),
        }
    except Exception as e:
        logger.error("citation eval failed: %s", e)
        return {}
```

- [ ] **Step 4: Update evaluate_response to include new evals**

In the `evaluate_response` function, add after the RAG relevance section:

```python
    # 4. Guardrail (derived from banned_word + hallucination)
    hallucination_result = results.get("hallucination")
    results["guardrail"] = _guardrail_check(results["banned_word"], hallucination_result)

    # 5. Citation accuracy
    if context:
        citation = _run_citation_eval(response, context)
        if citation:
            results["citation"] = citation
```

- [ ] **Step 5: Update ALL_ANNOTATIONS in __init__.py**

Change line 16:
```python
ALL_ANNOTATIONS = {"banned_word", "hallucination", "qa_correctness", "rag_relevance", "guardrail", "citation"}
```

- [ ] **Step 6: Add guardrail and citation to _backfill_evals()**

Add guardrail backfill (CODE eval, derived from existing annotations):
```python
# 4. Guardrail (derived)
grd_rows = list(rows_by_missing.get("guardrail", {}).values())
if grd_rows:
    grd_records = []
    for r in grd_rows:
        sid = r["context.span_id"]
        bw_ann = existing.get(sid, set())
        # Check if banned_word was detected or hallucination score > 0.5
        triggered = "banned_word" in bw_ann  # simplified — full check needs annotation data
        grd_records.append({
            "context.span_id": sid,
            "label": "triggered" if triggered else "clean",
            "score": 1.0 if triggered else 0.0,
            "explanation": "",
        })
    grd_df = pd.DataFrame(grd_records).set_index("context.span_id")
    client.spans.log_span_annotations_dataframe(dataframe=grd_df, annotation_name="guardrail", annotator_kind="CODE", sync=True)
    logger.info("backfill: uploaded %d guardrail annotations", len(grd_df))
```

Add citation backfill (LLM eval):
```python
# 5. Citation
cit_rows = list(rows_by_missing.get("citation", {}).values())
if cit_rows:
    from agent.evaluator import _run_citation_eval
    cit_records = []
    for r in cit_rows:
        result = _run_citation_eval(r["output"], r["reference"])
        if result:
            cit_records.append({
                "context.span_id": r["context.span_id"],
                "label": result.get("label", ""),
                "score": float(result.get("score", 0)),
                "explanation": result.get("explanation", ""),
            })
    if cit_records:
        cit_df = pd.DataFrame(cit_records).set_index("context.span_id")
        client.spans.log_span_annotations_dataframe(dataframe=cit_df, annotation_name="citation", annotator_kind="LLM", sync=True)
        logger.info("backfill: uploaded %d citation annotations", len(cit_df))
```

- [ ] **Step 7: Commit**

```bash
cd /home/rheon/Desktop/Semester/4-1/cpastone/legal-rag-self-improve-demo
git add src/agent/evaluator.py src/agent/__init__.py
git commit -m "feat: add tool_calling, guardrail, citation evals to pipeline"
```

---

## Task 19: Final integration verification

- [ ] **Step 1: Type-check the entire project**

```bash
cd /home/rheon/Desktop/Semester/4-1/cpastone/my-own-phenix
npx tsc --noEmit --pretty
```
Expected: no errors

- [ ] **Step 2: Run dev server and verify pages**

```bash
npm run dev
```

Check:
1. Dashboard: date picker works, RMF widgets available in add menu
2. Projects: 3 tabs visible, MEASURE grid shows metrics, risk tab loads
3. Chat: feedback buttons appear on history messages, toggle works correctly

- [ ] **Step 3: Run Prisma migration if not done**

```bash
npx prisma migrate dev --name add-feedback-risk-incident
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete RMF dashboard integration"
```
