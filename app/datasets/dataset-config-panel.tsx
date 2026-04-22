"use client";

import { Button } from "@/components/ui/button";
import { AgentModelSelector } from "@/components/agent-model-selector";
import { Play, X, Pencil } from "lucide-react";

interface EvalOption {
  name: string; evalType: string; template: string;
  outputMode: string; isCustom: boolean; badgeLabel: string; ruleConfig: string;
}

interface DatasetConfigPanelProps {
  // Agent / generate
  selectedAgent: string;
  onAgentChange: (value: string) => void;
  generating: boolean;
  genProgress: number;
  totalRows: number;
  selectedRowIndices: Set<number>;
  onGenerate: () => void;
  onCancel: () => void;

  // Eval
  checkedEvals: Set<string>;
  evalOptions: EvalOption[];
  evaluating: boolean;
  evalProgress: number;
  displayResultsLength: number;
  onEvaluate: () => void;
  onOpenEvalModal: () => void;
}

export function DatasetConfigPanel({
  selectedAgent, onAgentChange,
  generating, genProgress, totalRows, selectedRowIndices,
  onGenerate, onCancel,
  checkedEvals, evalOptions,
  evaluating, evalProgress, displayResultsLength,
  onEvaluate, onOpenEvalModal,
}: DatasetConfigPanelProps) {
  return (
    <div className="shrink-0 border-b bg-muted/5 px-5 py-4 space-y-4">
      {/* Row 1: Generate */}
      <div className="flex items-center gap-3">
        <p className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Agent</p>
        <div className="w-52">
          <AgentModelSelector value={selectedAgent} onChange={onAgentChange} />
        </div>
        {generating ? (
          <Button onClick={onCancel} variant="outline" className="h-8 gap-1.5 text-xs">
            <X className="size-3" /> Stop ({genProgress}%)
          </Button>
        ) : (
          <Button onClick={onGenerate} disabled={totalRows === 0} variant="outline" className="h-8 gap-1.5 text-xs">
            <Play className="size-3" />Generate{selectedRowIndices.size > 0 && ` (${selectedRowIndices.size})`}
          </Button>
        )}
        {generating && (
          <div className="h-1 w-28 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-foreground/40 transition-all duration-300" style={{ width: `${genProgress}%` }} />
          </div>
        )}
      </div>

      {/* Row 2: Evaluate */}
      <div className="flex items-start gap-3">
        <p className="mt-1.5 w-24 shrink-0 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Evals</p>
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {checkedEvals.size > 0 ? (
            [...checkedEvals].map(name => {
              const ev = evalOptions.find(e => e.name === name);
              return (
                <span key={name} className="flex items-center gap-1 rounded border bg-foreground/5 px-2 py-1 text-[11px] font-medium">
                  {name}
                  {ev && <span className="text-[9px] text-muted-foreground">{ev.evalType === "code_rule" ? "rule" : ev.isCustom ? "custom" : "llm"}</span>}
                </span>
              );
            })
          ) : (
            <span className="text-xs text-muted-foreground">None selected</span>
          )}
          <button onClick={onOpenEvalModal} className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
            <Pencil className="size-2.5" /> Edit
          </button>
        </div>
        {evaluating ? (
          <Button onClick={onCancel} className="h-8 shrink-0 gap-1.5 text-xs">
            <X className="size-3" /> Stop ({evalProgress}%)
          </Button>
        ) : (
          <Button onClick={onEvaluate} disabled={checkedEvals.size === 0 || displayResultsLength === 0} className="h-8 shrink-0 gap-1.5 text-xs">
            <Play className="size-3" />Evaluate
          </Button>
        )}
        {evaluating && (
          <div className="mt-3 h-1 w-28 shrink-0 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-foreground transition-all duration-300" style={{ width: `${evalProgress}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
