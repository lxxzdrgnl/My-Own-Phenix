"use client";

import { apiFetch } from "@/lib/api-client";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Trash2,
  RotateCcw,
  Play,
  X,
  FlaskConical,
  RefreshCw,
} from "lucide-react";
import { RuleBuilder, DEFAULT_RULE_CONFIG, type RuleConfig } from "@/components/rule-builder";
import { PromptBuilder, parsePromptToConfig, generatePromptMessages } from "@/components/prompt-builder";
import { DateRangePicker, getPresetRange, type DateRange } from "@/components/ui/date-range-picker";
import { refreshBadgeLabels } from "@/components/annotation-badge";
import { ModelSelector } from "@/components/model-selector";
import { PASS_LABELS } from "@/lib/constants";
import { BUILT_IN_EVALS, BUILT_IN_TYPES, NEW_EVAL_TEMPLATE } from "./eval-constants";
import type { EvalPrompt, ProjectEvalConfig } from "./eval-list";
import type { Project } from "@/lib/phoenix";

// ─── Types ─────────────────────────────────────────────────────────────────

interface EvalEditorProps {
  selectedEval: string | null;
  selectedProject: string | null;
  creating: boolean;
  projects: Project[];
  globalPrompts: EvalPrompt[];
  projectConfigs: ProjectEvalConfig[];
  defaultEvalModel: string;
  onCreated: (name: string, evalType: string, template: string, ruleConfig: RuleConfig, model: string) => void;
  onCancelCreate: () => void;
  onDeleted: () => void;
  onProjectConfigReload: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function EvalEditor({
  selectedEval,
  selectedProject,
  creating,
  projects,
  globalPrompts,
  projectConfigs,
  defaultEvalModel,
  onCreated,
  onCancelCreate,
  onDeleted,
  onProjectConfigReload,
}: EvalEditorProps) {
  // New eval form state
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<string>("llm_prompt");
  const [newEvalModel, setNewEvalModel] = useState(defaultEvalModel);

  // Editor state (for selected eval) — initialized from props when selectedEval changes
  const [editTemplate, setEditTemplate] = useState("");
  const [editEvalType, setEditEvalType] = useState<string>("llm_prompt");
  const [editRuleConfig, setEditRuleConfig] = useState<RuleConfig>(DEFAULT_RULE_CONFIG);
  const [editBadgeLabel, setEditBadgeLabel] = useState("");
  const [editModel, setEditModel] = useState(defaultEvalModel);
  const [isProjectOverride, setIsProjectOverride] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Test state
  const [testContext, setTestContext] = useState("The Eiffel Tower is located in Paris, France. It was constructed in 1889 and stands 330 meters tall. It was designed by Gustave Eiffel's engineering company.");
  const [testQuery, setTestQuery] = useState("How tall is the Eiffel Tower and where is it located?");
  const [testResponse, setTestResponse] = useState("The Eiffel Tower is 330 meters tall and is located in Paris, France. It was built in 1889 by Gustave Eiffel.");
  const [testResult, setTestResult] = useState<{ label: string; score: number; explanation: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // Backfill state
  const [backfillRange, setBackfillRange] = useState<DateRange>(() => getPresetRange(7));
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ evaluated: number; skipped: number; total: number } | null>(null);

  // ── Initialize editor state when selectedEval changes ──
  useEffect(() => {
    if (!selectedEval) return;
    setTestResult(null);
    setDirty(false);
    setBackfillResult(null);

    const projectConfig = projectConfigs.find((c) => c.evalName === selectedEval);
    const globalCustom = globalPrompts.find((p) => p.name === selectedEval);

    const evalType = globalCustom?.evalType ?? BUILT_IN_TYPES[selectedEval] ?? "llm_prompt";
    setEditEvalType(evalType);
    setEditBadgeLabel(globalCustom?.badgeLabel ?? "");
    setEditModel(globalCustom?.model || defaultEvalModel);

    if (evalType === "code_rule") {
      try {
        const saved = globalCustom?.ruleConfig ? JSON.parse(globalCustom.ruleConfig) : null;
        setEditRuleConfig(saved?.rules ? saved : DEFAULT_RULE_CONFIG);
      } catch {
        setEditRuleConfig(DEFAULT_RULE_CONFIG);
      }
    }

    if (projectConfig?.template) {
      setEditTemplate(projectConfig.template);
      setIsProjectOverride(true);
    } else {
      setEditTemplate(globalCustom?.template ?? "");
      setIsProjectOverride(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEval]);

  // ── Derived ──
  const isBuiltIn = selectedEval ? BUILT_IN_EVALS.includes(selectedEval) : false;

  // ── Save ──

  async function handleSaveGlobal() {
    if (!selectedEval) return;
    setSaving(true);
    const isCustom = !BUILT_IN_EVALS.includes(selectedEval);
    try {
      await apiFetch("/api/eval-prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedEval,
          projectId: null,
          evalType: editEvalType,
          outputMode: /"score":\s*0\.0-1\.0/.test(editTemplate) ? "score" : "binary",
          template: editTemplate,
          ruleConfig: editEvalType === "code_rule" ? editRuleConfig : undefined,
          badgeLabel: editBadgeLabel,
          model: editModel,
          isCustom,
        }),
      });
      setDirty(false);
      onProjectConfigReload();
      refreshBadgeLabels();
    } catch {}
    setSaving(false);
  }

  async function handleSaveProject() {
    if (!selectedEval || !selectedProject) return;
    setSaving(true);
    try {
      await apiFetch("/api/eval-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProject,
          evalName: selectedEval,
          template: editTemplate,
        }),
      });
      setDirty(false);
      setIsProjectOverride(true);
      onProjectConfigReload();
    } catch {}
    setSaving(false);
  }

  async function handleClearOverride() {
    if (!selectedEval || !selectedProject) return;
    try {
      await apiFetch("/api/eval-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProject,
          evalName: selectedEval,
          template: null,
        }),
      });
      setIsProjectOverride(false);
      onProjectConfigReload();
      const globalCustom = globalPrompts.find((p) => p.name === selectedEval);
      setEditTemplate(globalCustom?.template ?? "");
      setDirty(false);
    } catch {}
  }

  async function handleResetDefault() {
    if (!selectedEval) return;
    const globalCustom = globalPrompts.find((p) => p.name === selectedEval);
    if (globalCustom?.template) {
      setEditTemplate(globalCustom.template);
      setDirty(false);
    }
  }

  async function handleDelete() {
    if (!selectedEval || !selectedProject) return;
    if (!confirm(`Delete "${selectedEval}"?`)) return;

    const deleteAnnotations = confirm(
      "Also delete existing annotations from Phoenix?\n\nOK = Delete annotations too\nCancel = Keep annotations, only remove eval config",
    );

    try {
      await apiFetch(`/api/eval-prompts?name=${encodeURIComponent(selectedEval)}`, { method: "DELETE" });
      if (deleteAnnotations) {
        for (const p of projects) {
          try {
            await apiFetch(`/api/v1/projects/${encodeURIComponent(p.name)}/span_annotations`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: selectedEval }),
            });
          } catch {}
        }
      }
      onDeleted();
    } catch {}
  }

  async function handleBackfill() {
    if (!selectedEval || !selectedProject) return;
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await apiFetch("/api/eval-backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProject,
          evalName: selectedEval,
          startDate: backfillRange.from.toISOString().split("T")[0],
          endDate: backfillRange.to.toISOString().split("T")[0],
        }),
      });
      const data = await res.json();
      setBackfillResult(data);
    } catch {
      setBackfillResult({ evaluated: 0, skipped: 0, total: 0 });
    }
    setBackfilling(false);
  }

  async function handleCreate() {
    const name = newName.trim().toLowerCase().replace(/\s+/g, "_");
    if (!name || !selectedProject) return;
    try {
      await apiFetch("/api/eval-prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          projectId: null,
          evalType: newType,
          template: newType === "llm_prompt" ? NEW_EVAL_TEMPLATE : "",
          ruleConfig: newType === "code_rule" ? DEFAULT_RULE_CONFIG : undefined,
          model: newEvalModel,
          isCustom: true,
        }),
      });
      await apiFetch("/api/eval-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProject, evalName: name, enabled: true }),
      });
      const createdTemplate = newType === "llm_prompt" ? NEW_EVAL_TEMPLATE : "";
      const createdRuleConfig: RuleConfig = DEFAULT_RULE_CONFIG;
      setNewName("");
      setNewType("llm_prompt");
      setNewEvalModel(defaultEvalModel);
      onCreated(name, newType, createdTemplate, createdRuleConfig, newEvalModel);
    } catch {}
  }

  async function handleTest() {
    if (!editTemplate) return;
    setTesting(true);
    setTestResult(null);
    try {
      const replacePlaceholders = (text: string) =>
        text
          .replace(/\{context\}/g, testContext || "(no context)")
          .replace(/\{response\}/g, testResponse || "(no response)")
          .replace(/\{query\}/g, testQuery || "(no query)");

      const evalConfig = parsePromptToConfig(editTemplate);
      let messages;
      if (evalConfig) {
        const { system, user } = generatePromptMessages(evalConfig);
        messages = [
          { role: "system", content: replacePlaceholders(system) },
          { role: "user", content: replacePlaceholders(user) },
        ];
      } else {
        messages = [{ role: "user", content: replacePlaceholders(editTemplate) }];
      }

      const res = await apiFetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages, temperature: 0 }),
      });
      const data = await res.json();
      const result = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
      const isBinary = result.score === undefined;
      const score = isBinary
        ? (PASS_LABELS.has(String(result.label).toLowerCase()) ? 1.0 : 0.0)
        : (result.score ?? 0);
      setTestResult({ label: result.label ?? "", score, explanation: result.explanation ?? "" });
    } catch (e) {
      setTestResult({ label: "error", score: 0, explanation: String(e) });
    }
    setTesting(false);
  }

  // ── Render: Create form ──

  if (creating && !selectedEval) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <h1 className="text-xl font-semibold tracking-tight mb-1">New Evaluation</h1>
        <p className="text-sm text-muted-foreground mb-6">Create a custom evaluation to run on your agent traces.</p>

        <div className="space-y-5">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">Name</label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. pii_detection, tone_check, format_validation"
              className="text-sm"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground mt-1">Lowercase, underscores. This becomes the annotation name.</p>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">Type</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setNewType("llm_prompt")}
                className={cn(
                  "rounded-lg border p-4 text-left transition-colors",
                  newType === "llm_prompt" ? "border-foreground bg-accent" : "hover:bg-accent/50"
                )}
              >
                <p className="text-sm font-semibold">LLM Prompt</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Use an LLM to evaluate responses with a custom prompt. Best for subjective quality checks.
                </p>
              </button>
              <button
                onClick={() => setNewType("code_rule")}
                className={cn(
                  "rounded-lg border p-4 text-left transition-colors",
                  newType === "code_rule" ? "border-foreground bg-accent" : "hover:bg-accent/50"
                )}
              >
                <p className="text-sm font-semibold">Code Rule</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Check text patterns, token limits, or metadata with rules. Fast, no LLM cost.
                </p>
              </button>
            </div>
          </div>

          {newType === "llm_prompt" && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">Eval Model</label>
              <div className="w-64">
                <ModelSelector value={newEvalModel} onChange={setNewEvalModel} />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="flex-1"
            >
              Create Evaluation
            </Button>
            <Button variant="ghost" onClick={onCancelCreate}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Empty state ──

  if (!selectedEval) {
    return (
      <EmptyState
        icon={FlaskConical}
        title="Select an evaluation"
        description="Choose an evaluation from the list to edit its prompt."
        className="h-full"
      />
    );
  }

  // ── Render: Edit panel ──

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl p-6">
        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight">{selectedEval}</h1>
              <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase bg-foreground/8 text-foreground/60">
                {editEvalType === "llm_prompt" ? "LLM" : editEvalType === "code_rule" ? "Rule" : "Built-in"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {isProjectOverride && (
                <Button size="sm" variant="ghost" onClick={handleClearOverride} className="gap-1 text-xs h-7">
                  <X className="size-3" /> Remove Override
                </Button>
              )}
              {isBuiltIn && !isProjectOverride && (
                <Button size="sm" variant="ghost" onClick={handleResetDefault} className="gap-1 text-xs h-7">
                  <RotateCcw className="size-3" /> Reset
                </Button>
              )}
              {!isBuiltIn && (
                <Button size="sm" variant="ghost" onClick={handleDelete} className="gap-1 text-xs h-7 text-red-600">
                  <Trash2 className="size-3" />
                </Button>
              )}
            </div>
          </div>

          {/* Scope + Save bar */}
          <div className="flex items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5">
            <span className="text-[10px] text-muted-foreground shrink-0">Scope:</span>
            <div className="flex gap-0.5">
              <button
                onClick={() => { if (isProjectOverride) handleClearOverride(); }}
                className={cn(
                  "rounded px-2 py-1 text-[10px] font-medium transition-colors",
                  !isProjectOverride ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                All Projects
              </button>
              <button
                onClick={() => setIsProjectOverride(true)}
                className={cn(
                  "rounded px-2 py-1 text-[10px] font-medium transition-colors",
                  isProjectOverride ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {selectedProject}
              </button>
            </div>
            {dirty && (
              <Button
                size="sm"
                onClick={isProjectOverride ? handleSaveProject : handleSaveGlobal}
                disabled={saving}
                className="ml-auto h-6 text-[10px] px-3"
              >
                {saving ? "Saving..." : "Save"}
              </Button>
            )}
          </div>
        </div>

        {/* Backfill */}
        <div className="mb-5 flex items-center gap-3 rounded-lg border bg-muted/10 px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <RefreshCw className={cn("size-3.5 text-muted-foreground shrink-0", backfilling && "animate-spin")} />
              <span className="text-xs font-semibold">Run on Existing Traces</span>
              {backfillResult && (
                <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
                  {backfillResult.evaluated} evaluated, {backfillResult.skipped} skipped / {backfillResult.total}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <DateRangePicker value={backfillRange} onChange={setBackfillRange} />
              <Button
                size="sm"
                variant="outline"
                onClick={handleBackfill}
                disabled={backfilling || !editTemplate}
                className="gap-1.5 text-xs h-8 shrink-0"
              >
                {backfilling ? "Running..." : "Run"}
              </Button>
            </div>
          </div>
        </div>

        {/* Editor — changes by eval type */}
        {editEvalType === "code_rule" ? (
          <div className="mb-5">
            <RuleBuilder
              config={editRuleConfig}
              onChange={(cfg) => { setEditRuleConfig(cfg); setDirty(true); }}
            />
          </div>
        ) : editEvalType === "builtin" && !editTemplate ? (
          <div className="mb-5">
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                Using Phoenix built-in evaluator. No custom prompt needed.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditTemplate(`You are an expert evaluator for ${selectedEval}.

CONTEXT:
{context}

QUERY:
{query}

RESPONSE:
{response}

Evaluate and respond with JSON only: {{"label": "pass" or "fail", "score": 0.0-1.0, "explanation": "one line"}}`);
                  setEditEvalType("llm_prompt");
                  setDirty(true);
                }}
                className="text-xs"
              >
                Override with Custom Prompt
              </Button>
            </div>
          </div>
        ) : (
          <div className="mb-5">
            <div className="mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Eval Model</span>
              <div className="mt-1 w-64">
                <ModelSelector value={editModel} onChange={(m) => { setEditModel(m); setDirty(true); }} />
              </div>
            </div>
            <PromptBuilder
              template={editTemplate}
              evalName={selectedEval}
              badgeLabel={editBadgeLabel}
              onChange={(t) => { setEditTemplate(t); setDirty(true); }}
              onBadgeLabelChange={(l) => { setEditBadgeLabel(l); setDirty(true); }}
            />
          </div>
        )}

        {/* Test */}
        <div className="rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Play className="size-3" /> Test
            </h3>
            <Button size="sm" variant="outline" onClick={handleTest} disabled={testing || !editTemplate} className="gap-1.5 text-xs">
              {testing ? "Running..." : "Run"}
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Context</label>
              <Textarea value={testContext} onChange={(e) => setTestContext(e.target.value)} rows={3} placeholder="..." className="text-xs" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Query</label>
              <Textarea value={testQuery} onChange={(e) => setTestQuery(e.target.value)} rows={3} placeholder="..." className="text-xs" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Response</label>
              <Textarea value={testResponse} onChange={(e) => setTestResponse(e.target.value)} rows={3} placeholder="..." className="text-xs" />
            </div>
          </div>
          {testResult && (() => {
            const isPass = PASS_LABELS.has(String(testResult.label).toLowerCase()) || testResult.score >= 0.5;
            const isBinary = !/"score":\s*0\.0-1\.0/.test(editTemplate);
            return (
              <div className="rounded-md border bg-muted/20 p-3 flex items-center gap-3 text-sm">
                <span className={cn(
                  "rounded px-2 py-0.5 text-xs font-bold",
                  testResult.label === "error" ? "bg-muted text-destructive"
                    : isPass ? "bg-muted text-foreground"
                    : "bg-muted text-destructive"
                )}>
                  {testResult.label}
                </span>
                {!isBinary && (
                  <span className="tabular-nums font-mono text-xs">{testResult.score.toFixed(2)}</span>
                )}
                <span className="text-xs text-muted-foreground flex-1">{testResult.explanation}</span>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
