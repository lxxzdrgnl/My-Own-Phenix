"use client";

import { use } from "react";
import { ProjectView } from "./project-view";

export default function ProjectPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  return <ProjectView projectName={decodeURIComponent(name)} />;
}
