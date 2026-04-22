"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus, Check, ChevronRight } from "lucide-react";
import { Sidebar, SidebarHeader, SidebarItem, SidebarItemDiv } from "@/components/ui/sidebar";
import { BUILT_IN_EVALS, BUILT_IN_TYPES, EVAL_DESCRIPTIONS } from "./eval-constants";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface EvalPrompt {
  id: string;
  name: string;
  evalType: string; // "llm_prompt" | "code_rule" | "builtin"
  outputMode: string; // "score" | "binary"
  template: string;
  ruleConfig: string; // JSON
  badgeLabel: string;
  isCustom: boolean;
  model: string;
}

export interface ProjectEvalConfig {
  id: string;
  projectId: string;
  evalName: string;
  enabled: boolean;
  template: string | null;
}

interface EvalListProps {
  selectedProject: string | null;
  selectedEval: string | null;
  globalPrompts: EvalPrompt[];
  projectConfigs: ProjectEvalConfig[];
  onSelectEval: (name: string) => void;
  onToggleEval: (name: string) => void;
  onStartCreating: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function EvalList({
  selectedProject,
  selectedEval,
  globalPrompts,
  projectConfigs,
  onSelectEval,
  onToggleEval,
  onStartCreating,
}: EvalListProps) {
  function isEnabled(name: string): boolean {
    const c = projectConfigs.find((c) => c.evalName === name);
    if (c) return c.enabled;
    // Built-in evals default to enabled, custom evals default to disabled
    return BUILT_IN_EVALS.includes(name);
  }

  const customEvals = globalPrompts.filter((p) => p.isCustom && !BUILT_IN_EVALS.includes(p.name));

  return (
    <Sidebar>
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <SidebarHeader>Active Evaluations</SidebarHeader>
      </div>

      {selectedProject ? (
        <div className="flex-1 overflow-y-auto">
          {/* Built-in */}
          <div className="px-2 pt-1">
            {BUILT_IN_EVALS.map((name) => {
              const enabled = isEnabled(name);
              const hasOverride = projectConfigs.some((c) => c.evalName === name && c.template);
              return (
                <SidebarItemDiv
                  key={name}
                  active={selectedEval === name}
                >
                  {/* Toggle */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleEval(name); }}
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                      enabled ? "border-foreground bg-foreground" : "border-muted-foreground/30",
                    )}
                  >
                    {enabled && <Check className="size-2.5 text-background" />}
                  </button>
                  {/* Name + select */}
                  <button
                    onClick={() => onSelectEval(name)}
                    className="flex flex-1 items-center gap-1.5 text-left min-w-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm truncate", !enabled && "text-muted-foreground line-through")}>{name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{EVAL_DESCRIPTIONS[name] ?? ""}</p>
                    </div>
                    {hasOverride && (
                      <span className="shrink-0 rounded bg-foreground/10 px-1 py-0.5 text-[8px] font-bold uppercase text-muted-foreground">
                        override
                      </span>
                    )}
                    {(() => {
                      const t = BUILT_IN_TYPES[name] ?? "llm_prompt";
                      return (
                        <span className={cn(
                          "shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase",
                          t === "code_rule" ? "bg-muted text-muted-foreground"
                            : t === "builtin" ? "bg-foreground/10 text-foreground/70"
                            : "bg-foreground text-background"
                        )}>
                          {t === "code_rule" ? "rule" : t === "builtin" ? "built-in" : "llm"}
                        </span>
                      );
                    })()}
                    <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                  </button>
                </SidebarItemDiv>
              );
            })}
          </div>

          {/* Custom evals */}
          {customEvals.length > 0 && (
            <>
              <div className="px-3 pt-3 pb-1">
                <SidebarHeader>Custom</SidebarHeader>
              </div>
              <div className="px-2">
                {customEvals.map((p) => {
                  const enabled = isEnabled(p.name);
                  return (
                    <SidebarItemDiv
                      key={p.name}
                      active={selectedEval === p.name}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleEval(p.name); }}
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                          enabled ? "border-foreground bg-foreground" : "border-muted-foreground/30",
                        )}
                      >
                        {enabled && <Check className="size-2.5 text-background" />}
                      </button>
                      <button onClick={() => onSelectEval(p.name)} className="flex flex-1 items-center gap-1.5 text-left min-w-0">
                        <span className={cn("text-sm flex-1 truncate", !enabled && "text-muted-foreground")}>{p.name}</span>
                        <span className={cn(
                          "shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase",
                          p.evalType === "code_rule" ? "bg-muted text-muted-foreground"
                            : "bg-foreground text-background"
                        )}>
                          {p.evalType === "code_rule" ? "rule" : "llm"}
                        </span>
                        <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                      </button>
                    </SidebarItemDiv>
                  );
                })}
              </div>
            </>
          )}

          {/* Add new */}
          <div className="px-3 py-3">
            <Button
              size="sm"
              variant="outline"
              onClick={onStartCreating}
              className="w-full gap-1.5 text-xs"
            >
              <Plus className="size-3" /> Add Evaluation
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Select a project
        </div>
      )}
    </Sidebar>
  );
}
