"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──

export interface Rule {
  check: string;
  op: string;
  value: string;
  caseSensitive?: boolean;
}

export interface RuleConfig {
  rules: Rule[];
  logic: "any" | "all";
  match: { label: string; score: number };
  clean: { label: string; score: number };
}

// ── Constants ──

const CHECK_FIELDS = [
  { group: "Text", fields: [
    { value: "response", label: "Response" },
    { value: "query", label: "Query" },
    { value: "context", label: "Context" },
  ]},
  { group: "Tokens", fields: [
    { value: "total_tokens", label: "Total Tokens" },
    { value: "prompt_tokens", label: "Prompt Tokens" },
    { value: "completion_tokens", label: "Completion Tokens" },
  ]},
  { group: "Performance", fields: [
    { value: "latency_ms", label: "Latency (ms)" },
    { value: "cost", label: "Cost ($)" },
  ]},
  { group: "Meta", fields: [
    { value: "model_name", label: "Model Name" },
    { value: "status", label: "Status" },
    { value: "span_kind", label: "Span Kind" },
  ]},
];

const TEXT_FIELDS = new Set(["response", "query", "context", "model_name", "status", "span_kind"]);
const NUMBER_FIELDS = new Set(["total_tokens", "prompt_tokens", "completion_tokens", "latency_ms", "cost"]);

const TEXT_OPS = [
  { value: "contains_any", label: "contains any of" },
  { value: "not_contains_any", label: "does not contain" },
  { value: "matches_regex", label: "matches regex" },
  { value: "length_gt", label: "length >" },
  { value: "length_lt", label: "length <" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
];

const NUMBER_OPS = [
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "gte", label: ">=" },
  { value: "lte", label: "<=" },
  { value: "between", label: "between" },
  { value: "equals", label: "=" },
];

function getOpsForField(field: string) {
  if (NUMBER_FIELDS.has(field)) return NUMBER_OPS;
  return TEXT_OPS;
}

function needsValue(op: string): boolean {
  return !["is_empty", "is_not_empty"].includes(op);
}

// ── Component ──

interface RuleBuilderProps {
  config: RuleConfig;
  onChange: (config: RuleConfig) => void;
}

export function RuleBuilder({ config, onChange }: RuleBuilderProps) {
  function updateRule(idx: number, partial: Partial<Rule>) {
    const rules = [...config.rules];
    rules[idx] = { ...rules[idx], ...partial };
    // Reset op when check field changes type
    if (partial.check) {
      const newIsNumber = NUMBER_FIELDS.has(partial.check);
      const oldIsNumber = NUMBER_FIELDS.has(rules[idx].check);
      if (newIsNumber !== oldIsNumber) {
        rules[idx].op = newIsNumber ? "gt" : "contains_any";
        rules[idx].value = "";
      }
    }
    onChange({ ...config, rules });
  }

  function addRule() {
    onChange({
      ...config,
      rules: [...config.rules, { check: "response", op: "contains_any", value: "" }],
    });
  }

  function removeRule(idx: number) {
    const rules = config.rules.filter((_, i) => i !== idx);
    onChange({ ...config, rules: rules.length ? rules : [{ check: "response", op: "contains_any", value: "" }] });
  }

  return (
    <div className="space-y-4">
      {/* Rules */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Rules</label>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Logic:</span>
            <select
              value={config.logic}
              onChange={(e) => onChange({ ...config, logic: e.target.value as "any" | "all" })}
              className="h-6 rounded border bg-background px-1.5 text-[11px] outline-none"
            >
              <option value="any">ANY rule matches (OR)</option>
              <option value="all">ALL rules match (AND)</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          {config.rules.map((rule, idx) => {
            const ops = getOpsForField(rule.check);
            const showValue = needsValue(rule.op);
            const isText = TEXT_FIELDS.has(rule.check);

            return (
              <div key={idx} className="flex items-start gap-2 rounded-lg border bg-muted/20 p-2.5">
                <div className="flex-1 grid grid-cols-3 gap-2">
                  {/* Check field */}
                  <select
                    value={rule.check}
                    onChange={(e) => updateRule(idx, { check: e.target.value })}
                    className="h-8 rounded-md border bg-background px-2 text-xs outline-none"
                  >
                    {CHECK_FIELDS.map((group) => (
                      <optgroup key={group.group} label={group.group}>
                        {group.fields.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>

                  {/* Operator */}
                  <select
                    value={rule.op}
                    onChange={(e) => updateRule(idx, { op: e.target.value })}
                    className="h-8 rounded-md border bg-background px-2 text-xs outline-none"
                  >
                    {ops.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>

                  {/* Value */}
                  {showValue && (
                    <Input
                      value={rule.value}
                      onChange={(e) => updateRule(idx, { value: e.target.value })}
                      placeholder={rule.op === "contains_any" ? "word1, word2, ..." : rule.op === "between" ? "100,500" : "value"}
                      className="h-8 text-xs"
                    />
                  )}
                </div>

                {/* Case sensitive toggle (text only) */}
                {isText && showValue && (
                  <label className="flex items-center gap-1 shrink-0 pt-1.5">
                    <input
                      type="checkbox"
                      checked={rule.caseSensitive ?? false}
                      onChange={(e) => updateRule(idx, { caseSensitive: e.target.checked })}
                      className="size-3"
                    />
                    <span className="text-[10px] text-muted-foreground">Aa</span>
                  </label>
                )}

                {/* Remove */}
                <button onClick={() => removeRule(idx)} className="shrink-0 rounded p-1 hover:bg-muted mt-1">
                  <Trash2 className="size-3 text-muted-foreground" />
                </button>
              </div>
            );
          })}
        </div>

        <Button size="sm" variant="outline" onClick={addRule} className="mt-2 gap-1.5 text-xs w-full">
          <Plus className="size-3" /> Add Rule
        </Button>
      </div>

      {/* Results */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">When Matched</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground">Label</label>
              <Input
                value={config.match.label}
                onChange={(e) => onChange({ ...config, match: { ...config.match, label: e.target.value } })}
                className="h-7 text-xs"
                placeholder="detected"
              />
            </div>
            <div className="w-20">
              <label className="text-[10px] text-muted-foreground">Score</label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={config.match.score}
                onChange={(e) => onChange({ ...config, match: { ...config.match, score: parseFloat(e.target.value) || 0 } })}
                className="h-7 text-xs"
              />
            </div>
          </div>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">When Clean</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground">Label</label>
              <Input
                value={config.clean.label}
                onChange={(e) => onChange({ ...config, clean: { ...config.clean, label: e.target.value } })}
                className="h-7 text-xs"
                placeholder="clean"
              />
            </div>
            <div className="w-20">
              <label className="text-[10px] text-muted-foreground">Score</label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={config.clean.score}
                onChange={(e) => onChange({ ...config, clean: { ...config.clean, score: parseFloat(e.target.value) || 0 } })}
                className="h-7 text-xs"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Default config ──

export const DEFAULT_RULE_CONFIG: RuleConfig = {
  rules: [{ check: "response", op: "contains_any", value: "" }],
  logic: "any",
  match: { label: "detected", score: 1.0 },
  clean: { label: "clean", score: 0.0 },
};
