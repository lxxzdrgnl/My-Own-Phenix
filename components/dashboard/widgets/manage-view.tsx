"use client";

import { useCallback, useEffect, useState } from "react";
import { StatCard } from "@/components/dashboard/widgets/stat-card";
import { HighchartWidget } from "@/components/dashboard/widgets/highchart-widget";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { ShieldAlert } from "lucide-react";

interface RiskItem {
  id: string;
  projectId: string;
  name: string;
  system: string;
  riskLevel: string;
  mitigation: string;
  status: string;
  assignee?: string | null;
  dueDate?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Incident {
  id: string;
  projectId: string;
  title: string;
  severity: string;
  status: string;
  createdAt: string;
  resolvedAt?: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  MITIGATED: "#10b981",
  ACCEPTED: "#3b82f6",
  TRANSFERRED: "#8b5cf6",
  IN_PROGRESS: "#f59e0b",
  OPEN: "#ef4444",
};

const RISK_LEVEL_COLORS: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH: "#f97316",
  MEDIUM: "#f59e0b",
  LOW: "#10b981",
};

const STATUS_LABELS = ["MITIGATED", "ACCEPTED", "TRANSFERRED", "IN_PROGRESS", "OPEN"] as const;
type StatusFilter = "ALL" | (typeof STATUS_LABELS)[number];

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#6b7280";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {status}
    </span>
  );
}

function RiskLevelBadge({ level }: { level: string }) {
  const color = RISK_LEVEL_COLORS[level] ?? "#6b7280";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {level}
    </span>
  );
}

function buildDonutOptions(risks: RiskItem[]): Highcharts.Options {
  const counts: Record<string, number> = {};
  for (const r of risks) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }

  const data = STATUS_LABELS.filter((s) => (counts[s] ?? 0) > 0).map((s) => ({
    name: s,
    y: counts[s] ?? 0,
    color: STATUS_COLORS[s],
  }));

  return {
    chart: { type: "pie" },
    title: { text: "처리 상태 분포", style: { fontSize: "14px" } },
    plotOptions: {
      pie: {
        innerSize: "60%",
        dataLabels: { enabled: true, format: "<b>{point.name}</b>: {point.y}" },
      },
    },
    series: [
      {
        type: "pie",
        name: "리스크",
        data,
      },
    ],
  };
}

interface ManageViewProps {
  projectId: string;
  className?: string;
}

export function ManageView({ projectId, className }: ManageViewProps) {
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [risksRes, incidentsRes] = await Promise.all([
        fetch(`/api/risks?projectId=${encodeURIComponent(projectId)}`),
        fetch(`/api/incidents?projectId=${encodeURIComponent(projectId)}`),
      ]);
      if (risksRes.ok) {
        const data = await risksRes.json();
        setRisks(data.risks ?? []);
      }
      if (incidentsRes.ok) {
        const data = await incidentsRes.json();
        setIncidents(data.incidents ?? []);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Computed stats ──
  const total = risks.length;
  const mitigated = risks.filter((r) => r.status === "MITIGATED").length;
  const coverage = total > 0 ? Math.round((mitigated / total) * 100) : 0;

  const openRisks = risks.filter((r) => r.status === "OPEN" || r.status === "IN_PROGRESS").length;

  const activeIncidents = incidents.filter((i) => i.status !== "RESOLVED").length;

  const now = new Date();
  const overdueCount = risks.filter((r) => {
    if (!r.dueDate) return false;
    if (r.resolvedAt) return false;
    return new Date(r.dueDate) < now;
  }).length;

  const resolvedRisks = risks.filter((r) => r.resolvedAt && r.createdAt);
  const avgMttr =
    resolvedRisks.length > 0
      ? Math.round(
          resolvedRisks.reduce((sum, r) => {
            const diff =
              new Date(r.resolvedAt!).getTime() - new Date(r.createdAt).getTime();
            return sum + diff / (1000 * 60 * 60);
          }, 0) / resolvedRisks.length,
        )
      : null;

  // ── Filtered table rows ──
  const filteredRisks =
    statusFilter === "ALL" ? risks : risks.filter((r) => r.status === statusFilter);

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center py-16 text-muted-foreground text-sm", className)}>
        로딩 중...
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Top row: 5 stat cards */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { value: `${coverage}%`, label: "MANAGE 커버리지" },
          { value: openRisks, label: "미처리 리스크" },
          { value: activeIncidents, label: "활성 인시던트" },
          { value: overdueCount, label: "기한 초과 조치" },
          { value: avgMttr !== null ? `${avgMttr}h` : "—", label: "평균 MTTR" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border bg-card h-28">
            <StatCard value={stat.value} label={stat.label} />
          </div>
        ))}
      </div>

      {/* Middle row: donut + table */}
      <div className="grid grid-cols-2 gap-4">
        {/* Donut chart */}
        <div className="rounded-xl border bg-card h-72">
          {risks.length > 0 ? (
            <HighchartWidget options={buildDonutOptions(risks)} />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              데이터 없음
            </div>
          )}
        </div>

        {/* Risk table */}
        <div className="rounded-xl border bg-card flex flex-col overflow-hidden">
          {/* Table header + filter */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">처리 계획 목록</h3>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="ALL">전체 상태</option>
              {STATUS_LABELS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="overflow-auto flex-1">
            {filteredRisks.length === 0 ? (
              <EmptyState
                icon={ShieldAlert}
                title="리스크 항목이 없습니다"
                className="h-full"
              />
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-muted/30 sticky top-0">
                  <tr>
                    {["리스크명", "시스템", "고유 위험", "처리 방안", "상태", "담당자"].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredRisks.map((r, i) => (
                    <tr
                      key={r.id}
                      className={cn(
                        "border-t transition-colors hover:bg-muted/20",
                        i % 2 === 0 ? "" : "bg-muted/10",
                      )}
                    >
                      <td className="px-3 py-2 font-medium max-w-[120px] truncate" title={r.name}>
                        {r.name}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[100px] truncate" title={r.system}>
                        {r.system}
                      </td>
                      <td className="px-3 py-2">
                        <RiskLevelBadge level={r.riskLevel} />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate" title={r.mitigation}>
                        {r.mitigation}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.assignee ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
