"use client";
import { apiFetch } from "@/lib/api-client";

import { useCallback, useEffect, useState } from "react";
import { StatCard } from "@/components/dashboard/widgets/stat-card";
import { HighchartWidget } from "@/components/dashboard/widgets/highchart-widget";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldAlert, Plus, X } from "lucide-react";

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
    title: { text: "Status Distribution", style: { fontSize: "14px" } },
    plotOptions: {
      pie: {
        innerSize: "60%",
        dataLabels: { enabled: true, format: "<b>{point.name}</b>: {point.y}" },
      },
    },
    series: [
      {
        type: "pie",
        name: "Risks",
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRisk, setNewRisk] = useState({ name: "", system: "", riskLevel: "MEDIUM", mitigation: "", assignee: "" });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [risksRes, incidentsRes] = await Promise.all([
        apiFetch(`/api/risks?projectId=${encodeURIComponent(projectId)}`),
        apiFetch(`/api/incidents?projectId=${encodeURIComponent(projectId)}`),
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

  async function handleAddRisk() {
    if (!newRisk.name.trim()) return;
    try {
      await apiFetch("/api/risks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newRisk, projectId, status: "OPEN" }),
      });
      setNewRisk({ name: "", system: "", riskLevel: "MEDIUM", mitigation: "", assignee: "" });
      setShowAddForm(false);
      loadData();
    } catch {}
  }

  async function handleUpdateStatus(riskId: string, status: string) {
    try {
      await apiFetch("/api/risks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: riskId, status, resolvedAt: status === "MITIGATED" ? new Date().toISOString() : null }),
      });
      loadData();
    } catch {}
  }

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
        Loading...
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Add Risk button + form */}
      <div>
        {!showAddForm ? (
          <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)} className="gap-1.5 text-xs">
            <Plus className="size-3" /> Add Risk
          </Button>
        ) : (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">New Risk</h3>
              <button onClick={() => setShowAddForm(false)}><X className="size-4 text-muted-foreground" /></button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Name</label>
                <Input value={newRisk.name} onChange={(e) => setNewRisk({ ...newRisk, name: e.target.value })} placeholder="e.g. Hallucination in legal advice" className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">System</label>
                <Input value={newRisk.system} onChange={(e) => setNewRisk({ ...newRisk, system: e.target.value })} placeholder="e.g. RAG Pipeline" className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Severity</label>
                <select value={newRisk.riskLevel} onChange={(e) => setNewRisk({ ...newRisk, riskLevel: e.target.value })} className="h-8 w-full rounded-md border bg-background px-2 text-xs">
                  {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Mitigation</label>
                <Input value={newRisk.mitigation} onChange={(e) => setNewRisk({ ...newRisk, mitigation: e.target.value })} placeholder="e.g. Add citation eval + guardrail" className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Assignee</label>
                <Input value={newRisk.assignee} onChange={(e) => setNewRisk({ ...newRisk, assignee: e.target.value })} placeholder="e.g. Team Lead" className="h-8 text-xs" />
              </div>
            </div>
            <Button size="sm" onClick={handleAddRisk} disabled={!newRisk.name.trim()} className="text-xs">Create Risk</Button>
          </div>
        )}
      </div>

      {/* Top row: 5 stat cards */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { value: `${coverage}%`, label: "MANAGE Coverage" },
          { value: openRisks, label: "Open Risks" },
          { value: activeIncidents, label: "Active Incidents" },
          { value: overdueCount, label: "Overdue Actions" },
          { value: avgMttr !== null ? `${avgMttr}h` : "—", label: "Avg MTTR" },
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
              No data
            </div>
          )}
        </div>

        {/* Risk table */}
        <div className="rounded-xl border bg-card flex flex-col overflow-hidden">
          {/* Table header + filter */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Risk Treatment Plan</h3>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="ALL">All Status</option>
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
                title="No risk items found"
                className="h-full"
              />
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-muted/30 sticky top-0">
                  <tr>
                    {["Risk", "System", "Severity", "Mitigation", "Status", "Assignee", "Action"].map(
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
                      <td className="px-3 py-2">
                        <select
                          value={r.status}
                          onChange={(e) => handleUpdateStatus(r.id, e.target.value)}
                          className="rounded border bg-background px-1.5 py-0.5 text-[10px]"
                        >
                          {STATUS_LABELS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
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
