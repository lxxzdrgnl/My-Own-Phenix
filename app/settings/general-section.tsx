"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/empty-state";
import { CheckCircle, Loader2 } from "lucide-react";
import { useSettingsForm } from "@/lib/hooks";
import { DEFAULT_PHOENIX_URL } from "@/lib/constants";

const DEFAULTS = {
  phoenixUrl: DEFAULT_PHOENIX_URL,
};

export function GeneralSection() {
  const { settings, loading, saving, saved, dirty, update, save } = useSettingsForm(DEFAULTS);

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
            <Button onClick={save} disabled={saving || !dirty} size="sm">
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
