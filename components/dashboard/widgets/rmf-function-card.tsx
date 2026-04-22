"use client";

import { cn } from "@/lib/utils";
import { Info } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { RmfScores } from "@/lib/rmf-utils";

interface RmfFunctionCardsProps {
  scores: RmfScores;
  /** @deprecated use scores instead */
  measureScore?: number;
  className?: string;
}

interface FunctionDef {
  key: keyof RmfScores;
  name: string;
  label: string;
  color: string;
  description: string;
  formula: string;
}

const RMF_FUNCTIONS: FunctionDef[] = [
  {
    key: "govern",
    name: "GOVERN",
    label: "Governance",
    color: "#3b82f6",
    description: "AI policy, eval coverage, ethics principles, guardrail configuration",
    formula: "Base 20 + eval coverage (max 40) + custom evals (+20) + 5+ evals (+10) + 8+ evals (+10)",
  },
  {
    key: "map",
    name: "MAP",
    label: "Risk Identification",
    color: "#7c3aed",
    description: "Risk category coverage, eval type diversity, impact analysis",
    formula: "Categories with green status / 8 total categories (Accuracy, Safety, Quality, Retrieval, Citation, Performance, Cost, Tool Usage)",
  },
  {
    key: "measure",
    name: "MEASURE",
    label: "Risk Measurement",
    color: "#10b981",
    description: "12 performance metrics — all normalized 0-100%, higher is better",
    formula: "Average of all metric values (factual_rate, safety_rate, qa_accuracy, retrieval_relevance, citation_accuracy, latency_score, success_rate, token_score, cost_score, etc.)",
  },
  {
    key: "manage",
    name: "MANAGE",
    label: "Risk Response",
    color: "#14b8a6",
    description: "Risk mitigation rate, incident response, remediation actions",
    formula: "Mitigated risks / total risks × 100 − open incidents × 10 (max −30 penalty). 0% if no risks configured.",
  },
];

export function RmfFunctionCards({ scores, measureScore, className }: RmfFunctionCardsProps) {
  return (
    <div className={cn("grid grid-cols-4 gap-4 p-4", className)}>
      {RMF_FUNCTIONS.map((fn) => {
        const score = scores[fn.key] ?? (fn.key === "measure" ? measureScore : undefined);
        const display = score !== undefined ? `${score}%` : "—";

        return (
          <div
            key={fn.key}
            className="rounded-lg border border-border bg-card overflow-hidden flex flex-col"
          >
            <div
              className="h-1.5 w-full shrink-0"
              style={{ backgroundColor: fn.color }}
            />
            <div className="flex flex-col gap-2 p-4 flex-1">
              <div className="flex items-center justify-between">
                <span
                  className="text-base font-bold tracking-wide"
                  style={{ color: fn.color }}
                >
                  {fn.name}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                      <Info className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-left">
                    <p className="font-semibold mb-1">{fn.label}</p>
                    <p className="text-[11px] leading-relaxed opacity-80">{fn.formula}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <span className="text-sm font-medium text-foreground">
                {fn.label}
              </span>
              <span className="text-2xl font-bold tabular-nums text-foreground">
                {display}
              </span>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {fn.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
