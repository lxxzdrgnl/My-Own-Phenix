"use client";

import { Inbox, Plus } from "lucide-react";
import { Trace } from "@/lib/phoenix";
import { AnnotationBadges } from "@/components/annotation-badge";
import { formatDateTime } from "@/lib/date-utils";

interface TraceListProps {
  traces: Trace[];
  loading: boolean;
  selected: Trace | null;
  deleteMode: boolean;
  deleteModeVisible: boolean;
  deleteSelection: Set<string>;
  onSelectTrace: (t: Trace) => void;
  onToggleSelect: (traceId: string) => void;
  onAnnotate: (spanId: string) => void;
}

export function TraceList({
  traces,
  loading,
  selected,
  deleteMode,
  deleteModeVisible,
  deleteSelection,
  onSelectTrace,
  onToggleSelect,
  onAnnotate,
}: TraceListProps) {
  if (traces.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Inbox className="h-8 w-8 text-muted-foreground/20" />
        <span className="text-xs text-muted-foreground/50">
          {loading ? "Loading…" : "No traces"}
        </span>
      </div>
    );
  }

  return (
    <>
      {traces.map((t) => {
        const active = t.spanId === selected?.spanId;
        const checked = deleteSelection.has(t.traceId);
        return (
          <div
            key={t.spanId}
            onClick={() => {
              if (deleteMode) onToggleSelect(t.traceId);
              else onSelectTrace(t);
            }}
            className={`group cursor-pointer border-b transition-colors hover:bg-accent/50 ${active && !deleteMode ? "bg-accent font-medium" : "text-muted-foreground"} ${checked ? "bg-muted/50" : ""}`}
          >
            <div className="flex gap-2.5 px-3 py-2.5">
              {deleteMode ? (
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleSelect(t.traceId)}
                  onClick={(e) => e.stopPropagation()}
                  className={`mt-0.5 shrink-0 rounded ${deleteModeVisible ? "animate-slide-in" : "animate-slide-out"}`}
                />
              ) : (
                <div
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-200 ${active ? "bg-foreground" : "bg-transparent"}`}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm leading-snug">
                  {t.query || "(empty)"}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <time className="text-xs tabular-nums text-muted-foreground">
                    {formatDateTime(t.time)}
                  </time>
                </div>
                <div className="mt-1 flex items-center gap-1">
                  {t.annotations.length > 0 && (
                    <AnnotationBadges annotations={t.annotations} />
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAnnotate(t.spanId);
                    }}
                    className="rounded p-0.5 text-muted-foreground/30 transition-colors hover:bg-muted hover:text-foreground opacity-0 group-hover:opacity-100"
                    title="Add annotation"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
