"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { Assistant } from "./assistant";
import { fetchProjects } from "@/lib/phoenix";

const LS_KEY = "last_chat_project";

export default function Home() {
  const [project, setProject] = useState(() => {
    if (typeof window === "undefined") return "default";
    return localStorage.getItem(LS_KEY) || "default";
  });
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  const loadProjects = useCallback(() => {
    fetchProjects()
      .then((p) => setProjects(p.filter((x) => x.name !== "playground")))
      .catch(() => {});
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const handleProjectChange = (name: string) => {
    setProject(name);
    localStorage.setItem(LS_KEY, name);
  };

  const handleProjectAdd = async (name: string) => {
    try {
      const res = await fetch(`/api/phoenix?path=/v1/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: "" }),
      });
      if (res.ok) {
        loadProjects();
        handleProjectChange(name);
      }
    } catch {}
  };

  return (
    <Assistant
      project={project}
      projects={projects}
      onProjectChange={handleProjectChange}
      onProjectAdd={handleProjectAdd}
    />
  );
}
