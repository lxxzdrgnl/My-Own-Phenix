"use client";

import { RefreshCw, Play, Pencil, Inbox, ChevronDown, X, MessageSquarePlus } from "lucide-react";
import { PromptVersion } from "@/lib/phoenix";
import { Column, VersionOption } from "./hooks/use-playground-columns";

interface PromptColumnProps {
  col: Column;
  idx: number;
  versionOptions: VersionOption[];
  canRemove: boolean;
  onUpdate: (id: string, patch: Partial<Column>) => void;
  onRemove: (id: string) => void;
  onRun: (id: string) => void;
  onEditPrompt: (promptName: string, version: PromptVersion) => void;
  onAnnotate: (spanId: string) => void;
}

export function PromptColumn({
  col,
  idx,
  versionOptions,
  canRemove,
  onUpdate,
  onRemove,
  onRun,
  onEditPrompt,
  onAnnotate,
}: PromptColumnProps) {
  const sel = versionOptions.find((o) => o.version.id === col.promptId);

  return (
    <div
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
                  onEditPrompt(sel.promptName, sel.version)
                }
                className="flex items-center rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {canRemove && (
              <button
                onClick={() => onRemove(col.id)}
                className="flex items-center rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        <select
          value={col.promptId}
          onChange={(e) => onUpdate(col.id, { promptId: e.target.value })}
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
            onChange={(e) => onUpdate(col.id, { query: e.target.value })}
            rows={2}
            placeholder="Enter query…"
            className="w-full resize-none rounded-lg border bg-background px-2.5 py-1.5 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>

        {/* Context collapsible */}
        <div className="mt-1">
          <button
            onClick={() =>
              onUpdate(col.id, { contextOpen: !col.contextOpen })
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
              onChange={(e) => onUpdate(col.id, { context: e.target.value })}
              rows={4}
              placeholder="Context…"
              className="mt-1 w-full resize-y rounded-lg border bg-background px-2.5 py-1.5 text-sm leading-relaxed text-muted-foreground outline-none focus:ring-2 focus:ring-ring/40"
            />
          )}
        </div>

        {/* Run button */}
        <button
          onClick={() => onRun(col.id)}
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
              <div className="flex items-center gap-1.5">
                {!col.result.loading && col.result.tokens > 0 && (
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {col.result.tokens} tokens
                  </span>
                )}
                {col.spanId && (
                  <button
                    onClick={() => onAnnotate(col.spanId!)}
                    className="rounded p-1 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
                    title="Annotate this result"
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
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
}
