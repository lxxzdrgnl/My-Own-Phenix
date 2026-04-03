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
import { RefreshCw, Play, Pencil, Inbox, ChevronDown, Trash2, Filter } from "lucide-react";
import { Nav } from "@/components/nav";
import { AnnotationBadges } from "@/components/annotation-badge";
import { PromptEditModal } from "@/components/prompt-edit-modal";

interface VersionOption {
  promptName: string;
  label: string;
  version: PromptVersion;
}

export function Playground() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [traces, setTraces] = useState<Trace[]>([]);
  const [selected, setSelected] = useState<Trace | null>(null);
  const [loading, setLoading] = useState(true);
  const [versionOptions, setVersionOptions] = useState<VersionOption[]>([]);
  const [promptA, setPromptA] = useState("");
  const [promptB, setPromptB] = useState("");
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [running, setRunning] = useState(false);
  const [editTarget, setEditTarget] = useState<{ promptName: string; version: PromptVersion } | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [editQuery, setEditQuery] = useState("");
  const [editContext, setEditContext] = useState("");
  const [spanKinds, setSpanKinds] = useState<Set<string>>(new Set(["LLM"]));
  const [contentFilter, setContentFilter] = useState("ALL");
  const [filterOpen, setFilterOpen] = useState(false);

  // Load/save filters per project
  function filterKey(pid: string) { return `pg_filter_${pid}`; }

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
    localStorage.setItem(filterKey(pid), JSON.stringify({ kinds: [...kinds], content }));
  }
  const [deleteMode, setDeleteMode] = useState(false);
  const [deleteModeVisible, setDeleteModeVisible] = useState(false);
  const [deleteSelection, setDeleteSelection] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  function toggleDeleteMode() {
    if (deleteMode) {
      setDeleteModeVisible(false);
      setTimeout(() => { setDeleteMode(false); setDeleteSelection(new Set()); }, 150);
    } else {
      setDeleteMode(true);
      setDeleteModeVisible(true);
      setDeleteSelection(new Set());
    }
  }

  const loadProjects = useCallback(async () => {
    try {
      const ps = await fetchProjects();
      setProjects(ps);
      if (ps.length > 0 && !projectId) {
        setProjectId(ps[0].id);
        loadFilters(ps[0].id);
      }
    } catch (e) { console.error(e); }
  }, [projectId]);

  const loadTraces = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const kindsStr = spanKinds.size === 0 ? "ALL" : [...spanKinds].join(",");
    try { setTraces(await fetchTraces(projectId, kindsStr, contentFilter)); } catch (e) { console.error(e); }
    setLoading(false);
  }, [projectId, spanKinds, contentFilter]);

  const loadPrompts = useCallback(async () => {
    try {
      const ps = await fetchPrompts();
      const opts: VersionOption[] = [];
      for (const p of ps)
        for (const v of await fetchPromptVersions(p.name))
          opts.push({ promptName: p.name, label: `${p.name} / ${v.description || v.id}`, version: v });
      setVersionOptions(opts);
      if (opts.length > 0 && !promptA) setPromptA(opts[0].version.id);
    } catch (e) { console.error(e); }
  }, [promptA]);

  useEffect(() => { loadProjects(); loadPrompts(); }, [loadProjects, loadPrompts]);
  useEffect(() => { loadTraces(); }, [loadTraces]);


  async function handleRun() {
    if (!editQuery.trim()) return;
    const vA = versionOptions.find((o) => o.version.id === promptA)?.version;
    const vB = promptB ? versionOptions.find((o) => o.version.id === promptB)?.version : null;
    if (!vA) return;

    setRunning(true);
    const nr: ComparisonResult[] = [{ label: vA.description || vA.id, text: "", tokens: 0, loading: true }];
    if (vB) nr.push({ label: vB.description || vB.id, text: "", tokens: 0, loading: true });
    setResults([...nr]);

    const run = (v: PromptVersion, idx: number) =>
      callLLM(v, editQuery, editContext)
        .then((r) => { nr[idx] = { ...nr[idx], text: r.text, tokens: r.tokens, loading: false }; setResults([...nr]); })
        .catch((e: any) => { nr[idx] = { ...nr[idx], loading: false, error: e.message }; setResults([...nr]); });

    await Promise.all([run(vA, 0), ...(vB ? [run(vB, 1)] : [])]);
    setRunning(false);
  }

  function toggleSelect(traceId: string) {
    setDeleteSelection((prev) => {
      const next = new Set(prev);
      if (next.has(traceId)) next.delete(traceId); else next.add(traceId);
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
    if (!confirm(`${deleteSelection.size}개 트레이스를 삭제하시겠습니까?`)) return;
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
      setResults([]);
    }
    setTraces((prev) => prev.filter((t) => !deleteSelection.has(t.traceId)));
    setDeleteSelection(new Set());
    setDeleteMode(false);
    setDeleting(false);
  }

  const selA = versionOptions.find((o) => o.version.id === promptA);
  const selB = versionOptions.find((o) => o.version.id === promptB);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <Nav />

      <div className="flex min-h-0 flex-1">
        {/* ── LEFT: Trace list ── */}
        <div className="flex w-96 shrink-0 flex-col border-r bg-muted/5">
          {/* Header */}
          <div className="border-b px-3 py-3 overflow-visible relative z-10">
            <div className="flex items-center gap-2">
              <select
                value={projectId}
                onChange={(e) => { setProjectId(e.target.value); loadFilters(e.target.value); setSelected(null); setResults([]); }}
                className="h-8 flex-1 rounded-lg border bg-background px-2.5 text-[13px] font-medium outline-none transition focus:ring-2 focus:ring-ring/40"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button onClick={loadTraces} disabled={loading}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-background transition hover:bg-accent">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-primary" : "text-muted-foreground"}`} />
              </button>
              <button
                onClick={toggleDeleteMode}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition hover:bg-accent ${deleteMode ? "bg-accent border-primary" : "bg-background"}`}
                title="Delete traces"
              >
                <Trash2 className={`h-3.5 w-3.5 ${deleteMode ? "text-foreground" : ""}`} />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                id="filter-btn"
                onClick={() => setFilterOpen(!filterOpen)}
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] transition-colors hover:bg-accent
                  ${filterOpen ? "bg-accent border-primary" : "bg-background"}`}
              >
                <Filter className="h-3 w-3" />
                Filter
                <span className="ml-1 rounded bg-foreground/10 px-1 text-[9px] tabular-nums">{traces.length}</span>
              </button>
            </div>
          </div>

          {/* Delete bar */}
          {deleteMode && (
            <div className={`flex items-center justify-between border-b bg-muted/50 px-3 py-2 ${deleteModeVisible ? "animate-slide-down" : "animate-slide-up"}`}>
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground">
                <input
                  type="checkbox"
                  checked={deleteSelection.size === traces.length && traces.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded"
                />
                All
              </label>
              <button
                onClick={handleDeleteSelected}
                disabled={deleteSelection.size === 0 || deleting}
                className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1 text-[11px] font-medium text-background transition hover:bg-foreground/80 disabled:opacity-30"
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
                <span className="text-[11px] text-muted-foreground/50">{loading ? "Loading…" : "No traces"}</span>
              </div>
            ) : traces.map((t) => {
              const active = t.spanId === selected?.spanId;
              const checked = deleteSelection.has(t.traceId);
              return (
                <div key={t.spanId}
                  onClick={() => {
                    if (deleteMode) toggleSelect(t.traceId);
                    else if (selected?.spanId === t.spanId) { setSelected(null); setEditQuery(""); setEditContext(""); setResults([]); }
                    else { setSelected(t); setEditQuery(t.query); setEditContext(t.context); setResults([]); setContextOpen(false); }
                  }}
                  className={`group cursor-pointer border-b transition-colors hover:bg-accent/40
                    ${active && !deleteMode ? "bg-accent" : ""}
                    ${checked ? "bg-muted/50" : ""}`}
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
                      <div className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-200 ${active ? "bg-foreground" : "bg-transparent"}`} />
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[13px] leading-snug">{t.query || "(empty)"}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <time className="text-[10px] tabular-nums text-muted-foreground">
                          {new Date(t.time).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
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
            })}
          </div>
        </div>

        {/* ── RIGHT: 상하 구조 ── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">

          {/* TOP: Prompt 선택 + Query/Context */}
          <div className="shrink-0 border-b">
            {/* Prompt 선택 바 */}
            <div className="flex items-end gap-4 px-6 pt-4 pb-3">
              <div className="flex-1 min-w-0">
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Prompt A</label>
                  {selA && (
                    <button onClick={() => setEditTarget({ promptName: selA.promptName, version: selA.version })}
                      className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <select value={promptA} onChange={(e) => setPromptA(e.target.value)}
                  className="h-9 w-full rounded-lg border bg-background px-2.5 text-[13px] outline-none focus:ring-2 focus:ring-ring/40">
                  {versionOptions.map((o) => <option key={o.version.id} value={o.version.id}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-0">
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Prompt B</label>
                  {selB && (
                    <button onClick={() => setEditTarget({ promptName: selB.promptName, version: selB.version })}
                      className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <select value={promptB} onChange={(e) => setPromptB(e.target.value)}
                  className="h-9 w-full rounded-lg border bg-background px-2.5 text-[13px] outline-none focus:ring-2 focus:ring-ring/40">
                  <option value="">— none —</option>
                  {versionOptions.map((o) => <option key={o.version.id} value={o.version.id}>{o.label}</option>)}
                </select>
              </div>
              <button onClick={handleRun} disabled={running || !editQuery.trim()}
                className="h-9 shrink-0 flex items-center gap-2 rounded-lg bg-primary px-5 text-[13px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-35 disabled:cursor-not-allowed">
                <Play className="h-4 w-4" />
                {running ? "Running…" : "Run"}
              </button>
            </div>

            {/* Query + Context (editable) */}
            <div className="px-6 pb-3">
              <div className="mb-2">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Query</label>
                <textarea
                  value={editQuery}
                  onChange={(e) => setEditQuery(e.target.value)}
                  rows={2}
                  placeholder="질문을 입력하세요..."
                  className="w-full rounded-lg border bg-background px-3 py-2 text-[13px] leading-relaxed outline-none focus:ring-2 focus:ring-ring/40 resize-none"
                />
              </div>
              <div>
                <button onClick={() => setContextOpen(!contextOpen)}
                  className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground">
                  <ChevronDown className={`h-3 w-3 transition-transform ${contextOpen ? "rotate-180" : ""}`} />
                  Context ({editContext.length.toLocaleString()} chars)
                </button>
                {contextOpen && (
                  <textarea
                    value={editContext}
                    onChange={(e) => setEditContext(e.target.value)}
                    rows={5}
                    placeholder="컨텍스트를 입력하거나 트레이스에서 자동으로 채워집니다..."
                    className="w-full rounded-lg border bg-background px-3 py-2 text-[12px] leading-relaxed text-muted-foreground outline-none focus:ring-2 focus:ring-ring/40 resize-y"
                  />
                )}
              </div>
            </div>
          </div>

          {/* BOTTOM: Original | A | B */}
          <div className="flex-1">
            {results.length === 0 && !selected ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 opacity-30">
                <Inbox className="h-10 w-10" />
                <p className="text-sm">트레이스를 선택하거나 직접 Query를 입력하세요</p>
              </div>
            ) : (
              <div className="h-full px-6 py-4">
                <div className={`grid h-full gap-4 ${
                  results.length === 0
                    ? selected ? "grid-cols-1" : "grid-cols-1"
                    : results.length === 1
                      ? selected ? "grid-cols-2" : "grid-cols-1"
                      : selected ? "grid-cols-3" : "grid-cols-2"
                }`}>
                  {/* Original (only if trace selected) */}
                  {selected && (
                    <div className="flex flex-col rounded-xl border">
                      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
                        <span className="text-xs font-semibold">Original</span>
                        <AnnotationBadges annotations={selected.annotations} />
                      </div>
                      <div className="flex-1 overflow-y-auto whitespace-pre-wrap px-4 py-3 text-[13px] leading-relaxed">
                        {selected.response}
                      </div>
                    </div>
                  )}

                  {/* Results */}
                  {results.map((r, i) => (
                    <div key={i} className="flex flex-col rounded-xl border">
                      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">
                            {i === 0 ? "A" : "B"}
                          </span>
                          <span className="text-xs font-semibold">{r.label}</span>
                        </div>
                        {r.loading ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        ) : r.tokens > 0 ? (
                          <span className="text-[10px] tabular-nums text-muted-foreground">{r.tokens} tokens</span>
                        ) : null}
                      </div>
                      <div className={`flex-1 overflow-y-auto whitespace-pre-wrap px-4 py-3 text-[13px] leading-relaxed ${r.error ? "text-foreground" : ""}`}>
                        {r.loading ? (
                          <div className="flex items-center gap-2 py-4 text-muted-foreground">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            <span className="text-xs">Generating…</span>
                          </div>
                        ) : (r.error ?? r.text)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {editTarget && (
        <PromptEditModal
          promptName={editTarget.promptName}
          version={editTarget.version}
          onClose={() => setEditTarget(null)}
          onSave={() => { loadPrompts(); setEditTarget(null); }}
        />
      )}

      {/* Filter dropdown */}
      {filterOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />
          <div
            className="fixed z-50 w-72 overflow-hidden rounded-xl border bg-background shadow-xl"
            style={{
              top: (document.getElementById("filter-btn")?.getBoundingClientRect().bottom ?? 0) + 6,
              left: document.getElementById("filter-btn")?.getBoundingClientRect().left ?? 0,
            }}
          >
            {/* Span Kind */}
            <div className="border-b px-3 py-2.5">
              <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Span Kind</p>
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
                          if (active) next.delete(kind); else next.add(kind);
                        }
                        setSpanKinds(next);
                        saveFilters(projectId, next, contentFilter);
                        setSelected(null); setResults([]);
                      }}
                      className={`rounded-md border px-2 py-1 text-[10px] font-mono transition-all
                        ${active
                          ? "bg-foreground text-background border-foreground"
                          : "bg-background text-muted-foreground border-border hover:border-foreground/40"
                        }`}
                    >
                      {kind}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Content */}
            <div className="px-3 py-2.5">
              <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Content</p>
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
                        setSelected(null); setResults([]);
                      }}
                      className={`rounded-md px-2 py-1.5 text-left text-[11px] transition-colors
                        ${active
                          ? "bg-foreground/8 text-foreground font-medium"
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
