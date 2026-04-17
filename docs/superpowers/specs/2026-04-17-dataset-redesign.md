# Dataset Redesign Spec

## Problem

The current dataset feature has several issues:
- Column mapping is separate from CSV import instead of happening at import time
- Generate Responses fetches Phoenix projects instead of using DB AgentConfig
- Evaluate only supports one eval at a time, no custom eval visibility
- `responseCol` field exists but is unused
- Results (generate + evaluate) are in-memory only, lost on refresh
- No run history for regression testing

## Goals

- Batch testing: upload CSV, run agent, evaluate quality
- Regression testing: re-run same dataset after agent changes, compare results over time
- CSV export of results

---

## Layout

```
+------------+---------------------------------------------------+
| Datasets   | Header: [name] [Import CSV] [Export CSV] [Runs v] |
|            +-----------+---------------------------------------+
| search     | Config Bar                                        |
|            | Agent: [v select] [Generate]                      |
| > ds-1     | Evals: [x halluc] [x cite] [ ] qa [Evaluate]     |
| > ds-2  <  +-----------+---------------------------------------+
| > ds-3     | Results Table                                     |
|            | # | query | context | response | halluc | cite    |
|            | 1 | ...   | ...     | ...      | pass   | 0.8    |
|            | 2 | ...   | ...     | ...      | fail   | 0.3    |
|            +-----------+---------------------------------------+
| [+] New    | Stats: Total 50 | Pass 42 | Fail 8 | Avg 0.82   |
| ^ CSV      |                                                   |
+------------+---------------------------------------------------+
```

### Left Sidebar (w-60)

- Dataset list: name + row count, click to select
- Bottom: "+ New" button, CSV drag/drop area
- Drag CSV onto selected dataset -> Import modal (append mode)
- Drag CSV onto empty area -> Import modal (new dataset mode)

### Right Main Area

**Header**
- Dataset name + row/column count
- Import CSV button (opens Import modal in append mode)
- Export CSV button (exports current run results)
- Run History dropdown (select past run to view results)

**Config Bar** (single bordered box)
- Agent select: DB AgentConfig list + "Direct LLM (gpt-4o-mini)" option + Generate button
- Eval select: global eval list as checkboxes (builtin/custom/rule tags) + Evaluate button
- Progress bar shown only during execution

**Results Table**
- Columns: # | original data columns (query, context, etc.) | response | per-eval columns (label + score)
- Truncated cells with tooltip on hover
- Shown for latest run by default, switchable via Run History dropdown

**Stats Bar (bottom)**
- Total / Pass / Fail / Avg Score — shown only when results exist

---

## CSV Import Modal

Triggered by:
1. CSV drag/drop onto sidebar (new dataset)
2. CSV drag/drop onto selected dataset detail area (append)
3. Import CSV button in header (append)

**Modal contents:**
- Dataset name: text input (new) or read-only display (append)
- Preview table: first 5 rows
- Query Column dropdown (auto-mapped default)
- Context Column dropdown (optional, auto-mapped default)
- Confirm / Cancel buttons

**Auto-map keywords:**
- Query: query, question, prompt, input, instruction, user_prompt, jailbreak_query
- Context: context, document, reference

---

## Generate Responses

- Agent source dropdown:
  - DB AgentConfig entries: `"{project} ({agentType})"` format
  - "Direct LLM" option with model sub-select (gpt-4o-mini, etc.)
- Removes Phoenix `fetchProjects()` dependency
- For AgentConfig: uses existing `createThread`/`sendMessage` (LangGraph) or `createThreadRest`/`sendMessageRest` (REST)
- For Direct LLM: calls `/api/llm` endpoint
- Progress bar during generation
- Results saved to DatasetRun

## Evaluate

- Global eval list shown as checkboxes (not project-scoped)
- All eval types visible: builtin, custom (llm_prompt), code_rule
- Multiple evals selectable simultaneously
- Single "Evaluate" button runs all checked evals
- Each eval becomes a column in results table
- Results saved to same DatasetRun

---

## Data Model Changes

### Dataset (modified)

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
```

**Removed:** `responseCol` field

### DatasetRun (new)

```prisma
model DatasetRun {
  id          String   @id @default(cuid())
  datasetId   String
  dataset     Dataset  @relation(fields: [datasetId], references: [id], onDelete: Cascade)
  agentSource String   // "agent:{configId}" or "llm:gpt-4o-mini"
  evalNames   String   // JSON array: ["hallucination","citation"]
  status      String   @default("running") // running | completed | failed
  rowResults  String   @default("[]")
  createdAt   DateTime @default(now())
}
```

**rowResults JSON structure:**
```json
[
  {
    "rowIdx": 0,
    "response": "agent response text",
    "evals": {
      "hallucination": { "label": "pass", "score": 1.0, "explanation": "..." },
      "citation": { "label": "grounded", "score": 0.85, "explanation": "..." }
    }
  }
]
```

---

## API Routes

### Existing (modified)
- `GET /api/datasets` — list datasets (no change)
- `POST /api/datasets` — create dataset (remove responseCol)
- `PUT /api/datasets` — update dataset (remove responseCol)
- `DELETE /api/datasets` — delete dataset (cascade deletes runs)
- `GET /api/datasets/rows` — fetch rows (remove responseCol from response)

### New
- `GET /api/datasets/runs?datasetId={id}` — list runs for dataset (newest first)
- `GET /api/datasets/runs/{runId}` — get single run with results
- `POST /api/datasets/runs` — create new run (start generate+evaluate)
- `PUT /api/datasets/runs/{runId}` — update run status/results (incremental save)
- `DELETE /api/datasets/runs/{runId}` — delete a run

### CSV Export
- `GET /api/datasets/runs/{runId}/export` — returns CSV with original data + response + eval results

---

## Removals

- Column Mapping section from detail page (moved to Import modal)
- Phoenix `fetchProjects()` call in dataset-manager
- `responseCol` field from Prisma schema
- In-memory-only result storage (replaced by DatasetRun)
- Step 1 / Step 2 sequential UI layout

---

## Files to Modify

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Remove responseCol, add DatasetRun model |
| `app/datasets/dataset-manager.tsx` | Full rewrite |
| `app/api/datasets/route.ts` | Remove responseCol handling |
| `app/api/datasets/rows/route.ts` | Remove responseCol from response |
| `app/api/datasets/runs/route.ts` | New — run CRUD + generate + evaluate |
| `app/api/datasets/runs/[runId]/route.ts` | New — single run ops |
| `app/api/datasets/runs/[runId]/export/route.ts` | New — CSV export |
| `components/csv-import-modal.tsx` | New — shared import modal |
| `components/add-to-dataset-modal.tsx` | Update — remove responseCol usage |
