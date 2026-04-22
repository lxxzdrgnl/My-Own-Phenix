"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/empty-state";
import { CheckCircle, Loader2 } from "lucide-react";

interface GeneralSettings {
  phoenixUrl: string;
}

const DEFAULTS: GeneralSettings = {
  phoenixUrl: "http://localhost:6006",
};

export function GeneralSection() {
  const [settings, setSettings] = useState<GeneralSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setSettings({
        phoenixUrl: data.phoenixUrl ?? DEFAULTS.phoenixUrl,
      });
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function update(key: keyof GeneralSettings, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setDirty(false);
    } catch {}
    setSaving(false);
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-semibold tracking-tight">General</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Core configuration for the application.
        </p>
      </div>

      {loading && <LoadingState />}

      {!loading && (
        <div className="space-y-8">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                Connections
              </h3>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-2">
              <div className="rounded-lg border px-5 py-4">
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-medium">Phoenix URL</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Arize Phoenix server for trace collection and observability.
                    </p>
                  </div>
                  <Input
                    value={settings.phoenixUrl}
                    onChange={(e) => update("phoenixUrl", e.target.value)}
                    placeholder="http://localhost:6006"
                    className="font-mono text-xs"
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
                Saved. Restart the app to apply.
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
