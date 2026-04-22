"use client";
import { apiFetch } from "@/lib/api-client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/empty-state";
import { CheckCircle, Loader2 } from "lucide-react";
import { ModelSelector } from "@/components/model-selector";

interface WorkerSettings {
  evalWorkerEnabled: string;
  evalPollInterval: string;
  evalMaxLlmPerTrace: string;
  defaultEvalModel: string;
}

const DEFAULTS: WorkerSettings = {
  evalWorkerEnabled: "true",
  evalPollInterval: "15",
  evalMaxLlmPerTrace: "5",
  defaultEvalModel: "gpt-4o-mini",
};

export function EvalWorkerSection() {
  const [settings, setSettings] = useState<WorkerSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/settings");
      const data = await res.json();
      setSettings({
        evalWorkerEnabled: data.evalWorkerEnabled ?? DEFAULTS.evalWorkerEnabled,
        evalPollInterval: data.evalPollInterval ?? DEFAULTS.evalPollInterval,
        evalMaxLlmPerTrace: data.evalMaxLlmPerTrace ?? DEFAULTS.evalMaxLlmPerTrace,
        defaultEvalModel: data.defaultEvalModel ?? DEFAULTS.defaultEvalModel,
      });
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function update(key: keyof WorkerSettings, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setDirty(false);
    } catch {}
    setSaving(false);
  }

  const isEnabled = settings.evalWorkerEnabled === "true";

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold tracking-tight">Eval Worker</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Configure the background worker that auto-evaluates new traces from Phoenix.
        </p>
      </div>

      {loading && <LoadingState />}

      {!loading && (
        <div className="space-y-8">
          {/* Worker Status */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                Status
              </h3>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="rounded-lg border bg-muted/5 px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">Worker</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      isEnabled ? "bg-[#10b981] text-white" : "bg-muted text-muted-foreground"
                    }`}>
                      {isEnabled ? "Running" : "Paused"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isEnabled
                      ? "Polling Phoenix projects for new traces to evaluate."
                      : "Worker is paused. No automatic evaluations will run."}
                  </p>
                </div>
                <button
                  onClick={() => update("evalWorkerEnabled", isEnabled ? "false" : "true")}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                    isEnabled ? "bg-foreground" : "bg-muted"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 translate-y-0.5 rounded-full bg-background shadow-sm transition-transform ${
                      isEnabled ? "translate-x-[22px]" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* Configuration */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                Configuration
              </h3>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-2">
              {/* Default Eval Model */}
              <div className="rounded-lg border px-5 py-4">
                <div className="flex items-center justify-between gap-6">
                  <div>
                    <p className="text-sm font-medium">Default Model</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Fallback model when an eval has no specific model set.
                    </p>
                  </div>
                  <div className="w-56 shrink-0">
                    <ModelSelector
                      value={settings.defaultEvalModel}
                      onChange={(m) => update("defaultEvalModel", m)}
                    />
                  </div>
                </div>
              </div>

              {/* Polling Interval */}
              <div className="rounded-lg border px-5 py-4">
                <div className="flex items-center justify-between gap-6">
                  <div>
                    <p className="text-sm font-medium">Polling Interval</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Seconds between checks for new traces. Lower = faster, higher = less load.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={5}
                      max={300}
                      value={settings.evalPollInterval}
                      onChange={(e) => update("evalPollInterval", e.target.value)}
                      className="w-20 text-center text-sm tabular-nums"
                    />
                    <span className="text-xs text-muted-foreground/60">sec</span>
                  </div>
                </div>
              </div>

              {/* Max LLM Evals Per Trace */}
              <div className="rounded-lg border px-5 py-4">
                <div className="flex items-center justify-between gap-6">
                  <div>
                    <p className="text-sm font-medium">Max LLM Evals / Trace</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Cap on LLM-based eval calls per trace to control API costs.
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={settings.evalMaxLlmPerTrace}
                    onChange={(e) => update("evalMaxLlmPerTrace", e.target.value)}
                    className="w-20 text-center text-sm tabular-nums"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Save bar */}
          <div className="flex items-center gap-3 border-t pt-5">
            <Button onClick={handleSave} disabled={saving || !dirty} size="sm">
              {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              Save Changes
            </Button>
            {saved && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle className="h-3.5 w-3.5 text-[#10b981]" />
                Saved. Restart the eval worker to apply.
              </span>
            )}
            {dirty && !saved && (
              <span className="text-xs text-muted-foreground/50">Unsaved changes</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
