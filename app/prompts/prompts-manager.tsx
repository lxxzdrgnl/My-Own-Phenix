"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchPrompts,
  fetchPromptVersions,
  createPrompt,
  updatePrompt,
  deletePrompt,
  normalizeContent,
  PromptVersion,
  PromptInfo,
} from "@/lib/phoenix";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  ChevronRight,
  ChevronDown,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { Nav } from "@/components/nav";

interface PromptWithVersions {
  info: PromptInfo;
  versions: PromptVersion[];
}

export function PromptsManager() {
  const [prompts, setPrompts] = useState<PromptWithVersions[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "create" | "edit">(null);
  const [editTarget, setEditTarget] = useState<{
    name: string;
    description: string;
    system: string;
    user: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ps = await fetchPrompts();
      const result: PromptWithVersions[] = [];
      for (const p of ps) {
        const versions = await fetchPromptVersions(p.name);
        result.push({ info: p, versions });
      }
      setPrompts(result);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(name: string) {
    if (!confirm(`"${name}" 프롬프트와 모든 버전을 삭제하시겠습니까?`)) return;
    try {
      await deletePrompt(name);
      await load();
    } catch (e: any) {
      alert(`삭제 실패: ${e.message}`);
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
    });
    setModal("edit");
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <Nav />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl">
          {/* New Prompt */}
          <button
            onClick={() => setModal("create")}
            className="mb-5 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed py-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            New Prompt
          </button>

          {loading && (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading...
            </div>
          )}

          {!loading && prompts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <MessageSquare className="mb-3 h-10 w-10 opacity-15" />
              <p className="text-sm">프롬프트가 없습니다</p>
              <p className="text-xs opacity-60">위 버튼으로 첫 프롬프트를 만드세요</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {prompts.map((p) => (
              <div key={p.info.id} className="rounded-lg border">
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <button
                    onClick={() =>
                      setExpanded(
                        expanded === p.info.name ? null : p.info.name,
                      )
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
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] text-muted-foreground">
                    {p.versions.length} version
                    {p.versions.length !== 1 && "s"}
                  </span>
                  <button
                    onClick={() => handleEdit(p)}
                    className="rounded p-1.5 transition-colors hover:bg-muted"
                    title="새 버전 추가"
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => handleDelete(p.info.name)}
                    className="rounded p-1.5 transition-colors hover:bg-red-500/10"
                    title="삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </button>
                </div>

                {expanded === p.info.name && (
                  <div className="border-t">
                    {p.versions.map((v, i) => (
                      <div
                        key={v.id}
                        className="border-b last:border-b-0 px-4 py-3.5"
                      >
                        <div className="mb-2.5 flex items-center gap-2">
                          <span className="text-xs font-medium">
                            {String(v.description || v.id)}
                          </span>
                          {i === 0 && (
                            <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
                              latest
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {v.model_name} / temp{" "}
                            {v.invocation_parameters?.openai?.temperature ??
                              "N/A"}
                          </span>
                        </div>
                        {v.template?.messages?.map((m, mi) => (
                          <div key={mi} className="mb-2">
                            <span className="mb-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                              {m.role}
                            </span>
                            <div className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-xs leading-relaxed">
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
        </div>
      </div>

      {modal === "create" && (
        <PromptModal
          mode="create"
          onClose={() => setModal(null)}
          onSave={load}
        />
      )}
      {modal === "edit" && editTarget && (
        <PromptModal
          mode="edit"
          initial={editTarget}
          onClose={() => {
            setModal(null);
            setEditTarget(null);
          }}
          onSave={load}
        />
      )}
    </div>
  );
}

function PromptModal({
  mode,
  initial,
  onClose,
  onSave,
}: {
  mode: "create" | "edit";
  initial?: {
    name: string;
    description: string;
    system: string;
    user: string;
  };
  onClose: () => void;
  onSave: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [system, setSystem] = useState(initial?.system ?? "");
  const [user, setUser] = useState(initial?.user ?? "{{query}}");
  const [versionDesc, setVersionDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!name.trim() || !system.trim()) {
      setError("Name과 System prompt는 필수입니다");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (mode === "create") {
        await createPrompt(name, desc, system, user);
      } else {
        await updatePrompt(
          name,
          desc,
          versionDesc || `v${Date.now()}`,
          system,
          user,
        );
      }
      onSave();
      onClose();
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-[640px] max-h-[90vh] overflow-y-auto rounded-lg border bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">
            {mode === "create" ? "New Prompt" : `Edit: ${name}`}
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-3 p-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={mode === "edit"}
                className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                placeholder="my-prompt"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Description
              </label>
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                placeholder="프롬프트 설명"
              />
            </div>
          </div>
          {mode === "edit" && (
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Version Label
              </label>
              <input
                value={versionDesc}
                onChange={(e) => setVersionDesc(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                placeholder="e.g. v2 - 판례 인용 형식 추가"
              />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              System Prompt
            </label>
            <textarea
              value={system}
              onChange={(e) => setSystem(e.target.value)}
              rows={12}
              className="w-full rounded-md border bg-background px-2.5 py-2 text-sm leading-relaxed outline-none focus:ring-1 focus:ring-ring"
              placeholder="You are a Korean legal AI assistant..."
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              {"{{context}}와 {{query}}를 변수로 사용할 수 있습니다"}
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              User Template
            </label>
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder="{{query}}"
            />
          </div>
          {error && <p className="rounded-md bg-red-500/10 p-2 text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="h-9 rounded-md border px-4 text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="h-9 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : mode === "create"
                  ? "Create"
                  : "Save New Version"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
