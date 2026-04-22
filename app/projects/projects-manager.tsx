"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { fetchProjects, fetchTraces, fetchTraceTrees, Project, Trace, type TraceTree } from "@/lib/phoenix";
import { SpanTreeView } from "@/components/span-tree-view";
import { StatCard } from "@/components/dashboard/widgets/stat-card";
import { HighchartWidget } from "@/components/dashboard/widgets/highchart-widget";
import { MeasureGrid } from "@/components/dashboard/widgets/measure-grid";
import { RmfFunctionCards } from "@/components/dashboard/widgets/rmf-function-card";
import { GapAnalysis, type GapDataItem } from "@/components/dashboard/widgets/gap-analysis";
import { ManageView } from "@/components/dashboard/widgets/manage-view";
import { computeMetrics, computeGovernScore, computeMapScore, computeMeasureScore, computeManageScore, type FeedbackStats, type RmfScores } from "@/lib/rmf-utils";
import type { AnnotationData, SpanData } from "@/lib/dashboard-utils";
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
import { Sidebar, SidebarItemDiv } from "@/components/ui/sidebar";


function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
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
        new Date(t.time).toLocaleString("en-US", {
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


function buildPassFailChartOptions(traces: Trace[]): Highcharts.Options {
  const FAIL_LABELS = new Set(["hallucinated", "incorrect", "detected", "irrelevant", "unfaithful", "fail", "false"]);
  const byName: Record<string, { pass: number; fail: number }> = {};
  for (const t of traces) {
    for (const a of t.annotations) {
      if (!byName[a.name]) byName[a.name] = { pass: 0, fail: 0 };
      if (FAIL_LABELS.has(a.label)) byName[a.name].fail++;
      else byName[a.name].pass++;
    }
  }
  const categories = Object.keys(byName);
  return {
    chart: { type: "bar" },
    title: { text: "Pass / Fail by Eval", style: { fontSize: "14px" } },
    xAxis: { categories },
    yAxis: { title: { text: "Count" } },
    plotOptions: { bar: { stacking: "normal" } },
    series: [
      { name: "Pass", type: "bar", data: categories.map((n) => byName[n].pass), color: "#d4d4d4" },
      { name: "Fail", type: "bar", data: categories.map((n) => byName[n].fail), color: "#171717" },
    ],
  };
}

export function ProjectsManager() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedProject, setSelectedProjectState] = useState<string | null>(null);
  const setSelectedProject = (name: string | null) => {
    setSelectedProjectState(name);
    if (name) localStorage.setItem("last_projects_project", name);
  };
  const [traces, setTraces] = useState<Trace[]>([]);
  const [traceTrees, setTraceTrees] = useState<TraceTree[]>([]);
  const [tracesLoading, setTracesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [annotationFilter, setAnnotationFilter] = useState<"all" | "pass" | "fail" | "none">("all");
  const [latencyFilter, setLatencyFilter] = useState<"all" | "fast" | "medium" | "slow">("all");
  const [activeTab, setActiveTab] = useState<"traces" | "measure" | "risk">("traces");
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange(7));

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
      // Auto-select saved or first project
      if (ps.length > 0 && !selectedProject) {
        const saved = localStorage.getItem("last_projects_project");
        const initial = saved && ps.some((p) => p.name === saved) ? saved : ps[0].name;
        setSelectedProjectState(initial);
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
      const [t, trees] = await Promise.all([
        fetchTraces(selectedProject, undefined, undefined, dateRange.from?.toISOString(), dateRange.to?.toISOString()),
        fetchTraceTrees(selectedProject, dateRange.from?.toISOString(), dateRange.to?.toISOString()),
      ]);
      t.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setTraces(t);
      setTraceTrees(trees);
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

  // Metrics computation (based on traceTrees for accurate root-level data)
  const traceCount = traceTrees.length || traces.length;
  const latencies = (traceTrees.length > 0
    ? traceTrees.map((t) => t.latency)
    : traces.map((t) => t.latency)
  ).filter((l) => l > 0);
  const avgLatency = latencies.length
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 0;
  const allAnnotations = traceTrees.length > 0
    ? traceTrees.flatMap((t) => t.rootSpan.annotations)
    : traces.flatMap((t) => t.annotations);
  const scores = allAnnotations.map((a) => a.score).filter((s) => s > 0);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const hasAnnotations = allAnnotations.length > 0;

  // Feedback stats for frustration metric
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats | undefined>();
  const loadFeedbackStats = useCallback(async () => {
    if (!selectedProject) return;
    try {
      const res = await fetch(`/api/feedback/stats?project=${encodeURIComponent(selectedProject)}`);
      if (res.ok) {
        const data = await res.json();
        setFeedbackStats({ total: data.totalResponses, downCount: data.downCount });
      }
    } catch {}
  }, [selectedProject]);
  useEffect(() => { loadFeedbackStats(); }, [loadFeedbackStats]);

  // RMF / MEASURE tab metrics — use traceTrees for accurate token/cost data
  const rmfMetrics = useMemo(() => {
    if (!traceTrees.length && !traces.length) return computeMetrics([], [], feedbackStats);

    // Collect all spans from tree (including children) for token/cost metrics
    function collectSpans(node: import("@/lib/phoenix").RawSpan): SpanData[] {
      const result: SpanData[] = [{
        latency: node.latency,
        status: node.status || "OK",
        time: "",
        promptTokens: node.promptTokens || 0,
        completionTokens: node.completionTokens || 0,
        totalTokens: node.totalTokens || 0,
        model: node.model || "",
        spanKind: node.spanKind || "",
      }];
      for (const child of node.children) result.push(...collectSpans(child));
      return result;
    }

    const spanData: SpanData[] = traceTrees.length > 0
      ? traceTrees.flatMap((t) => {
          const spans = collectSpans(t.rootSpan);
          spans[0].time = t.time; // root gets the time
          return spans;
        })
      : traces.map((t) => ({
          latency: t.latency, status: t.status || "OK", time: t.time,
          promptTokens: t.promptTokens || 0, completionTokens: t.completionTokens || 0,
          totalTokens: t.totalTokens || 0, model: t.model || "", spanKind: t.spanKind || "LLM",
        }));

    const annData: AnnotationData[] = traceTrees.length > 0
      ? traceTrees.flatMap((t) => t.rootSpan.annotations.map((a) => ({ ...a, time: t.time })))
      : traces.flatMap((t) => (t.annotations || []).map((a) => ({ ...a, time: t.time })));

    return computeMetrics(spanData, annData, feedbackStats);
  }, [traceTrees, traces, feedbackStats]);

  // RMF function scores
  const [riskStats, setRiskStats] = useState({ total: 0, mitigated: 0, openIncidents: 0 });
  const loadRiskStats = useCallback(async () => {
    if (!selectedProject) return;
    try {
      const [risksRes, incidentsRes] = await Promise.all([
        fetch(`/api/risks?projectId=${encodeURIComponent(selectedProject)}`).then((r) => r.json()).catch(() => ({ risks: [] })),
        fetch(`/api/incidents?projectId=${encodeURIComponent(selectedProject)}`).then((r) => r.json()).catch(() => ({ incidents: [] })),
      ]);
      const risks = risksRes.risks ?? [];
      const incidents = incidentsRes.incidents ?? [];
      setRiskStats({
        total: risks.length,
        mitigated: risks.filter((r: any) => r.status === "MITIGATED").length,
        openIncidents: incidents.filter((i: any) => i.status !== "RESOLVED").length,
      });
    } catch {}
  }, [selectedProject]);
  useEffect(() => { loadRiskStats(); }, [loadRiskStats]);

  const rmfScores: RmfScores = useMemo(() => {
    // Count enabled evals for GOVERN
    const builtInCount = 6;
    const customEvalCount = traceTrees.length > 0
      ? new Set(traceTrees.flatMap((t) => t.rootSpan.annotations.map((a) => a.name))).size - builtInCount
      : 0;
    const enabledEvalCount = new Set(
      traceTrees.flatMap((t) => t.rootSpan.annotations.map((a) => a.name))
    ).size;

    return {
      govern: computeGovernScore(enabledEvalCount, builtInCount + Math.max(0, customEvalCount), customEvalCount > 0),
      map: computeMapScore(rmfMetrics),
      measure: computeMeasureScore(rmfMetrics),
      manage: computeManageScore(riskStats.total, riskStats.mitigated, riskStats.openIncidents),
    };
  }, [rmfMetrics, traceTrees, riskStats]);

  const gapData: GapDataItem[] = useMemo(() => {
    if (!rmfMetrics.length) return [];
    // Group metrics into risk categories and compute eval scores
    const categories: { system: string; metricIds: string[]; govScore: number }[] = [
      { system: "Factual Accuracy", metricIds: ["factual_rate"], govScore: 95 },
      { system: "QA Accuracy", metricIds: ["qa_accuracy"], govScore: 90 },
      { system: "Retrieval Relevance", metricIds: ["retrieval_relevance"], govScore: 20 },
      { system: "Safety", metricIds: ["safety_rate", "guardrail_pass"], govScore: 97 },
      { system: "Citation Accuracy", metricIds: ["citation_accuracy"], govScore: 85 },
      { system: "Performance", metricIds: ["latency_score", "success_rate"], govScore: 95 },
      { system: "Cost Efficiency", metricIds: ["token_score", "cost_score"], govScore: 80 },
      { system: "Tool Calling", metricIds: ["tool_calling_accuracy"], govScore: 60 },
    ];
    return categories.map((cat) => {
      const metrics = cat.metricIds.map((id) => rmfMetrics.find((m) => m.id === id)).filter(Boolean);
      const evalScore = metrics.length > 0
        ? Math.round(metrics.reduce((sum, m) => sum + m!.value, 0) / metrics.length)
        : 0;
      return { system: cat.system, govScore: cat.govScore, evalScore };
    });
  }, [rmfMetrics]);

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <Nav />

      <div className="flex min-h-0 flex-1">
        {/* Left Sidebar: Project List */}
        <Sidebar>
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
                <SidebarItemDiv
                  key={p.name}
                  active={active}
                  onClick={() => setSelectedProject(p.name)}
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30" />
                  <p className="flex-1 min-w-0 truncate">
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
                </SidebarItemDiv>
              );
            })}
          </div>
        </Sidebar>

        {/* Center: Project Detail */}
        <div className="flex-1 overflow-y-auto">
          {!selectedProject ? (
            <EmptyState icon={FolderOpen} title="Select a project" className="h-full" />
          ) : tracesLoading ? (
            <LoadingState className="h-full" />
          ) : (
            <div className="p-6">
              <div className="mx-auto max-w-5xl">
                {/* Header + Tab bar + Date picker */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h1 className="text-xl font-semibold tracking-tight">{selectedProject}</h1>
                      <p className="text-sm text-muted-foreground">Project overview</p>
                    </div>
                    <DateRangePicker value={dateRange} onChange={setDateRange} />
                  </div>
                  <div className="flex gap-1 border-b">
                  {(["traces", "measure", "risk"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                        activeTab === tab
                          ? "border-foreground text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {{ traces: "Traces", measure: "Measure", risk: "Risk Management" }[tab]}
                    </button>
                  ))}
                  </div>
                </div>

                {/* Traces tab */}
                {activeTab === "traces" && (
                <>
                    {/* Stat Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                      <div className="rounded-xl border bg-card h-28">
                        <StatCard
                          value={traceCount.toLocaleString()}
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
                          value={(() => {
                            const FAIL_LABELS = ["hallucinated", "incorrect", "detected", "irrelevant", "unfaithful", "fail", "false"];
                            const withAnns = traceTrees.filter((t) => t.rootSpan.annotations.length > 0);
                            if (withAnns.length === 0) return "-";
                            const passed = withAnns.filter((t) => !t.rootSpan.annotations.some((a) => FAIL_LABELS.includes(a.label))).length;
                            return `${Math.round((passed / withAnns.length) * 100)}%`;
                          })()}
                          label="Pass Rate"
                          trend={(() => {
                            const FAIL_LABELS = ["hallucinated", "incorrect", "detected", "irrelevant", "unfaithful", "fail", "false"];
                            const withAnns = traceTrees.filter((t) => t.rootSpan.annotations.length > 0);
                            if (withAnns.length === 0) return undefined;
                            const passed = withAnns.filter((t) => !t.rootSpan.annotations.some((a) => FAIL_LABELS.includes(a.label))).length;
                            return `${passed} / ${withAnns.length} traces`;
                          })()}
                        />
                      </div>
                    </div>

                    {/* Charts */}
                    {traces.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
                        <div className="rounded-xl border bg-card h-64">
                          <HighchartWidget options={buildLatencyChartOptions(traces)} />
                        </div>
                        {hasAnnotations && (
                          <div className="rounded-xl border bg-card h-64">
                            <HighchartWidget options={buildScoreChartOptions(traces)} />
                          </div>
                        )}
                        {hasAnnotations && (
                          <div className="rounded-xl border bg-card h-64">
                            <HighchartWidget options={buildPassFailChartOptions(traces)} />
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

                    {traceTrees.length === 0 ? (
                      <EmptyState
                        icon={Search}
                        title={traces.length === 0 ? "No traces found" : "No traces match the current filters"}
                        description={traces.length === 0 ? "This project has no traces yet." : "Try adjusting your filters."}
                        className="py-12"
                      />
                    ) : (
                      <SpanTreeView traces={traceTrees} projectName={selectedProject ?? undefined} onRefresh={loadTraces} />
                    )}
                  </>
                )}

                {/* MEASURE tab */}
                {activeTab === "measure" && (
                  <div className="space-y-6">
                    <RmfFunctionCards scores={rmfScores} />
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
