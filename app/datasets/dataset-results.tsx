"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { PASS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/date-utils";
import { Trash2, ChevronRight, FlaskConical } from "lucide-react";

interface RunMeta {
  id: string; agentSource: string; evalNames: string; status: string; createdAt: string;
}
interface RowResult {
  rowIdx: number; response: string; query?: string;
  evals: Record<string, { label: string; score: number; explanation: string }>;
}

interface DatasetResultsProps {
  runs: RunMeta[];
  liveRunId: string | null;
  liveResults: RowResult[];
  selectedRunId: string | null;
  displayResults: RowResult[];
  displayEvalNames: string[];
  hasResults: boolean;
  hasResponses: boolean;
  onLoadRun: (runId: string) => void;
  onDeleteRun: (runId: string) => void;
  onBackToPrompts: () => void;
}

export function DatasetResults({
  runs,
  liveRunId,
  liveResults,
  selectedRunId,
  displayResults,
  displayEvalNames,
  hasResults,
  hasResponses,
  onLoadRun,
  onDeleteRun,
  onBackToPrompts,
}: DatasetResultsProps) {
  const [expandedResultIdx, setExpandedResultIdx] = useState<number | null>(null);

  const allEvalEntries = displayResults.flatMap(r => Object.values(r.evals).filter(e => e.label !== "error"));
  const passCount = allEvalEntries.filter(e => PASS_LABELS.has(e.label.toLowerCase())).length;
  const failCount = allEvalEntries.filter(e => !PASS_LABELS.has(e.label.toLowerCase())).length;
  const avgScore = allEvalEntries.length > 0 ? allEvalEntries.reduce((s, e) => s + e.score, 0) / allEvalEntries.length : 0;

  return (
    <div className="flex h-full">
      {/* Run list sidebar */}
      {runs.length > 0 && (
        <div className="w-52 shrink-0 border-r overflow-y-auto">
          <p className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b">Runs</p>
          {/* Live run (if active) */}
          {liveRunId && (
            <div
              onClick={() => onLoadRun("")}
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
              onClick={() => onLoadRun(r.id)}
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
                <p className="text-[10px] text-muted-foreground">{formatDate(r.createdAt)}</p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); onDeleteRun(r.id); }}
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
              onClick={onBackToPrompts}
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
  );
}
