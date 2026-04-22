"use client";
import { apiFetch } from "@/lib/api-client";

import { useState, useCallback, useEffect } from "react";
import { Trash2, Bot, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel, FormError } from "@/components/ui/form-field";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";

interface AgentConfig {
  id: string;
  project: string;
  alias: string | null;
  agentType: string;
  endpoint: string;
  assistantId: string;
  templateId: string | null;
  template?: { id: string; name: string; description?: string } | null;
}

interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  agentType: string;
  endpoint: string;
  assistantId: string;
}

export function ChatSection() {
  const [configs, setConfigs] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<AgentConfig | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/agent-config");
      const data = await res.json();
      setConfigs(data.configs ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDisconnect(project: string) {
    if (!confirm(`Disconnect agent from project "${project}"?`)) return;
    await apiFetch(`/api/agent-config?project=${encodeURIComponent(project)}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-semibold tracking-tight">Chat</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Manage which agents are connected to each Phoenix project.
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
                description="Connect an agent to a project using the button below."
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
                      <button
                        onClick={() => setEditTarget(c)}
                        className="rounded p-1.5 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDisconnect(c.project)}
                        className="rounded p-1.5 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
                        title="Disconnect"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={() => { setEditTarget(null); setShowAdd(true); }}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm text-muted-foreground/60 transition-colors hover:border-foreground/20 hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                Connect Project
              </button>
            </div>
          </section>
        </div>
      )}

      {(showAdd || editTarget) && (
        <ProjectAgentModal
          existing={editTarget}
          onClose={() => { setShowAdd(false); setEditTarget(null); }}
          onSave={() => { setShowAdd(false); setEditTarget(null); load(); }}
        />
      )}
    </div>
  );
}

// ── Project-Agent Connection Modal ──

function ProjectAgentModal({
  existing,
  onClose,
  onSave,
}: {
  existing: AgentConfig | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const isEdit = !!existing;
  const [project, setProject] = useState(existing?.project ?? "");
  const [alias, setAlias] = useState(existing?.alias ?? "");
  const [selectedTemplateId, setSelectedTemplateId] = useState(existing?.templateId ?? "");
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    apiFetch("/api/agent-templates")
      .then((r) => r.json())
      .then((data) => setTemplates(data.templates ?? []))
      .catch(() => {});

    apiFetch("/api/v1/projects")
      .then((r) => r.json())
      .then((data) => {
        const names = (data.data ?? []).map((p: any) => p.name as string).filter((n: string) => n !== "playground");
        setProjects(names);
      })
      .catch(() => {});
  }, []);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  async function handleSave() {
    if (!project.trim()) { setError("Select a project."); return; }
    if (!selectedTemplateId) { setError("Select an agent."); return; }
    setError(undefined);
    setSaving(true);

    try {
      const res = await apiFetch("/api/agent-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: project.trim(),
          alias: alias.trim() || null,
          templateId: selectedTemplateId,
          agentType: selectedTemplate?.agentType ?? "langgraph",
          endpoint: selectedTemplate?.endpoint ?? "http://localhost:2024",
          assistantId: selectedTemplate?.assistantId ?? "agent",
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to save.");
        return;
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
        {isEdit ? `Edit: ${existing.project}` : "Connect Project to Agent"}
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div>
            <FormLabel>Phoenix Project</FormLabel>
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              disabled={isEdit}
              className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select project...</option>
              {projects.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div>
            <FormLabel>Display Name (optional)</FormLabel>
            <Input
              placeholder={project || "Alias for dashboard"}
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
            />
          </div>

          <div>
            <FormLabel>Agent</FormLabel>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select agent...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.description ? `— ${t.description}` : ""}
                </option>
              ))}
            </select>
            {templates.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                No agents registered. Go to Settings &gt; Agents to register one.
              </p>
            )}
          </div>

          {selectedTemplate && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">{selectedTemplate.agentType}</span>
                <span className="text-xs text-muted-foreground font-mono truncate">{selectedTemplate.endpoint}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Assistant ID: <span className="font-mono">{selectedTemplate.assistantId}</span>
              </p>
            </div>
          )}

          {error && <FormError message={error} />}

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !project || !selectedTemplateId}>
              {saving ? "Saving..." : isEdit ? "Update" : "Connect"}
            </Button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
