import { useState, useRef, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";

interface DatasetRow { [key: string]: string; }
interface RowResult {
  rowIdx: number; response: string; query?: string;
  evals: Record<string, { label: string; score: number; explanation: string }>;
}
interface AgentConfigOption {
  id: string; project: string; alias: string | null;
  agentType: string; endpoint: string; assistantId: string;
  template?: { name: string; description?: string } | null;
}

interface UseDatasetGenerationParams {
  selectedId: string | null;
  selectedAgent: string;
  agentConfigs: AgentConfigOption[];
  queryCol: string;
  selectedRowIndices: Set<number>;
  pageSize: number;
  cancelRef: React.MutableRefObject<boolean>;
  setLiveRunId: (id: string | null) => void;
  setSelectedRunId: (id: string | null) => void;
  setLiveResults: (results: RowResult[]) => void;
  setActiveTab: (tab: "prompts" | "results") => void;
  setRuns: (updater: (prev: any[]) => any[]) => void;
}

export function useDatasetGeneration({
  selectedId,
  selectedAgent,
  agentConfigs,
  queryCol,
  selectedRowIndices,
  pageSize,
  cancelRef,
  setLiveRunId,
  setSelectedRunId,
  setLiveResults,
  setActiveTab,
  setRuns,
}: UseDatasetGenerationParams) {
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);

  const handleGenerate = useCallback(async (totalRows: number) => {
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
    setRuns(() => runsData.runs ?? []);
  }, [selectedId, selectedAgent, agentConfigs, queryCol, selectedRowIndices, cancelRef, setLiveRunId, setSelectedRunId, setLiveResults, setActiveTab, setRuns]);

  return { generating, genProgress, handleGenerate };
}
