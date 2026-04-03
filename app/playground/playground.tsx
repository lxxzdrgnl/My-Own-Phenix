"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchTraces,
  fetchPrompts,
  fetchPromptVersions,
  fetchProjects,
  callLLM,
  deleteTrace,
  normalizeContent,
  Trace,
  PromptVersion,
  ComparisonResult,
  Project,
} from "@/lib/phoenix";
import { RefreshCw, Play, Eye, X, Inbox, ChevronDown, Trash2 } from "lucide-react";
import { Nav } from "@/components/nav";
import { AnnotationBadges } from "@/components/annotation-badge";

interface VersionOption {
  promptName: string;
  label: string;
  version: PromptVersion;
}

function PreviewModal({ version, onClose }: { version: PromptVersion; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl max-h-[80vh] overflow-y-auto rounded-xl border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b bg-background px-5 py-3">
          <h2 className="text-sm font-semibold">{version.description || version.id}</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          {version.template?.messages?.map((m, i) => (
            <div key={i}>
              <span className="inline-block rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">{m.role}</span>
              <pre className="mt-1.5 whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 font-sans text-xs leading-relaxed">{normalizeContent(m.content)}</pre>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Model: {version.model_name} · Temp: {version.invocation_parameters?.openai?.temperature ?? "—"}
          </p>
        </div>
      </div>
    </div>
  );
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
  const [previewVersion, setPreviewVersion] = useState<PromptVersion | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
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
      if (ps.length > 0 && !projectId) setProjectId(ps[0].id);
    } catch (e) { console.error(e); }
  }, [projectId]);

  const loadTraces = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try { setTraces(await fetchTraces(projectId)); } catch (e) { console.error(e); }
    setLoading(false);
  }, [projectId]);

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
    if (!selected) return;
    const vA = versionOptions.find((o) => o.version.id === promptA)?.version;
    const vB = promptB ? versionOptions.find((o) => o.version.id === promptB)?.version : null;
    if (!vA) return;

    setRunning(true);
    const nr: ComparisonResult[] = [{ label: vA.description || vA.id, text: "", tokens: 0, loading: true }];
    if (vB) nr.push({ label: vB.description || vB.id, text: "", tokens: 0, loading: true });
    setResults([...nr]);

    const run = (v: PromptVersion, idx: number) =>
      callLLM(v, selected.query, selected.context)
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
          <div className="border-b px-3 py-3">
            <div className="flex items-center gap-2">
              <select
                value={projectId}
                onChange={(e) => { setProjectId(e.target.value); setSelected(null); setResults([]); }}
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
            <p className="mt-1.5 text-[10px] tabular-nums text-muted-foreground">{traces.length} traces</p>
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
                    else { setSelected(t); setResults([]); setContextOpen(false); }
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

          {/* TOP: Prompt 선택 + Query */}
          {selected && (
            <div className="shrink-0 border-b">
              {/* Prompt 선택 바 */}
              <div className="flex items-end gap-4 px-6 pt-4 pb-3">
                <div className="flex-1 min-w-0">
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Prompt A</label>
                    {selA && (
                      <button onClick={() => setPreviewVersion(selA.version)}
                        className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                        <Eye className="h-3 w-3" />
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
                      <button onClick={() => setPreviewVersion(selB.version)}
                        className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                        <Eye className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <select value={promptB} onChange={(e) => setPromptB(e.target.value)}
                    className="h-9 w-full rounded-lg border bg-background px-2.5 text-[13px] outline-none focus:ring-2 focus:ring-ring/40">
                    <option value="">— none —</option>
                    {versionOptions.map((o) => <option key={o.version.id} value={o.version.id}>{o.label}</option>)}
                  </select>
                </div>
                <button onClick={handleRun} disabled={running}
                  className="h-9 shrink-0 flex items-center gap-2 rounded-lg bg-primary px-5 text-[13px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-35 disabled:cursor-not-allowed">
                  <Play className="h-4 w-4" />
                  {running ? "Running…" : "Run"}
                </button>
              </div>

              {/* Query + Context */}
              <div className="px-6 pb-3">
                <p className="text-[13px] leading-relaxed">
                  <span className="mr-2 inline-block rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase">Q</span>
                  {selected.query}
                </p>
                <button onClick={() => setContextOpen(!contextOpen)}
                  className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                  <ChevronDown className={`h-3 w-3 transition-transform ${contextOpen ? "rotate-180" : ""}`} />
                  Context ({selected.context.length.toLocaleString()} chars)
                </button>
                {contextOpen && (
                  <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/20 p-3 text-[12px] leading-relaxed text-muted-foreground">
                    {selected.context}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* BOTTOM: Original | A | B */}
          <div className="flex-1">
            {!selected ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 opacity-30">
                <Inbox className="h-10 w-10" />
                <p className="text-sm">왼쪽에서 트레이스를 선택하세요</p>
              </div>
            ) : (
              <div className="h-full px-6 py-4">
                <div className={`grid h-full gap-4 ${results.length === 0 ? "grid-cols-1" : results.length === 1 ? "grid-cols-2" : "grid-cols-3"}`}>
                  {/* Original */}
                  <div className="flex flex-col rounded-xl border">
                    <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
                      <span className="text-xs font-semibold">Original</span>
                      <AnnotationBadges annotations={selected.annotations} />
                    </div>
                    <div className="flex-1 overflow-y-auto whitespace-pre-wrap px-4 py-3 text-[13px] leading-relaxed">
                      {selected.response}
                    </div>
                  </div>

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

      {previewVersion && <PreviewModal version={previewVersion} onClose={() => setPreviewVersion(null)} />}
    </div>
  );
}
