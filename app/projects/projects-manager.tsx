"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { fetchProjects, fetchTraces, Project, Trace } from "@/lib/phoenix";
import { StatCard } from "@/components/dashboard/widgets/stat-card";
import { HighchartWidget } from "@/components/dashboard/widgets/highchart-widget";
import { MeasureGrid } from "@/components/dashboard/widgets/measure-grid";
import { RmfFunctionCards } from "@/components/dashboard/widgets/rmf-function-card";
import { GapAnalysis, type GapDataItem } from "@/components/dashboard/widgets/gap-analysis";
import { ManageView } from "@/components/dashboard/widgets/manage-view";
import { computeMetrics } from "@/lib/rmf-utils";
import type { AnnotationData, SpanData } from "@/lib/dashboard-utils";
import { AnnotationBadges } from "@/components/annotation-badge";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  GripVertical,
  Search,
  Filter,
  X,
} from "lucide-react";
import { Nav } from "@/components/nav";
import { Input } from "@/components/ui/input";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { DateRangePicker, getPresetRange, type DateRange } from "@/components/ui/date-range-picker";

type ProjectTab = "traces" | "measure" | "risk";

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function buildLatencyChartOptions(traces: Trace[]): Highcharts.Options {
  const sorted = [...traces].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
  );
  return {
    chart: { type: "area" },
    title: { text: "Latency Over Time", style: { fontSize: "14px" } },
    xAxis: {
      categories: sorted.map((t) =>
        new Date(t.time).toLocaleString("ko-KR", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      ),
    },
    yAxis: { title: { text: "ms" } },
    series: [
      { name: "Latency", type: "area", data: sorted.map((t) => Math.round(t.latency)) },
    ],
  };
}

function buildScoreChartOptions(traces: Trace[]): Highcharts.Options {
  const annotations = traces.flatMap((t) => t.annotations);
  const byName: Record<string, number[]> = {};
  for (const a of annotations) {
    if (!byName[a.name]) byName[a.name] = [];
    byName[a.name].push(a.score);
  }
  const categories = Object.keys(byName);
  const avgScores = categories.map((name) => {
    const scores = byName[name];
    return +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2);
  });
  return {
    chart: { type: "column" },
    title: { text: "Avg Score by Annotation", style: { fontSize: "14px" } },
    xAxis: { categories },
    yAxis: { title: { text: "Score" }, min: 0, max: 1 },
    series: [{ name: "Avg Score", type: "column", data: avgScores }],
  };
}

function TraceRow({ trace }: { trace: Trace }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{trace.query}</p>
          <div className="text-xs text-muted-foreground mt-0.5">
            {formatTime(trace.time)} &middot; {formatMs(trace.latency)}
            {trace.annotations.length > 0 && (
              <>
                {" "}&middot;{" "}
                <AnnotationBadges annotations={trace.annotations} />
              </>
            )}
          </div>
        </div>
      </button>
      {open && (
        <div className="border-t px-4 py-3 space-y-3 bg-muted/10">
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Query</p>
            <p className="text-sm whitespace-pre-wrap">{trace.query}</p>
          </div>
          {trace.context && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Context</p>
              <p className="text-sm whitespace-pre-wrap max-h-40 overflow-y-auto">{trace.context}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Response</p>
            <p className="text-sm whitespace-pre-wrap max-h-60 overflow-y-auto">{trace.response}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProjectsManager() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [tracesLoading, setTracesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [annotationFilter, setAnnotationFilter] = useState<"all" | "pass" | "fail" | "none">("all");
  const [latencyFilter, setLatencyFilter] = useState<"all" | "fast" | "medium" | "slow">("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange(7));
  const [activeTab, setActiveTab] = useState<ProjectTab>("traces");

  function saveOrder(ps: Project[]) {
    localStorage.setItem("project_order", JSON.stringify(ps.map((p) => p.name)));
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...projects];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setProjects(next);
    saveOrder(next);
  }

  function moveDown(idx: number) {
    if (idx === projects.length - 1) return;
    const next = [...projects];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setProjects(next);
    saveOrder(next);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ps = await fetchProjects();
      setProjects(ps);
      // Auto-select first project if none selected
      if (ps.length > 0 && !selectedProject) {
        setSelectedProject(ps[0].name);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [selectedProject]);

  const loadTraces = useCallback(async () => {
    if (!selectedProject) return;
    setTracesLoading(true);
    try {
      const t = await fetchTraces(
        selectedProject,
        undefined,
        undefined,
        dateRange.from?.toISOString(),
        dateRange.to?.toISOString(),
      );
      t.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setTraces(t);
    } catch (e) {
      console.error(e);
    }
    setTracesLoading(false);
  }, [selectedProject, dateRange]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadTraces();
  }, [loadTraces]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await fetch("/api/phoenix?path=/v1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: "" }),
      });
      setNewName("");
      await load();
    } catch (e: any) {
      alert(`Failed: ${e.message}`);
    }
    setCreating(false);
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete project "${name}"? All traces will be permanently removed.`)) return;
    try {
      await fetch(`/api/phoenix?path=/v1/projects/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (selectedProject === name) {
        setSelectedProject(null);
        setTraces([]);
      }
      await load();
    } catch (e: any) {
      alert(`Failed: ${e.message}`);
    }
  }

  // ── Filtering ──
  const GOOD_LABELS = ["factual", "correct", "clean", "relevant"];

  const filteredTraces = traces.filter((t) => {
    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!t.query.toLowerCase().includes(q) && !t.response.toLowerCase().includes(q)) return false;
    }
    // Annotation filter
    if (annotationFilter === "none") {
      if (t.annotations.length > 0) return false;
    } else if (annotationFilter === "pass") {
      if (t.annotations.length === 0) return false;
      if (!t.annotations.every((a) => GOOD_LABELS.includes(a.label) || a.score >= 0.8)) return false;
    } else if (annotationFilter === "fail") {
      if (t.annotations.length === 0) return false;
      if (!t.annotations.some((a) => !GOOD_LABELS.includes(a.label) && a.score < 0.8)) return false;
    }
    // Latency filter
    if (latencyFilter === "fast" && t.latency >= 1000) return false;
    if (latencyFilter === "medium" && (t.latency < 1000 || t.latency >= 3000)) return false;
    if (latencyFilter === "slow" && t.latency < 3000) return false;
    return true;
  });

  const hasActiveFilters = searchQuery !== "" || annotationFilter !== "all" || latencyFilter !== "all";

  // Metrics computation (based on all traces, not filtered)
  const latencies = traces.map((t) => t.latency).filter((l) => l > 0);
  const avgLatency = latencies.length
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 0;
  const scores = traces.flatMap((t) => t.annotations).map((a) => a.score).filter((s) => s > 0);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const hasAnnotations = scores.length > 0;

  // RMF / MEASURE tab metrics
  const rmfMetrics = useMemo(() => {
    if (!traces.length) return computeMetrics([], []);
    const annData: AnnotationData[] = traces.flatMap((t) =>
      (t.annotations || []).map((a) => ({ ...a, time: t.time }))
    );
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
    return computeMetrics(spanData, annData);
  }, [traces]);

  const measureScore = useMemo(() => {
    const greenCount = rmfMetrics.filter((m) => m.status === "green").length;
    return rmfMetrics.length > 0 ? Math.round((greenCount / rmfMetrics.length) * 100) : 0;
  }, [rmfMetrics]);

  const gapData: GapDataItem[] = [];

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <Nav />

      <div className="flex min-h-0 flex-1">
        {/* Left Sidebar: Project List */}
        <div className="flex w-64 shrink-0 flex-col border-r bg-muted/5">
          {/* Create */}
          <div className="border-b px-3 py-3">
            <div className="flex gap-1.5">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="New project"
                className="h-8 flex-1 min-w-0 rounded-lg"
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Project list */}
          <div className="flex-1 overflow-y-auto">
            {loading && <LoadingState className="py-12" />}

            {!loading && projects.length === 0 && (
              <EmptyState icon={FolderOpen} title="No projects" className="py-12" />
            )}

            {projects.map((p, idx) => {
              const active = p.name === selectedProject;
              return (
                <div
                  key={p.name}
                  onClick={() => setSelectedProject(p.name)}
                  className={`group flex cursor-pointer items-center gap-1.5 border-b px-2 py-2 transition-colors hover:bg-accent/40 ${
                    active ? "bg-accent" : ""
                  }`}
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30" />
                  <p className="flex-1 min-w-0 text-sm font-medium truncate">
                    {p.name}
                  </p>
                  {/* Order buttons */}
                  <div className="flex flex-col gap-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); moveUp(idx); }}
                      disabled={idx === 0}
                      className="rounded p-0.5 hover:bg-muted disabled:opacity-20"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveDown(idx); }}
                      disabled={idx === projects.length - 1}
                      className="rounded p-0.5 hover:bg-muted disabled:opacity-20"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(p.name);
                    }}
                    className="rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
                    title="Delete project"
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center: Project Detail */}
        <div className="flex-1 overflow-y-auto">
          {!selectedProject ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <FolderOpen className="h-12 w-12 opacity-15" />
              <p className="text-sm">Select a project</p>
            </div>
          ) : tracesLoading ? (
            <LoadingState className="h-full" />
          ) : (
            <div className="p-6">
              <div className="mx-auto max-w-5xl">
                {/* Header */}
                <div className="mb-6">
                  <h1 className="text-2xl font-bold">{selectedProject}</h1>
                  <p className="text-sm text-muted-foreground">Project overview</p>
                </div>

                {/* Tab bar */}
                <div className="flex gap-1 border-b mb-4">
                  {(["traces", "measure", "risk"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                        activeTab === tab
                          ? "border-primary text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {{ traces: "트레이스", measure: "MEASURE 지표", risk: "리스크 관리" }[tab]}
                    </button>
                  ))}
                </div>

                {/* Traces tab */}
                {activeTab === "traces" && (
                  <>
                    {/* Stat Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                      <div className="rounded-xl border bg-card h-28">
                        <StatCard
                          value={traces.length.toLocaleString()}
                          label="Total Traces"
                          trend={latencies.length > 0 ? `${latencies.length} with latency` : undefined}
                        />
                      </div>
                      <div className="rounded-xl border bg-card h-28">
                        <StatCard
                          value={formatMs(avgLatency)}
                          label="Avg Latency"
                          trend={latencies.length > 0 ? `max ${formatMs(Math.max(...latencies))}` : undefined}
                        />
                      </div>
                      <div className="rounded-xl border bg-card h-28">
                        <StatCard
                          value={hasAnnotations ? avgScore.toFixed(2) : "-"}
                          label="Avg Score"
                          trend={hasAnnotations ? `${scores.length} annotations` : undefined}
                        />
                      </div>
                      <div className="rounded-xl border bg-card h-28">
                        <StatCard
                          value={traces.filter((t) => t.response).length.toLocaleString()}
                          label="Responses"
                        />
                      </div>
                    </div>

                    {/* Charts */}
                    {traces.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
                        <div className="rounded-xl border bg-card h-64">
                          <HighchartWidget options={buildLatencyChartOptions(traces)} />
                        </div>
                        {hasAnnotations && (
                          <div className="rounded-xl border bg-card h-64">
                            <HighchartWidget options={buildScoreChartOptions(traces)} />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Trace list */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-lg font-semibold">Traces</h2>
                          <p className="text-sm text-muted-foreground">
                            {hasActiveFilters
                              ? `${filteredTraces.length} / ${traces.length} traces`
                              : "Recent requests and responses"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Date range */}
                          <DateRangePicker value={dateRange} onChange={setDateRange} />
                          {/* Search */}
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="Search traces..."
                              className="h-8 w-48 pl-8 text-xs"
                            />
                            {searchQuery && (
                              <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                                <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                              </button>
                            )}
                          </div>
                          {/* Filter toggle */}
                          <button
                            onClick={() => setFilterOpen(!filterOpen)}
                            className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
                              filterOpen || hasActiveFilters ? "border-primary bg-accent" : "hover:bg-muted"
                            }`}
                          >
                            <Filter className="h-3 w-3" />
                            Filter
                            {hasActiveFilters && (
                              <span className="rounded bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                                {[annotationFilter !== "all", latencyFilter !== "all"].filter(Boolean).length}
                              </span>
                            )}
                          </button>
                          {hasActiveFilters && (
                            <button
                              onClick={() => { setSearchQuery(""); setAnnotationFilter("all"); setLatencyFilter("all"); }}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Filter panel */}
                      {filterOpen && (
                        <div className="mt-3 flex flex-wrap items-center gap-4 rounded-lg border bg-muted/20 px-4 py-3">
                          {/* Annotation */}
                          <div>
                            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Annotation</p>
                            <div className="flex gap-1">
                              {(["all", "pass", "fail", "none"] as const).map((v) => (
                                <button
                                  key={v}
                                  onClick={() => setAnnotationFilter(v)}
                                  className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                                    annotationFilter === v
                                      ? "border-foreground bg-foreground text-background"
                                      : "hover:bg-muted"
                                  }`}
                                >
                                  {v === "all" ? "All" : v === "pass" ? "Pass" : v === "fail" ? "Fail" : "No Annot."}
                                </button>
                              ))}
                            </div>
                          </div>
                          {/* Latency */}
                          <div>
                            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Latency</p>
                            <div className="flex gap-1">
                              {([
                                { v: "all", l: "All" },
                                { v: "fast", l: "<1s" },
                                { v: "medium", l: "1-3s" },
                                { v: "slow", l: ">3s" },
                              ] as const).map(({ v, l }) => (
                                <button
                                  key={v}
                                  onClick={() => setLatencyFilter(v)}
                                  className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                                    latencyFilter === v
                                      ? "border-foreground bg-foreground text-background"
                                      : "hover:bg-muted"
                                  }`}
                                >
                                  {l}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {filteredTraces.length === 0 ? (
                      <p className="py-12 text-center text-muted-foreground">
                        {traces.length === 0 ? "No traces found for this project" : "No traces match the current filters"}
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {filteredTraces.map((t) => (
                          <TraceRow key={t.spanId} trace={t} />
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* MEASURE tab */}
                {activeTab === "measure" && (
                  <div className="space-y-6">
                    <RmfFunctionCards measureScore={measureScore} />
                    <MeasureGrid metrics={rmfMetrics} />
                    <GapAnalysis data={gapData} />
                  </div>
                )}

                {/* Risk tab */}
                {activeTab === "risk" && selectedProject && (
                  <ManageView projectId={selectedProject} />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
