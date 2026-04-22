"use client";
import { apiFetch } from "@/lib/api-client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
  Bot,
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

interface AgentListModalProps {
  open: boolean;
  onClose: () => void;
}

const AGENT_TYPES = [
  { value: "langgraph", label: "LangGraph" },
  { value: "rest", label: "REST SSE" },
];

/* ══════════════════════════════════════════════════════════════════════════
 *  Agent List Modal — follows PromptsModal pattern
 * ══════════════════════════════════════════════════════════════════════════ */

export function AgentTemplatesModal({ open, onClose }: AgentListModalProps) {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [innerModal, setInnerModal] = useState<null | "create" | "edit">(null);
  const [editTarget, setEditTarget] = useState<AgentEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/agent-templates");
      const data = await res.json();
      setAgents(data.templates ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function handleDelete(agent: AgentEntry) {
    if (!confirm(`Delete agent "${agent.name}" and disconnect all projects using it?`)) return;
    try {
      await apiFetch(`/api/agent-templates?id=${agent.id}`, { method: "DELETE" });
      await load();
    } catch {}
  }

  function handleEdit(agent: AgentEntry) {
    setEditTarget(agent);
    setInnerModal("edit");
  }

  function parseEvalPrompts(raw: string): Record<string, string> {
    try { return JSON.parse(raw); } catch { return {}; }
  }

  return (
    <Modal open={open} onClose={onClose} className="w-[720px]">
      <ModalHeader onClose={onClose}>Agents</ModalHeader>
      <ModalBody>
        <button
          onClick={() => { setEditTarget(null); setInnerModal("create"); }}
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
                {/* Header row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => setExpanded(isExpanded ? null : a.id)}
                    className="rounded p-0.5 hover:bg-muted"
                  >
                    {isExpanded
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    }
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{a.name}</p>
                    {a.description && (
                      <p className="truncate text-xs text-muted-foreground">{a.description}</p>
                    )}
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {a.agentType}
                  </span>
                  {promptKeys.length > 0 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {promptKeys.length} eval prompts
                    </span>
                  )}
                  <button
                    onClick={() => handleEdit(a)}
                    className="rounded p-1.5 transition-colors hover:bg-muted"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => handleDelete(a)}
                    className="rounded p-1.5 transition-colors hover:bg-red-500/10"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>

                {/* Expanded detail */}
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
                            <span className="mb-1 inline-block rounded bg-muted px-1.5 py-0.5 text-xs font-semibold uppercase">
                              {key}
                            </span>
                            <div className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-xs leading-relaxed">
                              {prompts[key]}
                            </div>
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
      </ModalBody>

      {innerModal === "create" && (
        <AgentFormModal
          mode="create"
          onClose={() => setInnerModal(null)}
          onSave={() => { setInnerModal(null); load(); }}
        />
      )}
      {innerModal === "edit" && editTarget && (
        <AgentFormModal
          mode="edit"
          initial={editTarget}
          onClose={() => { setInnerModal(null); setEditTarget(null); }}
          onSave={() => { setInnerModal(null); setEditTarget(null); load(); }}
        />
      )}
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 *  Agent Form Modal (create / edit)
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
        name: name.trim(),
        description: description.trim(),
        agentType,
        endpoint: endpoint.trim(),
        assistantId: assistantId.trim(),
        evalPrompts,
      };
      if (mode === "edit" && initial?.id) body.id = initial.id;

      const res = await apiFetch("/api/agent-templates", {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
    <Modal open onClose={onClose} className="w-[560px]">
      <ModalHeader onClose={onClose}>
        {mode === "create" ? "Register Agent" : `Edit: ${initial?.name}`}
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div>
            <FormLabel>Agent Name</FormLabel>
            <Input
              placeholder="e.g. Legal RAG, Dexter, Custom Agent"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={mode === "edit"}
            />
          </div>

          <div>
            <FormLabel>Description</FormLabel>
            <Input
              placeholder="Short description of this agent"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FormLabel>Agent Type</FormLabel>
              <select
                value={agentType}
                onChange={(e) => setAgentType(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              >
                {AGENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
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
              Custom eval prompts for this agent. Leave blank to use defaults.
              Use {"{{context}}"}, {"{{response}}"}, {"{{query}}"} as placeholders.
            </p>

            <div className="space-y-3">
              <div>
                <FormLabel>Hallucination</FormLabel>
                <Textarea rows={3} placeholder="Default prompt" value={evalHallucination} onChange={(e) => setEvalHallucination(e.target.value)} />
              </div>
              <div>
                <FormLabel>Citation</FormLabel>
                <Textarea rows={3} placeholder="Default prompt" value={evalCitation} onChange={(e) => setEvalCitation(e.target.value)} />
              </div>
              <div>
                <FormLabel>Tool Calling</FormLabel>
                <Textarea rows={3} placeholder="Default prompt" value={evalToolCalling} onChange={(e) => setEvalToolCalling(e.target.value)} />
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
