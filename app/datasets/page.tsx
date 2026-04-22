"use client";

import { Nav } from "@/components/nav";
import { DatasetManager } from "./dataset-manager";

export default function DatasetsPage() {
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <Nav />
      <DatasetManager />
    </div>
  );
}
