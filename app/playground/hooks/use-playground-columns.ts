import { useState, useEffect } from "react";
import { callLLM, PromptVersion, ComparisonResult } from "@/lib/phoenix";

export interface VersionOption {
  promptName: string;
  label: string;
  version: PromptVersion;
}

export interface Column {
  id: string;
  promptId: string;
  query: string;
  context: string;
  contextOpen: boolean;
  result: ComparisonResult | null;
  running: boolean;
  entering: boolean;
  spanId?: string;
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

export function usePlaygroundColumns(versionOptions: VersionOption[]) {
  const [columns, setColumns] = useState<Column[]>([]);

  // Init first column once prompts load
  useEffect(() => {
    if (versionOptions.length > 0 && columns.length === 0) {
      setColumns([makeColumn(versionOptions[0].version.id, "", "", false)]);
    }
  }, [versionOptions, columns.length]);

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
    setColumns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
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
        spanId: r.spanId,
      });
    } catch (e: any) {
      updateColumn(colId, {
        running: false,
        result: {
          label,
          text: "",
          tokens: 0,
          loading: false,
          error: e.message,
        },
      });
    }
  }

  function runAll() {
    columns.forEach((c) => runColumn(c.id));
  }

  function syncColumnsToTrace(query: string, context: string) {
    setColumns((prev) =>
      prev.map((c) => ({ ...c, query, context, result: null })),
    );
  }

  function clearColumns() {
    setColumns((prev) =>
      prev.map((c) => ({ ...c, query: "", context: "", result: null })),
    );
  }

  return {
    columns,
    addColumn,
    removeColumn,
    updateColumn,
    runColumn,
    runAll,
    syncColumnsToTrace,
    clearColumns,
  };
}
