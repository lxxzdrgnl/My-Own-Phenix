"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchTraces,
  fetchPrompts,
  fetchPromptVersions,
  fetchProjects,
  callLLM,
  deleteTrace,
  Trace,
  PromptVersion,
  ComparisonResult,
  Project,
} from "@/lib/phoenix";
import {
  RefreshCw,
  Play,
  Pencil,
  Inbox,
  ChevronDown,
  Trash2,
  Filter,
  Plus,
  X,
  Database,
} from "lucide-react";
import { Nav } from "@/components/nav";
import { Sidebar } from "@/components/ui/sidebar";
import { AnnotationBadges } from "@/components/annotation-badge";
import { AddToDatasetModal } from "@/components/add-to-dataset-modal";
import { PromptEditModal } from "@/components/prompt-edit-modal";
import { PromptsModal } from "@/components/prompts-modal";

interface VersionOption {
  promptName: string;
  label: string;
  version: PromptVersion;
}

interface Column {
  id: string;
  promptId: string;
  query: string;
  context: string;
  contextOpen: boolean;
  result: ComparisonResult | null;
  running: boolean;
  entering: boolean;
}

function makeColumn(
  promptId: string,
  query: string,
  context: string,
  entering: boolean,
): Column {
  return {
    id: crypto.randomUUID(),
    promptId,
    query,
    context,
    contextOpen: false,
    result: null,
    running: false,
    entering,
  };
}

export function Playground() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectIdState] = useState("");
  const setProjectId = (id: string) => {
    setProjectIdState(id);
    localStorage.setItem("last_playground_project", id);
  };
  const [traces, setTraces] = useState<Trace[]>([]);
  const [selected, setSelected] = useState<Trace | null>(null);
  const [loading, setLoading] = useState(true);
  const [versionOptions, setVersionOptions] = useState<VersionOption[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [editTarget, setEditTarget] = useState<{
    promptName: string;
    version: PromptVersion;
  } | null>(null);
  const [spanKinds, setSpanKinds] = useState<Set<string>>(new Set(["LLM"]));
  const [contentFilter, setContentFilter] = useState("ALL");
  const [filterOpen, setFilterOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [deleteModeVisible, setDeleteModeVisible] = useState(false);
  const [deleteSelection, setDeleteSelection] = useState<Set<string>>(
    new Set(),
  );
  const [deleting, setDeleting] = useState(false);
  const [originalContextOpen, setOriginalContextOpen] = useState(false);
  const [datasetModalOpen, setDatasetModalOpen] = useState(false);
  const [promptsModalOpen, setPromptsModalOpen] = useState(false);

  // Init first column once prompts load
  useEffect(() => {
    if (versionOptions.length > 0 && columns.length === 0) {
      setColumns([makeColumn(versionOptions[0].version.id, "", "", false)]);
    }
  }, [versionOptions, columns.length]);

  // ── Column ops ──────────────────────────────────────────────
  function addColumn() {
    const defaultId =
      versionOptions.length > 0 ? versionOptions[0].version.id : "";
    const firstQuery = columns[0]?.query ?? "";
    const firstContext = columns[0]?.context ?? "";
    const id = crypto.randomUUID();
    const newCol: Column = {
      ...makeColumn(defaultId, firstQuery, firstContext, true),
      id,
    };
    setColumns((prev) => [...prev, newCol]);
    // double-raf to let the 0-width paint before animating open
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        setColumns((prev) =>
          prev.map((c) => (c.id === id ? { ...c, entering: false } : c)),
        ),
      ),
    );
  }

  function removeColumn(colId: string) {
    if (columns.length <= 1) return;
    setColumns((prev) => prev.filter((c) => c.id !== colId));
  }

  function updateColumn(id: string, patch: Partial<Column>) {
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function runColumn(colId: string) {
    const col = columns.find((c) => c.id === colId);
    if (!col || !col.query.trim()) return;
    const version = versionOptions.find(
      (o) => o.version.id === col.promptId,
    )?.version;
    if (!version) return;

    const label = version.description || version.id;
    updateColumn(colId, {
      running: true,
      result: { label, text: "", tokens: 0, loading: true },
    });
    try {
      const r = await callLLM(version, col.query, col.context);
      updateColumn(colId, {
        running: false,
        result: { label, text: r.text, tokens: r.tokens, loading: false },
      });
    } catch (e: any) {
      updateColumn(colId, {
        running: false,
        result: { label, text: "", tokens: 0, loading: false, error: e.message },
      });
    }
  }

  function runAll() {
    columns.forEach((c) => runColumn(c.id));
  }

  function selectTrace(t: Trace) {
    if (selected?.spanId === t.spanId) {
      setSelected(null);
      setColumns((prev) =>
        prev.map((c) => ({ ...c, query: "", context: "", result: null })),
      );
      return;
    }
    setSelected(t);
    setColumns((prev) =>
      prev.map((c) => ({ ...c, query: t.query, context: t.context, result: null })),
    );
  }

  // ── Filters ──────────────────────────────────────────────────
  function filterKey(pid: string) {
    return `pg_filter_${pid}`;
  }
  function loadFilters(pid: string) {
    if (typeof window === "undefined" || !pid) return;
    try {
      const saved = localStorage.getItem(filterKey(pid));
      if (saved) {
        const { kinds, content } = JSON.parse(saved);
        setSpanKinds(new Set(kinds ?? ["LLM"]));
        setContentFilter(content ?? "ALL");
        return;
      }
    } catch {}
    setSpanKinds(new Set(["LLM"]));
    setContentFilter("ALL");
  }
  function saveFilters(pid: string, kinds: Set<string>, content: string) {
    if (!pid) return;
    localStorage.setItem(
      filterKey(pid),
      JSON.stringify({ kinds: [...kinds], content }),
    );
  }

  // ── Delete mode ───────────────────────────────────────────────
  function toggleDeleteMode() {
    if (deleteMode) {
      setDeleteModeVisible(false);
      setTimeout(() => {
        setDeleteMode(false);
        setDeleteSelection(new Set());
      }, 150);
    } else {
      setDeleteMode(true);
      setDeleteModeVisible(true);
      setDeleteSelection(new Set());
    }
  }

  function toggleSelect(traceId: string) {
    setDeleteSelection((prev) => {
      const next = new Set(prev);
      if (next.has(traceId)) next.delete(traceId);
      else next.add(traceId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (deleteSelection.size === traces.length) {
      setDeleteSelection(new Set());
    } else {
      setDeleteSelection(new Set(traces.map((t) => t.traceId)));
    }
  }

  async function handleDeleteSelected() {
    if (deleteSelection.size === 0) return;
    if (!confirm(`Delete ${deleteSelection.size} trace(s)?`)) return;
    setDeleting(true);
    for (const traceId of deleteSelection) {
      try {
        await deleteTrace(traceId);
      } catch (e) {
        console.error(`Failed to delete ${traceId}`, e);
      }
    }
    if (selected && deleteSelection.has(selected.traceId)) {
      setSelected(null);
    }
    setTraces((prev) => prev.filter((t) => !deleteSelection.has(t.traceId)));
    setDeleteSelection(new Set());
    setDeleteMode(false);
    setDeleting(false);
  }

  // ── Data loading ─────────────────────────────────────────────
  const loadProjects = useCallback(async () => {
    try {
      const ps = await fetchProjects();
      setProjects(ps);
      if (ps.length > 0 && !projectId) {
        const saved = localStorage.getItem("last_playground_project");
        const initial = saved && ps.some((p) => p.id === saved) ? saved : ps[0].id;
        setProjectIdState(initial);
        localStorage.setItem("last_playground_project", initial);
        loadFilters(initial);
      }
    } catch (e) {
      console.error(e);
    }
  }, [projectId]);

  const loadTraces = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const kindsStr =
      spanKinds.size === 0 ? "ALL" : [...spanKinds].join(",");
    try {
      setTraces(await fetchTraces(projectId, kindsStr, contentFilter));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [projectId, spanKinds, contentFilter]);

  const loadPrompts = useCallback(async () => {
    try {
      const ps = await fetchPrompts();
      const opts: VersionOption[] = [];
      for (const p of ps)
        for (const v of await fetchPromptVersions(p.name))
          opts.push({
            promptName: p.name,
            label: `${p.name} / ${v.description || v.id}`,
            version: v,
          });
      setVersionOptions(opts);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadProjects();
    loadPrompts();
  }, [loadProjects, loadPrompts]);
  useEffect(() => {
    loadTraces();
  }, [loadTraces]);

  // ── Render ────────────────────────────────────────────────────
  const anyRunning = columns.some((c) => c.running);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <Nav />

      <div className="flex min-h-0 flex-1">
        {/* ── LEFT: Trace list ── */}
        <Sidebar className="w-80">
          {/* Header */}
          <div className="relative z-10 border-b px-3 py-3">
            <div className="flex items-center gap-2">
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  loadFilters(e.target.value);
                  setSelected(null);
                }}
                className="h-8 flex-1 rounded-lg border bg-background px-2.5 text-sm font-medium outline-none transition focus:ring-2 focus:ring-ring/40"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                onClick={loadTraces}
                disabled={loading}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-background transition hover:bg-accent"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? "animate-spin text-primary" : "text-muted-foreground"}`}
                />
              </button>
              <button
                onClick={toggleDeleteMode}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition hover:bg-accent ${deleteMode ? "border-primary bg-accent" : "bg-background"}`}
                title="Delete traces"
              >
                <Trash2
                  className={`h-3.5 w-3.5 ${deleteMode ? "text-foreground" : ""}`}
                />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                id="filter-btn"
                onClick={() => setFilterOpen(!filterOpen)}
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors hover:bg-accent ${filterOpen ? "border-primary bg-accent" : "bg-background"}`}
              >
                <Filter className="h-3 w-3" />
                Filter
                <span className="ml-1 rounded bg-foreground/10 px-1 text-[11px] tabular-nums">
                  {traces.length}
                </span>
              </button>
            </div>
          </div>

          {/* Delete bar */}
          {deleteMode && (
            <div
              className={`flex items-center justify-between border-b bg-muted/50 px-3 py-2 ${deleteModeVisible ? "animate-slide-down" : "animate-slide-up"}`}
            >
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                <input
                  type="checkbox"
                  checked={
                    deleteSelection.size === traces.length && traces.length > 0
                  }
                  onChange={toggleSelectAll}
                  className="rounded"
                />
                All
              </label>
              <button
                onClick={handleDeleteSelected}
                disabled={deleteSelection.size === 0 || deleting}
                className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1 text-xs font-medium text-background transition hover:bg-foreground/80 disabled:opacity-30"
              >
                <Trash2 className="h-3 w-3" />
                {deleting ? "Deleting…" : `Delete ${deleteSelection.size}`}
              </button>
            </div>
          )}

          {/* Trace list */}
          <div className="flex-1 overflow-y-auto">
            {traces.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2">
                <Inbox className="h-8 w-8 text-muted-foreground/20" />
                <span className="text-xs text-muted-foreground/50">
                  {loading ? "Loading…" : "No traces"}
                </span>
              </div>
            ) : (
              traces.map((t) => {
                const active = t.spanId === selected?.spanId;
                const checked = deleteSelection.has(t.traceId);
                return (
                  <div
                    key={t.spanId}
                    onClick={() => {
                      if (deleteMode) toggleSelect(t.traceId);
                      else selectTrace(t);
                    }}
                    className={`group cursor-pointer border-b transition-colors hover:bg-accent/50 ${active && !deleteMode ? "bg-accent font-medium" : "text-muted-foreground"} ${checked ? "bg-muted/50" : ""}`}
                  >
                    <div className="flex gap-2.5 px-3 py-2.5">
                      {deleteMode ? (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(t.traceId)}
                          onClick={(e) => e.stopPropagation()}
                          className={`mt-0.5 shrink-0 rounded ${deleteModeVisible ? "animate-slide-in" : "animate-slide-out"}`}
                        />
                      ) : (
                        <div
                          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-200 ${active ? "bg-foreground" : "bg-transparent"}`}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm leading-snug">
                          {t.query || "(empty)"}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <time className="text-xs tabular-nums text-muted-foreground">
                            {new Date(t.time).toLocaleString("ko-KR", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        </div>
                        {t.annotations.length > 0 && (
                          <div className="mt-1">
                            <AnnotationBadges annotations={t.annotations} />
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })
            )}
          </div>
        </Sidebar>

        {/* ── RIGHT: Scrollable columns + fixed action bar ── */}
        <div className="flex min-h-0 min-w-0 flex-1">
          {/* Scrollable columns area */}
          <div className="flex min-h-0 min-w-0 flex-1 overflow-x-auto">
            {/* Original column (when trace selected) */}
            {selected && (
              <div className="flex flex-col border-r" style={{ flex: "1 0 280px" }}>
                <div className="shrink-0 border-b bg-muted/10 px-3 pt-3 pb-2">
                  <AddToDatasetModal
                    open={datasetModalOpen}
                    onClose={() => setDatasetModalOpen(false)}
                    query={selected.query}
                    context={selected.context}
                  />
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Original
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setDatasetModalOpen(true)}
                        className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        title="Add to dataset"
                      >
                        <Database className="size-3" />
                        Dataset
                      </button>
                      <AnnotationBadges annotations={selected.annotations} />
                    </div>
                  </div>

                  {/* Query (read-only) */}
                  <div className="mt-0">
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Query
                    </label>
                    <textarea
                      value={selected.query}
                      readOnly
                      rows={2}
                      className="w-full resize-none rounded-lg border bg-muted/20 px-2.5 py-1.5 text-sm leading-relaxed text-muted-foreground outline-none"
                    />
                  </div>

                  {/* Context collapsible (read-only) */}
                  <div className="mt-1">
                    <button
                      onClick={() => setOriginalContextOpen((v) => !v)}
                      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition hover:text-foreground"
                    >
                      <ChevronDown
                        className={`h-3 w-3 transition-transform ${originalContextOpen ? "rotate-180" : ""}`}
                      />
                      Context ({selected.context.length.toLocaleString()} chars)
                    </button>
                    {originalContextOpen && (
                      <textarea
                        value={selected.context}
                        readOnly
                        rows={4}
                        className="mt-1 w-full resize-y rounded-lg border bg-muted/20 px-2.5 py-1.5 text-sm leading-relaxed text-muted-foreground outline-none"
                      />
                    )}
                  </div>
                </div>

                {/* Result area */}
                <div className="flex-1 overflow-y-auto">
                  {selected.response ? (
                    <div className="h-full px-3 py-3">
                      <div className="mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          Result
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {selected.response}
                      </p>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 opacity-20">
                      <Inbox className="h-6 w-6" />
                      <span className="text-xs">No response</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Prompt columns */}
            {columns.map((col, idx) => {
              const sel = versionOptions.find((o) => o.version.id === col.promptId);
              return (
                <div
                  key={col.id}
                  className="flex flex-col border-r"
                  style={{
                    flex: col.entering ? "0 0 0px" : "1 0 280px",
                    overflow: "hidden",
                    transition:
                      "flex 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease",
                    opacity: col.entering ? 0 : 1,
                  }}
                >
                  {/* Column header: prompt selector + run */}
                  <div className="shrink-0 border-b bg-muted/5 px-3 pt-3 pb-2">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Prompt {idx + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        {sel && (
                          <button
                            onClick={() =>
                              setEditTarget({
                                promptName: sel.promptName,
                                version: sel.version,
                              })
                            }
                            className="flex items-center rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                        {columns.length > 1 && (
                          <button
                            onClick={() => removeColumn(col.id)}
                            className="flex items-center rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <select
                      value={col.promptId}
                      onChange={(e) =>
                        updateColumn(col.id, { promptId: e.target.value })
                      }
                      className="h-8 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                    >
                      {versionOptions.map((o) => (
                        <option key={o.version.id} value={o.version.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>

                    {/* Query */}
                    <div className="mt-2">
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Query
                      </label>
                      <textarea
                        value={col.query}
                        onChange={(e) =>
                          updateColumn(col.id, { query: e.target.value })
                        }
                        rows={2}
                        placeholder="Enter query…"
                        className="w-full resize-none rounded-lg border bg-background px-2.5 py-1.5 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ring/40"
                      />
                    </div>

                    {/* Context collapsible */}
                    <div className="mt-1">
                      <button
                        onClick={() =>
                          updateColumn(col.id, {
                            contextOpen: !col.contextOpen,
                          })
                        }
                        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition hover:text-foreground"
                      >
                        <ChevronDown
                          className={`h-3 w-3 transition-transform ${col.contextOpen ? "rotate-180" : ""}`}
                        />
                        Context ({col.context.length.toLocaleString()} chars)
                      </button>
                      {col.contextOpen && (
                        <textarea
                          value={col.context}
                          onChange={(e) =>
                            updateColumn(col.id, { context: e.target.value })
                          }
                          rows={4}
                          placeholder="Context…"
                          className="mt-1 w-full resize-y rounded-lg border bg-background px-2.5 py-1.5 text-sm leading-relaxed text-muted-foreground outline-none focus:ring-2 focus:ring-ring/40"
                        />
                      )}
                    </div>

                    {/* Run button */}
                    <button
                      onClick={() => runColumn(col.id)}
                      disabled={col.running || !col.query.trim()}
                      className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      {col.running ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                      {col.running ? "Running…" : "Run"}
                    </button>
                  </div>

                  {/* Result area */}
                  <div className="flex-1 overflow-y-auto">
                    {col.result ? (
                      <div className="h-full px-3 py-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Result
                          </span>
                          {!col.result.loading && col.result.tokens > 0 && (
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              {col.result.tokens} tokens
                            </span>
                          )}
                        </div>
                        {col.result.loading ? (
                          <div className="flex items-center gap-2 py-6 text-muted-foreground">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            <span className="text-sm">Generating…</span>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">
                            {col.result.error ?? col.result.text}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 opacity-20">
                        <Inbox className="h-6 w-6" />
                        <span className="text-xs">No result yet</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Fixed right action bar */}
          <div className="flex shrink-0 flex-col items-center gap-3 border-l bg-muted/5 px-3 pt-3">
            <button
              onClick={addColumn}
              className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background text-muted-foreground transition hover:bg-accent hover:text-foreground"
              title="Add prompt column"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={runAll}
              disabled={anyRunning || columns.every((c) => !c.query.trim())}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-40"
              title="Run all columns"
            >
              <Play className="h-4 w-4 fill-current" />
            </button>
            <button
              onClick={() => setPromptsModalOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background text-muted-foreground transition hover:bg-accent hover:text-foreground"
              title="Manage prompts"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <PromptsModal
        open={promptsModalOpen}
        onClose={() => setPromptsModalOpen(false)}
        onChanged={loadPrompts}
      />

      {editTarget && (
        <PromptEditModal
          promptName={editTarget.promptName}
          version={editTarget.version}
          onClose={() => setEditTarget(null)}
          onSave={() => {
            loadPrompts();
            setEditTarget(null);
          }}
        />
      )}

      {/* Filter dropdown */}
      {filterOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setFilterOpen(false)}
          />
          <div
            className="fixed z-50 w-72 overflow-hidden rounded-xl border bg-background shadow-xl"
            style={{
              top:
                (document
                  .getElementById("filter-btn")
                  ?.getBoundingClientRect().bottom ?? 0) + 6,
              left:
                document
                  .getElementById("filter-btn")
                  ?.getBoundingClientRect().left ?? 0,
            }}
          >
            <div className="border-b px-3 py-2.5">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Span Kind
              </p>
              <div className="flex flex-wrap gap-1">
                {["ALL", "LLM", "CHAIN", "RETRIEVER", "PROMPT"].map((kind) => {
                  const isAll = kind === "ALL";
                  const active = isAll
                    ? spanKinds.size === 0
                    : spanKinds.has(kind);
                  return (
                    <button
                      key={kind}
                      onClick={() => {
                        let next: Set<string>;
                        if (isAll) {
                          next = new Set();
                        } else {
                          next = new Set(spanKinds);
                          if (active) next.delete(kind);
                          else next.add(kind);
                        }
                        setSpanKinds(next);
                        saveFilters(projectId, next, contentFilter);
                        setSelected(null);
                      }}
                      className={`rounded-md border px-2 py-1 text-xs font-mono transition-all ${
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-background text-muted-foreground hover:border-foreground/40"
                      }`}
                    >
                      {kind}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-3 py-2.5">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Content
              </p>
              <div className="flex flex-col gap-0.5">
                {[
                  { value: "ALL", label: "All" },
                  { value: "RAG", label: "RAG only" },
                  { value: "PLAYGROUND", label: "Playground only" },
                ].map(({ value, label }) => {
                  const active = contentFilter === value;
                  return (
                    <button
                      key={value}
                      onClick={() => {
                        setContentFilter(value);
                        saveFilters(projectId, spanKinds, value);
                        setSelected(null);
                      }}
                      className={`rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                        active
                          ? "bg-foreground/8 font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {active && <span className="mr-1.5">•</span>}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
