# Human Annotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to manually annotate traces with labels, scores, and comments in Projects and Playground pages, uploaded to Phoenix as human annotations.

**Architecture:** New `POST /api/annotations` route uploads to Phoenix. New `AnnotationForm` component (modal) is shared between `SpanTreeView` (Projects) and Playground. The existing `Annotation` interface gains an `annotatorKind` field to distinguish human vs auto annotations in the UI.

**Tech Stack:** Next.js API route, Phoenix span_annotations API, React modal component, existing shared UI components

---

### Task 1: Annotation API Route

**Files:**
- Create: `app/api/annotations/route.ts`

- [ ] **Step 1: Create the annotation upload route**

```typescript
import { NextRequest, NextResponse } from "next/server";

const PHOENIX = process.env.PHOENIX_URL ?? "http://localhost:6006";

export async function POST(req: NextRequest) {
  const { spanId, name, label, score, explanation } = (await req.json()) as {
    spanId: string;
    name: string;
    label: string;
    score: number;
    explanation?: string;
  };

  if (!spanId || !name || !label) {
    return NextResponse.json({ error: "spanId, name, and label are required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${PHOENIX}/v1/span_annotations?sync=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [{
          span_id: spanId,
          name,
          annotator_kind: "HUMAN",
          result: { label, score: score ?? 0, explanation: explanation ?? "" },
        }],
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({ error: data.detail ?? `Phoenix error ${res.status}` }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to upload annotation" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/annotations/route.ts
git commit -m "feat: add human annotation API route"
```

---

### Task 2: Extend Annotation Interface with annotatorKind

**Files:**
- Modify: `lib/phoenix.ts`
- Modify: `components/annotation-badge.tsx`

- [ ] **Step 1: Add `annotatorKind` to the Annotation interface**

In `lib/phoenix.ts`, change:
```typescript
export interface Annotation {
  name: string;
  label: string;
  score: number;
}
```
to:
```typescript
export interface Annotation {
  name: string;
  label: string;
  score: number;
  annotatorKind?: "LLM" | "HUMAN";
}
```

- [ ] **Step 2: Populate annotatorKind when fetching annotations**

In `lib/phoenix.ts`, in the `fetchSpansAndAnnotations` function (around line 140-146), change:
```typescript
annMap[a.span_id].push({
  name: a.name,
  label: a.result?.label ?? "",
  score: a.result?.score ?? 0,
});
```
to:
```typescript
annMap[a.span_id].push({
  name: a.name,
  label: a.result?.label ?? "",
  score: a.result?.score ?? 0,
  annotatorKind: a.annotator_kind ?? undefined,
});
```

- [ ] **Step 3: Add human icon to AnnotationBadge**

In `components/annotation-badge.tsx`, add `User` to the lucide-react import:
```typescript
import { User } from "lucide-react";
```

In the `AnnotationBadge` component, add the `annotation.annotatorKind` check. Change the first `<span>` inside the badge (the name part, around line 99):

From:
```tsx
<span className={`px-1.5 py-1 ${good ? "bg-foreground/5 text-foreground/50" : "bg-foreground/10 text-foreground font-semibold"}`}>
  {short}
</span>
```

To:
```tsx
<span className={`flex items-center gap-0.5 px-1.5 py-1 ${good ? "bg-foreground/5 text-foreground/50" : "bg-foreground/10 text-foreground font-semibold"}`}>
  {annotation.annotatorKind === "HUMAN" && <User className="h-2.5 w-2.5" />}
  {short}
</span>
```

- [ ] **Step 4: Commit**

```bash
git add lib/phoenix.ts components/annotation-badge.tsx
git commit -m "feat: add annotatorKind to Annotation and show human icon on badges"
```

---

### Task 3: AnnotationForm Component

**Files:**
- Create: `components/annotation-form.tsx`

- [ ] **Step 1: Create the shared annotation form modal**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormLabel, FormError } from "@/components/ui/form-field";
import { Loader2 } from "lucide-react";
import type { Annotation } from "@/lib/phoenix";

interface EvalOption {
  name: string;
  outputMode: string; // "score" | "binary"
  badgeLabel: string;
}

interface AnnotationFormProps {
  open: boolean;
  onClose: () => void;
  spanId: string;
  existingAnnotations?: Annotation[];
  onSaved?: () => void;
}

export function AnnotationForm({ open, onClose, spanId, existingAnnotations = [], onSaved }: AnnotationFormProps) {
  const [evalOptions, setEvalOptions] = useState<EvalOption[]>([]);
  const [selectedEval, setSelectedEval] = useState("");
  const [customName, setCustomName] = useState("");
  const [mode, setMode] = useState<"binary" | "score">("binary");
  const [label, setLabel] = useState<"pass" | "fail" | "">("");
  const [score, setScore] = useState("1.0");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Load eval options
  const loadEvals = useCallback(async () => {
    try {
      const res = await fetch("/api/eval-prompts");
      const data = await res.json();
      setEvalOptions(
        (data.prompts ?? []).map((p: any) => ({
          name: p.name,
          outputMode: p.outputMode ?? "binary",
          badgeLabel: p.badgeLabel ?? "",
        })),
      );
    } catch {}
  }, []);

  useEffect(() => {
    if (open) {
      loadEvals();
      // Reset form
      setSelectedEval("");
      setCustomName("");
      setLabel("");
      setScore("1.0");
      setComment("");
      setError(undefined);
    }
  }, [open, loadEvals]);

  // Auto-detect mode when eval selected
  useEffect(() => {
    if (selectedEval === "__custom__") {
      setMode("binary");
    } else {
      const ev = evalOptions.find((e) => e.name === selectedEval);
      setMode(ev?.outputMode === "score" ? "score" : "binary");
    }
    setLabel("");
    setScore("1.0");
  }, [selectedEval, evalOptions]);

  const evalName = selectedEval === "__custom__" ? customName.trim() : selectedEval;

  async function handleSave() {
    if (!evalName) { setError("Select or enter an eval name."); return; }
    if (mode === "binary" && !label) { setError("Select Pass or Fail."); return; }
    setError(undefined);
    setSaving(true);

    const finalLabel = mode === "binary" ? label : (Number(score) >= 0.5 ? "pass" : "fail");
    const finalScore = mode === "binary" ? (label === "pass" ? 1.0 : 0.0) : Number(score);

    try {
      const res = await fetch("/api/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spanId,
          name: evalName,
          label: finalLabel,
          score: finalScore,
          explanation: comment.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to save annotation.");
        return;
      }

      onSaved?.();
      onClose();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  // Filter out already-annotated evals
  const existingNames = new Set(existingAnnotations.map((a) => a.name));
  const availableEvals = evalOptions.filter((e) => !existingNames.has(e.name));

  return (
    <Modal open={open} onClose={onClose} className="w-[440px]">
      <ModalHeader onClose={onClose}>Add Annotation</ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          {/* Eval name */}
          <div>
            <FormLabel>Evaluation</FormLabel>
            <select
              value={selectedEval}
              onChange={(e) => setSelectedEval(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select evaluation...</option>
              {availableEvals.map((e) => (
                <option key={e.name} value={e.name}>
                  {e.badgeLabel ? `${e.name} (${e.badgeLabel})` : e.name}
                </option>
              ))}
              <option value="__custom__">Custom name...</option>
            </select>
            {selectedEval === "__custom__" && (
              <Input
                className="mt-2"
                placeholder="Enter annotation name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            )}
          </div>

          {/* Result: Binary or Score */}
          {evalName && (
            <div>
              <FormLabel>Result</FormLabel>
              {mode === "binary" ? (
                <div className="flex gap-2">
                  <Button
                    variant={label === "pass" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setLabel("pass")}
                  >
                    Pass
                  </Button>
                  <Button
                    variant={label === "fail" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setLabel("fail")}
                  >
                    Fail
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    className="w-24 text-center tabular-nums"
                  />
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-foreground/40 transition-all"
                      style={{ width: `${Math.max(0, Math.min(1, Number(score))) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Comment */}
          {evalName && (
            <div>
              <FormLabel>Comment (optional)</FormLabel>
              <Textarea
                rows={2}
                placeholder="Explain your assessment..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          )}

          {error && <FormError message={error} />}

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !evalName}>
              {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/annotation-form.tsx
git commit -m "feat: add AnnotationForm modal component"
```

---

### Task 4: Integrate AnnotationForm into SpanTreeView (Projects)

**Files:**
- Modify: `components/span-tree-view.tsx`

- [ ] **Step 1: Add annotate button and form to SpanTreeView**

Read `components/span-tree-view.tsx` first to understand the structure.

Add imports:
```typescript
import { AnnotationForm } from "@/components/annotation-form";
import { Plus } from "lucide-react";
```

Add state at the top of the component:
```typescript
const [annotateSpanId, setAnnotateSpanId] = useState<string | null>(null);
const [annotateAnnotations, setAnnotateAnnotations] = useState<Annotation[]>([]);
```

Find every location where `<AnnotationBadges>` is rendered (there are 3 spots). After each `<AnnotationBadges>` block, add an "Annotate" button:

```tsx
<button
  onClick={(e) => {
    e.stopPropagation();
    setAnnotateSpanId(span.spanId);
    setAnnotateAnnotations(span.annotations);
  }}
  className="rounded p-1 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
  title="Add annotation"
>
  <Plus className="h-3 w-3" />
</button>
```

At the bottom of the component (before the closing fragment/div), add the form:

```tsx
<AnnotationForm
  open={!!annotateSpanId}
  onClose={() => setAnnotateSpanId(null)}
  spanId={annotateSpanId ?? ""}
  existingAnnotations={annotateAnnotations}
  onSaved={() => {
    setAnnotateSpanId(null);
    onRefresh?.();
  }}
/>
```

Note: The `SpanTreeView` component already has an `onRefresh` prop — use it to reload traces after annotation.

- [ ] **Step 2: Commit**

```bash
git add components/span-tree-view.tsx
git commit -m "feat: add annotate button to SpanTreeView in Projects"
```

---

### Task 5: Integrate AnnotationForm into Playground

**Files:**
- Modify: `app/playground/playground.tsx`

- [ ] **Step 1: Add annotate button to playground column results**

Read the playground file to find where column results are displayed. Look for where the LLM response text is shown per column.

Add imports:
```typescript
import { AnnotationForm } from "@/components/annotation-form";
import { MessageSquarePlus } from "lucide-react";
```

Add state:
```typescript
const [annotateSpanId, setAnnotateSpanId] = useState<string | null>(null);
```

The playground records spans to Phoenix with span IDs. Find where the result is displayed per column and add an annotate button next to it. The span ID should be available from the Phoenix span recording that happens in `/api/llm`.

However, the current `/api/llm` route doesn't return the span ID to the client. We need to modify it.

**First, update `/app/api/llm/route.ts`** to return the spanId in the response:

In the response JSON, add the spanId:
```typescript
return NextResponse.json({
  choices: [{ message: { content: result.content } }],
  usage: { ... },
  _spanId: spanId,  // add this
  _traceId: traceId, // add this
});
```

**Then in playground.tsx**, capture the spanId from the LLM response and store it per column.

Add `spanId` to the column type. In the column interface/state, add:
```typescript
spanId?: string;
```

When calling `/api/llm`, capture the spanId from the response and store it in the column state.

Then add an annotate button next to the result text:
```tsx
{col.spanId && (
  <button
    onClick={() => setAnnotateSpanId(col.spanId!)}
    className="rounded p-1 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
    title="Annotate this result"
  >
    <MessageSquarePlus className="h-3.5 w-3.5" />
  </button>
)}
```

Add the form at the bottom of the component:
```tsx
<AnnotationForm
  open={!!annotateSpanId}
  onClose={() => setAnnotateSpanId(null)}
  spanId={annotateSpanId ?? ""}
  onSaved={() => setAnnotateSpanId(null)}
/>
```

- [ ] **Step 2: Commit**

```bash
git add app/playground/playground.tsx app/api/llm/route.ts
git commit -m "feat: add annotate button to Playground results"
```

---

### Task 6: Update CLAUDE.md with AnnotationForm

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add AnnotationForm to the component table**

Add to the Available Components table:
```
| `AnnotationForm` | `components/annotation-form.tsx` | Human annotation modal (eval select, pass/fail or score, comment) |
```

- [ ] **Step 2: Commit**

Note: CLAUDE.md may be in .gitignore. If so, skip this step.

---

### Task 7: Build Verification

- [ ] **Step 1: Run build**

```bash
npx next build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 2: Manual verification checklist**

1. Start dev server: `npm run dev`
2. Go to Projects → select a project → expand a trace in SpanTreeView
3. Verify "+" annotate button appears next to annotation badges
4. Click it → AnnotationForm modal opens
5. Select an eval, choose Pass/Fail, optionally add comment
6. Save → modal closes, trace refreshes with new badge showing human icon
7. Go to Playground → run a prompt
8. Verify annotate button appears next to the result
9. Annotate → verify it saves

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete human annotation for Projects and Playground"
```
