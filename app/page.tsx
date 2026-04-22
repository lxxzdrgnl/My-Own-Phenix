"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { Assistant } from "./assistant";
import { fetchProjects } from "@/lib/phoenix";

const LS_KEY = "last_chat_project";

export default function Home() {
  const [project, setProject] = useState<string | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    setProject(saved || "default");
    fetchProjects()
      .then((p) => setProjects(p.filter((x) => x.name !== "playground")))
      .catch(() => {});
  }, []);

  const handleProjectChange = (name: string) => {
    setProject(name);
    localStorage.setItem(LS_KEY, name);
  };

  const handleProjectAdd = async (name: string) => {
    try {
      const res = await fetch(`/api/v1/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: "" }),
      });
      if (res.ok) {
        fetchProjects().then((p) => setProjects(p.filter((x) => x.name !== "playground"))).catch(() => {});
        handleProjectChange(name);
      }
    } catch {}
  };

  if (!project) return null;

  return (
    <Assistant
      project={project}
      projects={projects}
      onProjectChange={handleProjectChange}
      onProjectAdd={handleProjectAdd}
    />
  );
}
