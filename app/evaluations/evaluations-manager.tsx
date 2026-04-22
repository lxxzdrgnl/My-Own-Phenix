"use client";
import { apiFetch } from "@/lib/api-client";

import { useEffect, useState, useCallback } from "react";
import { fetchProjects, type Project } from "@/lib/phoenix";
import { LoadingState } from "@/components/ui/empty-state";
import { Sidebar, SidebarHeader, SidebarItem } from "@/components/ui/sidebar";
import { DEFAULT_RULE_CONFIG, type RuleConfig } from "@/components/rule-builder";
import { BUILT_IN_EVALS } from "./eval-constants";
import { EvalList, type EvalPrompt, type ProjectEvalConfig } from "./eval-list";
import { EvalEditor } from "./eval-editor";

// ─── Component ─────────────────────────────────────────────────────────────

export function EvaluationsManager() {
  // Data
  const [projects, setProjects] = useState<Project[]>([]);
  const [globalPrompts, setGlobalPrompts] = useState<EvalPrompt[]>([]);
  const [projectConfigs, setProjectConfigs] = useState<ProjectEvalConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection
  const [selectedProject, setSelectedProjectState] = useState<string | null>(null);
  const setSelectedProject = (name: string | null) => {
    setSelectedProjectState(name);
    if (name) localStorage.setItem("last_eval_project", name);
  };
  const [selectedEval, setSelectedEval] = useState<string | null>(null);

  // New eval panel
  const [creating, setCreating] = useState(false);

  // Default model from settings
  const [defaultEvalModel, setDefaultEvalModel] = useState("gpt-4o-mini");

  // ── Load ──

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const ps = await fetchProjects();
      setProjects(ps);
      if (ps.length > 0 && !selectedProject) {
        const saved = localStorage.getItem("last_eval_project");
        const initial = saved && ps.some((p) => p.name === saved) ? saved : ps[0].name;
        setSelectedProjectState(initial);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProjectConfig = useCallback(async (pid: string) => {
    try {
      const [configRes, promptsRes] = await Promise.all([
        apiFetch(`/api/eval-config?projectId=${encodeURIComponent(pid)}`).then((r) => r.json()),
        apiFetch(`/api/eval-prompts?projectId=${encodeURIComponent(pid)}`).then((r) => r.json()),
      ]);
      setProjectConfigs(configRes.configs ?? []);
      setGlobalPrompts(promptsRes.prompts ?? []);
    } catch {}
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { if (selectedProject) loadProjectConfig(selectedProject); }, [selectedProject, loadProjectConfig]);
  useEffect(() => {
    apiFetch("/api/settings").then((r) => r.json()).then((data) => {
      if (data.defaultEvalModel) setDefaultEvalModel(data.defaultEvalModel);
    }).catch(() => {});
  }, []);

  // ── Toggle ──

  async function toggleEval(evalName: string) {
    if (!selectedProject) return;
    const config = projectConfigs.find((c) => c.evalName === evalName);
    const currentEnabled = config ? config.enabled : true;
    const newEnabled = !currentEnabled;

    // Optimistic update
    setProjectConfigs((prev) => {
      const exists = prev.some((c) => c.evalName === evalName);
      if (exists) {
        return prev.map((c) => (c.evalName === evalName ? { ...c, enabled: newEnabled } : c));
      }
      return [...prev, { id: `temp-${evalName}`, projectId: selectedProject, evalName, enabled: newEnabled, template: null }];
    });

    try {
      await apiFetch("/api/eval-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProject, evalName, enabled: newEnabled }),
      });
    } catch {}
    loadProjectConfig(selectedProject);
  }

  // ── Handlers for EvalEditor callbacks ──

  function handleCreated(name: string, evalType: string, template: string, ruleConfig: RuleConfig, model: string) {
    if (selectedProject) loadProjectConfig(selectedProject);
    setCreating(false);
    setSelectedEval(name);
  }

  function handleDeleted() {
    setSelectedEval(null);
    if (selectedProject) loadProjectConfig(selectedProject);
  }

  function handleProjectConfigReload() {
    if (selectedProject) loadProjectConfig(selectedProject);
  }

  if (loading) return <LoadingState className="flex-1" />;

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── Left: Project list ── */}
      <Sidebar>
        <div className="px-3 pt-3 pb-1">
          <SidebarHeader>Projects</SidebarHeader>
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          {projects.map((p) => (
            <SidebarItem
              key={p.name}
              active={selectedProject === p.name}
              onClick={() => { setSelectedProject(p.name); setSelectedEval(null); setCreating(false); }}
            >
              {p.name}
            </SidebarItem>
          ))}
        </div>
      </Sidebar>

      {/* ── Center: Eval list ── */}
      <EvalList
        selectedProject={selectedProject}
        selectedEval={selectedEval}
        globalPrompts={globalPrompts}
        projectConfigs={projectConfigs}
        onSelectEval={(name) => { setSelectedEval(name); setCreating(false); }}
        onToggleEval={toggleEval}
        onStartCreating={() => { setCreating(true); setSelectedEval(null); }}
      />

      {/* ── Right: Editor panel ── */}
      <div className="flex-1 overflow-y-auto">
        <EvalEditor
          key={selectedEval ?? (creating ? "__creating__" : "__empty__")}
          selectedEval={selectedEval}
          selectedProject={selectedProject}
          creating={creating}
          projects={projects}
          globalPrompts={globalPrompts}
          projectConfigs={projectConfigs}
          defaultEvalModel={defaultEvalModel}
          onCreated={handleCreated}
          onCancelCreate={() => setCreating(false)}
          onDeleted={handleDeleted}
          onProjectConfigReload={handleProjectConfigReload}
        />
      </div>
    </div>
  );
}
