# URL Routing Refactor

## Overview

Change project pages from sidebar-selection to URL-based routing like Phoenix. Each project gets its own URL, enabling bookmarks, link sharing, and browser back/forward.

## Goals

- `/projects` → project list page
- `/projects/{name}` → specific project with traces
- `/projects/{name}/traces/{traceId}` → specific trace detail (deep link)
- Browser back/forward works naturally
- Existing sidebar UX preserved (sidebar shows project list, clicking navigates)

## Non-Goals

- Changing other pages' URL structure (datasets, evaluations, etc.)
- Server-side rendering of trace data

---

## Architecture

### Route Structure

```
app/projects/
├── page.tsx                          → /projects (project list, redirects to first or shows list)
├── [name]/
│   ├── page.tsx                      → /projects/{name} (trace list for project)
│   └── traces/
│       └── [traceId]/
│           └── page.tsx              → /projects/{name}/traces/{traceId} (trace detail)
```

### Current vs New

**Current:** Single `app/projects/page.tsx` → renders `ProjectsManager` which handles everything with state.

**New:** 
- `app/projects/page.tsx` — project list, sidebar with links
- `app/projects/[name]/page.tsx` — selected project view (traces, charts, stats)
- `app/projects/[name]/traces/[traceId]/page.tsx` — trace detail view

### Component Decomposition

`projects-manager.tsx` (currently ~700 lines) needs to be split:

1. **`ProjectsList`** — sidebar with project links (used in all project pages via layout)
2. **`ProjectView`** — trace list, charts, stats for a single project  
3. **`TraceDetail`** — span tree view for a single trace

### Shared Layout

```typescript
// app/projects/layout.tsx
// Renders Nav + Sidebar with project list
// Children render in the main content area
```

### Navigation

- Sidebar project items become `<Link href="/projects/{name}">` instead of `onClick` state changes
- Trace items in the list become `<Link href="/projects/{name}/traces/{traceId}">`
- Back button works naturally (browser history)

### URL Encoding

Project names may contain special characters. Use `encodeURIComponent` in links and `decodeURIComponent` in page params.

---

## Migration

The main challenge is splitting `projects-manager.tsx` which currently manages all state (selected project, selected trace, filters, etc.) into route-aware components.

Key state changes:
- `selectedProject` → comes from URL param `[name]`
- `selectedTrace` → comes from URL param `[traceId]`
- Filters, search, annotation filter → remain as component state (or URL search params for persistence)
