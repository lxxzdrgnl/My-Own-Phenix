"use client";

import { MeasureGrid } from "./measure-grid";
import { RmfFunctionCards } from "./rmf-function-card";
import { computeMetrics } from "@/lib/rmf-utils";
import type { WidgetRenderProps } from "./registry";

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
