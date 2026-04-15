"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchProjects, type Project } from "@/lib/phoenix";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState } from "@/components/ui/empty-state";
import {
  Plus,
  Trash2,
  RotateCcw,
  Play,
  Check,
  X,
  FlaskConical,
  ChevronRight,
} from "lucide-react";
import { RuleBuilder, DEFAULT_RULE_CONFIG, type RuleConfig } from "@/components/rule-builder";

// ─── Types ─────────────────────────────────────────────────────────────────

interface EvalPrompt {
  id: string;
  name: string;
  evalType: string; // "llm_prompt" | "code_rule" | "builtin"
  template: string;
  ruleConfig: string; // JSON
  isCustom: boolean;
}

interface ProjectEvalConfig {
  id: string;
  projectId: string;
  evalName: string;
  enabled: boolean;
  template: string | null;
}

interface BuiltInEvalDef {
  name: string;
  description: string;
  defaultType: string; // "llm_prompt" | "builtin" | "code_rule"
}

const BUILT_IN_EVAL_DEFS: BuiltInEvalDef[] = [
  { name: "hallucination", description: "Detects fabricated or factually wrong information", defaultType: "llm_prompt" },
  { name: "citation", description: "Checks if response is grounded in context", defaultType: "llm_prompt" },
  { name: "tool_calling", description: "Evaluates tool/retrieval usage appropriateness", defaultType: "llm_prompt" },
  { name: "qa_correctness", description: "Evaluates answer accuracy (Phoenix built-in, overridable)", defaultType: "builtin" },
  { name: "rag_relevance", description: "Measures retrieved document relevance (Phoenix built-in, overridable)", defaultType: "builtin" },
  { name: "banned_word", description: "Detects toxic or banned content (keyword matching)", defaultType: "code_rule" },
];

const BUILT_IN_EVALS = BUILT_IN_EVAL_DEFS.map((e) => e.name);

const EVAL_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  BUILT_IN_EVAL_DEFS.map((e) => [e.name, e.description]),
);

const BUILT_IN_TYPES: Record<string, string> = Object.fromEntries(
  BUILT_IN_EVAL_DEFS.map((e) => [e.name, e.defaultType]),
);

const DEFAULT_RULE_CONFIGS: Record<string, RuleConfig> = {
  banned_word: {
    rules: [{ check: "response", op: "contains_any", value: "fuck, shit", caseSensitive: false }],
    logic: "any",
    match: { label: "detected", score: 1.0 },
    clean: { label: "clean", score: 0.0 },
  },
};

const DEFAULT_TEMPLATES: Record<string, string> = {
  hallucination: `You are an expert at detecting factual errors and fabricated information in AI responses.

Determine whether the RESPONSE contains **factually incorrect or fabricated information**.

CONTEXT:
{context}

RESPONSE:
{response}

Important distinctions:
- Information beyond the CONTEXT is NOT automatically hallucination.
- Only flag if the RESPONSE states something **factually wrong**, **invents non-existent specifics**, or **directly contradicts** the CONTEXT.

Scoring:
- 0.0: No hallucination — factually accurate
- 0.3: Minor issue — slight inaccuracy
- 0.6: Significant — fabricated specifics
- 1.0: Complete hallucination

Respond with JSON only: {{"label": "factual" or "hallucinated", "score": 0.0-1.0, "explanation": "one line"}}`,

  citation: `You are an expert at evaluating context faithfulness.

Determine whether all claims in the RESPONSE are grounded in the CONTEXT.

CONTEXT:
{context}

RESPONSE:
{response}

Scoring:
- 1.0: Fully grounded
- 0.7-0.9: Mostly grounded
- 0.4-0.6: Partially grounded
- 0.0-0.3: Mostly ungrounded

Respond with JSON only: {{"label": "faithful" or "unfaithful", "score": 0.0-1.0, "explanation": "one line"}}`,

  tool_calling: `You are an expert at evaluating tool usage appropriateness.

User query:
{query}

Retrieved context:
{context}

Scoring:
- 1.0: Clearly relevant query — retrieval appropriate
- 0.7: Related but indirect
- 0.3: Tangentially related
- 0.0: Completely unrelated

Respond with JSON only: {{"label": "appropriate" or "inappropriate", "score": 0.0-1.0, "explanation": "one line"}}`,
};

const NEW_EVAL_TEMPLATE = `You are an expert evaluator.

CONTEXT:
{context}

QUERY:
{query}

RESPONSE:
{response}

Scoring:
- 0.0: Worst
- 0.5: Middle
- 1.0: Best

Respond with JSON only: {{"label": "pass" or "fail", "score": 0.0-1.0, "explanation": "one line"}}`;

// ─── Component ─────────────────────────────────────────────────────────────

export function EvaluationsManager() {
  // Data
  const [projects, setProjects] = useState<Project[]>([]);
  const [globalPrompts, setGlobalPrompts] = useState<EvalPrompt[]>([]);
  const [projectConfigs, setProjectConfigs] = useState<ProjectEvalConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedEval, setSelectedEval] = useState<string | null>(null);

  // Editor
  const [editTemplate, setEditTemplate] = useState("");
  const [editEvalType, setEditEvalType] = useState<string>("llm_prompt");
  const [editRuleConfig, setEditRuleConfig] = useState<RuleConfig>(DEFAULT_RULE_CONFIG);
  const [isProjectOverride, setIsProjectOverride] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // New eval
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<string>("llm_prompt");

  // Test
  const [testContext, setTestContext] = useState("");
  const [testQuery, setTestQuery] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [testResult, setTestResult] = useState<{ label: string; score: number; explanation: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // All eval names
  const allEvalNames = [
    ...BUILT_IN_EVALS,
    ...globalPrompts.filter((p) => p.isCustom && !BUILT_IN_EVALS.includes(p.name)).map((p) => p.name),
  ];

  // ── Load ──

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ps, promptsRes] = await Promise.all([
        fetchProjects(),
        fetch("/api/eval-prompts").then((r) => r.json()),
      ]);
      setProjects(ps);
      setGlobalPrompts(promptsRes.prompts ?? []);
      if (ps.length > 0 && !selectedProject) setSelectedProject(ps[0].name);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [selectedProject]);

  const loadProjectConfig = useCallback(async (pid: string) => {
    try {
      const res = await fetch(`/api/eval-config?projectId=${encodeURIComponent(pid)}`);
      const data = await res.json();
      setProjectConfigs(data.configs ?? []);
    } catch {}
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { if (selectedProject) loadProjectConfig(selectedProject); }, [selectedProject, loadProjectConfig]);

  // ── Eval selection ──

  function selectEval(name: string) {
    setSelectedEval(name);
    setTestResult(null);
    setDirty(false);

    const projectConfig = projectConfigs.find((c) => c.evalName === name);
    const globalCustom = globalPrompts.find((p) => p.name === name);

    // Determine eval type: saved > built-in default > llm_prompt
    const evalType = globalCustom?.evalType ?? BUILT_IN_TYPES[name] ?? "llm_prompt";
    setEditEvalType(evalType);

    // Load rule config
    if (evalType === "code_rule") {
      try {
        const saved = globalCustom?.ruleConfig ? JSON.parse(globalCustom.ruleConfig) : null;
        setEditRuleConfig(saved?.rules ? saved : DEFAULT_RULE_CONFIGS[name] ?? DEFAULT_RULE_CONFIG);
      } catch {
        setEditRuleConfig(DEFAULT_RULE_CONFIGS[name] ?? DEFAULT_RULE_CONFIG);
      }
    }

    // Load template: project override → global custom → built-in default
    if (projectConfig?.template) {
      setEditTemplate(projectConfig.template);
      setIsProjectOverride(true);
    } else {
      setEditTemplate(globalCustom?.template ?? DEFAULT_TEMPLATES[name] ?? "");
      setIsProjectOverride(false);
    }
  }

  // ── Toggle ──

  async function toggleEval(evalName: string) {
    if (!selectedProject) return;
    const config = projectConfigs.find((c) => c.evalName === evalName);
    const currentEnabled = config ? config.enabled : true;
    try {
      await fetch("/api/eval-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProject, evalName, enabled: !currentEnabled }),
      });
      await loadProjectConfig(selectedProject);
    } catch {}
  }

  function isEnabled(name: string): boolean {
    const c = projectConfigs.find((c) => c.evalName === name);
    return c ? c.enabled : true;
  }

  // ── Save ──

  async function handleSaveGlobal() {
    if (!selectedEval) return;
    setSaving(true);
    try {
      await fetch("/api/eval-prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedEval,
          evalType: editEvalType,
          template: editTemplate,
          ruleConfig: editEvalType === "code_rule" ? editRuleConfig : undefined,
          isCustom: !BUILT_IN_EVALS.includes(selectedEval),
        }),
      });
      setDirty(false);
      await loadAll();
    } catch {}
    setSaving(false);
  }

  async function handleSaveProject() {
    if (!selectedEval || !selectedProject) return;
    setSaving(true);
    try {
      await fetch("/api/eval-config", {
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
      await loadProjectConfig(selectedProject);
    } catch {}
    setSaving(false);
  }

  async function handleClearOverride() {
    if (!selectedEval || !selectedProject) return;
    try {
      await fetch("/api/eval-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProject,
          evalName: selectedEval,
          template: null,
        }),
      });
      setIsProjectOverride(false);
      await loadProjectConfig(selectedProject);
      // Reload with global template
      const globalCustom = globalPrompts.find((p) => p.name === selectedEval);
      setEditTemplate(globalCustom?.template ?? DEFAULT_TEMPLATES[selectedEval] ?? "");
      setDirty(false);
    } catch {}
  }

  async function handleResetDefault() {
    if (!selectedEval || !DEFAULT_TEMPLATES[selectedEval]) return;
    setEditTemplate(DEFAULT_TEMPLATES[selectedEval]);
    setDirty(true);
  }

  async function handleDelete() {
    if (!selectedEval) return;
    if (!confirm(`Delete "${selectedEval}"?`)) return;
    try {
      await fetch(`/api/eval-prompts?name=${encodeURIComponent(selectedEval)}`, { method: "DELETE" });
      setSelectedEval(null);
      await loadAll();
    } catch {}
  }

  async function handleCreate() {
    const name = newName.trim().toLowerCase().replace(/\s+/g, "_");
    if (!name) return;
    try {
      await fetch("/api/eval-prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          evalType: newType,
          template: newType === "llm_prompt" ? NEW_EVAL_TEMPLATE : "",
          ruleConfig: newType === "code_rule" ? DEFAULT_RULE_CONFIG : undefined,
          isCustom: true,
        }),
      });
      setNewName("");
      setNewType("llm_prompt");
      setCreating(false);
      await loadAll();
      selectEval(name);
    } catch {}
  }

  // ── Test ──

  async function handleTest() {
    if (!editTemplate) return;
    setTesting(true);
    setTestResult(null);
    try {
      const prompt = editTemplate
        .replace(/\{context\}/g, testContext || "(no context)")
        .replace(/\{response\}/g, testResponse || "(no response)")
        .replace(/\{query\}/g, testQuery || "(no query)");
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], temperature: 0 }),
      });
      const data = await res.json();
      const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
      setTestResult({ label: parsed.label ?? "", score: parsed.score ?? 0, explanation: parsed.explanation ?? "" });
    } catch (e) {
      setTestResult({ label: "error", score: 0, explanation: String(e) });
    }
    setTesting(false);
  }

  // ── Derived ──

  const isBuiltIn = selectedEval ? BUILT_IN_EVALS.includes(selectedEval) : false;
  const hasProjectOverride = projectConfigs.some((c) => c.evalName === selectedEval && c.template);

  if (loading) return <LoadingState className="flex-1" />;

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── Left: Project list ── */}
      <div className="flex w-56 shrink-0 flex-col border-r">
        <div className="px-3 pt-3 pb-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Projects</p>
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          {projects.map((p) => (
            <button
              key={p.name}
              onClick={() => { setSelectedProject(p.name); setSelectedEval(null); }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-left transition-colors",
                selectedProject === p.name ? "bg-accent font-medium" : "hover:bg-accent/50 text-muted-foreground",
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Center: Active Evals ── */}
      <div className="flex w-64 shrink-0 flex-col border-r">
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Active Evaluations
          </p>
        </div>

        {selectedProject ? (
          <div className="flex-1 overflow-y-auto">
            {/* Built-in */}
            <div className="px-2 pt-1">
              {BUILT_IN_EVALS.map((name) => {
                const enabled = isEnabled(name);
                const hasOverride = projectConfigs.some((c) => c.evalName === name && c.template);
                return (
                  <div
                    key={name}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-2 transition-colors",
                      selectedEval === name ? "bg-accent" : "hover:bg-accent/40",
                    )}
                  >
                    {/* Toggle */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleEval(name); }}
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                        enabled ? "border-foreground bg-foreground" : "border-muted-foreground/30",
                      )}
                    >
                      {enabled && <Check className="size-2.5 text-background" />}
                    </button>
                    {/* Name + select */}
                    <button
                      onClick={() => selectEval(name)}
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
                            t === "code_rule" ? "bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
                              : t === "builtin" ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                              : "bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                          )}>
                            {t === "code_rule" ? "rule" : t === "builtin" ? "built-in" : "llm"}
                          </span>
                        );
                      })()}
                      <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Custom evals */}
            {globalPrompts.filter((p) => p.isCustom && !BUILT_IN_EVALS.includes(p.name)).length > 0 && (
              <>
                <div className="px-3 pt-3 pb-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Custom</p>
                </div>
                <div className="px-2">
                  {globalPrompts.filter((p) => p.isCustom && !BUILT_IN_EVALS.includes(p.name)).map((p) => {
                    const enabled = isEnabled(p.name);
                    return (
                      <div
                        key={p.name}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-2 transition-colors",
                          selectedEval === p.name ? "bg-accent" : "hover:bg-accent/40",
                        )}
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleEval(p.name); }}
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                            enabled ? "border-foreground bg-foreground" : "border-muted-foreground/30",
                          )}
                        >
                          {enabled && <Check className="size-2.5 text-background" />}
                        </button>
                        <button onClick={() => selectEval(p.name)} className="flex flex-1 items-center gap-1.5 text-left min-w-0">
                          <span className={cn("text-sm flex-1 truncate", !enabled && "text-muted-foreground")}>{p.name}</span>
                          <span className={cn(
                            "shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase",
                            p.evalType === "code_rule" ? "bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
                              : "bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                          )}>
                            {p.evalType === "code_rule" ? "rule" : "llm"}
                          </span>
                          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                        </button>
                      </div>
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
                onClick={() => { setCreating(true); setSelectedEval(null); setNewName(""); setNewType("llm_prompt"); }}
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
      </div>

      {/* ── Right: Prompt editor ── */}
      <div className="flex-1 overflow-y-auto">
        {creating && !selectedEval ? (
          /* ── Create new eval form ── */
          <div className="mx-auto max-w-lg p-8">
            <h1 className="text-xl font-bold mb-1">New Evaluation</h1>
            <p className="text-sm text-muted-foreground mb-6">Create a custom evaluation to run on your agent traces.</p>

            <div className="space-y-5">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Name</label>
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
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Type</label>
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

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className="flex-1"
                >
                  Create Evaluation
                </Button>
                <Button variant="ghost" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        ) : !selectedEval ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <FlaskConical className="size-12 opacity-15" />
            <p className="text-sm">Select an evaluation to edit its prompt</p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl p-6">
            {/* Header */}
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h1 className="text-lg font-bold tracking-tight">{selectedEval}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isProjectOverride ? (
                    <span>Project override for <span className="font-semibold">{selectedProject}</span></span>
                  ) : (
                    <span>Global default {isBuiltIn ? "(built-in)" : "(custom)"}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {isProjectOverride && (
                  <Button size="sm" variant="ghost" onClick={handleClearOverride} className="gap-1 text-xs">
                    <X className="size-3" /> Remove Override
                  </Button>
                )}
                {isBuiltIn && !isProjectOverride && (
                  <Button size="sm" variant="ghost" onClick={handleResetDefault} className="gap-1 text-xs">
                    <RotateCcw className="size-3" /> Reset Default
                  </Button>
                )}
                {!isBuiltIn && (
                  <Button size="sm" variant="ghost" onClick={handleDelete} className="gap-1 text-xs text-red-600">
                    <Trash2 className="size-3" /> Delete
                  </Button>
                )}
              </div>
            </div>

            {/* Scope selector */}
            <div className="mb-4 flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
              <span className="text-xs text-muted-foreground">Save to:</span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={!isProjectOverride ? "default" : "ghost"}
                  onClick={() => {
                    if (isProjectOverride) handleClearOverride();
                  }}
                  className="h-6 text-[11px] px-2"
                >
                  Global (all projects)
                </Button>
                <Button
                  size="sm"
                  variant={isProjectOverride ? "default" : "ghost"}
                  onClick={() => setIsProjectOverride(true)}
                  className="h-6 text-[11px] px-2"
                >
                  {selectedProject} only
                </Button>
              </div>
              {dirty && (
                <Button
                  size="sm"
                  onClick={isProjectOverride ? handleSaveProject : handleSaveGlobal}
                  disabled={saving}
                  className="ml-auto h-6 text-[11px] px-3"
                >
                  {saving ? "Saving..." : "Save"}
                </Button>
              )}
            </div>

            {/* Type badge */}
            <div className="mb-4 flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Type:</span>
              <span className={cn(
                "rounded px-2 py-0.5 text-[10px] font-bold uppercase",
                editEvalType === "llm_prompt" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                editEvalType === "code_rule" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              )}>
                {editEvalType === "llm_prompt" ? "LLM Prompt" : editEvalType === "code_rule" ? "Code Rule" : "Built-in"}
              </span>
              {editEvalType === "builtin" && (
                <span className="text-[10px] text-muted-foreground">
                  Phoenix evaluator — override with custom prompt below
                </span>
              )}
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
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Prompt Template
                  </label>
                  <span className="text-[10px] text-muted-foreground">
                    Placeholders: <code className="rounded bg-muted px-1">{"{context}"}</code>{" "}
                    <code className="rounded bg-muted px-1">{"{response}"}</code>{" "}
                    <code className="rounded bg-muted px-1">{"{query}"}</code>
                  </span>
                </div>
                <Textarea
                  value={editTemplate}
                  onChange={(e) => { setEditTemplate(e.target.value); setDirty(true); }}
                  rows={14}
                  className="font-mono text-xs leading-relaxed"
                />
              </div>
            )}

            {/* Test panel */}
            <div className="rounded-lg border p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <Play className="size-3.5" /> Test
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

              {testResult && (
                <div className="rounded-md border bg-muted/20 p-3 flex items-center gap-3 text-sm">
                  <span className={cn(
                    "rounded px-2 py-0.5 text-xs font-bold",
                    testResult.label === "error" ? "bg-red-100 text-red-700"
                      : testResult.score <= 0.3 ? "bg-emerald-100 text-emerald-700"
                      : testResult.score >= 0.6 ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  )}>
                    {testResult.label}
                  </span>
                  <span className="tabular-nums font-mono text-xs">{testResult.score.toFixed(2)}</span>
                  <span className="text-xs text-muted-foreground flex-1">{testResult.explanation}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
