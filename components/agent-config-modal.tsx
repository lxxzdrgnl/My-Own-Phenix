"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, Bot } from "lucide-react";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormLabel, FormError } from "@/components/ui/form-field";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

interface AgentConfig {
  endpoint: string;
  assistantId: string;
  agentType?: string;
}

interface AgentEntry {
  id: string;
  name: string;
  description: string;
  agentType: string;
  endpoint: string;
  assistantId: string;
  evalPrompts: string;
}

interface AgentConfigModalProps {
  open: boolean;
  onClose: () => void;
  project: string;
  onSaved?: (config: AgentConfig | null) => void;
}

type Tab = "select" | "manage";

const AGENT_TYPES = [
  { value: "langgraph", label: "LangGraph" },
  { value: "rest", label: "REST SSE" },
];

export function AgentConfigModal({ open, onClose, project, onSaved }: AgentConfigModalProps) {
  const [tab, setTab] = useState<Tab>("select");
  const [alias, setAlias] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [savedMsg, setSavedMsg] = useState(false);

  // Manage tab state
  const [expanded, setExpanded] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<null | "create" | "edit">(null);
  const [formTarget, setFormTarget] = useState<AgentEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [agentsRes, configRes] = await Promise.all([
        fetch("/api/agent-templates"),
        fetch(`/api/agent-config?project=${encodeURIComponent(project)}`),
      ]);
      const agentsData = await agentsRes.json();
      setAgents(agentsData.templates ?? []);

      const configData = await configRes.json();
      if (configData.config) {
        setAlias(configData.config.alias ?? "");
        setSelectedAgentId(configData.config.templateId ?? "");
      } else {
        setAlias("");
        setSelectedAgentId("");
      }
    } catch {}
    setLoading(false);
  }, [project]);

  useEffect(() => {
    if (open) {
      setError(undefined);
      setSavedMsg(false);
      setFormMode(null);
      load();
    }
  }, [open, load]);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  const handleSave = async () => {
    setError(undefined);
    setSavedMsg(false);
    if (!selectedAgentId) {
      setError("Please select an agent.");
      return;
    }
    const agent = agents.find((a) => a.id === selectedAgentId);
    if (!agent) return;

    setSaving(true);
    try {
      const res = await fetch("/api/agent-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project,
          alias: alias.trim(),
          templateId: selectedAgentId,
          agentType: agent.agentType,
          endpoint: agent.endpoint,
          assistantId: agent.assistantId,
        }),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "Failed to save.");
        return;
      }
      setSavedMsg(true);
      onSaved?.({ endpoint: agent.endpoint, assistantId: agent.assistantId, agentType: agent.agentType });
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  async function handleDeleteAgent(a: AgentEntry) {
    if (!confirm(`Delete agent "${a.name}"?`)) return;
    try {
      await fetch(`/api/agent-templates?id=${a.id}`, { method: "DELETE" });
      if (selectedAgentId === a.id) setSelectedAgentId("");
      await load();
    } catch {}
  }

  function parseEvalPrompts(raw: string): Record<string, string> {
    try { return JSON.parse(raw); } catch { return {}; }
  }

  return (
    <Modal open={open} onClose={onClose} className="w-[640px]">
      <ModalHeader onClose={onClose}>Project Settings</ModalHeader>
      <ModalBody>
        {/* Tabs */}
        <div className="flex gap-1 border-b mb-4">
          {(["select", "manage"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                tab === t
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {{ select: "Project", manage: "Agents" }[t]}
            </button>
          ))}
        </div>

        {/* ── Select tab ── */}
        {tab === "select" && (
          <div className="space-y-4">
            <div>
              <FormLabel>Project (Phoenix)</FormLabel>
              <Input value={project} disabled />
            </div>
            <div>
              <FormLabel>Display Name</FormLabel>
              <Input placeholder={project} value={alias} onChange={(e) => setAlias(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">Optional alias shown in the dashboard.</p>
            </div>
            <div>
              <FormLabel>Agent</FormLabel>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">— Select an agent —</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} {a.description ? `— ${a.description}` : ""}
                  </option>
                ))}
              </select>
              {agents.length === 0 && !loading && (
                <p className="mt-1 text-xs text-muted-foreground">
                  No agents registered. Go to <button onClick={() => setTab("manage")} className="underline">Agents</button> tab to register one.
                </p>
              )}
            </div>

            {selectedAgent && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">{selectedAgent.agentType}</span>
                  <span className="text-xs text-muted-foreground font-mono truncate">{selectedAgent.endpoint}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Assistant ID: <span className="font-mono">{selectedAgent.assistantId}</span>
                </p>
              </div>
            )}

            {error && <FormError message={error} />}
            {savedMsg && <p className="text-xs text-green-600">Saved successfully.</p>}

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !selectedAgentId}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Manage tab ── */}
        {tab === "manage" && (
          <div>
            <button
              onClick={() => { setFormTarget(null); setFormMode("create"); }}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed py-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              Register New Agent
            </button>

            {loading && <LoadingState />}
            {!loading && agents.length === 0 && (
              <EmptyState icon={Bot} title="No agents registered" description="Register an agent to connect it to projects." />
            )}

            <div className="flex flex-col gap-2">
              {agents.map((a) => {
                const isExpanded = expanded === a.id;
                const prompts = parseEvalPrompts(a.evalPrompts);
                const promptKeys = Object.keys(prompts).filter((k) => prompts[k]);

                return (
                  <div key={a.id} className="rounded-lg border">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button onClick={() => setExpanded(isExpanded ? null : a.id)} className="rounded p-0.5 hover:bg-muted">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{a.name}</p>
                        {a.description && <p className="truncate text-xs text-muted-foreground">{a.description}</p>}
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{a.agentType}</span>
                      {promptKeys.length > 0 && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{promptKeys.length} prompts</span>
                      )}
                      <button onClick={() => { setFormTarget(a); setFormMode("edit"); }} className="rounded p-1.5 transition-colors hover:bg-muted" title="Edit">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={() => handleDeleteAgent(a)} className="rounded p-1.5 transition-colors hover:bg-red-500/10" title="Delete">
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="border-t px-4 py-3 space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-xs font-semibold uppercase text-muted-foreground">Endpoint</span>
                            <p className="mt-0.5 font-mono text-xs break-all">{a.endpoint}</p>
                          </div>
                          <div>
                            <span className="text-xs font-semibold uppercase text-muted-foreground">Assistant ID</span>
                            <p className="mt-0.5 font-mono text-xs">{a.assistantId}</p>
                          </div>
                        </div>
                        {promptKeys.length > 0 && (
                          <div>
                            <span className="text-xs font-semibold uppercase text-muted-foreground">Eval Prompts</span>
                            {promptKeys.map((key) => (
                              <div key={key} className="mt-2">
                                <span className="mb-1 inline-block rounded bg-muted px-1.5 py-0.5 text-xs font-semibold uppercase">{key}</span>
                                <div className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-xs leading-relaxed">{prompts[key]}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {formMode && (
              <AgentFormModal
                mode={formMode}
                initial={formTarget}
                onClose={() => { setFormMode(null); setFormTarget(null); }}
                onSave={() => { setFormMode(null); setFormTarget(null); load(); }}
              />
            )}
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 *  Agent Form Modal (create / edit) — inner modal
 * ══════════════════════════════════════════════════════════════════════════ */

interface AgentFormModalProps {
  mode: "create" | "edit";
  initial?: AgentEntry | null;
  onClose: () => void;
  onSave: () => void;
}

function AgentFormModal({ mode, initial, onClose, onSave }: AgentFormModalProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [agentType, setAgentType] = useState(initial?.agentType ?? "langgraph");
  const [endpoint, setEndpoint] = useState(initial?.endpoint ?? "http://localhost:2024");
  const [assistantId, setAssistantId] = useState(initial?.assistantId ?? "agent");
  const [evalHallucination, setEvalHallucination] = useState("");
  const [evalCitation, setEvalCitation] = useState("");
  const [evalToolCalling, setEvalToolCalling] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (initial?.evalPrompts) {
      try {
        const p = JSON.parse(initial.evalPrompts);
        setEvalHallucination(p.hallucination ?? "");
        setEvalCitation(p.citation ?? "");
        setEvalToolCalling(p.tool_calling ?? "");
      } catch {}
    }
  }, [initial]);

  async function handleSave() {
    if (!name.trim()) { setError("Name is required."); return; }
    if (!endpoint.trim()) { setError("Endpoint is required."); return; }
    setError(undefined);
    setSaving(true);

    const evalPrompts: Record<string, string> = {};
    if (evalHallucination.trim()) evalPrompts.hallucination = evalHallucination.trim();
    if (evalCitation.trim()) evalPrompts.citation = evalCitation.trim();
    if (evalToolCalling.trim()) evalPrompts.tool_calling = evalToolCalling.trim();

    try {
      const body: Record<string, unknown> = {
        name: name.trim(), description: description.trim(),
        agentType, endpoint: endpoint.trim(), assistantId: assistantId.trim(), evalPrompts,
      };
      if (mode === "edit" && initial?.id) body.id = initial.id;

      const res = await fetch("/api/agent-templates", {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { setError((await res.json()).error ?? "Failed to save."); return; }
      onSave();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} className="w-[520px]">
      <ModalHeader onClose={onClose}>
        {mode === "create" ? "Register Agent" : `Edit: ${initial?.name}`}
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div>
            <FormLabel>Agent Name</FormLabel>
            <Input placeholder="e.g. Legal RAG, Dexter" value={name} onChange={(e) => setName(e.target.value)} disabled={mode === "edit"} />
          </div>
          <div>
            <FormLabel>Description</FormLabel>
            <Input placeholder="Short description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FormLabel>Agent Type</FormLabel>
              <select value={agentType} onChange={(e) => setAgentType(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring">
                {AGENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <FormLabel>Assistant ID</FormLabel>
              <Input placeholder="agent" value={assistantId} onChange={(e) => setAssistantId(e.target.value)} />
            </div>
          </div>
          <div>
            <FormLabel>Endpoint URL</FormLabel>
            <Input placeholder="http://localhost:2024" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2">Eval Prompts</p>
            <p className="text-xs text-muted-foreground mb-3">
              Custom eval prompts. Leave blank for defaults.
            </p>
            <div className="space-y-3">
              <div>
                <FormLabel>Hallucination</FormLabel>
                <Textarea rows={3} placeholder="Default" value={evalHallucination} onChange={(e) => setEvalHallucination(e.target.value)} />
              </div>
              <div>
                <FormLabel>Citation</FormLabel>
                <Textarea rows={3} placeholder="Default" value={evalCitation} onChange={(e) => setEvalCitation(e.target.value)} />
              </div>
              <div>
                <FormLabel>Tool Calling</FormLabel>
                <Textarea rows={3} placeholder="Default" value={evalToolCalling} onChange={(e) => setEvalToolCalling(e.target.value)} />
              </div>
            </div>
          </div>

          {error && <FormError message={error} />}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : mode === "create" ? "Register" : "Save"}
            </Button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
