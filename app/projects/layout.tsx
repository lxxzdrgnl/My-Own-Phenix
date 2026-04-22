import { Nav } from "@/components/nav";
import { ProjectsSidebar } from "./projects-sidebar";

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <Nav />
      <div className="flex min-h-0 flex-1">
        <ProjectsSidebar />
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
