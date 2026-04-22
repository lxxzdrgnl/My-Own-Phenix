"use client";

import { useState, useCallback, useEffect } from "react";
import { Plus, Trash2, Pencil, CheckCircle, XCircle, Loader2, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel, FormError } from "@/components/ui/form-field";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { ModelSelector } from "@/components/model-selector";

interface ProviderEntry {
  id: string;
  provider: string;
  apiKey: string;
  isActive: boolean;
}

const PROVIDER_META: Record<string, { label: string; placeholder: string }> = {
  openai: { label: "OpenAI", placeholder: "sk-..." },
  anthropic: { label: "Anthropic", placeholder: "sk-ant-..." },
  google: { label: "Google", placeholder: "AIza..." },
  xai: { label: "xAI", placeholder: "xai-..." },
};

const PROVIDER_OPTIONS = Object.entries(PROVIDER_META).map(([value, { label }]) => ({ value, label }));

export function ProvidersSection() {
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<ProviderEntry | null>(null);
  const [defaultEvalModel, setDefaultEvalModel] = useState("gpt-4o-mini");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [provRes, settingsRes] = await Promise.all([
        fetch("/api/providers"),
        fetch("/api/settings"),
      ]);
      const provData = await provRes.json();
      const settingsData = await settingsRes.json();
      setProviders(provData.providers ?? []);
      if (settingsData.defaultEvalModel) setDefaultEvalModel(settingsData.defaultEvalModel);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(p: ProviderEntry) {
    if (!confirm(`Delete ${PROVIDER_META[p.provider]?.label || p.provider} provider?`)) return;
    await fetch(`/api/providers/${p.id}`, { method: "DELETE" });
    await load();
  }

  async function handleDefaultModelChange(model: string) {
    setDefaultEvalModel(model);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultEvalModel: model }),
    });
  }

  const registeredProviders = new Set(providers.map((p) => p.provider));

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold">LLM Providers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Register API keys to enable models from each provider.
        </p>
      </div>

      {loading && <LoadingState />}

      {!loading && (
        <div className="space-y-6">
          {/* Default Eval Model */}
          <div className="rounded-lg border px-4 py-3">
            <FormLabel>Default Eval Model</FormLabel>
            <p className="mb-2 text-xs text-muted-foreground">
              Used when an eval does not have a specific model configured.
            </p>
            <div className="w-64">
              <ModelSelector value={defaultEvalModel} onChange={handleDefaultModelChange} />
            </div>
          </div>

          {/* Provider list */}
          <div className="space-y-3">
            {providers.map((p) => (
              <div key={p.id} className="flex items-center gap-4 rounded-lg border px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {PROVIDER_META[p.provider]?.label || p.provider}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">{p.apiKey}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    p.isActive ? "bg-[#10b981] text-white" : "bg-[#ef4444] text-white"
                  }`}
                >
                  {p.isActive ? "Active" : "Inactive"}
                </span>
                <button
                  onClick={() => {
                    setEditTarget(p);
                    setShowForm(true);
                  }}
                  className="rounded p-1.5 transition-colors hover:bg-muted"
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button
                  onClick={() => handleDelete(p)}
                  className="rounded p-1.5 transition-colors hover:bg-muted"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            ))}

            {providers.length === 0 && (
              <EmptyState
                icon={Key}
                title="No providers registered"
                description="Add an LLM provider to start using models in playground and evaluations."
              />
            )}

            <button
              onClick={() => {
                setEditTarget(null);
                setShowForm(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed py-3 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              Add Provider
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <ProviderFormModal
          existing={editTarget}
          registeredProviders={registeredProviders}
          onClose={() => {
            setShowForm(false);
            setEditTarget(null);
          }}
          onSave={() => {
            setShowForm(false);
            setEditTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function ProviderFormModal({
  existing,
  registeredProviders,
  onClose,
  onSave,
}: {
  existing: ProviderEntry | null;
  registeredProviders: Set<string>;
  onClose: () => void;
  onSave: () => void;
}) {
  const isEdit = !!existing;
  const [provider, setProvider] = useState(existing?.provider ?? "");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [error, setError] = useState<string | undefined>();

  const availableProviders = PROVIDER_OPTIONS.filter((o) =>
    isEdit ? o.value === existing.provider : !registeredProviders.has(o.value),
  );

  async function handleTest() {
    if (!provider || !apiKey) {
      setError("Select a provider and enter an API key.");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey }),
      });
      setTestResult(await res.json());
    } catch {
      setTestResult({ success: false, error: "Network error" });
    }
    setTesting(false);
  }

  async function handleSave() {
    if (!provider) {
      setError("Select a provider.");
      return;
    }
    if (!apiKey && !isEdit) {
      setError("Enter an API key.");
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      if (isEdit) {
        const body: Record<string, unknown> = {};
        if (apiKey) body.apiKey = apiKey;
        const res = await fetch(`/api/providers/${existing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const d = await res.json();
          setError(d.error ?? "Failed to update.");
          return;
        }
      } else {
        const res = await fetch("/api/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, apiKey }),
        });
        if (!res.ok) {
          const d = await res.json();
          setError(d.error ?? "Failed to save.");
          return;
        }
      }
      onSave();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} className="w-[480px]">
      <ModalHeader onClose={onClose}>
        {isEdit ? `Edit: ${PROVIDER_META[existing.provider]?.label}` : "Add Provider"}
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div>
            <FormLabel>Provider</FormLabel>
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setTestResult(null);
              }}
              disabled={isEdit}
              className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select provider...</option>
              {availableProviders.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FormLabel>API Key</FormLabel>
            <Input
              type="password"
              placeholder={PROVIDER_META[provider]?.placeholder ?? "Enter API key"}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTestResult(null);
              }}
            />
            {isEdit && (
              <p className="mt-1 text-xs text-muted-foreground">
                Leave blank to keep the current key. Current: {existing.apiKey}
              </p>
            )}
          </div>
          {testResult && (
            <div
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                testResult.success
                  ? "border-[#10b981]/30 text-[#10b981]"
                  : "border-[#ef4444]/30 text-[#ef4444]"
              }`}
            >
              {testResult.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              {testResult.success ? "Connection successful" : testResult.error || "Connection failed"}
            </div>
          )}
          {error && <FormError message={error} />}
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing || !provider || !apiKey}
            >
              {testing ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
              Test Connection
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : isEdit ? "Update" : "Add"}
            </Button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
