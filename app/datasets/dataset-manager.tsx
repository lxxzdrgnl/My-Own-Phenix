"use client";
import { apiFetch } from "@/lib/api-client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AgentModelSelector } from "@/components/agent-model-selector";
import { CSVImportModal } from "@/components/csv-import-modal";
import { EvalSelectorModal, type EvalOverrides } from "@/components/eval-selector-modal";
import { cn } from "@/lib/utils";
import {
  Upload, Play, FileSpreadsheet, Plus, Trash2, RefreshCw,
  Database, Download, ChevronDown, Pencil, Check, X, Settings2,
  ChevronRight, FlaskConical, List,
} from "lucide-react";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { Sidebar, SidebarHeader, SidebarItemDiv } from "@/components/ui/sidebar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DatasetMeta {
  id: string; name: string; fileName: string;
  headers: string; queryCol: string; contextCol: string; rowCount: number;
}
interface DatasetRow { [key: string]: string; }
interface RunMeta {
  id: string; agentSource: string; evalNames: string; status: string; createdAt: string;
}
interface RowResult {
  rowIdx: number; response: string; query?: string;
  evals: Record<string, { label: string; score: number; explanation: string }>;
}
interface AgentConfigOption {
  id: string; project: string; alias: string | null;
  agentType: string; endpoint: string; assistantId: string;
  template?: { name: string; description?: string } | null;
}
interface EvalOption {
  name: string; evalType: string; template: string;
  outputMode: string; isCustom: boolean; badgeLabel: string; ruleConfig: string;
}

const PASS_LABELS = new Set([
  "pass","true","yes","correct","factual","faithful","appropriate","clean","relevant",
]);

// ─── Component ────────────────────────────────────────────────────────────────

export function DatasetManager() {
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [queryCol, setQueryCol] = useState("");
  const [contextCol, setContextCol] = useState("");

  const [importModal, setImportModal] = useState<{ open: boolean; target: { id: string; name: string } | null }>({ open: false, target: null });
  const [dragOver, setDragOver] = useState(false);

  const [agentConfigs, setAgentConfigs] = useState<AgentConfigOption[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);

  const [evalOptions, setEvalOptions] = useState<EvalOption[]>([]);
  const [checkedEvals, setCheckedEvals] = useState<Set<string>>(new Set());
  const [evalOverrides, setEvalOverrides] = useState<EvalOverrides>({});
  const [evaluating, setEvaluating] = useState(false);
  const [evalProgress, setEvalProgress] = useState(0);

  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<RowResult[]>([]);
  const [runEvalNames, setRunEvalNames] = useState<string[]>([]);
  const [runsOpen, setRunsOpen] = useState(false);

  const [liveResults, setLiveResults] = useState<RowResult[]>([]);
  const [liveRunId, setLiveRunId] = useState<string | null>(null);
  const [evalModalOpen, setEvalModalOpen] = useState(false);

  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [editRowData, setEditRowData] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<"prompts" | "results">("prompts");
  const [configOpen, setConfigOpen] = useState(true);

  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);
  const [totalRows, setTotalRows] = useState(0);
  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set());
  const cancelRef = useRef(false);
  const [expandedResultIdx, setExpandedResultIdx] = useState<number | null>(null);

  // ── Load datasets ──
  const loadDatasets = useCallback(async () => {
    try {
      const res = await apiFetch("/api/datasets");
      const data = await res.json();
      setDatasets(data.datasets ?? []);
    } catch {}
    setLoading(false);
  }, []);
  useEffect(() => { loadDatasets(); }, [loadDatasets]);

  useEffect(() => {
    apiFetch("/api/agent-config").then(r => r.json()).then(d => setAgentConfigs(d.configs ?? [])).catch(() => {});
  }, []);

  const loadEvals = useCallback(async () => {
    try {
      const res = await apiFetch("/api/eval-prompts");
      const data = await res.json();
      setEvalOptions(data.prompts ?? []);
    } catch {}
  }, []);
  useEffect(() => { loadEvals(); }, [loadEvals]);

  // ── Load a page of rows ──
  async function loadPage(id: string, p: number) {
    try {
      const res = await apiFetch(`/api/datasets/rows?id=${id}&page=${p}&pageSize=${pageSize}`);
      const data = await res.json();
      setHeaders(data.headers ?? []);
      setRows(data.rows ?? []);
      setTotalRows(data.total ?? 0);
      setQueryCol(data.queryCol ?? "");
      setContextCol(data.contextCol ?? "");
      setCheckedEvals(new Set(data.evalNames ?? []));
      setEvalOverrides(data.evalOverrides ?? {});
      setPage(p);
    } catch {}
  }

  // ── Select dataset ──
  async function selectDataset(id: string) {
    setSelectedId(id);
    setLiveResults([]); setLiveRunId(null);
    setSelectedRunId(null); setRunResults([]); setRunEvalNames([]);
    setActiveTab("prompts"); setPage(0); setSelectedRowIndices(new Set());
    try {
      const [_, runsRes] = await Promise.all([
        loadPage(id, 0),
        apiFetch(`/api/datasets/runs?datasetId=${id}`),
      ]);
      const runsData = await runsRes.json();
      setRuns(runsData.runs ?? []);
    } catch {}
  }

  async function loadRun(runId: string) {
    setSelectedRunId(runId); setLiveResults([]); setLiveRunId(null);
    try {
      const res = await apiFetch(`/api/datasets/runs/${runId}`);
      const data = await res.json();
      setRunResults(data.rowResults ?? []);
      setRunEvalNames(data.evalNames ?? []);
      setActiveTab("results");
    } catch {}
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const res = await apiFetch("/api/datasets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      setNewName(""); setCreating(false);
      await loadDatasets();
      if (data.dataset?.id) selectDataset(data.dataset.id);
    } catch {}
  }

  async function handleImport(data: {
    name: string; fileName: string; headers: string[];
    rows: Record<string, string>[]; queryCol: string; contextCol: string;
  }) {
    const target = importModal.target;
    if (target) {
      await apiFetch("/api/datasets/rows", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: target.id, rows: data.rows }),
      });
      await loadDatasets(); selectDataset(target.id);
    } else {
      const res = await apiFetch("/api/datasets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name, fileName: data.fileName, headers: data.headers, rows: data.rows, queryCol: data.queryCol, contextCol: data.contextCol }),
      });
      let result: any = {};
      try { result = await res.json(); } catch {}
      await loadDatasets();
      if (result.dataset?.id) selectDataset(result.dataset.id);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this dataset?")) return;
    await apiFetch("/api/datasets", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (selectedId === id) { setSelectedId(null); setRows([]); setHeaders([]); }
    loadDatasets();
  }

  function handleCancel() {
    cancelRef.current = true;
  }

  async function handleGenerate() {
    if (totalRows === 0 || !selectedId) return;
    cancelRef.current = false;
    setGenerating(true); setGenProgress(0);

    // Fetch ALL rows, then filter to selected (if any)
    const allRowsRes = await apiFetch(`/api/datasets/rows?id=${selectedId}&all=1`);
    const allRowsData = await allRowsRes.json();
    let allRows: DatasetRow[] = allRowsData.rows ?? [];
    if (selectedRowIndices.size > 0) {
      allRows = allRows.filter(r => selectedRowIndices.has((r as any)._rowIndex));
    }
    if (allRows.length === 0) { setGenerating(false); return; }

    const runRes = await apiFetch("/api/datasets/runs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datasetId: selectedId, agentSource: selectedAgent, evalNames: [] }),
    });
    const { run } = await runRes.json();
    setLiveRunId(run.id); setSelectedRunId(null);
    setActiveTab("results");

    const results: RowResult[] = [];
    for (let i = 0; i < allRows.length; i++) {
      if (cancelRef.current) break;
      const row = allRows[i];
      const query = queryCol ? row[queryCol] ?? "" : "";
      let response = "";
      try {
        if (selectedAgent.startsWith("llm:")) {
          const model = selectedAgent.replace("llm:", "");
          const res = await apiFetch("/api/llm", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages: [{ role: "user", content: query }], temperature: 0.7 }),
          });
          const data = await res.json();
          response = data.choices?.[0]?.message?.content ?? "(no response)";
        } else {
          const configId = selectedAgent.replace("agent:", "");
          const config = agentConfigs.find(c => c.id === configId);
          if (!config) throw new Error("Agent config not found");
          const { createThread, sendMessage, createThreadRest, sendMessageRest } = await import("@/lib/chatApi");
          const isRest = config.agentType === "rest";
          const { thread_id } = isRest ? await createThreadRest() : await createThread(config.endpoint);
          const msgs = [{ type: "human" as const, content: query }];
          if (isRest) {
            for await (const event of sendMessageRest({ endpoint: config.endpoint, threadId: thread_id, messages: msgs, project: config.project })) {
              if ((event.event as string) === "messages/partial") {
                const d = event.data as any;
                if (Array.isArray(d)) { const last = d[d.length - 1]; if (last?.content) response = typeof last.content === "string" ? last.content : last.content.map((p: any) => p.text ?? "").join(""); }
              }
            }
          } else {
            const generator = await sendMessage({ threadId: thread_id, messages: msgs, project: config.project, endpoint: config.endpoint, assistantId: config.assistantId });
            for await (const event of generator) {
              if ((event.event as string) === "messages/partial") {
                const d = event.data as any;
                if (Array.isArray(d)) { const last = d[d.length - 1]; if (last?.content) response = typeof last.content === "string" ? last.content : last.content.map((p: any) => p.text ?? "").join(""); }
              }
            }
          }
          response = response || "(no response)";
        }
      } catch (e) { response = `(error: ${e instanceof Error ? e.message : String(e)})`; }

      results.push({ rowIdx: (row as any)._rowIndex ?? i, response, evals: {}, query });
      setGenProgress(Math.round(((i + 1) / allRows.length) * 100));
      setLiveResults([...results]);
    }

    await apiFetch(`/api/datasets/runs/${run.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowResults: results, status: cancelRef.current ? "stopped" : "generated" }),
    });
    setGenerating(false); cancelRef.current = false;
    const runsData = await (await apiFetch(`/api/datasets/runs?datasetId=${selectedId}`)).json();
    setRuns(runsData.runs ?? []);
  }

  async function handleEvaluate() {
    if (checkedEvals.size === 0) return;
    const runId = liveRunId || selectedRunId;
    const currentResults = liveRunId ? liveResults : runResults;
    if (!runId || currentResults.length === 0) return;
    cancelRef.current = false;
    setEvaluating(true); setEvalProgress(0);

    // Fetch ALL rows, filter to selected if any
    const allRowsRes = await apiFetch(`/api/datasets/rows?id=${selectedId}&all=1`);
    const allRowsData = await allRowsRes.json();
    let allRows: DatasetRow[] = allRowsData.rows ?? [];
    if (selectedRowIndices.size > 0) {
      allRows = allRows.filter(r => selectedRowIndices.has((r as any)._rowIndex));
    }

    const evalNamesList = [...checkedEvals];
    const evalsToRun = evalOptions.filter(e => checkedEvals.has(e.name));
    await apiFetch(`/api/datasets/runs/${runId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evalNames: evalNamesList }),
    });

    const updatedResults = currentResults.map(r => ({ ...r, evals: { ...r.evals } }));
    // Build rowIdx → result index map for fast lookup
    const resultByRowIdx = new Map<number, number>();
    updatedResults.forEach((r, idx) => resultByRowIdx.set(r.rowIdx, idx));

    const totalWork = updatedResults.length * evalsToRun.length;
    let done = 0;

    outer: for (const eval_ of evalsToRun) {
      for (const result of updatedResults) {
        if (cancelRef.current) break outer;
        const rowIdx = result.rowIdx;
        const row = allRows.find(r => (r as any)._rowIndex === rowIdx);
        const query = row && queryCol ? row[queryCol] ?? "" : (result.query ?? "");
        const context = row && contextCol ? row[contextCol] ?? "" : "";
        const response = result.response ?? "";
        try {
          if (eval_.evalType === "code_rule") {
            const overrideRC = evalOverrides[eval_.name]?.ruleConfig;
            const ruleConfig = JSON.parse(overrideRC || eval_.ruleConfig || "{}");
            const rules = ruleConfig.rules ?? []; const logic = ruleConfig.logic ?? "any";
            let matched = logic === "all";
            for (const rule of rules) {
              const target = rule.check === "query" ? query : response;
              const words = (rule.value ?? "").split(",").map((w: string) => w.trim());
              const cs = rule.caseSensitive; const t = cs ? target : target.toLowerCase();
              const hit = words.some((w: string) => t.includes(cs ? w : w.toLowerCase()));
              if (logic === "any" && hit) { matched = true; break; }
              if (logic === "all" && !hit) { matched = false; break; }
            }
            const ruleResult = matched ? ruleConfig.match : ruleConfig.clean;
            result.evals[eval_.name] = { label: ruleResult?.label ?? (matched ? "detected" : "clean"), score: ruleResult?.score ?? (matched ? 1.0 : 0.0), explanation: "" };
          } else if (eval_.template || evalOverrides[eval_.name]?.template) {
            const effectiveTemplate = evalOverrides[eval_.name]?.template || eval_.template;
            const filled = effectiveTemplate.replace(/\{context\}/g, context || "(no context)").replace(/\{response\}/g, response || "(no response)").replace(/\{query\}/g, query || "(no query)");
            const res = await apiFetch("/api/llm", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: filled }], temperature: 0 }),
            });
            const data = await res.json();
            const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
            const label = String(parsed.label ?? ""); const isBinary = parsed.score === undefined;
            const score = isBinary ? (PASS_LABELS.has(label.toLowerCase()) ? 1.0 : 0.0) : Number(parsed.score ?? 0);
            result.evals[eval_.name] = { label, score, explanation: parsed.explanation ?? "" };
          }
        } catch (e) { result.evals[eval_.name] = { label: "error", score: 0, explanation: String(e) }; }
        done++; setEvalProgress(Math.round((done / totalWork) * 100));
        if (liveRunId) setLiveResults([...updatedResults]);
        else setRunResults([...updatedResults]);
      }
    }

    await apiFetch(`/api/datasets/runs/${runId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowResults: updatedResults, status: cancelRef.current ? "stopped" : "completed" }),
    });
    setEvaluating(false); cancelRef.current = false; setRunEvalNames(evalNamesList);
    if (liveRunId) setLiveResults([...updatedResults]);
    else setRunResults([...updatedResults]);
    if (selectedId) {
      const runsData = await (await apiFetch(`/api/datasets/runs?datasetId=${selectedId}`)).json();
      setRuns(runsData.runs ?? []);
    }
  }

  async function handleDeleteRun(runId: string) {
    await apiFetch(`/api/datasets/runs/${runId}`, { method: "DELETE" });
    if (selectedRunId === runId) { setSelectedRunId(null); setRunResults([]); setRunEvalNames([]); }
    if (liveRunId === runId) { setLiveRunId(null); setLiveResults([]); }
    setRuns(prev => prev.filter(r => r.id !== runId));
    if (activeTab === "results") setActiveTab("prompts");
  }

  function startEditRow(index: number) {
    const row = rows[index];
    const { _rowIndex, ...data } = row;
    setEditingRowIndex(index);
    setEditRowData(data);
  }

  async function handleSaveRow(index: number) {
    const row = rows[index];
    const rowIndex = (row as any)._rowIndex ?? index;
    setRows(prev => prev.map((r, i) => (i === index ? { ...editRowData, _rowIndex: rowIndex } : r)));
    setEditingRowIndex(null);
    if (selectedId) {
      await apiFetch("/api/datasets/rows", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedId, rowIndex, data: editRowData }),
      });
    }
  }

  async function handleDeleteRow(index: number) {
    if (!confirm("Delete this prompt?")) return;
    const row = rows[index];
    const rowIndex = (row as any)._rowIndex ?? index;
    if (editingRowIndex === index) setEditingRowIndex(null);
    if (selectedId) {
      await apiFetch("/api/datasets/rows", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedId, rowIndex }),
      });
      setTotalRows(prev => prev - 1);
      loadDatasets();
      loadPage(selectedId, page);
    }
  }

  // ── Derived state ──
  const selected = datasets.find(d => d.id === selectedId);
  const displayResults = liveRunId ? liveResults : runResults;
  const displayEvalNames = liveRunId ? [...checkedEvals] : runEvalNames;
  const hasResults = displayResults.length > 0;
  const hasResponses = displayResults.some(r => r.response);

  const allEvalEntries = displayResults.flatMap(r => Object.values(r.evals).filter(e => e.label !== "error"));
  const passCount = allEvalEntries.filter(e => PASS_LABELS.has(e.label.toLowerCase())).length;
  const failCount = allEvalEntries.filter(e => !PASS_LABELS.has(e.label.toLowerCase())).length;
  const avgScore = allEvalEntries.length > 0 ? allEvalEntries.reduce((s, e) => s + e.score, 0) / allEvalEntries.length : 0;

  const currentRunId = liveRunId || selectedRunId;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">

      {/* ── Left sidebar ── */}
      <Sidebar>
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          <SidebarHeader>Datasets</SidebarHeader>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="New dataset"
          >
            <Plus className="size-3" />
            Dataset
          </button>
        </div>

        {creating && (
          <div className="mx-2 mb-2 flex gap-1">
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
              placeholder="Dataset name..."
              className="h-7 text-xs"
              autoFocus
            />
            <Button size="sm" onClick={handleCreate} disabled={!newName.trim()} className="h-7 px-2 text-xs">OK</Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2">
          {loading && <LoadingState className="py-6" />}
          {datasets.map(d => (
            <SidebarItemDiv
              key={d.id}
              active={selectedId === d.id}
              onClick={() => selectDataset(d.id)}
            >
              <FileSpreadsheet className="size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm", selectedId === d.id ? "text-foreground" : "")}>{d.name}</p>
                <p className="text-[10px] text-muted-foreground">{d.rowCount} prompts</p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); handleDelete(d.id); }}
                className="rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
              >
                <Trash2 className="size-3 text-muted-foreground" />
              </button>
            </SidebarItemDiv>
          ))}
          {datasets.length === 0 && !loading && (
            <EmptyState icon={Database} title="No datasets yet" className="py-8" />
          )}
        </div>

        <div
          onClick={() => setImportModal({ open: true, target: null })}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); setImportModal({ open: true, target: null }); }}
          className="mx-2 mb-2 cursor-pointer rounded-lg border-2 border-dashed border-muted-foreground/15 py-4 text-center hover:border-muted-foreground/30 hover:bg-muted/20 transition-colors"
        >
          <Upload className="mx-auto mb-1 size-4 text-muted-foreground/30" />
          <p className="text-[10px] text-muted-foreground/50">Drop CSV or click</p>
        </div>
      </Sidebar>

      {/* ── Right panel ── */}
      <div
        className={cn("flex min-w-0 flex-1 flex-col", dragOver && "ring-2 ring-inset ring-foreground/20")}
        onDragOver={e => { e.preventDefault(); if (selectedId) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false);
          if (!selectedId || !selected) return;
          setImportModal({ open: true, target: { id: selected.id, name: selected.name } });
        }}
      >
        {!selectedId ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <EmptyState icon={Database} title="Select a dataset" description="Choose a dataset from the list to get started." className="h-auto" />
            <Button variant="outline" size="sm" onClick={() => setImportModal({ open: true, target: null })} className="gap-1.5 text-xs">
              <Upload className="size-3" /> Import CSV
            </Button>
          </div>
        ) : (
          <div className="flex h-full flex-col">

            {/* ── Top bar ── */}
            <div className="flex shrink-0 items-center justify-between border-b px-5 py-3">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">{selected?.name}</h1>
                <p className="text-[10px] text-muted-foreground">{totalRows.toLocaleString()} prompts · {headers.length} columns</p>
              </div>
              <div className="flex items-center gap-1.5">
                {currentRunId && (
                  <Button size="sm" variant="outline" onClick={() => window.open(`/api/datasets/runs/${currentRunId}/export`, "_blank")} className="h-7 gap-1.5 text-xs">
                    <Download className="size-3" /> Export
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setImportModal({ open: true, target: selected ? { id: selected.id, name: selected.name } : null })} className="h-7 gap-1.5 text-xs">
                  <Upload className="size-3" /> Import CSV
                </Button>
                <button
                  onClick={() => setConfigOpen(!configOpen)}
                  title="Configure"
                  className={cn("rounded-md border p-1.5 transition-colors hover:bg-accent", configOpen && "bg-accent")}
                >
                  <Settings2 className="size-3.5" />
                </button>
              </div>
            </div>

            {/* ── Config panel ── */}
            {configOpen && (
              <div className="shrink-0 border-b bg-muted/5 px-5 py-4 space-y-4">
                {/* Row 1: Generate */}
                <div className="flex items-center gap-3">
                  <p className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Agent</p>
                  <div className="w-52">
                    <AgentModelSelector value={selectedAgent} onChange={setSelectedAgent} />
                  </div>
                  {generating ? (
                    <Button onClick={handleCancel} variant="outline" className="h-8 gap-1.5 text-xs">
                      <X className="size-3" /> Stop ({genProgress}%)
                    </Button>
                  ) : (
                    <Button onClick={handleGenerate} disabled={totalRows === 0} variant="outline" className="h-8 gap-1.5 text-xs">
                      <Play className="size-3" />Generate{selectedRowIndices.size > 0 && ` (${selectedRowIndices.size})`}
                    </Button>
                  )}
                  {generating && (
                    <div className="h-1 w-28 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-foreground/40 transition-all duration-300" style={{ width: `${genProgress}%` }} />
                    </div>
                  )}
                </div>

                {/* Row 2: Evaluate */}
                <div className="flex items-start gap-3">
                  <p className="mt-1.5 w-24 shrink-0 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Evals</p>
                  <div className="flex flex-1 flex-wrap items-center gap-1.5">
                    {checkedEvals.size > 0 ? (
                      [...checkedEvals].map(name => {
                        const ev = evalOptions.find(e => e.name === name);
                        return (
                          <span key={name} className="flex items-center gap-1 rounded border bg-foreground/5 px-2 py-1 text-[11px] font-medium">
                            {name}
                            {ev && <span className="text-[9px] text-muted-foreground">{ev.evalType === "code_rule" ? "rule" : ev.isCustom ? "custom" : "llm"}</span>}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-xs text-muted-foreground">None selected</span>
                    )}
                    <button onClick={() => setEvalModalOpen(true)} className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                      <Pencil className="size-2.5" /> Edit
                    </button>
                  </div>
                  {evaluating ? (
                    <Button onClick={handleCancel} className="h-8 shrink-0 gap-1.5 text-xs">
                      <X className="size-3" /> Stop ({evalProgress}%)
                    </Button>
                  ) : (
                    <Button onClick={handleEvaluate} disabled={checkedEvals.size === 0 || displayResults.length === 0} className="h-8 shrink-0 gap-1.5 text-xs">
                      <Play className="size-3" />Evaluate
                    </Button>
                  )}
                  {evaluating && (
                    <div className="mt-3 h-1 w-28 shrink-0 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-foreground transition-all duration-300" style={{ width: `${evalProgress}%` }} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Tabs ── */}
            <div className="flex shrink-0 items-center gap-0 border-b px-5">
              {(["prompts", "results"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => {
                    if (tab === "results" && !hasResults && runs.length > 0) {
                      loadRun(runs[0].id);
                    } else {
                      setActiveTab(tab);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-1.5 border-b-2 px-1 py-2.5 mr-4 text-xs font-medium transition-colors",
                    activeTab === tab
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                    tab === "results" && !hasResults && runs.length === 0 && "cursor-not-allowed opacity-40"
                  )}
                  disabled={tab === "results" && !hasResults && runs.length === 0}
                >
                  {tab === "prompts" ? <List className="size-3" /> : <FlaskConical className="size-3" />}
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {tab === "prompts" && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{totalRows}</span>}
                  {tab === "results" && runs.length > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{runs.length}</span>}
                </button>
              ))}
            </div>

            {/* ── Tab content ── */}
            <div className="min-h-0 flex-1 overflow-y-auto">

              {/* Prompts tab */}
              {activeTab === "prompts" && (
                <div className="px-5 py-4">
                  {rows.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-16 text-center">
                      <EmptyState icon={Database} title="No prompts yet" description="Import a CSV or add prompts from the Playground." className="h-auto" />
                      <Button variant="outline" size="sm" onClick={() => setImportModal({ open: true, target: selected ? { id: selected.id, name: selected.name } : null })} className="mt-1 gap-1.5 text-xs">
                        <Upload className="size-3" /> Import CSV
                      </Button>
                    </div>
                  ) : (
                    <>
                    {/* Selection bar */}
                    <div className="mb-2 flex items-center gap-3">
                      <button
                        onClick={() => {
                          if (selectedRowIndices.size === rows.length) {
                            setSelectedRowIndices(new Set());
                          } else {
                            setSelectedRowIndices(new Set(rows.map(r => (r as any)._rowIndex)));
                          }
                        }}
                        className={cn(
                          "flex size-4 items-center justify-center rounded border transition-colors",
                          selectedRowIndices.size > 0 ? "border-foreground bg-foreground" : "border-muted-foreground/30"
                        )}
                      >
                        {selectedRowIndices.size > 0 && <Check className="size-2.5 text-background" />}
                      </button>
                      {selectedRowIndices.size > 0 ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{selectedRowIndices.size.toLocaleString()} selected</span>
                          <button
                            onClick={async () => {
                              if (!confirm(`Delete ${selectedRowIndices.size} selected prompts?`)) return;
                              if (selectedId) {
                                await apiFetch("/api/datasets/rows", {
                                  method: "DELETE", headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ id: selectedId, rowIndices: [...selectedRowIndices] }),
                                });
                                setSelectedRowIndices(new Set());
                                loadDatasets();
                                loadPage(selectedId, 0);
                              }
                            }}
                            className="flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] hover:bg-muted hover:text-destructive transition-colors"
                          >
                            <Trash2 className="size-2.5" /> Delete
                          </button>
                          <button onClick={() => setSelectedRowIndices(new Set())} className="text-muted-foreground/60 hover:text-foreground">Clear</button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">Select rows to run on a subset</span>
                      )}
                    </div>

                    <div className="overflow-hidden rounded-lg border">
                      {rows.map((row, i) => {
                        const query = queryCol ? row[queryCol] ?? "" : "";
                        const context = contextCol ? row[contextCol] ?? "" : "";
                        const isEditing = editingRowIndex === i;

                        return (
                          <div key={i} className={cn("border-b last:border-b-0", isEditing && "bg-muted/20")}>
                            {isEditing ? (
                              <div className="p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-muted-foreground">Editing #{i + 1}</span>
                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={() => handleSaveRow(i)}
                                      className="flex items-center gap-1 rounded bg-foreground px-2.5 py-1 text-[11px] font-medium text-background hover:bg-foreground/80"
                                    >
                                      <Check className="size-3" /> Save
                                    </button>
                                    <button
                                      onClick={() => setEditingRowIndex(null)}
                                      className="flex items-center gap-1 rounded border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                                    >
                                      <X className="size-3" /> Cancel
                                    </button>
                                  </div>
                                </div>
                                {headers.map(h => (
                                  <div key={h}>
                                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      {h}
                                      {h === queryCol && <span className="ml-1.5 text-muted-foreground normal-case">· query</span>}
                                      {h === contextCol && <span className="ml-1.5 text-muted-foreground normal-case">· context</span>}
                                    </label>
                                    <Textarea
                                      value={editRowData[h] ?? ""}
                                      onChange={e => setEditRowData(prev => ({ ...prev, [h]: e.target.value }))}
                                      rows={h === contextCol ? 5 : 2}
                                      className="text-xs"
                                    />
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className={cn("flex items-start gap-0 hover:bg-muted/20 transition-colors", selectedRowIndices.has((row as any)._rowIndex) && "bg-accent/40")}>
                                {/* Checkbox + Row number */}
                                <div className="flex w-12 shrink-0 flex-col items-center gap-1 pt-3.5 pb-3">
                                  <button
                                    onClick={() => {
                                      const idx = (row as any)._rowIndex;
                                      setSelectedRowIndices(prev => {
                                        const next = new Set(prev);
                                        if (next.has(idx)) next.delete(idx); else next.add(idx);
                                        return next;
                                      });
                                    }}
                                    className={cn(
                                      "flex size-4 items-center justify-center rounded border transition-colors",
                                      selectedRowIndices.has((row as any)._rowIndex)
                                        ? "border-foreground bg-foreground"
                                        : "border-muted-foreground/30 hover:border-muted-foreground"
                                    )}
                                  >
                                    {selectedRowIndices.has((row as any)._rowIndex) && <Check className="size-2.5 text-background" />}
                                  </button>
                                  <span className="text-[9px] tabular-nums text-muted-foreground/30">{(row as any)._rowIndex != null ? (row as any)._rowIndex + 1 : page * pageSize + i + 1}</span>
                                </div>
                                {/* Content */}
                                <div className="flex-1 min-w-0 py-3 pr-2">
                                  {query && (
                                    <p className="text-sm text-foreground line-clamp-2 leading-relaxed">{query}</p>
                                  )}
                                  {context && (
                                    <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{context}</p>
                                  )}
                                  {!query && !context && (
                                    <p className="text-xs text-muted-foreground/40 italic">No query or context</p>
                                  )}
                                </div>
                                {/* Actions — always visible */}
                                <div className="flex shrink-0 items-center gap-1 px-3 py-3">
                                  <button
                                    onClick={() => startEditRow(i)}
                                    className="rounded p-1.5 text-muted-foreground/40 hover:bg-muted hover:text-foreground transition-colors"
                                    title="Edit"
                                  >
                                    <Pencil className="size-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRow(i)}
                                    className="rounded p-1.5 text-muted-foreground/40 hover:bg-muted hover:text-destructive transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Pagination */}
                    {totalRows > pageSize && (
                      <div className="flex items-center justify-between rounded-lg border px-4 py-2.5 mt-4">
                        <p className="text-xs text-muted-foreground">
                          {(page * pageSize + 1).toLocaleString()}–{Math.min((page + 1) * pageSize, totalRows).toLocaleString()} of {totalRows.toLocaleString()}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline" size="sm"
                            disabled={page === 0}
                            onClick={() => selectedId && loadPage(selectedId, page - 1)}
                            className="h-7 px-2.5 text-xs"
                          >
                            Previous
                          </Button>
                          <div className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                            <Input
                              type="number"
                              min={1}
                              max={Math.ceil(totalRows / pageSize)}
                              value={page + 1}
                              onChange={e => {
                                const p = Math.max(0, Math.min(Math.ceil(totalRows / pageSize) - 1, parseInt(e.target.value || "1") - 1));
                                if (selectedId) loadPage(selectedId, p);
                              }}
                              className="h-7 w-14 text-center text-xs tabular-nums px-1"
                            />
                            <span>/ {Math.ceil(totalRows / pageSize)}</span>
                          </div>
                          <Button
                            variant="outline" size="sm"
                            disabled={(page + 1) * pageSize >= totalRows}
                            onClick={() => selectedId && loadPage(selectedId, page + 1)}
                            className="h-7 px-2.5 text-xs"
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                    </>
                  )}
                </div>
              )}

              {/* Results tab */}
              {activeTab === "results" && (
                <div className="flex h-full">
                  {/* Run list sidebar */}
                  {runs.length > 0 && (
                    <div className="w-52 shrink-0 border-r overflow-y-auto">
                      <p className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b">Runs</p>
                      {/* Live run (if active) */}
                      {liveRunId && (
                        <div
                          onClick={() => { setSelectedRunId(null); }}
                          className={cn(
                            "group flex cursor-pointer items-center gap-2 border-b px-3 py-2.5 transition-colors hover:bg-accent",
                            !selectedRunId && "bg-accent"
                          )}
                        >
                          <div className="size-1.5 shrink-0 rounded-full bg-foreground/40 animate-pulse" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">Live run</p>
                            <p className="text-[10px] text-muted-foreground">{liveResults.length} responses</p>
                          </div>
                        </div>
                      )}
                      {runs.map(r => (
                        <div
                          key={r.id}
                          onClick={() => loadRun(r.id)}
                          className={cn(
                            "group flex cursor-pointer items-center gap-2 border-b px-3 py-2.5 transition-colors hover:bg-accent last:border-b-0",
                            selectedRunId === r.id && !liveRunId && "bg-accent"
                          )}
                        >
                          <div className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            r.status === "completed" ? "bg-[#3b82f6]" : r.status === "running" ? "bg-foreground/40 animate-pulse" : "bg-muted-foreground/20"
                          )} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">{r.agentSource.replace("llm:", "").replace("agent:", "")}</p>
                            <p className="text-[10px] text-muted-foreground">{new Date(r.createdAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); handleDeleteRun(r.id); }}
                            className="shrink-0 rounded p-1 opacity-0 hover:text-red-500 group-hover:opacity-100"
                          >
                            <Trash2 className="size-3 text-muted-foreground" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Results content */}
                  <div className="flex-1 overflow-y-auto px-5 py-4">
                  {!hasResults ? (
                    <div className="flex flex-col items-center gap-3 py-16 text-center">
                      <EmptyState icon={FlaskConical} title="No results yet" description="Generate responses first, then optionally run evaluations." className="h-auto" />
                      <button
                        onClick={() => setActiveTab("prompts")}
                        className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <ChevronRight className="size-3" /> Back to prompts
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Stats row */}
                      {allEvalEntries.length > 0 && (
                        <div className="flex gap-3">
                          <div className="flex-1 rounded-lg border p-3">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p>
                            <p className="mt-0.5 text-xl font-bold tabular-nums">{allEvalEntries.length}</p>
                          </div>
                          <div className="flex-1 rounded-lg border p-3">
                            <div className="flex items-center gap-1.5">
                              <div className="size-1.5 rounded-full" style={{ backgroundColor: "#3b82f6" }} />
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pass</p>
                            </div>
                            <p className="mt-0.5 text-xl font-bold tabular-nums">{passCount}</p>
                          </div>
                          <div className="flex-1 rounded-lg border p-3">
                            <div className="flex items-center gap-1.5">
                              <div className="size-1.5 rounded-full bg-muted-foreground/40" />
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Fail</p>
                            </div>
                            <p className="mt-0.5 text-xl font-bold tabular-nums">{failCount}</p>
                          </div>
                          <div className="flex-1 rounded-lg border p-3">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg Score</p>
                            <p className="mt-0.5 text-xl font-bold tabular-nums">{(avgScore * 100).toFixed(1)}%</p>
                          </div>
                          <div className="flex-[2] rounded-lg border p-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pass Rate</p>
                              <p className="text-xs font-bold tabular-nums" style={{ color: "#3b82f6" }}>{allEvalEntries.length > 0 ? ((passCount / allEvalEntries.length) * 100).toFixed(0) : 0}%</p>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                              <div className="h-full transition-all rounded-full" style={{ backgroundColor: "#3b82f6", width: `${allEvalEntries.length > 0 ? (passCount / allEvalEntries.length) * 100 : 0}%` }} />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Results table */}
                      <div className="overflow-hidden rounded-lg border">
                        <div className="max-h-[calc(100vh-320px)] overflow-auto">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 border-b bg-muted/40">
                              <tr>
                                <th className="w-10 px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">#</th>
                                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Query</th>
                                {hasResponses && <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Response</th>}
                                {displayEvalNames.map(en => (
                                  <th key={en} className="whitespace-nowrap px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{en}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {displayResults.map((result, i) => {
                                const query = result.query ?? "";
                                const isExpanded = expandedResultIdx === i;
                                const colSpan = 2 + (hasResponses ? 1 : 0) + displayEvalNames.length;
                                return (
                                  <React.Fragment key={i}>
                                    <tr
                                      className={cn("cursor-pointer transition-colors", isExpanded ? "bg-accent/30" : "hover:bg-muted/20")}
                                      onClick={() => setExpandedResultIdx(isExpanded ? null : i)}
                                    >
                                      <td className="px-3 py-3 tabular-nums text-muted-foreground">{result.rowIdx + 1}</td>
                                      <td className="max-w-[220px] px-3 py-3">
                                        <p className="truncate text-muted-foreground">{query}</p>
                                      </td>
                                      {hasResponses && (
                                        <td className="max-w-[400px] px-3 py-3">
                                          <p className="truncate">{result.response ?? ""}</p>
                                        </td>
                                      )}
                                      {displayEvalNames.map(en => {
                                        const ev = result.evals?.[en];
                                        if (!ev) return <td key={en} className="px-3 py-3 text-center text-muted-foreground/30">—</td>;
                                        const isPass = PASS_LABELS.has(ev.label.toLowerCase());
                                        return (
                                          <td key={en} className="px-3 py-3 text-center">
                                            <span className="inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] font-medium">
                                              <span className={cn(
                                                "size-1.5 rounded-full",
                                                ev.label === "error" ? "bg-destructive" : isPass ? "bg-[#3b82f6]" : "bg-muted-foreground/40"
                                              )} />
                                              {ev.label}
                                            </span>
                                            {ev.score !== undefined && (
                                              <span className="ml-1 font-mono text-[10px] text-muted-foreground">{ev.score.toFixed(2)}</span>
                                            )}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                    {isExpanded && (
                                      <tr className="bg-muted/10">
                                        <td colSpan={colSpan} className="px-4 py-4">
                                          <div className="space-y-3 max-w-4xl">
                                            <div>
                                              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Query</p>
                                              <p className="text-sm leading-relaxed whitespace-pre-wrap">{query}</p>
                                            </div>
                                            {result.response && (
                                              <div>
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Response</p>
                                                <p className="text-sm leading-relaxed whitespace-pre-wrap rounded border bg-background p-3">{result.response}</p>
                                              </div>
                                            )}
                                            {Object.keys(result.evals).length > 0 && (
                                              <div>
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Evaluations</p>
                                                <div className="flex flex-wrap gap-2">
                                                  {Object.entries(result.evals).map(([name, ev]) => {
                                                    const isPass = PASS_LABELS.has(ev.label.toLowerCase());
                                                    return (
                                                      <div key={name} className="rounded border p-2 text-xs min-w-[140px]">
                                                        <p className="font-medium mb-0.5">{name}</p>
                                                        <div className="flex items-center gap-1.5">
                                                          <span className={cn("size-1.5 rounded-full", ev.label === "error" ? "bg-destructive" : isPass ? "bg-[#3b82f6]" : "bg-muted-foreground/40")} />
                                                          <span>{ev.label}</span>
                                                          {ev.score !== undefined && <span className="font-mono text-muted-foreground">{ev.score.toFixed(2)}</span>}
                                                        </div>
                                                        {ev.explanation && <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">{ev.explanation}</p>}
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <CSVImportModal
        open={importModal.open}
        onClose={() => setImportModal({ open: false, target: null })}
        targetDataset={importModal.target}
        onImport={handleImport}
      />
      <EvalSelectorModal
        open={evalModalOpen}
        onClose={() => setEvalModalOpen(false)}
        datasetName={selected?.name ?? ""}
        checkedEvals={checkedEvals}
        evalOverrides={evalOverrides}
        onConfirm={(sel, ovr) => {
          setCheckedEvals(sel); setEvalOverrides(ovr); loadEvals();
          if (selectedId) {
            apiFetch("/api/datasets", {
              method: "PUT", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: selectedId, evalNames: [...sel], evalOverrides: ovr }),
            });
          }
        }}
      />
    </div>
  );
}
