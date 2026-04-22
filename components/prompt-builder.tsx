"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  Eye,
  Pencil,
  GripVertical,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────

export interface ScoreRange {
  id: string;
  min: number;
  max: number;
  label: string;
  meaning: string;
}

export interface EvalFormConfig {
  role: string;
  task: string;
  criteria: string[];
  inputFields: ("context" | "query" | "response")[];
  outputMode: "score" | "binary";
  scoreRanges: ScoreRange[];
  passLabel: string;
  failLabel: string;
  passThreshold: number;
  badgeLabel: string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────

const DEFAULT_SCORE_RANGES: ScoreRange[] = [
  { id: "1", min: 0.0, max: 0.0, label: "Completely wrong", meaning: "Completely wrong or off-topic" },
  { id: "2", min: 0.1, max: 0.3, label: "Poor", meaning: "Mostly incorrect or irrelevant" },
  { id: "3", min: 0.4, max: 0.6, label: "Fair", meaning: "Partially correct but has notable gaps" },
  { id: "4", min: 0.7, max: 0.9, label: "Good", meaning: "Mostly accurate with minor issues" },
  { id: "5", min: 1.0, max: 1.0, label: "Excellent", meaning: "Accurate, relevant, complete" },
];


export const DEFAULT_FORM_CONFIG: EvalFormConfig = {
  role: "AI response evaluator",
  task: "Evaluate the quality of the RESPONSE based on the given CONTEXT and QUERY.\nConsider accuracy, relevance, completeness, and faithfulness to the provided context.",
  criteria: [],
  inputFields: ["context", "query", "response"],
  outputMode: "score",
  scoreRanges: DEFAULT_SCORE_RANGES,
  passLabel: "pass",
  failLabel: "fail",
  passThreshold: 0.5,
  badgeLabel: "",
};

// ─── Generate prompt from config ──────────────────────────────────────────

/** Split prompt into system (role + task + criteria) and user (data + scoring) parts */
export function generatePromptMessages(config: EvalFormConfig): { system: string; user: string } {
  // System: role + task — this is the instruction the LLM must follow
  const sysLines: string[] = [];
  sysLines.push(`You are an expert ${config.role}.`);
  if (config.task) {
    sysLines.push("");
    sysLines.push("## YOUR EVALUATION RULE (MUST FOLLOW):");
    sysLines.push(config.task);
    sysLines.push("");
    sysLines.push("You MUST follow the above rule exactly. Do NOT override it based on the content.");
  }

  // User: data + output format
  const userLines: string[] = [];
  if (config.inputFields.includes("context")) {
    userLines.push("CONTEXT:");
    userLines.push("{context}");
    userLines.push("");
  }
  if (config.inputFields.includes("query")) {
    userLines.push("QUERY:");
    userLines.push("{query}");
    userLines.push("");
  }
  if (config.inputFields.includes("response")) {
    userLines.push("RESPONSE:");
    userLines.push("{response}");
    userLines.push("");
  }

  if (config.outputMode === "score") {
    userLines.push("Scoring:");
    const sorted = [...config.scoreRanges].sort((a, b) => b.max - a.max);
    for (const range of sorted) {
      const rangeStr = range.min === range.max
        ? range.min.toFixed(1)
        : `${range.min.toFixed(1)}-${range.max.toFixed(1)}`;
      userLines.push(`- ${rangeStr}: ${range.label} — ${range.meaning}`);
    }
    userLines.push("");
    userLines.push(
      `Respond with JSON only: {{"label": "${config.passLabel}" or "${config.failLabel}", "score": 0.0-1.0, "explanation": "one line"}}`,
    );
  } else {
    userLines.push(`Answer "${config.passLabel}" or "${config.failLabel}" only.`);
    userLines.push("");
    userLines.push(
      `Respond with JSON only: {{"label": "${config.passLabel}" or "${config.failLabel}", "explanation": "one line"}}`,
    );
  }

  return { system: sysLines.join("\n"), user: userLines.join("\n") };
}

export function generatePromptFromConfig(config: EvalFormConfig): string {
  const lines: string[] = [];

  lines.push(`You are an expert ${config.role}.`);
  if (config.task) {
    lines.push("");
    lines.push(config.task);
  }
  lines.push("");

  if (config.inputFields.includes("context")) {
    lines.push("CONTEXT:");
    lines.push("{context}");
    lines.push("");
  }
  if (config.inputFields.includes("query")) {
    lines.push("QUERY:");
    lines.push("{query}");
    lines.push("");
  }
  if (config.inputFields.includes("response")) {
    lines.push("RESPONSE:");
    lines.push("{response}");
    lines.push("");
  }

  if (config.outputMode === "score") {
    lines.push("Scoring:");
    const sorted = [...config.scoreRanges].sort((a, b) => b.max - a.max);
    for (const range of sorted) {
      const rangeStr = range.min === range.max
        ? range.min.toFixed(1)
        : `${range.min.toFixed(1)}-${range.max.toFixed(1)}`;
      lines.push(`- ${rangeStr}: ${range.label} — ${range.meaning}`);
    }
    lines.push("");
    lines.push(
      `Respond with JSON only: {{"label": "${config.passLabel}" or "${config.failLabel}", "score": 0.0-1.0, "explanation": "one line"}}`,
    );
  } else {
    lines.push(`Answer "${config.passLabel}" or "${config.failLabel}" only.`);
    lines.push("");
    lines.push(
      `Respond with JSON only: {{"label": "${config.passLabel}" or "${config.failLabel}", "explanation": "one line"}}`,
    );
  }

  return lines.join("\n");
}

// ─── Parse existing prompt into config (best-effort) ──────────────────────

export function parsePromptToConfig(template: string): EvalFormConfig | null {
  if (!template.trim()) return null;

  try {
    const config: EvalFormConfig = { ...DEFAULT_FORM_CONFIG };

    // Extract role
    const roleMatch = template.match(/You are an expert (.+?)\./);
    if (roleMatch) config.role = roleMatch[1];

    // Extract input fields
    config.inputFields = [];
    if (template.includes("{context}")) config.inputFields.push("context");
    if (template.includes("{query}")) config.inputFields.push("query");
    if (template.includes("{response}")) config.inputFields.push("response");

    // Detect output mode: if "score" appears in JSON format line, it's score mode
    const hasScoreInJson = /"score":\s*0\.0-1\.0/.test(template);
    config.outputMode = hasScoreInJson ? "score" : "binary";

    // Extract labels
    const labelMatch = template.match(/"label":\s*"(\w+)"\s*or\s*"(\w+)"/);
    if (labelMatch) {
      config.passLabel = labelMatch[1];
      config.failLabel = labelMatch[2];
    }

    // Extract score ranges
    const scoreLines = template.match(/^- [\d.]+(?:-[\d.]+)?: .+/gm);
    if (scoreLines && scoreLines.length > 0) {
      config.scoreRanges = scoreLines.map((line, i) => {
        const m = line.match(/^- ([\d.]+)(?:-([\d.]+))?: (.+?)(?:\s*—\s*(.+))?$/);
        if (!m) return DEFAULT_SCORE_RANGES[i] ?? { id: String(i), min: 0, max: 1, label: line, meaning: "" };
        return {
          id: String(i + 1),
          min: parseFloat(m[1]),
          max: m[2] ? parseFloat(m[2]) : parseFloat(m[1]),
          label: m[3].trim(),
          meaning: m[4]?.trim() ?? "",
        };
      });
    }

    // Extract task — all lines between role and first data field
    const allLines = template.split("\n");
    const taskParts: string[] = [];
    let inTask = false;
    for (const line of allLines) {
      if (line.startsWith("You are an expert")) { inTask = true; continue; }
      if (["CONTEXT:", "QUERY:", "RESPONSE:", "Scoring:", "Answer "].some((p) => line.startsWith(p))) break;
      if (line.startsWith("Respond with")) break;
      if (line.startsWith("- ") && line.match(/^- [\d.]/)) break;
      if (inTask) taskParts.push(line);
    }
    const taskText = taskParts.join("\n").trim();
    if (taskText) config.task = taskText;

    return config;
  } catch {
    return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────

interface PromptBuilderProps {
  template: string;
  evalName: string;
  badgeLabel?: string;
  onChange: (template: string) => void;
  onBadgeLabelChange?: (label: string) => void;
}

export function PromptBuilder({ template, evalName, badgeLabel = "", onChange, onBadgeLabelChange }: PromptBuilderProps) {
  const [mode, setMode] = useState<"form" | "raw">("form");
  const [config, setConfig] = useState<EvalFormConfig>(() => {
    return parsePromptToConfig(template) ?? DEFAULT_FORM_CONFIG;
  });
  const [lastExternalTemplate, setLastExternalTemplate] = useState(template);

  // Re-initialize only when template changes externally (not from our own onChange)
  if (template !== lastExternalTemplate) {
    const generated = generatePromptFromConfig(config);
    if (template !== generated) {
      const parsed = parsePromptToConfig(template);
      if (parsed) setConfig(parsed);
    }
    setLastExternalTemplate(template);
  }

  const updateConfig = useCallback(
    (partial: Partial<EvalFormConfig>) => {
      setConfig((prev) => {
        const next = { ...prev, ...partial };
        // Schedule onChange to avoid setState-during-render
        queueMicrotask(() => onChange(generatePromptFromConfig(next)));
        return next;
      });
    },
    [onChange],
  );

  // ── Score range helpers ──

  function addScoreRange() {
    const id = String(Date.now());
    updateConfig({
      scoreRanges: [
        ...config.scoreRanges,
        { id, min: 0, max: 0, label: "", meaning: "" },
      ],
    });
  }

  function updateScoreRange(id: string, partial: Partial<ScoreRange>) {
    updateConfig({
      scoreRanges: config.scoreRanges.map((r) =>
        r.id === id ? { ...r, ...partial } : r,
      ),
    });
  }

  function removeScoreRange(id: string) {
    if (config.scoreRanges.length <= 2) return;
    updateConfig({
      scoreRanges: config.scoreRanges.filter((r) => r.id !== id),
    });
  }

  // ── Criteria helpers ──

  function toggleInputField(field: "context" | "query" | "response") {
    const fields = config.inputFields.includes(field)
      ? config.inputFields.filter((f) => f !== field)
      : [...config.inputFields, field];
    updateConfig({ inputFields: fields });
  }

  // ── Render ──

  if (mode === "raw") {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Prompt Template (Raw)
          </label>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const parsed = parsePromptToConfig(template);
              if (parsed) setConfig(parsed);
              setMode("form");
            }}
            className="gap-1.5 text-[11px] h-6"
          >
            <Eye className="size-3" /> Form View
          </Button>
        </div>
        <Textarea
          value={template}
          onChange={(e) => onChange(e.target.value)}
          rows={16}
          className="font-mono text-xs leading-relaxed"
        />
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Placeholders: <code className="rounded bg-muted px-1">{"{context}"}</code>{" "}
          <code className="rounded bg-muted px-1">{"{query}"}</code>{" "}
          <code className="rounded bg-muted px-1">{"{response}"}</code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Evaluation Config
        </label>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setMode("raw")}
          className="gap-1.5 text-[11px] h-6"
        >
          <Pencil className="size-3" /> Edit Raw Prompt
        </Button>
      </div>

      {/* ── Role & Task ── */}
      <div className="rounded-lg border p-4 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Evaluator Role
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">You are an expert</span>
          <Input
            value={config.role}
            onChange={(e) => updateConfig({ role: e.target.value })}
            className="h-8 text-xs flex-1"
            placeholder="AI response evaluator"
          />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
            Task Description
          </p>
          <Textarea
            value={config.task}
            onChange={(e) => updateConfig({ task: e.target.value })}
            rows={2}
            className="text-xs"
            placeholder="Evaluate the quality of the RESPONSE based on the given CONTEXT and QUERY."
          />
        </div>
      </div>

      {/* ── Input Fields ── */}
      <div className="rounded-lg border p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Input Fields
        </p>
        <div className="flex gap-2">
          {(["context", "query", "response"] as const).map((field) => {
            const active = config.inputFields.includes(field);
            return (
              <button
                key={field}
                onClick={() => toggleInputField(field)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-muted-foreground/20 text-muted-foreground hover:border-muted-foreground/40",
                )}
              >
                <code className="text-[10px]">{`{${field}}`}</code>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Select which data fields are included in the evaluation prompt.
        </p>
      </div>

      {/* ── Output Mode ── */}
      <div className="rounded-lg border p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Output Mode
        </p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            onClick={() => updateConfig({ outputMode: "score" })}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors",
              config.outputMode === "score" ? "border-foreground bg-accent" : "hover:bg-accent/50",
            )}
          >
            <p className="text-sm font-semibold">Score (0.0 - 1.0)</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Returns a numeric score with label. Best for nuanced quality assessment.
            </p>
          </button>
          <button
            onClick={() => updateConfig({ outputMode: "binary" })}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors",
              config.outputMode === "binary" ? "border-foreground bg-accent" : "hover:bg-accent/50",
            )}
          >
            <p className="text-sm font-semibold">Binary (True / False)</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Returns pass or fail only. Best for clear-cut checks.
            </p>
          </button>
        </div>

        {/* Labels */}
        <div className={cn("grid gap-3", config.outputMode === "score" ? "grid-cols-3" : "grid-cols-2")}>
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">
              {config.outputMode === "binary" ? "True Label" : "Pass Label"}
            </label>
            <Input
              value={config.passLabel}
              onChange={(e) => updateConfig({ passLabel: e.target.value })}
              className="h-8 text-xs"
              placeholder={config.outputMode === "binary" ? "true" : "pass"}
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">
              {config.outputMode === "binary" ? "False Label" : "Fail Label"}
            </label>
            <Input
              value={config.failLabel}
              onChange={(e) => updateConfig({ failLabel: e.target.value })}
              className="h-8 text-xs"
              placeholder={config.outputMode === "binary" ? "false" : "fail"}
            />
          </div>
          {config.outputMode === "score" && (
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Pass Threshold</label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={config.passThreshold}
                onChange={(e) =>
                  updateConfig({ passThreshold: parseFloat(e.target.value) || 0.5 })
                }
                className="h-8 text-xs tabular-nums"
              />
            </div>
          )}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          {config.outputMode === "score"
            ? `Returns score 0.0-1.0. Scores above ${config.passThreshold} → "${config.passLabel}", below → "${config.failLabel}".`
            : `Returns "${config.passLabel}" or "${config.failLabel}" with explanation.`}
        </p>
      </div>

      {/* ── Score Ranges (only for score mode) ── */}
      {config.outputMode === "score" && (
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Score Ranges
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={addScoreRange}
              className="h-6 text-[11px] gap-1"
            >
              <Plus className="size-3" /> Add Range
            </Button>
          </div>

          {/* Visual score bar */}
          <div className="mb-4 h-3 flex rounded-full overflow-hidden border">
            {[...config.scoreRanges]
              .sort((a, b) => a.min - b.min)
              .map((range, i) => {
                const width = ((range.max - range.min + 0.1) / 1.1) * 100;
                const shades = [
                  "bg-neutral-900 dark:bg-neutral-100",
                  "bg-neutral-700 dark:bg-neutral-300",
                  "bg-neutral-500",
                  "bg-neutral-300 dark:bg-neutral-700",
                  "bg-neutral-100 dark:bg-neutral-900",
                ];
                return (
                  <div
                    key={range.id}
                    className={cn("h-full", shades[i % shades.length])}
                    style={{ width: `${Math.max(width, 5)}%` }}
                    title={`${range.min.toFixed(1)}-${range.max.toFixed(1)}: ${range.label}`}
                  />
                );
              })}
          </div>

          {/* Range rows */}
          <div className="space-y-2">
            {[...config.scoreRanges]
              .sort((a, b) => b.max - a.max)
              .map((range) => (
                <div
                  key={range.id}
                  className="flex items-center gap-2 rounded-md border bg-muted/10 px-3 py-2"
                >
                  <GripVertical className="size-3 text-muted-foreground/30 shrink-0" />
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={range.min}
                    onChange={(e) =>
                      updateScoreRange(range.id, { min: parseFloat(e.target.value) || 0 })
                    }
                    className="h-7 w-16 text-xs text-center tabular-nums"
                  />
                  <span className="text-xs text-muted-foreground">-</span>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={range.max}
                    onChange={(e) =>
                      updateScoreRange(range.id, { max: parseFloat(e.target.value) || 0 })
                    }
                    className="h-7 w-16 text-xs text-center tabular-nums"
                  />
                  <Input
                    value={range.label}
                    onChange={(e) => updateScoreRange(range.id, { label: e.target.value })}
                    placeholder="Label"
                    className="h-7 w-28 text-xs"
                  />
                  <Input
                    value={range.meaning}
                    onChange={(e) => updateScoreRange(range.id, { meaning: e.target.value })}
                    placeholder="Description..."
                    className="h-7 flex-1 text-xs"
                  />
                  <button
                    onClick={() => removeScoreRange(range.id)}
                    disabled={config.scoreRanges.length <= 2}
                    className={cn(
                      "shrink-0 rounded p-1 transition-colors",
                      config.scoreRanges.length <= 2
                        ? "opacity-20 cursor-not-allowed"
                        : "hover:bg-muted",
                    )}
                  >
                    <Trash2 className="size-3 text-muted-foreground" />
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── Badge Preview ── */}
      <div className="rounded-lg border p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Badge Preview
        </p>
        <div className="flex items-center gap-4 mb-3">
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Short Name (max 4 chars)</label>
            <Input
              value={badgeLabel}
              onChange={(e) => {
                const v = e.target.value.toUpperCase().slice(0, 4);
                onBadgeLabelChange?.(v);
              }}
              placeholder={evalName.slice(0, 3).toUpperCase()}
              className="h-8 w-24 text-xs font-mono uppercase"
              maxLength={4}
            />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-muted-foreground mb-1 block">Preview</label>
            <div className="flex items-center gap-3">
              {/* Pass example */}
              <span className="inline-flex items-center overflow-hidden rounded text-[9px] font-mono tabular-nums leading-none border border-foreground/15">
                <span className="px-1.5 py-1 bg-foreground/5 text-foreground/50">
                  {badgeLabel || evalName.slice(0, 3).toUpperCase()}
                </span>
                {config.outputMode === "score" ? (
                  <span className="px-1.5 py-1 font-bold bg-foreground/10 text-foreground/70">85%</span>
                ) : (
                  <span className="px-1.5 py-1 font-bold bg-foreground/10 text-foreground/70">PASS</span>
                )}
              </span>
              <span className="text-[10px] text-muted-foreground">vs</span>
              {/* Fail example */}
              <span className="inline-flex items-center overflow-hidden rounded text-[9px] font-mono tabular-nums leading-none border-2 border-foreground">
                <span className="px-1.5 py-1 bg-foreground/10 text-foreground font-semibold">
                  {badgeLabel || evalName.slice(0, 3).toUpperCase()}
                </span>
                {config.outputMode === "score" ? (
                  <span className="px-1.5 py-1 font-bold bg-foreground text-background">0%</span>
                ) : (
                  <span className="px-1.5 py-1 font-bold bg-foreground text-background">FAIL</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Generated Prompt Preview ── */}
      <details className="rounded-lg border">
        <summary className="cursor-pointer px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted/20 transition-colors">
          Preview Generated Prompt
        </summary>
        <div className="border-t px-4 py-3">
          <pre className="whitespace-pre-wrap text-xs font-mono text-muted-foreground leading-relaxed">
            {generatePromptFromConfig(config)}
          </pre>
        </div>
      </details>
    </div>
  );
}
