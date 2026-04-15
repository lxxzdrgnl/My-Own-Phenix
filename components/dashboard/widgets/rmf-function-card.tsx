"use client";

import { cn } from "@/lib/utils";

interface RmfFunctionCardsProps {
  measureScore?: number;
  className?: string;
}

interface FunctionDef {
  key: string;
  name: string;
  label: string;
  color: string;
  description: string;
}

const RMF_FUNCTIONS: FunctionDef[] = [
  {
    key: "GOVERN",
    name: "GOVERN",
    label: "Governance",
    color: "#3b82f6",
    description: "AI policy, roles/responsibilities, ethics principles, training",
  },
  {
    key: "MAP",
    name: "MAP",
    label: "Risk Identification",
    color: "#7c3aed",
    description: "AI system inventory, risk categories, impact analysis",
  },
  {
    key: "MEASURE",
    name: "MEASURE",
    label: "Risk Measurement",
    color: "#10b981",
    description: "Performance metrics, bias evaluation, hallucination/toxicity monitoring",
  },
  {
    key: "MANAGE",
    name: "MANAGE",
    label: "Risk Response",
    color: "#14b8a6",
    description: "Remediation actions, alert systems, incident response, audit trail",
  },
];

export function RmfFunctionCards({ measureScore, className }: RmfFunctionCardsProps) {
  return (
    <div className={cn("grid grid-cols-4 gap-4 p-4", className)}>
      {RMF_FUNCTIONS.map((fn) => {
        const score =
          fn.key === "MEASURE" && measureScore !== undefined
            ? `${measureScore.toFixed(1)}%`
            : "—";

        return (
          <div
            key={fn.key}
            className="rounded-lg border border-border bg-card overflow-hidden flex flex-col"
          >
            {/* Color bar */}
            <div
              className="h-1.5 w-full shrink-0"
              style={{ backgroundColor: fn.color }}
            />

            <div className="flex flex-col gap-2 p-4 flex-1">
              {/* Function name */}
              <span
                className="text-base font-bold tracking-wide"
                style={{ color: fn.color }}
              >
                {fn.name}
              </span>

              {/* Label */}
              <span className="text-sm font-medium text-foreground">
                {fn.label}
              </span>

              {/* Score */}
              <span className="text-2xl font-bold tabular-nums text-foreground">
                {score}
              </span>

              {/* Description */}
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
