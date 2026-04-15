"use client";

import { cn } from "@/lib/utils";
import { MEASURE_METRICS, MetricValue, STATUS_COLORS } from "@/lib/rmf-utils";

interface MeasureGridProps {
  metrics: MetricValue[];
  className?: string;
}

export function MeasureGrid({ metrics, className }: MeasureGridProps) {
  return (
    <div className={cn("grid grid-cols-4 gap-4 p-4", className)}>
      {metrics.map((metric) => {
        const def = MEASURE_METRICS.find((m) => m.id === metric.id);
        if (!def) return null;

        const dotColor = STATUS_COLORS[metric.status];

        return (
          <div
            key={metric.id}
            className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2"
          >
            {/* Header: status dot + label */}
            <div className="flex items-center gap-2">
              <span
                className="inline-block shrink-0 rounded-full"
                style={{
                  width: "0.625rem",
                  height: "0.625rem",
                  backgroundColor: dotColor,
                }}
              />
              <span className="text-sm font-semibold text-foreground truncate">
                {def.engLabel}
              </span>
            </div>

            {/* Large value */}
            <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
              {metric.formatted}
            </span>

            {/* Metric ID */}
            <span className="text-xs text-muted-foreground font-medium">
              {def.id}
            </span>

            {/* Description */}
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {def.description}
            </p>
          </div>
        );
      })}
    </div>
  );
}
