"use client";

import { Nav } from "@/components/nav";
import { EvaluationsManager } from "./evaluations-manager";

export default function EvaluationsPage() {
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <Nav />
      <EvaluationsManager />
    </div>
  );
}
