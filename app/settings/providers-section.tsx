"use client";

import { useState, useCallback, useEffect } from "react";
import { CheckCircle, XCircle, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form-field";
import { LoadingState } from "@/components/ui/empty-state";

interface ProviderEntry {
  id: string;
  provider: string;
  apiKey: string;
  isActive: boolean;
}

const ALL_PROVIDERS = [
  { key: "openai", label: "OpenAI", placeholder: "sk-..." },
  { key: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
  { key: "google", label: "Google", placeholder: "AIza..." },
  { key: "xai", label: "xAI", placeholder: "xai-..." },
] as const;

export function ProvidersSection() {
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/providers");
      const data = await res.json();
      setProviders(data.providers ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const providerMap = new Map<string, ProviderEntry>();
  for (const p of providers) providerMap.set(p.provider, p);

  const configuredCount = providers.length;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold tracking-tight">LLM Providers</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Register API keys to enable models across playground, evaluations, and dataset runs.
        </p>
      </div>

      {loading && <LoadingState />}

      {!loading && (
        <div className="space-y-8">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                Providers
              </h3>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {configuredCount}/{ALL_PROVIDERS.length}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-2">
              {ALL_PROVIDERS.map(({ key, label, placeholder }) => (
                <ProviderRow
                  key={key}
                  providerKey={key}
                  label={label}
                  placeholder={placeholder}
                  existing={providerMap.get(key) ?? null}
                  onUpdate={load}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// ── Individual Provider Row ──

function ProviderRow({
  providerKey,
  label,
  placeholder,
  existing,
  onUpdate,
}: {
  providerKey: string;
  label: string;
  placeholder: string;
  existing: ProviderEntry | null;
  onUpdate: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isConfigured = !!existing;

  async function handleSave() {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      if (existing) {
        await fetch(`/api/providers/${existing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey }),
        });
      } else {
        await fetch("/api/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: providerKey, apiKey }),
        });
      }
      setApiKey("");
      setTestResult(null);
      onUpdate();
    } catch {}
    setSaving(false);
  }

  async function handleTest() {
    if (!apiKey.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerKey, apiKey: apiKey.trim() }),
      });
      setTestResult(await res.json());
    } catch {
      setTestResult({ success: false, error: "Network error" });
    }
    setTesting(false);
  }

  async function handleDelete() {
    if (!existing) return;
    setDeleting(true);
    await fetch(`/api/providers/${existing.id}`, { method: "DELETE" });
    setTestResult(null);
    onUpdate();
    setDeleting(false);
  }

  return (
    <div className="group rounded-lg border transition-colors hover:border-foreground/15">
      <div className="px-4 py-3 space-y-2.5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-[10px] font-bold uppercase text-muted-foreground">
            {label.slice(0, 2)}
          </div>
          <p className="flex-1 text-sm font-semibold">{label}</p>
          {isConfigured ? (
            <span className="rounded-full bg-[#10b981] px-2 py-0.5 text-[10px] font-semibold text-white">
              Active
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground/60">
              Not configured
            </span>
          )}
        </div>

        {/* Configured: masked key + remove */}
        {isConfigured && (
          <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-1.5">
            <p className="flex-1 font-mono text-[11px] text-muted-foreground">{existing.apiKey}</p>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-[11px] font-medium text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              {deleting ? "..." : "Remove"}
            </button>
          </div>
        )}

        {/* API Key input */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Input
              type={showKey ? "text" : "password"}
              placeholder={isConfigured ? "New key to replace..." : placeholder}
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
              className="pr-8 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground"
            >
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3 text-xs"
            onClick={handleTest}
            disabled={testing || !apiKey.trim()}
          >
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test"}
          </Button>
          <Button
            size="sm"
            className="h-9 px-3 text-xs"
            onClick={handleSave}
            disabled={saving || !apiKey.trim()}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : isConfigured ? "Replace" : "Save"}
          </Button>
        </div>

        {/* Test result */}
        {testResult && (
          <div className={`flex items-center gap-1.5 text-[11px] font-medium ${
            testResult.success ? "text-[#10b981]" : "text-[#ef4444]"
          }`}>
            {testResult.success ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {testResult.success ? "Connection verified" : testResult.error || "Connection failed"}
          </div>
        )}
      </div>
    </div>
  );
}
