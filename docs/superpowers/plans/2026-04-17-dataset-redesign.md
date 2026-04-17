# Dataset Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the dataset feature with CSV import modal, DB-based agent selection, multi-eval support, and persistent run history.

**Architecture:** Left sidebar for dataset list, right area with config bar (agent + eval selection) and results table. DatasetRun model persists generate+evaluate results. CSV import modal handles column mapping at import time.

**Tech Stack:** Next.js App Router, Prisma/SQLite, Tailwind CSS, existing shared UI components (Modal, Button, Input)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `prisma/schema.prisma` | Modify | Remove responseCol, add DatasetRun model |
| `app/api/datasets/route.ts` | Modify | Remove responseCol from CRUD |
| `app/api/datasets/rows/route.ts` | Modify | Remove responseCol from response |
| `app/api/datasets/runs/route.ts` | Create | Run CRUD: list, create |
| `app/api/datasets/runs/[runId]/route.ts` | Create | Single run: get, update, delete |
| `app/api/datasets/runs/[runId]/export/route.ts` | Create | CSV export |
| `components/csv-import-modal.tsx` | Create | CSV import modal with preview + column mapping |
| `app/datasets/dataset-manager.tsx` | Rewrite | New layout: sidebar + config bar + results table |
| `components/add-to-dataset-modal.tsx` | Modify | Remove responseCol references |

---

### Task 1: Schema — Remove responseCol, Add DatasetRun

**Files:**
- Modify: `prisma/schema.prisma:140-152`

- [ ] **Step 1: Update Prisma schema**

In `prisma/schema.prisma`, replace the Dataset model (lines 140–152) with:

```prisma
model Dataset {
  id         String       @id @default(cuid())
  name       String
  fileName   String       @default("")
  headers    String       @default("[]")
  queryCol   String       @default("")
  contextCol String       @default("")
  rowCount   Int          @default(0)
  rows       String       @default("[]")
  runs       DatasetRun[]
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt
}

model DatasetRun {
  id          String   @id @default(cuid())
  datasetId   String
  dataset     Dataset  @relation(fields: [datasetId], references: [id], onDelete: Cascade)
  agentSource String   @default("")
  evalNames   String   @default("[]")
  status      String   @default("running")
  rowResults  String   @default("[]")
  createdAt   DateTime @default(now())
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma db push
```

Expected: Schema synced, no errors. The `responseCol` column is dropped from Dataset, DatasetRun table created.

- [ ] **Step 3: Generate Prisma client**

```bash
npx prisma generate
```

Expected: Prisma Client generated successfully.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(dataset): remove responseCol, add DatasetRun model"
```

---

### Task 2: Update Dataset API — Remove responseCol

**Files:**
- Modify: `app/api/datasets/route.ts`
- Modify: `app/api/datasets/rows/route.ts`

- [ ] **Step 1: Update `app/api/datasets/route.ts`**

In the GET handler (line 7), remove `responseCol` from the select:

```typescript
select: { id: true, name: true, fileName: true, headers: true, queryCol: true, contextCol: true, rowCount: true, createdAt: true, updatedAt: true },
```

In the POST handler (lines 13-14), remove `responseCol` from destructuring and data:

```typescript
const { name, fileName, headers, queryCol, contextCol, rows } = body;
```

And the create data (remove `responseCol: responseCol ?? ""`):

```typescript
const dataset = await prisma.dataset.create({
  data: {
    name,
    fileName: fileName ?? "",
    headers: JSON.stringify(headers ?? []),
    queryCol: queryCol ?? "",
    contextCol: contextCol ?? "",
    rowCount: rows?.length ?? 0,
    rows: JSON.stringify(rows ?? []),
  },
});
```

In the PUT handler (lines 46-48), remove the responseCol line:

Remove: `if (data.responseCol !== undefined) updateData.responseCol = data.responseCol;`

- [ ] **Step 2: Update `app/api/datasets/rows/route.ts`**

In the GET response (lines 14-17), remove `responseCol`:

```typescript
return NextResponse.json({
  rows: JSON.parse(dataset.rows),
  headers: JSON.parse(dataset.headers),
  queryCol: dataset.queryCol,
  contextCol: dataset.contextCol,
});
```

- [ ] **Step 3: Verify the app compiles**

```bash
npx next build 2>&1 | head -30
```

Expected: No TypeScript errors related to responseCol.

- [ ] **Step 4: Commit**

```bash
git add app/api/datasets/route.ts app/api/datasets/rows/route.ts
git commit -m "feat(dataset): remove responseCol from API routes"
```

---

### Task 3: DatasetRun API Routes

**Files:**
- Create: `app/api/datasets/runs/route.ts`
- Create: `app/api/datasets/runs/[runId]/route.ts`
- Create: `app/api/datasets/runs/[runId]/export/route.ts`

- [ ] **Step 1: Create `app/api/datasets/runs/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// List runs for a dataset
export async function GET(request: NextRequest) {
  const datasetId = request.nextUrl.searchParams.get("datasetId");
  if (!datasetId) return NextResponse.json({ error: "datasetId required" }, { status: 400 });

  const runs = await prisma.datasetRun.findMany({
    where: { datasetId },
    orderBy: { createdAt: "desc" },
    select: { id: true, agentSource: true, evalNames: true, status: true, createdAt: true },
  });
  return NextResponse.json({ runs });
}

// Create a new run
export async function POST(request: NextRequest) {
  const { datasetId, agentSource, evalNames } = await request.json();
  if (!datasetId || !agentSource) {
    return NextResponse.json({ error: "datasetId and agentSource required" }, { status: 400 });
  }

  const run = await prisma.datasetRun.create({
    data: {
      datasetId,
      agentSource,
      evalNames: JSON.stringify(evalNames ?? []),
      status: "running",
      rowResults: "[]",
    },
  });
  return NextResponse.json({ run }, { status: 201 });
}
```

- [ ] **Step 2: Create `app/api/datasets/runs/[runId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Get single run with results
export async function GET(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = await prisma.datasetRun.findUnique({ where: { id: runId } });
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    ...run,
    evalNames: JSON.parse(run.evalNames),
    rowResults: JSON.parse(run.rowResults),
  });
}

// Update run (status, append results)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const body = await req.json();
  const updateData: Record<string, unknown> = {};

  if (body.status !== undefined) updateData.status = body.status;
  if (body.rowResults !== undefined) updateData.rowResults = JSON.stringify(body.rowResults);
  if (body.evalNames !== undefined) updateData.evalNames = JSON.stringify(body.evalNames);

  const run = await prisma.datasetRun.update({ where: { id: runId }, data: updateData });
  return NextResponse.json({ run });
}

// Delete run
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  await prisma.datasetRun.delete({ where: { id: runId } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Create `app/api/datasets/runs/[runId]/export/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = await prisma.datasetRun.findUnique({ where: { id: runId } });
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });

  const dataset = await prisma.dataset.findUnique({ where: { id: run.datasetId } });
  if (!dataset) return NextResponse.json({ error: "dataset not found" }, { status: 404 });

  const headers: string[] = JSON.parse(dataset.headers);
  const rows: Record<string, string>[] = JSON.parse(dataset.rows);
  const rowResults: { rowIdx: number; response: string; evals: Record<string, { label: string; score: number; explanation: string }> }[] = JSON.parse(run.rowResults);
  const evalNames: string[] = JSON.parse(run.evalNames);

  // Build CSV header
  const csvHeaders = [...headers, "response"];
  for (const en of evalNames) {
    csvHeaders.push(`${en}_label`, `${en}_score`, `${en}_explanation`);
  }

  // Build CSV rows
  const csvRows: string[] = [csvHeaders.map(escapeCSV).join(",")];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const result = rowResults.find((r) => r.rowIdx === i);
    const cells: string[] = headers.map((h) => row[h] ?? "");
    cells.push(result?.response ?? "");
    for (const en of evalNames) {
      const ev = result?.evals?.[en];
      cells.push(ev?.label ?? "", String(ev?.score ?? ""), ev?.explanation ?? "");
    }
    csvRows.push(cells.map(escapeCSV).join(","));
  }

  const csv = csvRows.join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${dataset.name}-run-${runId.slice(0, 8)}.csv"`,
    },
  });
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
```

- [ ] **Step 4: Verify routes compile**

```bash
npx next build 2>&1 | tail -10
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/api/datasets/runs/
git commit -m "feat(dataset): add DatasetRun API routes (CRUD + CSV export)"
```

---

### Task 4: CSV Import Modal

**Files:**
- Create: `components/csv-import-modal.tsx`

- [ ] **Step 1: Create `components/csv-import-modal.tsx`**

```tsx
"use client";

import { useState, useRef } from "react";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload } from "lucide-react";

interface CSVImportModalProps {
  open: boolean;
  onClose: () => void;
  /** null = new dataset, string = append to existing dataset */
  targetDataset: { id: string; name: string } | null;
  onImport: (data: {
    name: string;
    fileName: string;
    headers: string[];
    rows: Record<string, string>[];
    queryCol: string;
    contextCol: string;
  }) => void;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  function parseLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; }
      else { current += ch; }
    }
    result.push(current.trim());
    return result;
  }
  const headers = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseLine(lines[i]);
    if (vals.length === 0 || (vals.length === 1 && !vals[0])) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ""; });
    rows.push(row);
  }
  return { headers, rows };
}

function autoMapColumns(headers: string[]) {
  const lower = headers.map((x) => x.toLowerCase());
  const find = (keywords: string[]) =>
    headers[lower.findIndex((x) => keywords.some((k) => x.includes(k)))] ?? "";
  return {
    queryCol: find(["query", "question", "prompt", "input", "instruction", "user_prompt", "jailbreak_query"]),
    contextCol: find(["context", "document", "reference"]),
  };
}

export function CSVImportModal({ open, onClose, targetDataset, onImport }: CSVImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [queryCol, setQueryCol] = useState("");
  const [contextCol, setContextCol] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    setFile(f);
    if (!targetDataset && !name) setName(f.name.replace(/\.(csv|tsv)$/i, ""));
    f.text().then((text) => {
      const parsed = parseCSV(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      const mapping = autoMapColumns(parsed.headers);
      setQueryCol(mapping.queryCol);
      setContextCol(mapping.contextCol);
    });
  }

  function handleConfirm() {
    const dsName = targetDataset ? targetDataset.name : name.trim();
    if (!dsName || headers.length === 0) return;
    onImport({
      name: dsName,
      fileName: file?.name ?? "",
      headers,
      rows,
      queryCol,
      contextCol,
    });
    // Reset state
    setFile(null);
    setName("");
    setHeaders([]);
    setRows([]);
    setQueryCol("");
    setContextCol("");
    onClose();
  }

  function handleClose() {
    setFile(null);
    setName("");
    setHeaders([]);
    setRows([]);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} className="w-[700px]">
      <ModalHeader onClose={handleClose}>
        {targetDataset ? `Import CSV → ${targetDataset.name}` : "Import CSV — New Dataset"}
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          {/* Dataset name (new only) */}
          {!targetDataset && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 block">
                Dataset Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. jailbreak-tests"
                className="text-sm"
                autoFocus
              />
            </div>
          )}

          {/* File drop / select */}
          {!file ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/20 py-10 cursor-pointer hover:border-muted-foreground/40 transition-colors"
            >
              <Upload className="size-6 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">Drop a CSV file or click to browse</p>
              <input ref={fileRef} type="file" accept=".csv,.tsv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          ) : (
            <>
              {/* File info */}
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{rows.length} rows, {headers.length} columns</p>
              </div>

              {/* Column mapping */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 block">
                    Query Column
                  </label>
                  <select
                    value={queryCol}
                    onChange={(e) => setQueryCol(e.target.value)}
                    className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                  >
                    <option value="">— None —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 block">
                    Context Column (optional)
                  </label>
                  <select
                    value={contextCol}
                    onChange={(e) => setContextCol(e.target.value)}
                    className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                  >
                    <option value="">— None —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>

              {/* Preview table */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Preview (first 5 rows)</p>
                <div className="rounded-lg border overflow-hidden">
                  <div className="max-h-[200px] overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30 sticky top-0">
                        <tr>
                          {headers.map((h) => (
                            <th key={h} className="px-3 py-1.5 text-left font-semibold text-muted-foreground whitespace-nowrap">
                              {h}
                              {h === queryCol && <span className="ml-1 text-[8px] text-blue-500">Q</span>}
                              {h === contextCol && <span className="ml-1 text-[8px] text-purple-500">C</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-t">
                            {headers.map((h) => (
                              <td key={h} className="px-3 py-1.5 max-w-[180px] truncate" title={row[h]}>{row[h]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={handleClose} className="text-xs">Cancel</Button>
            <Button
              onClick={handleConfirm}
              disabled={headers.length === 0 || (!targetDataset && !name.trim())}
              className="text-xs"
            >
              {targetDataset ? "Import" : "Create & Import"}
            </Button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx next build 2>&1 | tail -5
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add components/csv-import-modal.tsx
git commit -m "feat(dataset): add CSV import modal with preview and column mapping"
```

---

### Task 5: Rewrite DatasetManager — Sidebar + Config Bar + Results Table

**Files:**
- Rewrite: `app/datasets/dataset-manager.tsx`

This is the largest task. The component structure:
1. Left sidebar: dataset list
2. Right area: header, config bar, results table, stats bar

- [ ] **Step 1: Rewrite `app/datasets/dataset-manager.tsx`**

```tsx
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CSVImportModal } from "@/components/csv-import-modal";
import { cn } from "@/lib/utils";
import {
  Upload,
  Play,
  FileSpreadsheet,
  Plus,
  Trash2,
  RefreshCw,
  Database,
  Download,
  ChevronDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────

interface DatasetMeta {
  id: string;
  name: string;
  fileName: string;
  headers: string;
  queryCol: string;
  contextCol: string;
  rowCount: number;
}

interface DatasetRow {
  [key: string]: string;
}

interface RunMeta {
  id: string;
  agentSource: string;
  evalNames: string;
  status: string;
  createdAt: string;
}

interface RowResult {
  rowIdx: number;
  response: string;
  evals: Record<string, { label: string; score: number; explanation: string }>;
}

interface AgentConfigOption {
  id: string;
  project: string;
  alias: string | null;
  agentType: string;
  endpoint: string;
  assistantId: string;
}

interface EvalOption {
  name: string;
  evalType: string;
  template: string;
  outputMode: string;
  isCustom: boolean;
  badgeLabel: string;
}

const PASS_LABELS = new Set([
  "pass", "true", "yes", "correct", "factual", "faithful",
  "appropriate", "clean", "relevant",
]);

// ─── Component ────────────────────────────────────────────────────────────

export function DatasetManager() {
  // Dataset list
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Create
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  // Detail state
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [queryCol, setQueryCol] = useState("");
  const [contextCol, setContextCol] = useState("");

  // Import modal
  const [importModal, setImportModal] = useState<{
    open: boolean;
    target: { id: string; name: string } | null;
  }>({ open: false, target: null });
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Agent config
  const [agentConfigs, setAgentConfigs] = useState<AgentConfigOption[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("llm:gpt-4o-mini");
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);

  // Evals
  const [evalOptions, setEvalOptions] = useState<EvalOption[]>([]);
  const [checkedEvals, setCheckedEvals] = useState<Set<string>>(new Set());
  const [evaluating, setEvaluating] = useState(false);
  const [evalProgress, setEvalProgress] = useState(0);

  // Runs
  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<RowResult[]>([]);
  const [runEvalNames, setRunEvalNames] = useState<string[]>([]);
  const [runsOpen, setRunsOpen] = useState(false);

  // In-progress results (before saved to run)
  const [liveResults, setLiveResults] = useState<RowResult[]>([]);
  const [liveRunId, setLiveRunId] = useState<string | null>(null);

  // ── Load datasets ──
  const loadDatasets = useCallback(async () => {
    try {
      const res = await fetch("/api/datasets");
      const data = await res.json();
      setDatasets(data.datasets ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  // ── Load agent configs ──
  useEffect(() => {
    fetch("/api/agent-config")
      .then((r) => r.json())
      .then((data) => setAgentConfigs(data.configs ?? []))
      .catch(() => {});
  }, []);

  // ── Load evals ──
  useEffect(() => {
    fetch("/api/eval-prompts")
      .then((r) => r.json())
      .then((data) => {
        const prompts = (data.prompts ?? []).filter(
          (p: EvalOption) => p.template || p.evalType === "code_rule"
        );
        setEvalOptions(prompts);
      })
      .catch(() => {});
  }, []);

  // ── Select dataset ──
  async function selectDataset(id: string) {
    setSelectedId(id);
    setLiveResults([]);
    setLiveRunId(null);
    setSelectedRunId(null);
    setRunResults([]);
    setRunEvalNames([]);
    try {
      const [rowsRes, runsRes] = await Promise.all([
        fetch(`/api/datasets/rows?id=${id}`),
        fetch(`/api/datasets/runs?datasetId=${id}`),
      ]);
      const rowsData = await rowsRes.json();
      const runsData = await runsRes.json();
      setHeaders(rowsData.headers ?? []);
      setRows(rowsData.rows ?? []);
      setQueryCol(rowsData.queryCol ?? "");
      setContextCol(rowsData.contextCol ?? "");
      setRuns(runsData.runs ?? []);
    } catch {}
  }

  // ── Load run results ──
  async function loadRun(runId: string) {
    setSelectedRunId(runId);
    setLiveResults([]);
    setLiveRunId(null);
    try {
      const res = await fetch(`/api/datasets/runs/${runId}`);
      const data = await res.json();
      setRunResults(data.rowResults ?? []);
      setRunEvalNames(data.evalNames ?? []);
    } catch {}
  }

  // ── Create empty dataset ──
  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const res = await fetch("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      setNewName("");
      setCreating(false);
      await loadDatasets();
      if (data.dataset?.id) selectDataset(data.dataset.id);
    } catch {}
  }

  // ── CSV Import callback ──
  async function handleImport(data: {
    name: string;
    fileName: string;
    headers: string[];
    rows: Record<string, string>[];
    queryCol: string;
    contextCol: string;
  }) {
    const target = importModal.target;
    if (target) {
      // Append to existing
      await fetch("/api/datasets/rows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: target.id, rows: data.rows }),
      });
      await loadDatasets();
      selectDataset(target.id);
    } else {
      // Create new
      const res = await fetch("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          fileName: data.fileName,
          headers: data.headers,
          rows: data.rows,
          queryCol: data.queryCol,
          contextCol: data.contextCol,
        }),
      });
      const result = await res.json();
      await loadDatasets();
      if (result.dataset?.id) selectDataset(result.dataset.id);
    }
  }

  // ── Delete dataset ──
  async function handleDelete(id: string) {
    if (!confirm("Delete this dataset?")) return;
    await fetch("/api/datasets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (selectedId === id) {
      setSelectedId(null);
      setRows([]);
      setHeaders([]);
    }
    loadDatasets();
  }

  // ── Generate responses ──
  async function handleGenerate() {
    if (!rows.length || !selectedId) return;
    setGenerating(true);
    setGenProgress(0);

    // Create run
    const runRes = await fetch("/api/datasets/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        datasetId: selectedId,
        agentSource: selectedAgent,
        evalNames: [],
      }),
    });
    const { run } = await runRes.json();
    setLiveRunId(run.id);
    setSelectedRunId(null);

    const results: RowResult[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const query = queryCol ? row[queryCol] ?? "" : "";
      let response = "";

      try {
        if (selectedAgent.startsWith("llm:")) {
          // Direct LLM
          const model = selectedAgent.replace("llm:", "");
          const res = await fetch("/api/llm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              messages: [{ role: "user", content: query }],
              temperature: 0.7,
            }),
          });
          const data = await res.json();
          response = data.choices?.[0]?.message?.content ?? "(no response)";
        } else {
          // Agent — find config
          const configId = selectedAgent.replace("agent:", "");
          const config = agentConfigs.find((c) => c.id === configId);
          if (!config) throw new Error("Agent config not found");

          const { createThread, sendMessage, createThreadRest, sendMessageRest } =
            await import("@/lib/chatApi");

          const isRest = config.agentType === "rest";
          const { thread_id } = isRest
            ? await createThreadRest()
            : await createThread(config.endpoint);

          const msgs = [{ type: "human" as const, content: query }];

          if (isRest) {
            for await (const event of sendMessageRest({
              endpoint: config.endpoint,
              threadId: thread_id,
              messages: msgs,
              project: config.project,
            })) {
              if ((event.event as string) === "messages/partial") {
                const d = event.data as any;
                if (Array.isArray(d)) {
                  const last = d[d.length - 1];
                  if (last?.content)
                    response =
                      typeof last.content === "string"
                        ? last.content
                        : last.content.map((p: any) => p.text ?? "").join("");
                }
              }
            }
          } else {
            const generator = await sendMessage({
              threadId: thread_id,
              messages: msgs,
              project: config.project,
              endpoint: config.endpoint,
              assistantId: config.assistantId,
            });
            for await (const event of generator) {
              if ((event.event as string) === "messages/partial") {
                const d = event.data as any;
                if (Array.isArray(d)) {
                  const last = d[d.length - 1];
                  if (last?.content)
                    response =
                      typeof last.content === "string"
                        ? last.content
                        : last.content.map((p: any) => p.text ?? "").join("");
                }
              }
            }
          }
          response = response || "(no response)";
        }
      } catch (e) {
        response = `(error: ${e instanceof Error ? e.message : String(e)})`;
      }

      results.push({ rowIdx: i, response, evals: {} });
      setGenProgress(Math.round(((i + 1) / rows.length) * 100));
      setLiveResults([...results]);
    }

    // Save results to run
    await fetch(`/api/datasets/runs/${run.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowResults: results, status: "generated" }),
    });

    setGenerating(false);
    // Refresh runs list
    const runsRes = await fetch(`/api/datasets/runs?datasetId=${selectedId}`);
    const runsData = await runsRes.json();
    setRuns(runsData.runs ?? []);
  }

  // ── Evaluate ──
  async function handleEvaluate() {
    if (checkedEvals.size === 0) return;
    const runId = liveRunId;
    const currentResults = liveResults;
    if (!runId || currentResults.length === 0) return;

    setEvaluating(true);
    setEvalProgress(0);

    const evalNamesList = [...checkedEvals];
    const evalsToRun = evalOptions.filter((e) => checkedEvals.has(e.name));

    // Update run with eval names
    await fetch(`/api/datasets/runs/${runId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evalNames: evalNamesList }),
    });

    const updatedResults = currentResults.map((r) => ({ ...r, evals: { ...r.evals } }));
    const totalWork = rows.length * evalsToRun.length;
    let done = 0;

    for (const eval_ of evalsToRun) {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const query = queryCol ? row[queryCol] ?? "" : "";
        const context = contextCol ? row[contextCol] ?? "" : "";
        const response = updatedResults[i]?.response ?? "";

        try {
          if (eval_.evalType === "code_rule") {
            // Run code rule locally
            const ruleConfig = JSON.parse(eval_.template || "{}");
            // Simple rule evaluation — check response for patterns
            const rules = ruleConfig.rules ?? [];
            const logic = ruleConfig.logic ?? "any";
            let matched = logic === "all";
            for (const rule of rules) {
              const target = rule.check === "query" ? query : response;
              const words = (rule.value ?? "").split(",").map((w: string) => w.trim());
              const cs = rule.caseSensitive;
              const t = cs ? target : target.toLowerCase();
              const hit = words.some((w: string) => t.includes(cs ? w : w.toLowerCase()));
              if (logic === "any" && hit) { matched = true; break; }
              if (logic === "all" && !hit) { matched = false; break; }
            }
            const result = matched ? ruleConfig.match : ruleConfig.clean;
            updatedResults[i].evals[eval_.name] = {
              label: result?.label ?? (matched ? "detected" : "clean"),
              score: result?.score ?? (matched ? 1.0 : 0.0),
              explanation: "",
            };
          } else if (eval_.template) {
            // LLM eval
            const filled = eval_.template
              .replace(/\{context\}/g, context || "(no context)")
              .replace(/\{response\}/g, response || "(no response)")
              .replace(/\{query\}/g, query || "(no query)");

            const res = await fetch("/api/llm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: filled }],
                temperature: 0,
              }),
            });
            const data = await res.json();
            const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
            const label = String(parsed.label ?? "");
            const isBinary = parsed.score === undefined;
            const score = isBinary
              ? PASS_LABELS.has(label.toLowerCase()) ? 1.0 : 0.0
              : Number(parsed.score ?? 0);
            updatedResults[i].evals[eval_.name] = {
              label,
              score,
              explanation: parsed.explanation ?? "",
            };
          }
        } catch (e) {
          updatedResults[i].evals[eval_.name] = {
            label: "error",
            score: 0,
            explanation: String(e),
          };
        }

        done++;
        setEvalProgress(Math.round((done / totalWork) * 100));
        setLiveResults([...updatedResults]);
      }
    }

    // Save to run
    await fetch(`/api/datasets/runs/${runId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowResults: updatedResults, status: "completed" }),
    });

    setEvaluating(false);
    setRunEvalNames(evalNamesList);
    // Refresh runs list
    if (selectedId) {
      const runsRes = await fetch(`/api/datasets/runs?datasetId=${selectedId}`);
      const runsData = await runsRes.json();
      setRuns(runsData.runs ?? []);
    }
  }

  // ── Derived state ──
  const selected = datasets.find((d) => d.id === selectedId);
  const displayResults = liveRunId ? liveResults : runResults;
  const displayEvalNames = liveRunId
    ? [...checkedEvals]
    : runEvalNames;
  const hasResults = displayResults.length > 0;

  // Stats
  const allEvalEntries = displayResults.flatMap((r) =>
    Object.values(r.evals).filter((e) => e.label !== "error")
  );
  const passCount = allEvalEntries.filter((e) =>
    PASS_LABELS.has(e.label.toLowerCase())
  ).length;
  const failCount = allEvalEntries.filter(
    (e) => !PASS_LABELS.has(e.label.toLowerCase())
  ).length;
  const avgScore =
    allEvalEntries.length > 0
      ? allEvalEntries.reduce((s, e) => s + e.score, 0) / allEvalEntries.length
      : 0;
  const hasResponses = displayResults.some((r) => r.response);
  const hasEvals = displayResults.some((r) => Object.keys(r.evals).length > 0);

  // ── Export ──
  async function handleExport() {
    const runId = liveRunId || selectedRunId;
    if (!runId) return;
    window.open(`/api/datasets/runs/${runId}/export`, "_blank");
  }

  // ── Delete run ──
  async function handleDeleteRun(runId: string) {
    await fetch(`/api/datasets/runs/${runId}`, { method: "DELETE" });
    if (selectedRunId === runId) {
      setSelectedRunId(null);
      setRunResults([]);
      setRunEvalNames([]);
    }
    if (liveRunId === runId) {
      setLiveRunId(null);
      setLiveResults([]);
    }
    setRuns((prev) => prev.filter((r) => r.id !== runId));
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── Left: Dataset list ── */}
      <div className="flex w-60 shrink-0 flex-col border-r">
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Datasets
          </p>
          <button
            onClick={() => setCreating(true)}
            className="rounded p-1 hover:bg-muted"
            title="New dataset"
          >
            <Plus className="size-3.5" />
          </button>
        </div>

        {creating && (
          <div className="mx-2 mb-2 flex gap-1">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") setCreating(false);
              }}
              placeholder="Dataset name..."
              className="h-7 text-xs"
              autoFocus
            />
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="h-7 px-2 text-xs"
            >
              OK
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2">
          {datasets.map((d) => (
            <div
              key={d.id}
              onClick={() => selectDataset(d.id)}
              className={cn(
                "group flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 transition-colors",
                selectedId === d.id ? "bg-accent" : "hover:bg-accent/50"
              )}
            >
              <FileSpreadsheet className="size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.name}</p>
                <p className="text-[10px] text-muted-foreground">{d.rowCount} rows</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(d.id);
                }}
                className="rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
              >
                <Trash2 className="size-3 text-muted-foreground" />
              </button>
            </div>
          ))}
          {datasets.length === 0 && !loading && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No datasets yet
            </p>
          )}
        </div>

        {/* Drop zone in sidebar */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (!f) return;
            // If no dataset selected, create new; otherwise append
            setImportModal({ open: true, target: null });
            // Store file for modal — trigger via hidden input
            const dt = new DataTransfer();
            dt.items.add(f);
            if (fileRef.current) {
              fileRef.current.files = dt.files;
              fileRef.current.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }}
          className="mx-2 mb-2 cursor-pointer rounded-lg border-2 border-dashed border-muted-foreground/15 py-4 text-center"
          onClick={() => setImportModal({ open: true, target: null })}
        >
          <Upload className="mx-auto mb-1 size-4 text-muted-foreground/30" />
          <p className="text-[10px] text-muted-foreground/50">Drop CSV or click</p>
        </div>
      </div>

      {/* ── Right: Detail ── */}
      <div
        className={cn("flex-1 overflow-y-auto", dragOver && "ring-2 ring-inset ring-primary/30")}
        onDragOver={(e) => {
          e.preventDefault();
          if (selectedId) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!selectedId) return;
          const f = e.dataTransfer.files[0];
          if (f) setImportModal({ open: true, target: selected ? { id: selected.id, name: selected.name } : null });
        }}
      >
        {!selectedId ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <Database className="size-12 opacity-15" />
            <p className="text-sm">Select a dataset or upload a CSV</p>
          </div>
        ) : (
          <div className="mx-auto max-w-6xl p-6">
            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold">{selected?.name}</h1>
                <p className="text-xs text-muted-foreground">
                  {rows.length} rows, {headers.length} columns
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setImportModal({
                      open: true,
                      target: selected ? { id: selected.id, name: selected.name } : null,
                    })
                  }
                  className="h-7 gap-1.5 text-xs"
                >
                  <Upload className="size-3" /> Import CSV
                </Button>
                {(liveRunId || selectedRunId) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleExport}
                    className="h-7 gap-1.5 text-xs"
                  >
                    <Download className="size-3" /> Export CSV
                  </Button>
                )}
                {/* Run history dropdown */}
                {runs.length > 0 && (
                  <div className="relative">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRunsOpen(!runsOpen)}
                      className="h-7 gap-1.5 text-xs"
                    >
                      Runs ({runs.length})
                      <ChevronDown className={cn("size-3 transition-transform", runsOpen && "rotate-180")} />
                    </Button>
                    {runsOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setRunsOpen(false)} />
                        <div className="absolute right-0 z-50 mt-1 w-72 rounded-lg border bg-background shadow-xl">
                          <div className="max-h-60 overflow-y-auto p-1">
                            {runs.map((r) => (
                              <div
                                key={r.id}
                                onClick={() => {
                                  loadRun(r.id);
                                  setRunsOpen(false);
                                }}
                                className={cn(
                                  "group flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-xs transition-colors hover:bg-accent",
                                  selectedRunId === r.id && "bg-accent"
                                )}
                              >
                                <div>
                                  <p className="font-medium">
                                    {r.agentSource}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {new Date(r.createdAt).toLocaleString("ko-KR")} · {r.status}
                                  </p>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteRun(r.id);
                                  }}
                                  className="rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Config bar */}
            <div className="mb-5 rounded-lg border p-4">
              {/* Generate row */}
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Agent
                  </label>
                  <select
                    value={selectedAgent}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                    className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                  >
                    <option value="llm:gpt-4o-mini">Direct LLM (gpt-4o-mini)</option>
                    <option value="llm:gpt-4o">Direct LLM (gpt-4o)</option>
                    {agentConfigs.map((c) => (
                      <option key={c.id} value={`agent:${c.id}`}>
                        {c.alias || c.project} ({c.agentType})
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  onClick={handleGenerate}
                  disabled={generating || rows.length === 0}
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                >
                  {generating ? (
                    <>
                      <RefreshCw className="size-3 animate-spin" /> {genProgress}%
                    </>
                  ) : (
                    <>
                      <Play className="size-3" /> Generate
                    </>
                  )}
                </Button>
              </div>

              {/* Progress bar for generate */}
              {generating && (
                <div className="mt-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-foreground/50 transition-all"
                      style={{ width: `${genProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Eval row */}
              <div className="mt-4 border-t pt-4">
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Evaluations
                </label>
                <div className="flex flex-wrap gap-2">
                  {evalOptions.map((e) => (
                    <label
                      key={e.name}
                      className={cn(
                        "flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                        checkedEvals.has(e.name)
                          ? "border-foreground bg-foreground text-background"
                          : "hover:bg-accent"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checkedEvals.has(e.name)}
                        onChange={() => {
                          setCheckedEvals((prev) => {
                            const next = new Set(prev);
                            if (next.has(e.name)) next.delete(e.name);
                            else next.add(e.name);
                            return next;
                          });
                        }}
                        className="hidden"
                      />
                      {e.name}
                      <span className="text-[9px] opacity-60">
                        {e.evalType === "code_rule" ? "rule" : e.isCustom ? "custom" : "builtin"}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    onClick={handleEvaluate}
                    disabled={evaluating || checkedEvals.size === 0 || !liveRunId || liveResults.length === 0}
                    className="h-8 gap-1.5 text-xs"
                  >
                    {evaluating ? (
                      <>
                        <RefreshCw className="size-3 animate-spin" /> {evalProgress}%
                      </>
                    ) : (
                      <>
                        <Play className="size-3" /> Evaluate
                      </>
                    )}
                  </Button>
                  {checkedEvals.size > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {checkedEvals.size} selected
                    </span>
                  )}
                </div>
                {evaluating && (
                  <div className="mt-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-foreground transition-all"
                        style={{ width: `${evalProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Stats bar */}
            {hasEvals && !evaluating && (
              <div className="mb-5 grid grid-cols-4 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold tabular-nums">{allEvalEntries.length}</p>
                  <p className="text-[10px] uppercase text-muted-foreground">Total</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold tabular-nums text-emerald-600">{passCount}</p>
                  <p className="text-[10px] uppercase text-muted-foreground">Pass</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold tabular-nums text-red-600">{failCount}</p>
                  <p className="text-[10px] uppercase text-muted-foreground">Fail</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold tabular-nums">{(avgScore * 100).toFixed(1)}%</p>
                  <p className="text-[10px] uppercase text-muted-foreground">Avg Score</p>
                </div>
              </div>
            )}

            {/* Results table */}
            <div className="overflow-hidden rounded-lg border">
              <div className="max-h-[500px] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/30">
                    <tr>
                      <th className="w-10 px-3 py-2 text-left font-semibold text-muted-foreground">
                        #
                      </th>
                      {headers.map((h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap px-3 py-2 text-left font-semibold text-muted-foreground"
                        >
                          {h}
                          {h === queryCol && (
                            <span className="ml-1 text-[8px] text-blue-500">Q</span>
                          )}
                          {h === contextCol && (
                            <span className="ml-1 text-[8px] text-purple-500">C</span>
                          )}
                        </th>
                      ))}
                      {hasResponses && (
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                          Response
                        </th>
                      )}
                      {displayEvalNames.map((en) => (
                        <th
                          key={en}
                          className="whitespace-nowrap px-3 py-2 text-center font-semibold text-muted-foreground"
                        >
                          {en}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows
                      .slice(0, hasResults ? rows.length : 50)
                      .map((row, i) => {
                        const result = displayResults.find((r) => r.rowIdx === i);
                        return (
                          <tr key={i} className="border-t hover:bg-muted/10">
                            <td className="px-3 py-2 tabular-nums text-muted-foreground">
                              {i + 1}
                            </td>
                            {headers.map((h) => (
                              <td
                                key={h}
                                className="max-w-[180px] truncate px-3 py-2"
                                title={row[h]}
                              >
                                {row[h]}
                              </td>
                            ))}
                            {hasResponses && (
                              <td
                                className="max-w-[250px] truncate px-3 py-2"
                                title={result?.response}
                              >
                                {result?.response ?? ""}
                              </td>
                            )}
                            {displayEvalNames.map((en) => {
                              const ev = result?.evals?.[en];
                              if (!ev) return <td key={en} className="px-3 py-2 text-center">—</td>;
                              const isPass = PASS_LABELS.has(ev.label.toLowerCase());
                              return (
                                <td key={en} className="px-3 py-2 text-center" title={ev.explanation}>
                                  <span
                                    className={cn(
                                      "rounded px-1.5 py-0.5 text-[10px] font-bold",
                                      ev.label === "error"
                                        ? "bg-red-100 text-red-700"
                                        : isPass
                                          ? "bg-emerald-100 text-emerald-700"
                                          : "bg-red-100 text-red-700"
                                    )}
                                  >
                                    {ev.label}
                                  </span>
                                  {ev.score !== undefined && (
                                    <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                                      {ev.score.toFixed(2)}
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              {!hasResults && rows.length > 50 && (
                <div className="border-t px-4 py-2 text-[10px] text-muted-foreground">
                  Showing first 50 of {rows.length} rows
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CSV Import Modal */}
      <CSVImportModal
        open={importModal.open}
        onClose={() => setImportModal({ open: false, target: null })}
        targetDataset={importModal.target}
        onImport={handleImport}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify the app compiles**

```bash
npx next build 2>&1 | tail -10
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/datasets/dataset-manager.tsx
git commit -m "feat(dataset): rewrite DatasetManager with new layout, agent select, multi-eval, run history"
```

---

### Task 6: Update AddToDatasetModal — Remove responseCol

**Files:**
- Modify: `components/add-to-dataset-modal.tsx`

- [ ] **Step 1: Update `components/add-to-dataset-modal.tsx`**

In `handleCreateAndAdd` (around line 56), remove `responseCol: "response"` from the body:

```typescript
body: JSON.stringify({
  name: newName.trim(),
  headers,
  queryCol: "query",
  contextCol: "context",
  rows: [row],
}),
```

In `handleAddToExisting` (around line 93), remove `responseCol: "response"` from the PUT body:

```typescript
body: JSON.stringify({
  id: selectedId,
  headers: ["query", "context", "response"],
  queryCol: "query",
  contextCol: "context",
  rows: [{ query: editQuery, context: editContext, response: editResponse }],
}),
```

Note: The "response" column still exists as a data column in the headers — we're only removing the `responseCol` metadata field that the Dataset model no longer has.

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx next build 2>&1 | tail -10
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/add-to-dataset-modal.tsx
git commit -m "fix(dataset): remove responseCol from AddToDatasetModal"
```

---

### Task 7: Manual Smoke Test

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test CSV import flow**

1. Navigate to `/datasets`
2. Click "Drop CSV or click" in sidebar → modal opens (new dataset mode)
3. Select a CSV file → preview table shows, column mapping auto-filled
4. Set dataset name, confirm → dataset created, appears in sidebar
5. Select the dataset → drag a CSV onto the right area → modal opens (append mode)
6. Confirm → rows appended

- [ ] **Step 3: Test Generate flow**

1. Select a dataset with rows
2. Choose "Direct LLM (gpt-4o-mini)" in agent dropdown
3. Click Generate → progress bar shows, responses populate in table
4. If agent configs exist, test with an agent option too

- [ ] **Step 4: Test Evaluate flow**

1. After Generate completes, check 2+ evals
2. Click Evaluate → progress bar shows, eval columns appear in table
3. Stats bar shows Total/Pass/Fail/Avg

- [ ] **Step 5: Test Run History**

1. Click "Runs (N)" dropdown → see the run
2. Navigate away, come back → select same dataset → click run from dropdown → results load
3. Click Export CSV → CSV downloads with correct data

- [ ] **Step 6: Test header Import CSV button**

1. Select a dataset
2. Click "Import CSV" button in header → modal opens in append mode
3. Import a CSV → rows appended

- [ ] **Step 7: Commit any fixes**

If any issues found during testing, fix and commit.
