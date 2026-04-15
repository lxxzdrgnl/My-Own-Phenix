# Project Guidelines

## Shared UI Components

New UI must use the shared components in `components/ui/`. Do NOT inline duplicate styles.

### Available Components

| Component | Path | Usage |
|-----------|------|-------|
| `Input` | `components/ui/input.tsx` | All text/number inputs |
| `Textarea` | `components/ui/textarea.tsx` | All multiline text fields |
| `Button` | `components/ui/button.tsx` | All buttons (variants: default, outline, destructive, ghost) |
| `Modal`, `ModalHeader`, `ModalBody` | `components/ui/modal.tsx` | All modal dialogs |
| `FormLabel` | `components/ui/form-field.tsx` | All form labels |
| `FormError` | `components/ui/form-field.tsx` | All form error messages |
| `LoadingState` | `components/ui/empty-state.tsx` | Loading spinners |
| `EmptyState` | `components/ui/empty-state.tsx` | Empty/no-data states (takes icon, title, description) |
| `Dialog` | `components/ui/dialog.tsx` | Radix-based dialog (for auth-modal style) |
| `Avatar` | `components/ui/avatar.tsx` | User avatar (Radix primitive) |
| `Collapsible` | `components/ui/collapsible.tsx` | Expandable/collapsible sections (Radix primitive) |
| `Tooltip` | `components/ui/tooltip.tsx` | Hover tooltips (Radix primitive) |
| `AnnotationBadge`, `AnnotationBadges` | `components/annotation-badge.tsx` | Annotation score display |
| `PromptFormModal`, `PromptFormInitial` | `components/prompts-modal.tsx` | Prompt create/edit form (single source of truth) |
| `PromptEditModal` | `components/prompt-edit-modal.tsx` | Thin wrapper around PromptFormModal for version editing |
| `PromptsModal` | `components/prompts-modal.tsx` | Full prompt management modal (list + CRUD) |
| `AuthModal` | `components/auth-modal.tsx` | Sign-in required dialog |
| `Nav` | `components/nav.tsx` | Top navigation bar (all pages) |
| `ModelSelector` | `components/model-selector.tsx` | LLM model dropdown selector |
| `ProjectSelector` | `components/project-selector.tsx` | Project dropdown selector with add support |
| `StatCard` | `components/dashboard/widgets/stat-card.tsx` | Dashboard stat card (value, label, trend) |
| `HighchartWidget` | `components/dashboard/widgets/highchart-widget.tsx` | Highcharts chart wrapper |
| `WidgetGrid` | `components/dashboard/widget-grid.tsx` | Draggable dashboard grid layout |
| `AddWidgetMenu` | `components/dashboard/add-widget-menu.tsx` | Widget type picker dropdown |

### Rules

- Before creating inline styles for inputs, buttons, modals, labels, error messages, or loading/empty states, check if a shared component already exists.
- If a new UI pattern appears 2+ times, extract it into `components/ui/`.
- All shared components use `cn()` from `lib/utils.ts` for className merging.
- Extend existing shared components with variants rather than creating new ones.
- `PromptFormModal` is the single source of truth for prompt create/edit forms. Do NOT duplicate this logic.
- `PromptEditModal` is a thin wrapper around `PromptFormModal` for convenience.

## Tech Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS (design tokens: `foreground`, `background`, `muted`, `primary`, `accent`, `card`, `popover`, `ring`)
- Radix UI primitives (Dialog, Tooltip, Collapsible)
- class-variance-authority for component variants
- Prisma + SQLite
- Firebase Auth
- Phoenix (Arize) for LLM observability
- Highcharts for data visualization

## Code Style

- Korean locale (`ko-KR`) for date formatting
- `"use client"` directive on all interactive components
- Prefer `useCallback` for async data-loading functions passed to `useEffect`

## UI Rules

- All UI must use **monochrome/grayscale color scheme** (black, white, gray tones only for base UI; color only for status indicators like green/yellow/red dots)
- All UI text must be in **English only** — no Korean in UI labels, buttons, headers, or placeholders

## Architecture Overview

### Dashboard (`app/dashboard/page.tsx`)
- Multi-project support with `ProjectSelector`
- Draggable `WidgetGrid` using react-grid-layout
- 17 widgets in 3 categories: Evaluation, Performance, Tokens & Cost
- Widget registry at `components/dashboard/widgets/registry.tsx`
- Layout persistence per user+project via Prisma (`app/api/dashboard/layout/route.ts`)

### Projects View (`app/projects/projects-manager.tsx`)
- Left sidebar: project list with reorder
- Center panel: traces, charts, stat cards
- Filters: annotation status, latency bands, full-text search

### Phoenix Data Flow
- Proxy: `app/api/phoenix/route.ts` → Phoenix server
- Client: `lib/phoenix.ts` (fetchProjects, fetchTraces, fetchPrompts, etc.)
- Spans fetched from `/v1/projects/{name}/spans`, annotations from `/v1/projects/{name}/span_annotations`
- Dashboard utils: `lib/dashboard-utils.ts` (groupByDate, hourlyBuckets, calcCost, etc.)

### Evaluation Pipeline (external: `legal-rag-self-improve-demo/`)
- 4 evals uploaded to Phoenix as span annotations:
  - `hallucination` (LLM-based, HallucinationEvaluator)
  - `qa_correctness` (LLM-based, QAEvaluator)
  - `rag_relevance` (LLM-based, RelevanceEvaluator)
  - `banned_word` (CODE-based, keyword match)
- Inline eval (real-time in graph) + polling worker (every 15s) + backfill on startup
- Annotations have: name, label, score (0-1), explanation

### Key Data Types
- `SpanData`: latency, status, time, promptTokens, completionTokens, totalTokens, model, spanKind
- `AnnotationData`: name, label, score, time
- `WidgetConfig`: id, type, title
- `WidgetViewMode`: "summary" | "trend" | "detail"
