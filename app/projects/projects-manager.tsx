"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchProjects, Project } from "@/lib/phoenix";
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { Nav } from "@/components/nav";

export function ProjectsManager() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ps = await fetchProjects();
      // Restore saved order from localStorage
      const saved = localStorage.getItem("project_order");
      if (saved) {
        try {
          const order: string[] = JSON.parse(saved);
          ps.sort((a, b) => {
            const ai = order.indexOf(a.name);
            const bi = order.indexOf(b.name);
            if (ai === -1 && bi === -1) return 0;
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
          });
        } catch {}
      }
      setProjects(ps);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await fetch("/api/phoenix?path=/v1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: "" }),
      });
      setNewName("");
      await load();
    } catch (e: any) {
      alert(`Failed: ${e.message}`);
    }
    setCreating(false);
  }

  async function handleDelete(name: string) {
    if (!confirm(`"${name}" 프로젝트를 삭제하시겠습니까? 모든 트레이스가 삭제됩니다.`)) return;
    try {
      await fetch(`/api/phoenix?path=/v1/projects/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      await load();
    } catch (e: any) {
      alert(`Failed: ${e.message}`);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <Nav />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl">
          {/* Create */}
          <div className="mb-5 flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="New project name"
              className="h-10 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              className="flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              {creating ? "Creating..." : "Create"}
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading...
            </div>
          )}

          {/* List */}
          <div className="flex flex-col gap-2">
            {projects.map((p, idx) => (
              <div
                key={p.name}
                className="flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/30"
              >
                <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/30" />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{p.name}</p>
                </div>

                {/* Order buttons */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    className="rounded p-0.5 hover:bg-muted disabled:opacity-20"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => moveDown(idx)}
                    disabled={idx === projects.length - 1}
                    className="rounded p-0.5 hover:bg-muted disabled:opacity-20"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>

                <button
                  onClick={() => handleDelete(p.name)}
                  className="rounded p-1.5 transition-colors hover:bg-muted"
                  title="Delete project"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>

          {!loading && projects.length === 0 && (
            <p className="py-20 text-center text-sm text-muted-foreground">
              No projects
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
