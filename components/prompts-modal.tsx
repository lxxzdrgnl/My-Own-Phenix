"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchPrompts,
  fetchPromptVersions,
  fetchPromptVersionTags,
  addPromptVersionTag,
  deletePromptVersionTag,
  createPrompt,
  updatePrompt,
  deletePrompt,
  normalizeContent,
  PromptVersion,
  PromptInfo,
  PromptTag,
} from "@/lib/phoenix";
import {
  Plus,
  Tag,
  Pencil,
  Trash2,
  X,
  ChevronRight,
  ChevronDown,
  MessageSquare,
} from "lucide-react";
import { ModelSelector } from "@/components/model-selector";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormLabel, FormError } from "@/components/ui/form-field";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

interface VersionWithTags extends PromptVersion {
  tags: PromptTag[];
}

interface PromptWithVersions {
  info: PromptInfo;
  versions: VersionWithTags[];
}

interface PromptsModalProps {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

export function PromptsModal({ open, onClose, onChanged }: PromptsModalProps) {
  const [prompts, setPrompts] = useState<PromptWithVersions[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [innerModal, setInnerModal] = useState<null | "create" | "edit">(null);
  const [editTarget, setEditTarget] = useState<PromptFormInitial | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ps = await fetchPrompts();
      const result: PromptWithVersions[] = [];
      for (const p of ps) {
        const versions = await fetchPromptVersions(p.name);
        const versionsWithTags: VersionWithTags[] = [];
        for (const v of versions) {
          const tags = await fetchPromptVersionTags(v.id);
          versionsWithTags.push({ ...v, tags });
        }
        result.push({ info: p, versions: versionsWithTags });
      }
      setPrompts(result);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function handleDelete(name: string) {
    if (!confirm(`Delete prompt "${name}" and all its versions?`)) return;
    try {
      await deletePrompt(name);
      await load();
      onChanged?.();
    } catch (e: any) {
      alert(`Delete failed: ${e.message}`);
    }
  }

  function handleEdit(p: PromptWithVersions) {
    const latest = p.versions[0];
    const msgs = latest?.template?.messages ?? [];
    setEditTarget({
      name: p.info.name,
      description: p.info.description ?? "",
      system: normalizeContent(msgs.find((m) => m.role === "system")?.content ?? ""),
      user: normalizeContent(msgs.find((m) => m.role === "user")?.content ?? "{{query}}"),
      model: latest?.model_name ?? "gpt-4o-mini",
      temperature: latest?.invocation_parameters?.openai?.temperature ?? 0.7,
    });
    setInnerModal("edit");
  }

  function handleInnerSave() {
    load();
    onChanged?.();
  }

  return (
    <Modal open={open} onClose={onClose} className="w-[720px]">
      <ModalHeader onClose={onClose}>Prompts</ModalHeader>
      <ModalBody>
        <button
          onClick={() => setInnerModal("create")}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed py-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          New Prompt
        </button>

        {loading && <LoadingState />}

        {!loading && prompts.length === 0 && (
          <EmptyState icon={MessageSquare} title="No prompts yet" />
        )}

        <div className="flex flex-col gap-2">
          {prompts.map((p) => (
            <div key={p.info.id} className="rounded-lg border">
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() =>
                    setExpanded(expanded === p.info.name ? null : p.info.name)
                  }
                  className="rounded p-0.5 hover:bg-muted"
                >
                  {expanded === p.info.name ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{String(p.info.name)}</p>
                  {p.info.description && typeof p.info.description === "string" && (
                    <p className="truncate text-xs text-muted-foreground">
                      {p.info.description}
                    </p>
                  )}
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {p.versions.length} ver
                </span>
                <button
                  onClick={() => handleEdit(p)}
                  className="rounded p-1.5 transition-colors hover:bg-muted"
                  title="Add new version"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button
                  onClick={() => handleDelete(p.info.name)}
                  className="rounded p-1.5 transition-colors hover:bg-red-500/10"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>

              {expanded === p.info.name && (
                <div className="border-t">
                  {p.versions.map((v, i) => (
                    <div key={v.id} className="border-b last:border-b-0 px-4 py-3">
                      <div className="mb-2 flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {String(v.description || v.id)}
                        </span>
                        {i === 0 && (
                          <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 text-xs font-medium">
                            latest
                          </span>
                        )}
                        {v.tags.map((tag) => (
                          <span
                            key={tag.name}
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
                          >
                            <Tag className="h-2.5 w-2.5" />
                            {tag.name}
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm(`Delete tag "${tag.name}"?`)) return;
                                try {
                                  await deletePromptVersionTag(v.id, tag.name);
                                  await load();
                                  onChanged?.();
                                } catch (err: any) {
                                  alert(err.message);
                                }
                              }}
                              className="ml-0.5 hover:text-foreground text-muted-foreground"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        ))}
                        <button
                          onClick={async () => {
                            const name = prompt("Tag name (e.g. production, staging)");
                            if (!name?.trim()) return;
                            try {
                              await addPromptVersionTag(v.id, name.trim());
                              await load();
                              onChanged?.();
                            } catch (err: any) {
                              alert(err.message);
                            }
                          }}
                          className="rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                        >
                          + tag
                        </button>
                        <span className="text-xs text-muted-foreground">
                          {v.model_name} / temp{" "}
                          {v.invocation_parameters?.openai?.temperature ?? "N/A"}
                        </span>
                      </div>
                      {v.template?.messages?.map((m, mi) => (
                        <div key={mi} className="mb-2">
                          <span className="mb-1 inline-block rounded bg-muted px-1.5 py-0.5 text-xs font-semibold uppercase">
                            {m.role}
                          </span>
                          <div className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-sm leading-relaxed">
                            {normalizeContent(m.content)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </ModalBody>

      {innerModal === "create" && (
        <PromptFormModal
          mode="create"
          onClose={() => setInnerModal(null)}
          onSave={handleInnerSave}
        />
      )}
      {innerModal === "edit" && editTarget && (
        <PromptFormModal
          mode="edit"
          initial={editTarget}
          onClose={() => {
            setInnerModal(null);
            setEditTarget(null);
          }}
          onSave={handleInnerSave}
        />
      )}
    </Modal>
  );
}

/* ── Shared Prompt Form Modal ─────────────────────────────────── */

export interface PromptFormInitial {
  name: string;
  description: string;
  system: string;
  user: string;
  model: string;
  temperature: number;
}

interface PromptFormModalProps {
  mode: "create" | "edit";
  initial?: PromptFormInitial;
  onClose: () => void;
  onSave: () => void;
}

export function PromptFormModal({
  mode,
  initial,
  onClose,
  onSave,
}: PromptFormModalProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [system, setSystem] = useState(initial?.system ?? "");
  const [user, setUser] = useState(initial?.user ?? "{{query}}");
  const [model, setModel] = useState(initial?.model ?? "gpt-4o-mini");
  const [temperature, setTemperature] = useState(initial?.temperature ?? 0.7);
  const [versionDesc, setVersionDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!name.trim() || !system.trim()) {
      setError("Name and System prompt are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (mode === "create") {
        await createPrompt(name, desc, system, user, model, temperature);
      } else {
        await updatePrompt(name, desc, versionDesc || `v${Date.now()}`, system, user, model, temperature);
      }
      onSave();
      onClose();
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(false);
  }

  return (
    <Modal open onClose={onClose} z={60}>
      <ModalHeader onClose={onClose}>
        {mode === "create" ? "New Prompt" : `Edit: ${name}`}
      </ModalHeader>
      <ModalBody className="flex flex-col gap-3">
        <div className="flex gap-3">
          <div className="flex-1">
            <FormLabel>Model</FormLabel>
            <ModelSelector value={model} onChange={setModel} />
          </div>
          <div className="w-28">
            <FormLabel>Temperature</FormLabel>
            <Input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <FormLabel>Name</FormLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={mode === "edit"}
              placeholder="my-prompt"
            />
          </div>
          <div className="flex-1">
            <FormLabel>Description</FormLabel>
            <Input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Prompt description"
            />
          </div>
        </div>
        {mode === "edit" && (
          <div>
            <FormLabel>Version Label</FormLabel>
            <Input
              value={versionDesc}
              onChange={(e) => setVersionDesc(e.target.value)}
              placeholder="e.g. v2 - add citation format"
            />
          </div>
        )}
        <div>
          <FormLabel>System Prompt</FormLabel>
          <Textarea
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            rows={10}
            placeholder="You are a Korean legal AI assistant..."
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {"Use {{context}} and {{query}} as template variables"}
          </p>
        </div>
        <div>
          <FormLabel>User Template</FormLabel>
          <Input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="{{query}}"
          />
        </div>
        <FormError message={error} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : mode === "create" ? "Create" : "Save New Version"}
          </Button>
        </div>
      </ModalBody>
    </Modal>
  );
}
