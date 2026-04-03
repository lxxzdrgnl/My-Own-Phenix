"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchTraces,
  fetchPrompts,
  fetchPromptVersions,
  callLLM,
  normalizeContent,
  Trace,
  PromptVersion,
  ComparisonResult,
} from "@/lib/phoenix";
import { RefreshCw, Play, Eye, X, Inbox, ChevronDown } from "lucide-react";
import { Nav } from "@/components/nav";

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

  const loadTraces = useCallback(async () => {
    setLoading(true);
    try { setTraces(await fetchTraces()); } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

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

  useEffect(() => { loadTraces(); loadPrompts(); }, [loadTraces, loadPrompts]);

  function badge(annotations: Trace["annotations"], name: string) {
    const a = annotations.find((x) => x.name === name);
    if (!a) return null;
    const good = name === "hallucination" ? a.label === "factual" : a.label === "correct";
    return { cls: good ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500", label: a.label };
  }

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

  const selA = versionOptions.find((o) => o.version.id === promptA);
  const selB = versionOptions.find((o) => o.version.id === promptB);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <Nav />

      <div className="flex min-h-0 flex-1">
        {/* ── LEFT: Trace list ── */}
        <div className="flex w-80 shrink-0 flex-col border-r">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-xs font-semibold tracking-wide">Traces</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] tabular-nums text-muted-foreground">{traces.length}</span>
              <button onClick={loadTraces} disabled={loading} className="rounded-md p-1 hover:bg-muted">
                <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {traces.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 opacity-40">
                <Inbox className="h-7 w-7" />
                <span className="text-[11px]">{loading ? "Loading…" : "No traces"}</span>
              </div>
            ) : traces.map((t) => {
              const h = badge(t.annotations, "hallucination");
              const q = badge(t.annotations, "qa_correctness");
              const active = t.spanId === selected?.spanId;
              return (
                <div key={t.spanId}
                  onClick={() => { setSelected(t); setResults([]); setContextOpen(false); }}
                  className={`cursor-pointer border-b px-4 py-3 transition-colors hover:bg-accent/50
                    ${active ? "bg-accent border-l-[3px] border-l-primary" : "border-l-[3px] border-l-transparent"}`}>
                  <p className="line-clamp-2 text-[13px] leading-snug font-medium">{t.query || "(empty)"}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <time className="text-[10px] text-muted-foreground tabular-nums">
                      {new Date(t.time).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </time>
                    {h && <span className={`rounded-full px-1.5 py-px text-[9px] font-semibold ${h.cls}`}>{h.label}</span>}
                    {q && <span className={`rounded-full px-1.5 py-px text-[9px] font-semibold ${q.cls}`}>{q.label}</span>}
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
                      <div className="flex gap-1">
                        {["hallucination", "qa_correctness"].map((name) => {
                          const b = badge(selected.annotations, name);
                          return b ? <span key={name} className={`rounded-full px-1.5 py-px text-[9px] font-semibold ${b.cls}`}>{b.label}</span> : null;
                        })}
                      </div>
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
                      <div className={`flex-1 overflow-y-auto whitespace-pre-wrap px-4 py-3 text-[13px] leading-relaxed ${r.error ? "text-destructive" : ""}`}>
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
