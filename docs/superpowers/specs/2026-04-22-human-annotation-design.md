# Human Annotation

## Overview

Add manual annotation capability to Projects and Playground pages. Users can label traces with pass/fail, scores, and comments — uploaded to Phoenix as `annotator_kind: "HUMAN"` annotations alongside existing auto-eval annotations.

## Goals

- Annotate traces directly from Projects trace detail and Playground results
- Select from existing eval names or enter custom annotation name
- Binary (Pass/Fail) or score (0-1) input based on eval outputMode
- Optional comment/explanation
- Upload to Phoenix as human annotation
- Display alongside auto-eval badges with visual distinction

## Non-Goals

- Annotation queue/workflow (future)
- Annotation assignment to specific users
- Local DB storage (Phoenix is source of truth)

---

## Architecture

### New API Route: `POST /api/annotations`

```typescript
// Body: { spanId, name, label, score, explanation }
// Uploads to Phoenix: POST /v1/span_annotations
// annotator_kind: "HUMAN"
```

### New Component: `AnnotationForm`

Shared modal/popover component used by both Projects and Playground.

**Props:**
- `spanId: string` — the span to annotate
- `existingAnnotations?: Annotation[]` — to show what's already annotated
- `onSaved?: () => void` — callback after successful save

**Form fields:**
1. **Eval name** — dropdown of registered eval names from `/api/eval-prompts` + free text input for custom
2. **Label/Score** — auto-switches based on eval's outputMode:
   - Binary: two buttons (Pass / Fail)
   - Score: slider or number input (0.0 - 1.0)
   - Custom name: default to binary
3. **Comment** — optional textarea
4. **Save button** → calls `POST /api/annotations`

### UI Integration

**Projects tab** (`projects-manager.tsx`):
- In trace detail panel, add "Annotate" button next to existing annotation badges
- Opens `AnnotationForm` as a popover or inline section

**Playground** (`playground.tsx`):
- In each column result area, add small "Annotate" button
- Opens `AnnotationForm` for the playground span

### Badge Display

Existing `AnnotationBadge` component already handles display. Add a small user icon to distinguish human annotations:
- Auto eval: badge as-is
- Human annotation: same badge + tiny user icon overlay

Distinction via the `annotator_kind` field from Phoenix annotation data. Requires fetching `annotator_kind` in the annotation fetch calls.

---

## Data Flow

```
1. User clicks "Annotate" on a trace/span
2. AnnotationForm opens with eval name dropdown
3. User selects eval, sets label/score, optionally adds comment
4. Save → POST /api/annotations
5. API route → Phoenix POST /v1/span_annotations (annotator_kind: "HUMAN")
6. UI refreshes annotations → new badge appears with human icon
```

## API Specification

### `POST /api/annotations`

**Request:**
```json
{
  "spanId": "abc123",
  "name": "hallucination",
  "label": "pass",
  "score": 1.0,
  "explanation": "Response is factually accurate"
}
```

**Response:**
```json
{ "ok": true }
```

**Implementation:**
```typescript
await fetch(`${PHOENIX}/v1/span_annotations?sync=true`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    data: [{
      span_id: spanId,
      name,
      annotator_kind: "HUMAN",
      result: { label, score, explanation }
    }]
  })
});
```

## UI Specifications

### AnnotationForm Component

```
┌─────────────────────────────┐
│ Add Annotation              │
├─────────────────────────────┤
│ Eval:  [hallucination    ▾] │
│                             │
│ Result: [Pass] [Fail]       │
│                             │
│ Comment:                    │
│ ┌─────────────────────────┐ │
│ │                         │ │
│ └─────────────────────────┘ │
│                             │
│           [Cancel] [Save]   │
└─────────────────────────────┘
```

- Monochrome palette per CLAUDE.md
- Uses shared `Button`, `Textarea`, `Modal` components
- Pass/Fail buttons: outline style, active state `bg-foreground text-background`
- Score mode: `<Input type="number" min={0} max={1} step={0.1} />`

### Badge Distinction

Human annotation badges show a tiny `User` icon (from lucide-react) at the left of the badge text:
- `[👤 HAL 100%]` vs `[HAL 100%]` for auto

This requires the `AnnotationBadge` component to accept an optional `annotatorKind` prop.
