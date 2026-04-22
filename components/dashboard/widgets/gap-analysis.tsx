"use client";

import { cn } from "@/lib/utils";
import {
  getGapStatus,
  getRecommendedAction,
  GAP_STATUS_COLORS,
  GapStatus,
} from "@/lib/rmf-utils";
import { HighchartWidget } from "@/components/dashboard/widgets/highchart-widget";

export interface GapDataItem {
  system: string;
  govScore: number;
  evalScore: number;
}

interface GapAnalysisProps {
  data: GapDataItem[];
  className?: string;
}

export function GapAnalysis({ data, className }: GapAnalysisProps) {
  // Sort worst-first: largest negative gap (evalScore - govScore) first
  const sorted = [...data].sort(
    (a, b) => (a.evalScore - a.govScore) - (b.evalScore - b.govScore)
  );

  const categories = sorted.map((d) => d.system);
  const govSeries = sorted.map((d) => d.govScore);
  const evalSeries = sorted.map((d) => d.evalScore);

  const chartOptions: Highcharts.Options = {
    chart: { type: "column" },
    title: { text: "Gov Score vs Eval Score (worst first)" },
    xAxis: {
      categories,
      labels: { rotation: -45 },
    },
    yAxis: {
      min: 0,
      max: 100,
      title: { text: "Score" },
    },
    colors: ["#3b82f6", "#a1a1aa"],
    series: [
      {
        type: "column",
        name: "Gov Score",
        data: govSeries,
        color: "#3b82f6",
      },
      {
        type: "column",
        name: "Eval Score",
        data: evalSeries,
        color: "#a1a1aa",
      },
    ],
    legend: { enabled: true },
  };

  return (
    <div className={cn("flex flex-col gap-4 p-4", className)}>
      {/* Chart */}
      <div className="h-64 w-full">
        <HighchartWidget options={chartOptions} />
      </div>

      {/* Risk table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wide text-xs">
                RISK
              </th>
              <th className="px-3 py-2 text-right font-semibold text-xs uppercase tracking-wide" style={{ color: "#3b82f6" }}>
                GOV SCORE
              </th>
              <th className="px-3 py-2 text-right font-semibold text-xs uppercase tracking-wide" style={{ color: "#a1a1aa" }}>
                EVAL SCORE
              </th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground uppercase tracking-wide text-xs">
                GAP
              </th>
              <th className="px-3 py-2 text-center font-semibold text-muted-foreground uppercase tracking-wide text-xs">
                STATUS
              </th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wide text-xs">
                RECOMMENDED ACTION
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item, idx) => {
              const gap = item.evalScore - item.govScore;
              const status: GapStatus = getGapStatus(gap);
              const badgeColor = GAP_STATUS_COLORS[status];
              const action = getRecommendedAction(status);

              return (
                <tr
                  key={item.system}
                  className={cn(
                    "border-b border-border last:border-0",
                    idx % 2 === 0 ? "bg-background" : "bg-muted/20"
                  )}
                >
                  <td className="px-3 py-2 font-medium text-foreground">
                    {item.system}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: "#3b82f6" }}>
                    {item.govScore.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: "#a1a1aa" }}>
                    {item.evalScore.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {gap >= 0 ? "+" : ""}{gap.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                      style={{ backgroundColor: badgeColor }}
                    >
                      {status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs">
                    {action}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
