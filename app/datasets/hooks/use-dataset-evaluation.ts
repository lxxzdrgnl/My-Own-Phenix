import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";
import { PASS_LABELS } from "@/lib/constants";

interface DatasetRow { [key: string]: string; }
interface RowResult {
  rowIdx: number; response: string; query?: string;
  evals: Record<string, { label: string; score: number; explanation: string }>;
}
interface EvalOption {
  name: string; evalType: string; template: string;
  outputMode: string; isCustom: boolean; badgeLabel: string; ruleConfig: string;
}
type EvalOverrides = Record<string, { template?: string; ruleConfig?: string }>;

interface UseDatasetEvaluationParams {
  selectedId: string | null;
  liveRunId: string | null;
  selectedRunId: string | null;
  liveResults: RowResult[];
  runResults: RowResult[];
  checkedEvals: Set<string>;
  evalOptions: EvalOption[];
  evalOverrides: EvalOverrides;
  queryCol: string;
  contextCol: string;
  selectedRowIndices: Set<number>;
  cancelRef: React.MutableRefObject<boolean>;
  setLiveResults: (results: RowResult[]) => void;
  setRunResults: (results: RowResult[]) => void;
  setRunEvalNames: (names: string[]) => void;
  setRuns: (updater: (prev: any[]) => any[]) => void;
}

export function useDatasetEvaluation({
  selectedId,
  liveRunId,
  selectedRunId,
  liveResults,
  runResults,
  checkedEvals,
  evalOptions,
  evalOverrides,
  queryCol,
  contextCol,
  selectedRowIndices,
  cancelRef,
  setLiveResults,
  setRunResults,
  setRunEvalNames,
  setRuns,
}: UseDatasetEvaluationParams) {
  const [evaluating, setEvaluating] = useState(false);
  const [evalProgress, setEvalProgress] = useState(0);

  const handleEvaluate = useCallback(async () => {
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
      setRuns(() => runsData.runs ?? []);
    }
  }, [
    selectedId, liveRunId, selectedRunId, liveResults, runResults,
    checkedEvals, evalOptions, evalOverrides, queryCol, contextCol,
    selectedRowIndices, cancelRef, setLiveResults, setRunResults, setRunEvalNames, setRuns,
  ]);

  return { evaluating, evalProgress, handleEvaluate };
}
