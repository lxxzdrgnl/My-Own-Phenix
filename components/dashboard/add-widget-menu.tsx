"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  PlusIcon,
  TrendingUp,
  CheckCircle2,
  FileSearch,
  Ban,
  Activity,
  Clock,
  AlertTriangle,
  BarChart3,
  CalendarClock,
  GitCompare,
  Coins,
  DollarSign,
  ArrowLeftRight,
  Cpu,
  Gauge,
  Hash,
} from "lucide-react";

export const WIDGET_GROUPS = [
  {
    label: "Evaluation",
    items: [
      { type: "hallucination", title: "Hallucination Rate", icon: TrendingUp },
      { type: "qa_correctness", title: "QA Correctness", icon: CheckCircle2 },
      { type: "rag_relevance", title: "RAG Relevance", icon: FileSearch },
      { type: "banned_word", title: "Banned Word Detection", icon: Ban },
      { type: "score_comparison", title: "Score Comparison", icon: GitCompare },
      { type: "annotation_scores", title: "Annotation Scores", icon: BarChart3 },
    ],
  },
  {
    label: "Performance",
    items: [
      { type: "total_queries", title: "Total Queries", icon: Activity },
      { type: "avg_latency", title: "Avg Response Time", icon: Clock },
      { type: "error_rate", title: "Error Rate", icon: AlertTriangle },
      { type: "latency_distribution", title: "Latency Distribution", icon: BarChart3 },
      { type: "queries_timeline", title: "Queries Timeline", icon: CalendarClock },
      { type: "throughput", title: "Throughput (tok/s)", icon: Gauge },
    ],
  },
  {
    label: "Tokens & Cost",
    items: [
      { type: "token_usage", title: "Token Usage", icon: Coins },
      { type: "token_cost", title: "Estimated Cost", icon: DollarSign },
      { type: "token_ratio", title: "Input/Output Ratio", icon: ArrowLeftRight },
      { type: "avg_tokens_per_call", title: "Avg Tokens/Call", icon: Hash },
      { type: "model_distribution", title: "Model Distribution", icon: Cpu },
    ],
  },
] as const;

interface AddWidgetMenuProps {
  existingTypes?: string[];
  onAdd: (type: string, title: string) => void;
}

export function AddWidgetMenu({ onAdd }: AddWidgetMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-sm"
        onClick={() => setOpen(!open)}
      >
        <PlusIcon className="size-3.5" />
        Add Widget
      </Button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 max-h-80 w-64 overflow-y-auto rounded-xl border bg-popover p-1.5 shadow-xl">
          {WIDGET_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-2.5 pb-1 pt-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                {group.label}
              </div>
              {group.items.map((w) => {
                const Icon = w.icon;
                return (
                  <button
                    key={w.type}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-base transition-colors hover:bg-accent"
                    onClick={() => {
                      onAdd(w.type, w.title);
                      setOpen(false);
                    }}
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{w.title}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
