"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchTraces,
  fetchPrompts,
  fetchPromptVersions,
  fetchProjects,
  deleteTrace,
  Trace,
  PromptVersion,
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
  Database,
} from "lucide-react";
import { Nav } from "@/components/nav";
import { Sidebar } from "@/components/ui/sidebar";
import { AnnotationBadges } from "@/components/annotation-badge";
import { AddToDatasetModal } from "@/components/add-to-dataset-modal";
import { PromptEditModal } from "@/components/prompt-edit-modal";
import { PromptsModal } from "@/components/prompts-modal";
import { AnnotationForm } from "@/components/annotation-form";
import { usePlaygroundColumns, VersionOption } from "./hooks/use-playground-columns";
import { PromptColumn } from "./prompt-column";
import { FilterDropdown } from "./filter-dropdown";
import { TraceList } from "./trace-list";

function filterKey(pid: string) {
  return `pg_filter_${pid}`;
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
  const [annotateSpanId, setAnnotateSpanId] = useState<string | null>(null);

  const {
    columns,
    addColumn,
    removeColumn,
    updateColumn,
    runColumn,
    runAll,
    syncColumnsToTrace,
    clearColumns,
  } = usePlaygroundColumns(versionOptions);

  function selectTrace(t: Trace) {
    if (selected?.spanId === t.spanId) {
      setSelected(null);
      clearColumns();
      return;
    }
    setSelected(t);
    syncColumnsToTrace(t.query, t.context);
  }

  // ── Filters ──────────────────────────────────────────────────
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
        const initial =
          saved && ps.some((p) => p.id === saved) ? saved : ps[0].id;
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
            <TraceList
              traces={traces}
              loading={loading}
              selected={selected}
              deleteMode={deleteMode}
              deleteModeVisible={deleteModeVisible}
              deleteSelection={deleteSelection}
              onSelectTrace={selectTrace}
              onToggleSelect={toggleSelect}
              onAnnotate={setAnnotateSpanId}
            />
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
            {columns.map((col, idx) => (
              <PromptColumn
                key={col.id}
                col={col}
                idx={idx}
                versionOptions={versionOptions}
                canRemove={columns.length > 1}
                onUpdate={updateColumn}
                onRemove={removeColumn}
                onRun={runColumn}
                onEditPrompt={(promptName, version) =>
                  setEditTarget({ promptName, version })
                }
                onAnnotate={setAnnotateSpanId}
              />
            ))}
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

      <AnnotationForm
        open={!!annotateSpanId}
        onClose={() => setAnnotateSpanId(null)}
        spanId={annotateSpanId ?? ""}
        onSaved={() => {
          setAnnotateSpanId(null);
          loadTraces();
        }}
      />

      {/* Filter dropdown */}
      {filterOpen && (
        <FilterDropdown
          spanKinds={spanKinds}
          contentFilter={contentFilter}
          projectId={projectId}
          onClose={() => setFilterOpen(false)}
          onSpanKindChange={setSpanKinds}
          onContentFilterChange={setContentFilter}
          onClearSelected={() => setSelected(null)}
        />
      )}
    </div>
  );
}
