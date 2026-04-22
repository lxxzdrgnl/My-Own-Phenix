"use client";
import { apiFetch } from "@/lib/api-client";

import { useState, useCallback, useEffect } from "react";
import { Trash2, Bot, Pencil, Plus, MessageCircle, CheckCircle, Loader2, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

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
              {configs.map((c) => {
                const isExpanded = expandedProject === c.project;
                return (
                  <div key={c.id} className="rounded-lg border transition-colors hover:border-foreground/15">
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setExpandedProject(isExpanded ? null : c.project)}
                          className="rounded p-0.5 hover:bg-muted"
                        >
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground/50" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                          }
                        </button>
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

                    {isExpanded && (
                      <ProjectStarterQuestions project={c.project} />
                    )}
                  </div>
                );
              })}

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
          existingProjects={configs.map((c) => c.project)}
          onClose={() => { setShowAdd(false); setEditTarget(null); }}
          onSave={() => { setShowAdd(false); setEditTarget(null); load(); }}
        />
      )}
    </div>
  );
}

// ── Project Starter Questions (inline expanded panel) ──

import { ChatSuggestion, MAX_CHAT_SUGGESTIONS, parseChatSuggestions } from "@/lib/constants";

function ProjectStarterQuestions({ project }: { project: string }) {
  const [suggestions, setSuggestions] = useState<ChatSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/settings");
      const data = await res.json();
      setSuggestions(parseChatSuggestions(data[`chatSuggestions:${project}`]));
    } catch {
      setSuggestions([]);
    }
    setLoading(false);
  }, [project]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [`chatSuggestions:${project}`]: JSON.stringify(suggestions) }),
      });
      setSaved(true);
      setDirty(false);
    } catch {}
    setSaving(false);
  }

  function handleDelete(idx: number) {
    setSuggestions((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
    setSaved(false);
  }

  const [showAddModal, setShowAddModal] = useState(false);

  function handleAdd() {
    if (suggestions.length >= MAX_CHAT_SUGGESTIONS) return;
    setShowAddModal(true);
  }

  function handleAddSave(newItem: ChatSuggestion) {
    setSuggestions((prev) => [...prev, newItem]);
    setShowAddModal(false);
    setDirty(true);
    setSaved(false);
  }

  function handleUpdate(idx: number, updated: ChatSuggestion) {
    setSuggestions((prev) => prev.map((s, i) => (i === idx ? updated : s)));
    setDirty(true);
    setSaved(false);
  }

  if (loading) return <div className="border-t px-4 py-3"><LoadingState /></div>;

  return (
    <div className="border-t bg-muted/5 px-4 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-3.5 w-3.5 text-muted-foreground/50" />
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
          Starter Questions
        </p>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {suggestions.length}/{MAX_CHAT_SUGGESTIONS}
        </span>
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-1.5">
          {suggestions.map((s, idx) => (
            <div key={idx} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{s.title || "Untitled"}</p>
                <p className="text-[10px] text-muted-foreground/60 truncate">{s.label}</p>
              </div>
              <button
                onClick={() => setEditIdx(idx)}
                className="rounded p-1 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => handleDelete(idx)}
                className="rounded p-1 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        {suggestions.length < MAX_CHAT_SUGGESTIONS && (
          <button
            onClick={handleAdd}
            className="flex items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground/60 transition-colors hover:border-foreground/20 hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        )}
        {dirty && (
          <Button onClick={handleSave} disabled={saving} size="sm" className="h-7 text-xs">
            {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Save
          </Button>
        )}
        {saved && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <CheckCircle className="h-3 w-3 text-[#10b981]" />
            Saved
          </span>
        )}
      </div>

      {editIdx !== null && (
        <SuggestionEditModal
          suggestion={suggestions[editIdx]}
          onClose={() => setEditIdx(null)}
          onSave={(updated) => {
            handleUpdate(editIdx, updated);
            setEditIdx(null);
          }}
        />
      )}

      {showAddModal && (
        <SuggestionEditModal
          suggestion={{ title: "", label: "", prompt: "" }}
          onClose={() => setShowAddModal(false)}
          onSave={handleAddSave}
        />
      )}
    </div>
  );
}

function SuggestionEditModal({
  suggestion,
  onClose,
  onSave,
}: {
  suggestion: ChatSuggestion;
  onClose: () => void;
  onSave: (s: ChatSuggestion) => void;
}) {
  const [title, setTitle] = useState(suggestion.title);
  const [label, setLabel] = useState(suggestion.label);
  const [prompt, setPrompt] = useState(suggestion.prompt);

  function handleSubmit() {
    if (!title.trim() || !prompt.trim()) return;
    onSave({ title: title.trim(), label: label.trim(), prompt: prompt.trim() });
  }

  return (
    <Modal open onClose={onClose} className="w-[480px]">
      <ModalHeader onClose={onClose}>Edit Starter Question</ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div>
            <FormLabel>Title</FormLabel>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. How to deploy?"
            />
          </div>
          <div>
            <FormLabel>Subtitle</FormLabel>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Step-by-step guide"
            />
          </div>
          <div>
            <FormLabel>Prompt</FormLabel>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="The full question sent to the agent..."
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={!title.trim() || !prompt.trim()}>
              Save
            </Button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}

// ── Project-Agent Connection Modal ──

function ProjectAgentModal({
  existing,
  existingProjects,
  onClose,
  onSave,
}: {
  existing: AgentConfig | null;
  existingProjects: string[];
  onClose: () => void;
  onSave: () => void;
}) {
  const isEdit = !!existing;
  const [project, setProject] = useState(existing?.project ?? "");
  const [alias, setAlias] = useState(existing?.alias ?? "");
  const [selectedTemplateId, setSelectedTemplateId] = useState(existing?.templateId ?? "");
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const isDuplicate = !isEdit && project.trim() !== "" && existingProjects.includes(project.trim());

  useEffect(() => {
    apiFetch("/api/agent-templates")
      .then((r) => r.json())
      .then((data) => setTemplates(data.templates ?? []))
      .catch(() => {});
  }, []);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  async function handleSave() {
    if (!project.trim()) { setError("Enter a project name."); return; }
    if (isDuplicate) { setError(`Project "${project.trim()}" already exists.`); return; }
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
        {isEdit ? `Edit: ${existing.project}` : "Create Project"}
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div>
            <FormLabel>Project Name</FormLabel>
            <Input
              value={project}
              onChange={(e) => { setProject(e.target.value); setError(undefined); }}
              placeholder="e.g. legal-rag, customer-support"
              disabled={isEdit}
            />
            {isDuplicate && (
              <p className="mt-1 text-xs text-destructive">
                Project &quot;{project.trim()}&quot; already exists.
              </p>
            )}
            {!isEdit && !isDuplicate && (
              <p className="mt-1 text-xs text-muted-foreground">
                This name will be used as the Phoenix project name for traces.
              </p>
            )}
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
            <Button size="sm" onClick={handleSave} disabled={saving || !project.trim() || isDuplicate || !selectedTemplateId}>
              {saving ? "Saving..." : isEdit ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
