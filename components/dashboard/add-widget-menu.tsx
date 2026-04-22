"use client";
import { apiFetch } from "@/lib/api-client";

import { useState, useRef, useEffect, useCallback } from "react";
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
  LayoutGrid,
  Table2,
  ThumbsDown,
  Wrench,
  ShieldCheck,
  BookOpen,
  FlaskConical,
} from "lucide-react";

export const WIDGET_GROUPS = [
  {
    label: "RMF MEASURE",
    items: [
      { type: "rmf_overview",           title: "RMF Overview",           icon: LayoutGrid },
      { type: "rmf_measure_grid",       title: "MEASURE Metric Grid",    icon: Table2 },
      // 12 individual MEASURE metrics
      { type: "hallucination",          title: "Hallucination Rate",     icon: TrendingUp },
      { type: "banned_word",            title: "Toxicity Rate",          icon: Ban },
      { type: "qa_correctness",         title: "QA Accuracy",            icon: CheckCircle2 },
      { type: "rag_relevance",          title: "Retrieval Relevance",    icon: FileSearch },
      { type: "avg_latency",            title: "Latency P95",            icon: Clock },
      { type: "error_rate",             title: "Error Rate",             icon: AlertTriangle },
      { type: "token_usage",            title: "Token Efficiency",       icon: Coins },
      { type: "token_cost",             title: "Cost Tracking",          icon: DollarSign },
      { type: "rmf_user_frustration",   title: "User Frustration",       icon: ThumbsDown },
      { type: "rmf_tool_calling",       title: "Tool Calling Score",     icon: Wrench },
      { type: "rmf_guardrail_trigger",  title: "Guardrail Trigger",      icon: ShieldCheck },
      { type: "rmf_citation_accuracy",  title: "Citation Accuracy",      icon: BookOpen },
    ],
  },
  {
    label: "Evaluation",
    items: [
      { type: "score_comparison", title: "Score Comparison", icon: GitCompare },
      { type: "annotation_scores", title: "Annotation Scores", icon: BarChart3 },
    ],
  },
  {
    label: "Performance",
    items: [
      { type: "total_queries", title: "Total Queries", icon: Activity },
      { type: "latency_distribution", title: "Latency Distribution", icon: BarChart3 },
      { type: "queries_timeline", title: "Queries Timeline", icon: CalendarClock },
      { type: "throughput", title: "Throughput (tok/s)", icon: Gauge },
    ],
  },
  {
    label: "Tokens & Cost",
    items: [
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

interface CustomEval {
  name: string;
  evalType: string;
  isCustom: boolean;
}

export function AddWidgetMenu({ onAdd }: AddWidgetMenuProps) {
  const [open, setOpen] = useState(false);
  const [customEvals, setCustomEvals] = useState<CustomEval[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadCustomEvals = useCallback(async () => {
    try {
      const res = await apiFetch("/api/eval-prompts");
      const data = await res.json();
      setCustomEvals((data.prompts ?? []).filter((p: CustomEval) => p.isCustom));
    } catch {}
  }, []);

  useEffect(() => {
    if (!open) return;
    loadCustomEvals();
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, loadCustomEvals]);

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
          {customEvals.length > 0 && (
            <div>
              <div className="px-2.5 pb-1 pt-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                Custom Evals
              </div>
              {customEvals.map((e) => (
                <button
                  key={e.name}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-base transition-colors hover:bg-accent"
                  onClick={() => {
                    onAdd(`eval_${e.name}`, e.name);
                    setOpen(false);
                  }}
                >
                  <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{e.name}</span>
                  <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
                    {e.evalType === "code_rule" ? "rule" : "llm"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
