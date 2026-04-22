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
  RefreshCw,
} from "lucide-react";
import { RuleBuilder, DEFAULT_RULE_CONFIG, type RuleConfig } from "@/components/rule-builder";
import { PromptBuilder, parsePromptToConfig, generatePromptMessages } from "@/components/prompt-builder";
import { DateRangePicker, getPresetRange, type DateRange } from "@/components/ui/date-range-picker";
import { refreshBadgeLabels } from "@/components/annotation-badge";
import { ModelSelector } from "@/components/model-selector";

// ─── Types ─────────────────────────────────────────────────────────────────

interface EvalPrompt {
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


const NEW_EVAL_TEMPLATE = `You are an expert AI response evaluator.

Evaluate the quality of the RESPONSE based on the given CONTEXT and QUERY.
Consider accuracy, relevance, completeness, and faithfulness to the provided context.

CONTEXT:
{context}

QUERY:
{query}

RESPONSE:
{response}

Scoring:
- 1.0: Excellent — accurate, relevant, complete, and well-grounded
- 0.7-0.9: Good — mostly accurate with minor issues
- 0.4-0.6: Fair — partially correct but has notable gaps or inaccuracies
- 0.1-0.3: Poor — mostly incorrect or irrelevant
- 0.0: Completely wrong or off-topic

Respond with JSON only: {{"label": "pass" or "fail", "score": 0.0-1.0, "explanation": "one line"}}`;

// ─── Component ─────────────────────────────────────────────────────────────

export function EvaluationsManager() {
  // Data
  const [projects, setProjects] = useState<Project[]>([]);
  const [globalPrompts, setGlobalPrompts] = useState<EvalPrompt[]>([]);
  const [projectConfigs, setProjectConfigs] = useState<ProjectEvalConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection
  const [selectedProject, setSelectedProjectState] = useState<string | null>(null);
  const setSelectedProject = (name: string | null) => {
    setSelectedProjectState(name);
    if (name) localStorage.setItem("last_eval_project", name);
  };
  const [selectedEval, setSelectedEval] = useState<string | null>(null);

  // Editor
  const [editTemplate, setEditTemplate] = useState("");
  const [editEvalType, setEditEvalType] = useState<string>("llm_prompt");
  const [editRuleConfig, setEditRuleConfig] = useState<RuleConfig>(DEFAULT_RULE_CONFIG);
  const [editBadgeLabel, setEditBadgeLabel] = useState("");
  const [editModel, setEditModel] = useState("gpt-4o-mini");
  const [isProjectOverride, setIsProjectOverride] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // New eval
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<string>("llm_prompt");
  const [defaultEvalModel, setDefaultEvalModel] = useState("gpt-4o-mini");
  const [newEvalModel, setNewEvalModel] = useState("gpt-4o-mini");

  // Test & Backfill tabs
  const [testTab, setTestTab] = useState<"test" | "backfill">("test");

  // Test
  const [testContext, setTestContext] = useState("The Eiffel Tower is located in Paris, France. It was constructed in 1889 and stands 330 meters tall. It was designed by Gustave Eiffel's engineering company.");
  const [testQuery, setTestQuery] = useState("How tall is the Eiffel Tower and where is it located?");
  const [testResponse, setTestResponse] = useState("The Eiffel Tower is 330 meters tall and is located in Paris, France. It was built in 1889 by Gustave Eiffel.");
  const [testResult, setTestResult] = useState<{ label: string; score: number; explanation: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // Backfill
  const [backfillRange, setBackfillRange] = useState<DateRange>(() => getPresetRange(7));
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ evaluated: number; skipped: number; total: number } | null>(null);

  // All eval names
  const allEvalNames = [
    ...BUILT_IN_EVALS,
    ...globalPrompts.filter((p) => p.isCustom && !BUILT_IN_EVALS.includes(p.name)).map((p) => p.name),
  ];

  // ── Load ──

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const ps = await fetchProjects();
      setProjects(ps);
      if (ps.length > 0 && !selectedProject) {
        const saved = localStorage.getItem("last_eval_project");
        const initial = saved && ps.some((p) => p.name === saved) ? saved : ps[0].name;
        setSelectedProjectState(initial);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProjectConfig = useCallback(async (pid: string) => {
    try {
      const [configRes, promptsRes] = await Promise.all([
        fetch(`/api/eval-config?projectId=${encodeURIComponent(pid)}`).then((r) => r.json()),
        fetch(`/api/eval-prompts?projectId=${encodeURIComponent(pid)}`).then((r) => r.json()),
      ]);
      setProjectConfigs(configRes.configs ?? []);
      setGlobalPrompts(promptsRes.prompts ?? []);
    } catch {}
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { if (selectedProject) loadProjectConfig(selectedProject); }, [selectedProject, loadProjectConfig]);
  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((data) => {
      if (data.defaultEvalModel) {
        setDefaultEvalModel(data.defaultEvalModel);
        setNewEvalModel(data.defaultEvalModel);
      }
    }).catch(() => {});
  }, []);

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
    setEditBadgeLabel(globalCustom?.badgeLabel ?? "");
    setEditModel(globalCustom?.model || defaultEvalModel);

    // Load rule config
    if (evalType === "code_rule") {
      try {
        const saved = globalCustom?.ruleConfig ? JSON.parse(globalCustom.ruleConfig) : null;
        setEditRuleConfig(saved?.rules ? saved : DEFAULT_RULE_CONFIG);
      } catch {
        setEditRuleConfig(DEFAULT_RULE_CONFIG);
      }
    }

    // Load template: project override → global custom → built-in default
    if (projectConfig?.template) {
      setEditTemplate(projectConfig.template);
      setIsProjectOverride(true);
    } else {
      setEditTemplate(globalCustom?.template ?? "");
      setIsProjectOverride(false);
    }
  }

  // ── Toggle ──

  async function toggleEval(evalName: string) {
    if (!selectedProject) return;
    const config = projectConfigs.find((c) => c.evalName === evalName);
    const currentEnabled = config ? config.enabled : true;
    const newEnabled = !currentEnabled;

    // Optimistic update — immediately reflect in UI
    setProjectConfigs((prev) => {
      const exists = prev.some((c) => c.evalName === evalName);
      if (exists) {
        return prev.map((c) => (c.evalName === evalName ? { ...c, enabled: newEnabled } : c));
      }
      return [...prev, { id: `temp-${evalName}`, projectId: selectedProject, evalName, enabled: newEnabled, template: null }];
    });

    try {
      await fetch("/api/eval-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProject, evalName, enabled: newEnabled }),
      });
    } catch {}
    // Sync with server
    loadProjectConfig(selectedProject);
  }

  function isEnabled(name: string): boolean {
    const c = projectConfigs.find((c) => c.evalName === name);
    if (c) return c.enabled;
    // Built-in evals default to enabled, custom evals default to disabled
    return BUILT_IN_EVALS.includes(name);
  }

  // ── Save ──

  async function handleSaveGlobal() {
    if (!selectedEval) return;
    setSaving(true);
    const isCustom = !BUILT_IN_EVALS.includes(selectedEval);
    try {
      await fetch("/api/eval-prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedEval,
          projectId: isCustom ? null : null,
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
      if (selectedProject) await loadProjectConfig(selectedProject);
      refreshBadgeLabels();
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
      setEditTemplate(globalCustom?.template ?? "");
      setDirty(false);
    } catch {}
  }

  async function handleResetDefault() {
    if (!selectedEval) return;
    // Reload original template from DB
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
      await fetch(`/api/eval-prompts?name=${encodeURIComponent(selectedEval)}`, { method: "DELETE" });
      if (deleteAnnotations) {
        for (const p of projects) {
          try {
            await fetch(`/api/phoenix?path=${encodeURIComponent(`/v1/projects/${p.name}/span_annotations`)}`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: selectedEval }),
            });
          } catch {}
        }
      }
      setSelectedEval(null);
      await loadProjectConfig(selectedProject);
    } catch {}
  }

  async function handleBackfill() {
    if (!selectedEval || !selectedProject) return;
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await fetch("/api/eval-backfill", {
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
    } catch (e) {
      setBackfillResult({ evaluated: 0, skipped: 0, total: 0 });
    }
    setBackfilling(false);
  }

  async function handleCreate() {
    const name = newName.trim().toLowerCase().replace(/\s+/g, "_");
    if (!name || !selectedProject) return;
    try {
      // Create globally (visible to all projects)
      await fetch("/api/eval-prompts", {
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
      // Enable only for the current project
      await fetch("/api/eval-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProject, evalName: name, enabled: true }),
      });
      setNewName("");
      setNewType("llm_prompt");
      setNewEvalModel(defaultEvalModel);
      setCreating(false);
      await loadProjectConfig(selectedProject);
      setSelectedEval(name);
      setEditEvalType(newType);
      setEditTemplate(newType === "llm_prompt" ? NEW_EVAL_TEMPLATE : "");
      setEditRuleConfig(newType === "code_rule" ? DEFAULT_RULE_CONFIG : DEFAULT_RULE_CONFIG);
      setEditModel(newEvalModel);
      setIsProjectOverride(false);
      setDirty(false);
      setTestResult(null);
    } catch {}
  }

  // ── Test ──

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

      // Try to parse config for system/user split; fallback to single user message
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

      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages, temperature: 0 }),
      });
      const data = await res.json();
      const result = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
      // Binary mode: no score in response, derive from label
      const isBinary = result.score === undefined;
      const PASS_LABELS = ["pass", "true", "yes", "correct", "factual", "faithful", "appropriate", "clean", "relevant"];
      const score = isBinary
        ? (PASS_LABELS.includes(String(result.label).toLowerCase()) ? 1.0 : 0.0)
        : (result.score ?? 0);
      setTestResult({ label: result.label ?? "", score, explanation: result.explanation ?? "" });
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
                            p.evalType === "code_rule" ? "bg-muted text-muted-foreground"
                              : "bg-foreground text-background"
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

              {newType === "llm_prompt" && (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Eval Model</label>
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
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl p-6">
            {/* Header */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <h1 className="text-lg font-bold tracking-tight">{selectedEval}</h1>
                  <span className={cn(
                    "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                    editEvalType === "llm_prompt" ? "bg-foreground/8 text-foreground/60" :
                    editEvalType === "code_rule" ? "bg-foreground/8 text-foreground/60" :
                    "bg-foreground/8 text-foreground/60"
                  )}>
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

            {/* Backfill — run on existing traces */}
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
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Eval Model</span>
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
              {testResult && (() => {
                const PASS_LABELS = ["pass", "true", "yes", "correct", "factual", "faithful", "appropriate", "clean", "relevant"];
                const isPass = PASS_LABELS.includes(String(testResult.label).toLowerCase()) || testResult.score >= 0.5;
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
        )}
      </div>
    </div>
  );
}
