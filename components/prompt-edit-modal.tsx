"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { updatePrompt, normalizeContent, PromptVersion } from "@/lib/phoenix";
import { ModelSelector } from "@/components/model-selector";

interface Props {
  promptName: string;
  version: PromptVersion;
  onClose: () => void;
  onSave: () => void;
}

export function PromptEditModal({ promptName, version, onClose, onSave }: Props) {
  const msgs = version.template?.messages ?? [];
  const [system, setSystem] = useState(
    normalizeContent(msgs.find((m) => m.role === "system")?.content ?? ""),
  );
  const [user, setUser] = useState(
    normalizeContent(msgs.find((m) => m.role === "user")?.content ?? "{{query}}"),
  );
  const [model, setModel] = useState(version.model_name ?? "gpt-4o-mini");
  const [temperature, setTemperature] = useState(
    version.invocation_parameters?.openai?.temperature ?? 0.7,
  );
  const [versionDesc, setVersionDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!system.trim()) {
      setError("System prompt는 필수입니다");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updatePrompt(
        promptName,
        "",
        versionDesc || `v${Date.now()}`,
        system,
        user,
        model,
        temperature,
      );
      onSave();
      onClose();
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[640px] max-h-[90vh] overflow-y-auto rounded-xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b bg-background px-5 py-3">
          <h2 className="text-sm font-semibold">Edit: {promptName}</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-5">
          {/* Model & Temperature */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Model
              </label>
              <ModelSelector value={model} onChange={setModel} />
            </div>
            <div className="w-28">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Temperature
              </label>
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
                className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Version Label */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Version Label
            </label>
            <input
              value={versionDesc}
              onChange={(e) => setVersionDesc(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder="e.g. v2 - 판례 인용 형식 추가"
            />
          </div>

          {/* System Prompt */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              System Prompt
            </label>
            <textarea
              value={system}
              onChange={(e) => setSystem(e.target.value)}
              rows={12}
              className="w-full rounded-md border bg-background px-2.5 py-2 text-sm leading-relaxed outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              {"{{context}}와 {{query}}를 변수로 사용할 수 있습니다"}
            </p>
          </div>

          {/* User Template */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              User Template
            </label>
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder="{{query}}"
            />
          </div>

          {error && (
            <p className="rounded-md bg-red-500/10 p-2 text-xs text-red-400">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="h-9 rounded-md border px-4 text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="h-9 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save New Version"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
