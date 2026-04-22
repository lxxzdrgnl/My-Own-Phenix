"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus, Pencil, Trash2, ChevronRight, ChevronDown, Bot,
} from "lucide-react";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormLabel, FormError } from "@/components/ui/form-field";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";

interface AgentEntry {
  id: string;
  name: string;
  description: string;
  agentType: string;
  endpoint: string;
  assistantId: string;
  evalPrompts: string;
}

const AGENT_TYPES = [
  { value: "langgraph", label: "LangGraph" },
  { value: "rest", label: "REST SSE" },
];

export function AgentsSection() {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<AgentEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agent-templates");
      const data = await res.json();
      setAgents(data.templates ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(agent: AgentEntry) {
    if (!confirm(`Delete agent "${agent.name}" and disconnect all projects using it?`)) return;
    await fetch(`/api/agent-templates?id=${agent.id}`, { method: "DELETE" });
    await load();
  }

  function parseEvalPrompts(raw: string): Record<string, string> {
    try { return JSON.parse(raw); } catch { return {}; }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold tracking-tight">Agents</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Register and manage agent templates for projects and dataset runs.
        </p>
      </div>

      {loading && <LoadingState />}

      {!loading && (
        <div className="space-y-8">
          {/* Agent list */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                Templates
              </h3>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {agents.length}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-2">
              {agents.map((a) => {
                const isExpanded = expanded === a.id;
                const prompts = parseEvalPrompts(a.evalPrompts);
                const promptKeys = Object.keys(prompts).filter((k) => prompts[k]);

                return (
                  <div key={a.id} className="rounded-lg border transition-colors hover:border-foreground/15">
                    {/* Header row */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button
                        onClick={() => setExpanded(isExpanded ? null : a.id)}
                        className="rounded p-0.5 hover:bg-muted"
                      >
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground/50" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                        }
                      </button>
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-[10px] font-bold uppercase text-muted-foreground">
                        {a.name.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{a.name}</p>
                        {a.description && (
                          <p className="truncate text-[11px] text-muted-foreground/60">{a.description}</p>
                        )}
                      </div>
                      <span className="rounded-full bg-foreground/8 px-2 py-0.5 text-[10px] font-semibold text-foreground/60">
                        {a.agentType}
                      </span>
                      {promptKeys.length > 0 && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground/60">
                          {promptKeys.length} evals
                        </span>
                      )}
                      <button
                        onClick={() => { setEditTarget(a); setShowForm(true); }}
                        className="rounded p-1.5 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(a)}
                        className="rounded p-1.5 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t bg-muted/5 px-4 py-3 space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Endpoint</p>
                            <p className="mt-1 font-mono text-xs text-foreground/80 break-all">{a.endpoint}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Assistant ID</p>
                            <p className="mt-1 font-mono text-xs text-foreground/80">{a.assistantId}</p>
                          </div>
                        </div>

                        {promptKeys.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Eval Prompts</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {promptKeys.map((key) => (
                                <span key={key} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                                  {key}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {agents.length === 0 && (
                <EmptyState icon={Bot} title="No agents registered" description="Register an agent template to connect it to projects." />
              )}

              <button
                onClick={() => { setEditTarget(null); setShowForm(true); }}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm text-muted-foreground/60 transition-colors hover:border-foreground/20 hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                Register New Agent
              </button>
            </div>
          </section>
        </div>
      )}

      {showForm && (
        <AgentFormModal
          mode={editTarget ? "edit" : "create"}
          initial={editTarget}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
          onSave={() => { setShowForm(false); setEditTarget(null); load(); }}
        />
      )}
    </div>
  );
}

// ── Agent Form Modal ──

function AgentFormModal({ mode, initial, onClose, onSave }: {
  mode: "create" | "edit";
  initial?: AgentEntry | null;
  onClose: () => void;
  onSave: () => void;
}) {
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
        name: name.trim(), description: description.trim(), agentType,
        endpoint: endpoint.trim(), assistantId: assistantId.trim(), evalPrompts,
      };
      if (mode === "edit" && initial?.id) body.id = initial.id;

      const res = await fetch("/api/agent-templates", {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { setError((await res.json()).error ?? "Failed to save."); return; }
      onSave();
    } catch { setError("Network error."); } finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} className="w-[560px]">
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
              Custom eval prompts. Leave blank for defaults. Use {"{{context}}"}, {"{{response}}"}, {"{{query}}"}.
            </p>
            <div className="space-y-3">
              <div><FormLabel>Hallucination</FormLabel><Textarea rows={3} placeholder="Default" value={evalHallucination} onChange={(e) => setEvalHallucination(e.target.value)} /></div>
              <div><FormLabel>Citation</FormLabel><Textarea rows={3} placeholder="Default" value={evalCitation} onChange={(e) => setEvalCitation(e.target.value)} /></div>
              <div><FormLabel>Tool Calling</FormLabel><Textarea rows={3} placeholder="Default" value={evalToolCalling} onChange={(e) => setEvalToolCalling(e.target.value)} /></div>
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
