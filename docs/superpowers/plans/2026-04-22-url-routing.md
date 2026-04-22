# URL Routing Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change project pages from sidebar-state-based navigation to URL-based routing (`/projects/{name}`, `/projects/{name}/traces/{traceId}`).

**Architecture:** Split `projects-manager.tsx` into a shared layout + route-specific pages. Project name and trace ID come from URL params instead of component state. Sidebar project items become `<Link>` elements.

**Tech Stack:** Next.js App Router dynamic routes, existing shared components

---

### Task 1: Create Projects Layout with Shared Sidebar

**Files:**
- Create: `app/projects/layout.tsx`
- Create: `app/projects/projects-sidebar.tsx`

- [ ] **Step 1: Create the sidebar component**

Extract the project list sidebar from `projects-manager.tsx` into a standalone component.

`app/projects/projects-sidebar.tsx`:

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchProjects, type Project } from "@/lib/phoenix";
import { Sidebar, SidebarHeader, SidebarItemDiv } from "@/components/ui/sidebar";
import { Plus, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProjectsSidebar() {
  const params = useParams();
  const currentName = params.name ? decodeURIComponent(params.name as string) : null;
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await fetchProjects();
      setProjects(p.filter((x) => x.name !== "playground"));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      await fetch("/api/v1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: "" }),
      });
      setNewName("");
      setCreating(false);
      await load();
    } catch {}
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete project "${name}"?`)) return;
    await fetch(`/api/v1/projects/${encodeURIComponent(name)}`, { method: "DELETE" });
    await load();
  }

  return (
    <Sidebar>
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <SidebarHeader>Projects</SidebarHeader>
        <div className="flex items-center gap-1">
          <button onClick={load} className="rounded p-1 hover:bg-muted" title="Refresh">
            <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => setCreating(true)} className="rounded p-1 hover:bg-muted" title="New project">
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>

      {creating && (
        <div className="mx-2 mb-2 flex gap-1">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
            placeholder="Project name..."
            className="h-7 text-xs"
            autoFocus
          />
          <Button size="sm" onClick={handleCreate} disabled={!newName.trim()} className="h-7 px-2 text-xs">OK</Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2">
        {projects.map((p) => (
          <Link key={p.name} href={`/projects/${encodeURIComponent(p.name)}`}>
            <SidebarItemDiv active={currentName === p.name} className="justify-between">
              <span className="truncate">{p.name}</span>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(p.name); }}
                className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-muted"
              >
                <Trash2 className="size-3 text-muted-foreground" />
              </button>
            </SidebarItemDiv>
          </Link>
        ))}
      </div>
    </Sidebar>
  );
}
```

- [ ] **Step 2: Create the layout**

`app/projects/layout.tsx`:

```typescript
import { Nav } from "@/components/nav";
import { ProjectsSidebar } from "./projects-sidebar";

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
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
```

- [ ] **Step 3: Commit**

```bash
git add app/projects/layout.tsx app/projects/projects-sidebar.tsx
git commit -m "feat: add projects layout with shared sidebar"
```

---

### Task 2: Create Project List Page (index)

**Files:**
- Modify: `app/projects/page.tsx`

- [ ] **Step 1: Replace current page with a simple redirect/empty state**

The project list page shows when no project is selected (`/projects`).

```typescript
import { EmptyState } from "@/components/ui/empty-state";
import { FolderOpen } from "lucide-react";

export default function ProjectsPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={FolderOpen}
        title="Select a project"
        description="Choose a project from the sidebar to view traces and analytics."
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/projects/page.tsx
git commit -m "feat: add projects index page with empty state"
```

---

### Task 3: Create Project Detail Page

**Files:**
- Create: `app/projects/[name]/page.tsx`

- [ ] **Step 1: Create the project detail page**

This page extracts the main content area from `projects-manager.tsx` — trace list, charts, stats, filters — for a single project.

```typescript
"use client";

import { use } from "react";
import { ProjectView } from "./project-view";

export default function ProjectPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const projectName = decodeURIComponent(name);

  return <ProjectView projectName={projectName} />;
}
```

- [ ] **Step 2: Create ProjectView component**

Create `app/projects/[name]/project-view.tsx` — extract the center panel logic from `projects-manager.tsx`. This is the main content area: trace list with SpanTreeView, charts (latency, scores, pass/fail), stat cards, filters (search, annotation, latency, date range).

This component receives `projectName` as a prop instead of reading it from state. It manages its own trace loading, filtering, and display.

Read the current `projects-manager.tsx` carefully and extract:
- All the trace loading logic (fetchTraces, fetchTraceTrees)
- Chart data computation
- Filter state and logic
- The JSX for the center panel (everything that's NOT the sidebar)

Keep the same UI, just decouple from the sidebar project selection.

- [ ] **Step 3: Commit**

```bash
git add app/projects/[name]/
git commit -m "feat: add project detail page with trace view"
```

---

### Task 4: Create Trace Detail Page (Deep Link)

**Files:**
- Create: `app/projects/[name]/traces/[traceId]/page.tsx`

- [ ] **Step 1: Create the trace deep link page**

```typescript
"use client";

import { use } from "react";
import { TraceDetailView } from "./trace-detail-view";

export default function TraceDetailPage({ params }: { params: Promise<{ name: string; traceId: string }> }) {
  const { name, traceId } = use(params);
  return (
    <TraceDetailView
      projectName={decodeURIComponent(name)}
      traceId={decodeURIComponent(traceId)}
    />
  );
}
```

- [ ] **Step 2: Create TraceDetailView component**

`app/projects/[name]/traces/[traceId]/trace-detail-view.tsx`:

This component fetches a single trace's span tree and renders the `SpanTreeView` for that specific trace. Include a back link to `/projects/{name}`.

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchTraceTrees, type TraceTree } from "@/lib/phoenix";
import { SpanTreeView } from "@/components/span-tree-view";
import { LoadingState } from "@/components/ui/empty-state";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function TraceDetailView({ projectName, traceId }: { projectName: string; traceId: string }) {
  const [traces, setTraces] = useState<TraceTree[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchTraceTrees(projectName);
      // Filter to the specific trace
      const filtered = result.filter((t) => t.traceId === traceId);
      setTraces(filtered);
    } catch {}
    setLoading(false);
  }, [projectName, traceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href={`/projects/${encodeURIComponent(projectName)}`}
          className="rounded p-1.5 transition-colors hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Trace Detail</h1>
          <p className="text-xs font-mono text-muted-foreground">{traceId}</p>
        </div>
      </div>

      {loading && <LoadingState />}

      {!loading && traces.length > 0 && (
        <SpanTreeView traces={traces} projectName={projectName} onRefresh={load} />
      )}

      {!loading && traces.length === 0 && (
        <p className="text-sm text-muted-foreground">Trace not found.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/projects/[name]/traces/
git commit -m "feat: add trace detail deep link page"
```

---

### Task 5: Clean Up Old ProjectsManager

**Files:**
- Modify or delete: `app/projects/projects-manager.tsx`

- [ ] **Step 1: Remove the old monolithic component**

Since the layout, sidebar, project view, and trace detail are now separate files, the old `projects-manager.tsx` is no longer needed. Delete it.

```bash
rm app/projects/projects-manager.tsx
```

Verify no imports reference it:

```bash
grep -r "projects-manager" app/ components/ --include="*.ts" --include="*.tsx"
```

The old `page.tsx` imported it — that was already replaced in Task 2.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "refactor: remove old projects-manager.tsx, replaced by route-based pages"
```

---

### Task 6: Update Trace Links in SpanTreeView

**Files:**
- Modify: `components/span-tree-view.tsx`

- [ ] **Step 1: Add trace deep links**

In the `SpanTreeView` trace list, make trace IDs clickable links to `/projects/{name}/traces/{traceId}`.

If `projectName` prop is provided, wrap the trace ID or add a link icon that opens the trace detail page.

- [ ] **Step 2: Commit**

```bash
git add components/span-tree-view.tsx
git commit -m "feat: add deep links to trace detail pages in SpanTreeView"
```

---

### Task 7: Build Verification

- [ ] **Step 1: Run build**

```bash
npx next build
```

Expected: Build succeeds. Routes include `/projects`, `/projects/[name]`, `/projects/[name]/traces/[traceId]`.

- [ ] **Step 2: Manual test**

1. Navigate to `/projects` — see empty state "Select a project"
2. Click project in sidebar — URL changes to `/projects/my-project`
3. See traces, charts, stats
4. Browser back → back to `/projects`
5. Bookmark `/projects/my-project` → opens directly to that project
6. Click a trace → URL changes to `/projects/my-project/traces/abc123`
7. Browser back → back to project view

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: complete URL routing refactor for projects"
```
