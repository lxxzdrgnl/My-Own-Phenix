import { EmptyState } from "@/components/ui/empty-state";
import { FolderOpen } from "lucide-react";

export const dynamic = "force-dynamic";

export default function ProjectsPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState icon={FolderOpen} title="Select a project" description="Choose a project from the sidebar." />
    </div>
  );
}
