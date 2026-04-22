"use client";

import { useState, useCallback, useEffect } from "react";
import { Trash2, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";

interface AgentConfig {
  id: string;
  project: string;
  alias: string | null;
  agentType: string;
  endpoint: string;
  assistantId: string;
  template?: { name: string; description?: string } | null;
}

export function ChatSection() {
  const [configs, setConfigs] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agent-config");
      const data = await res.json();
      setConfigs(data.configs ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDisconnect(project: string) {
    if (!confirm(`Disconnect agent from project "${project}"?`)) return;
    await fetch(`/api/agent-config?project=${encodeURIComponent(project)}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-semibold tracking-tight">Chat</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          View and manage which agents are connected to each Phoenix project.
          You can also configure these from the chat interface per project.
        </p>
      </div>

      {loading && <LoadingState />}

      {!loading && (
        <div className="space-y-8">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                Project Agent Mapping
              </h3>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {configs.length}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {configs.length === 0 && (
              <EmptyState
                icon={Bot}
                title="No project-agent connections"
                description="Connect an agent to a project from the chat interface using the settings icon."
              />
            )}

            <div className="space-y-2">
              {configs.map((c) => (
                <div key={c.id} className="rounded-lg border transition-colors hover:border-foreground/15">
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-[10px] font-bold uppercase text-muted-foreground">
                        {(c.alias || c.project).slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{c.alias || c.project}</p>
                          {c.alias && (
                            <span className="text-[11px] text-muted-foreground/50">{c.project}</span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground/60">
                          <span className="font-medium">
                            {c.template?.name || "Custom"}
                          </span>
                          <span>·</span>
                          <span className="font-mono">{c.endpoint}</span>
                        </div>
                      </div>
                      <span className="rounded-full bg-foreground/8 px-2 py-0.5 text-[10px] font-semibold text-foreground/60">
                        {c.agentType}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground/40 hover:text-foreground"
                        onClick={() => handleDisconnect(c.project)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
