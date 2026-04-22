"use client";
import { apiFetch } from "@/lib/api-client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchProjects, type Project } from "@/lib/phoenix";
import { Input } from "@/components/ui/input";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { Sidebar, SidebarItemLink } from "@/components/ui/sidebar";
import {
  Plus,
  Trash2,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  GripVertical,
} from "lucide-react";

export function ProjectsSidebar() {
  const params = useParams();
  const router = useRouter();
  const currentProject = params.name ? decodeURIComponent(params.name as string) : null;

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  function saveOrder(ps: Project[]) {
    localStorage.setItem("project_order", JSON.stringify(ps.map((p) => p.name)));
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...projects];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setProjects(next);
    saveOrder(next);
  }

  function moveDown(idx: number) {
    if (idx === projects.length - 1) return;
    const next = [...projects];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setProjects(next);
    saveOrder(next);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ps = await fetchProjects();
      setProjects(ps);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await apiFetch("/api/v1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: "" }),
      });
      const created = newName.trim();
      setNewName("");
      await load();
      router.push(`/projects/${encodeURIComponent(created)}`);
    } catch (e: any) {
      alert(`Failed: ${e.message}`);
    }
    setCreating(false);
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete project "${name}"? All traces will be permanently removed.`)) return;
    try {
      await apiFetch(`/api/v1/projects/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (currentProject === name) {
        router.push("/projects");
      }
      await load();
    } catch (e: any) {
      alert(`Failed: ${e.message}`);
    }
  }

  return (
    <Sidebar>
      {/* Create */}
      <div className="border-b px-3 py-3">
        <div className="flex gap-1.5">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="New project"
            className="h-8 flex-1 min-w-0 rounded-lg"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || creating}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto">
        {loading && <LoadingState className="py-12" />}

        {!loading && projects.length === 0 && (
          <EmptyState icon={FolderOpen} title="No projects" className="py-12" />
        )}

        {projects.map((p, idx) => {
          const active = p.name === currentProject;
          return (
            <SidebarItemLink
              key={p.name}
              href={`/projects/${encodeURIComponent(p.name)}`}
              active={active}
            >
              <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30" />
              <p className="flex-1 min-w-0 truncate">
                {p.name}
              </p>
              {/* Order buttons */}
              <div className="flex flex-col gap-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveUp(idx); }}
                  disabled={idx === 0}
                  className="rounded p-0.5 hover:bg-muted disabled:opacity-20"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveDown(idx); }}
                  disabled={idx === projects.length - 1}
                  className="rounded p-0.5 hover:bg-muted disabled:opacity-20"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDelete(p.name);
                }}
                className="rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
                title="Delete project"
              >
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </button>
            </SidebarItemLink>
          );
        })}
      </div>
    </Sidebar>
  );
}
