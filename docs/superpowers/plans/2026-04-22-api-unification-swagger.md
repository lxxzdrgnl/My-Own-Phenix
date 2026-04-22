# API Unification + Swagger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify all APIs under port 3000 with clean REST paths, and serve Swagger UI at `/api/docs`.

**Architecture:** Replace `?path=` proxy with `/api/v1/[...path]` catch-all route. Build a combined OpenAPI spec from My Own Phenix endpoints + Phoenix's spec. Serve Swagger UI as a Next.js page.

**Tech Stack:** Next.js API routes, OpenAPI 3.1, swagger-ui-react

---

### Task 1: Create `/api/v1/[...path]` Catch-All Proxy

**Files:**
- Create: `app/api/v1/[...path]/route.ts`

- [ ] **Step 1: Create the catch-all proxy route**

```typescript
import { NextRequest, NextResponse } from "next/server";

const PHOENIX = process.env.PHOENIX_URL ?? "http://localhost:6006";

async function proxyToPhoenix(req: NextRequest, method: string) {
  const segments = req.nextUrl.pathname.replace("/api/v1/", "/v1/");
  const search = req.nextUrl.search;
  const url = `${PHOENIX}${segments}${search}`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const options: RequestInit = { method, headers, signal: AbortSignal.timeout(15000) };

  if (method !== "GET" && method !== "HEAD") {
    options.body = await req.text();
  }

  const res = await fetch(url, options);
  const data = await res.text();

  return new NextResponse(data, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
  });
}

export async function GET(req: NextRequest) {
  return proxyToPhoenix(req, "GET");
}

export async function POST(req: NextRequest) {
  return proxyToPhoenix(req, "POST");
}

export async function PUT(req: NextRequest) {
  return proxyToPhoenix(req, "PUT");
}

export async function DELETE(req: NextRequest) {
  return proxyToPhoenix(req, "DELETE");
}

export async function PATCH(req: NextRequest) {
  return proxyToPhoenix(req, "PATCH");
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/v1/
git commit -m "feat: add /api/v1 catch-all proxy to Phoenix"
```

---

### Task 2: Migrate Client-Side Phoenix Calls

**Files:**
- Modify: `lib/phoenix.ts`
- Modify: `app/page.tsx`
- Modify: `app/dashboard/page.tsx`
- Modify: `app/projects/projects-manager.tsx`
- Modify: `app/evaluations/evaluations-manager.tsx`
- Modify: `app/settings/chat-section.tsx`
- Modify: `components/span-tree-view.tsx`

- [ ] **Step 1: Update all `/api/phoenix?path=` calls to `/api/v1/` paths**

The pattern change for every file:

**Before:**
```typescript
fetch(`/api/phoenix?path=/v1/projects/${name}/spans&limit=200`)
```

**After:**
```typescript
fetch(`/api/v1/projects/${name}/spans?limit=200`)
```

**Specific replacements in `lib/phoenix.ts`:**

| Line | Before | After |
|------|--------|-------|
| 69 | `/api/phoenix?path=/v1/projects` | `/api/v1/projects` |
| 119 | `/api/phoenix?path=/v1/projects/${...}/spans&limit=1000` | `/api/v1/projects/${...}/spans?limit=1000` |
| 137 | `/api/phoenix?path=/v1/projects/${...}/span_annotations&${params}&limit=1000` | `/api/v1/projects/${...}/span_annotations?${params}&limit=1000` |
| 498 | `/api/phoenix?path=/v1/prompts` | `/api/v1/prompts` |
| 507 | `/api/phoenix?path=/v1/prompts/${name}/versions` | `/api/v1/prompts/${name}/versions` |
| 523 | `/api/phoenix?path=/v1/prompt_versions/${id}/tags` | `/api/v1/prompt_versions/${id}/tags` |
| 534 | `/api/phoenix?path=/v1/prompt_versions/${id}/tags` | `/api/v1/prompt_versions/${id}/tags` |
| 552 | `/api/phoenix?path=/v1/prompt_versions/${id}/tags/${tag}` | `/api/v1/prompt_versions/${id}/tags/${tag}` |
| 571 | `/api/phoenix?path=/v1/prompts` | `/api/v1/prompts` |
| 608 | `/api/phoenix?path=/v1/prompts` | `/api/v1/prompts` |
| 638 | `/api/phoenix?path=/v1/prompts/${name}` | `/api/v1/prompts/${name}` |
| 649 | `/api/phoenix?path=/v1/traces/${traceId}` | `/api/v1/traces/${traceId}` |

**Other files — same pattern:** Search for `/api/phoenix?path=` and replace. For query params that were appended with `&`, change to `?`.

Key gotcha: When the original URL had `&param=value` after the path (e.g. `?path=/v1/foo&limit=100`), in the new format it becomes `?limit=100` (first param uses `?`, not `&`).

- [ ] **Step 2: Commit**

```bash
git add lib/phoenix.ts app/page.tsx app/dashboard/page.tsx app/projects/ app/evaluations/ app/settings/chat-section.tsx components/span-tree-view.tsx
git commit -m "refactor: migrate all client calls from /api/phoenix?path= to /api/v1/"
```

---

### Task 3: Remove Old Phoenix Proxy Route

**Files:**
- Delete: `app/api/phoenix/route.ts`

- [ ] **Step 1: Delete the old proxy**

```bash
rm app/api/phoenix/route.ts
rmdir app/api/phoenix
```

- [ ] **Step 2: Verify no remaining references**

```bash
grep -r "/api/phoenix" app/ lib/ components/ --include="*.ts" --include="*.tsx"
```

Expected: No results (or only comments/docs).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove old /api/phoenix proxy route"
```

---

### Task 4: Install swagger-ui-react

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dependencies**

```bash
npm install swagger-ui-react
npm install -D @types/swagger-ui-react
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add swagger-ui-react dependency"
```

---

### Task 5: Create OpenAPI Spec for My Own Phenix Endpoints

**Files:**
- Create: `lib/openapi-spec.ts`

- [ ] **Step 1: Create the My Own Phenix OpenAPI definitions**

```typescript
import type { OpenAPIV3_1 } from "openapi-types";

export const MY_PHENIX_PATHS: OpenAPIV3_1.PathsObject = {
  // ── Auth ──
  "/api/auth/sync": {
    post: {
      tags: ["Auth"],
      summary: "Sync user after Firebase login",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                uid: { type: "string" },
                email: { type: "string" },
                name: { type: "string" },
              },
              required: ["uid", "email"],
            },
          },
        },
      },
      responses: { "200": { description: "User synced" } },
    },
  },

  // ── Chat ──
  "/api/user-threads": {
    get: {
      tags: ["Chat"],
      summary: "List chat threads",
      parameters: [
        { name: "userId", in: "query", required: true, schema: { type: "string" } },
        { name: "project", in: "query", schema: { type: "string" } },
      ],
      responses: { "200": { description: "Thread list" } },
    },
    post: {
      tags: ["Chat"],
      summary: "Create chat thread",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                userId: { type: "string" },
                langGraphThreadId: { type: "string" },
                title: { type: "string" },
                project: { type: "string" },
              },
              required: ["userId", "langGraphThreadId"],
            },
          },
        },
      },
      responses: { "200": { description: "Thread created" } },
    },
  },
  "/api/user-threads/{id}": {
    delete: {
      tags: ["Chat"],
      summary: "Delete chat thread",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "Thread deleted" } },
    },
  },
  "/api/user-threads/{id}/messages": {
    get: {
      tags: ["Chat"],
      summary: "List messages in thread",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "Message list" } },
    },
    post: {
      tags: ["Chat"],
      summary: "Add message to thread",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                role: { type: "string" },
                content: { type: "string" },
              },
              required: ["role", "content"],
            },
          },
        },
      },
      responses: { "200": { description: "Message added" } },
    },
  },
  "/api/llm": {
    post: {
      tags: ["Chat"],
      summary: "Call LLM (multi-provider)",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                messages: { type: "array", items: { type: "object", properties: { role: { type: "string" }, content: { type: "string" } } } },
                model: { type: "string", default: "gpt-4o-mini" },
                temperature: { type: "number", default: 0.7 },
                promptLabel: { type: "string" },
              },
              required: ["messages"],
            },
          },
        },
      },
      responses: { "200": { description: "LLM response (OpenAI-compatible format)" } },
    },
  },
  "/api/feedback": {
    get: {
      tags: ["Chat"],
      summary: "Get message feedback",
      parameters: [
        { name: "messageId", in: "query", required: true, schema: { type: "string" } },
        { name: "userId", in: "query", required: true, schema: { type: "string" } },
      ],
      responses: { "200": { description: "Feedback value" } },
    },
    post: {
      tags: ["Chat"],
      summary: "Submit message feedback",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                messageId: { type: "string" },
                userId: { type: "string" },
                value: { type: "string", enum: ["up", "down"] },
              },
              required: ["messageId", "userId", "value"],
            },
          },
        },
      },
      responses: { "200": { description: "Feedback saved" } },
    },
    delete: {
      tags: ["Chat"],
      summary: "Delete message feedback",
      responses: { "200": { description: "Feedback deleted" } },
    },
  },

  // ── Providers ──
  "/api/providers": {
    get: {
      tags: ["Providers"],
      summary: "List LLM providers",
      parameters: [{ name: "decrypt", in: "query", schema: { type: "string", enum: ["true"] }, description: "Return decrypted keys (internal use)" }],
      responses: { "200": { description: "Provider list with masked API keys" } },
    },
    post: {
      tags: ["Providers"],
      summary: "Register LLM provider",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                provider: { type: "string", enum: ["openai", "anthropic", "google", "xai"] },
                apiKey: { type: "string" },
              },
              required: ["provider", "apiKey"],
            },
          },
        },
      },
      responses: { "200": { description: "Provider registered" } },
    },
  },
  "/api/providers/{id}": {
    put: {
      tags: ["Providers"],
      summary: "Update provider API key",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "Provider updated" } },
    },
    delete: {
      tags: ["Providers"],
      summary: "Delete provider",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "Provider deleted" } },
    },
  },
  "/api/providers/test": {
    post: {
      tags: ["Providers"],
      summary: "Test provider connection",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                provider: { type: "string" },
                apiKey: { type: "string" },
              },
              required: ["provider", "apiKey"],
            },
          },
        },
      },
      responses: { "200": { description: "Connection test result" } },
    },
  },

  // ── Annotations ──
  "/api/annotations": {
    post: {
      tags: ["Annotations"],
      summary: "Add human annotation to span",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                spanId: { type: "string" },
                name: { type: "string" },
                label: { type: "string" },
                score: { type: "number" },
                explanation: { type: "string" },
              },
              required: ["spanId", "name", "label"],
            },
          },
        },
      },
      responses: { "200": { description: "Annotation saved" } },
    },
  },

  // ── Evaluations ──
  "/api/eval-prompts": {
    get: {
      tags: ["Evaluations"],
      summary: "List eval prompts",
      responses: { "200": { description: "Eval prompt list" } },
    },
    put: {
      tags: ["Evaluations"],
      summary: "Create or update eval prompt",
      responses: { "200": { description: "Eval prompt saved" } },
    },
    delete: {
      tags: ["Evaluations"],
      summary: "Delete eval prompt",
      responses: { "200": { description: "Eval prompt deleted" } },
    },
  },
  "/api/eval-backfill": {
    post: {
      tags: ["Evaluations"],
      summary: "Run eval backfill on date range",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                projectId: { type: "string" },
                evalName: { type: "string" },
                startDate: { type: "string" },
                endDate: { type: "string" },
              },
              required: ["projectId", "evalName", "startDate", "endDate"],
            },
          },
        },
      },
      responses: { "200": { description: "Backfill results" } },
    },
  },
  "/api/eval-config": {
    get: {
      tags: ["Evaluations"],
      summary: "Get project eval config",
      parameters: [{ name: "projectId", in: "query", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "Eval config list" } },
    },
    put: {
      tags: ["Evaluations"],
      summary: "Update project eval config",
      responses: { "200": { description: "Config updated" } },
    },
  },

  // ── Datasets ──
  "/api/datasets": {
    get: {
      tags: ["Datasets"],
      summary: "List datasets",
      responses: { "200": { description: "Dataset list" } },
    },
    post: {
      tags: ["Datasets"],
      summary: "Create dataset",
      responses: { "200": { description: "Dataset created" } },
    },
    put: {
      tags: ["Datasets"],
      summary: "Update dataset",
      responses: { "200": { description: "Dataset updated" } },
    },
    delete: {
      tags: ["Datasets"],
      summary: "Delete dataset",
      responses: { "200": { description: "Dataset deleted" } },
    },
  },
  "/api/datasets/rows": {
    get: { tags: ["Datasets"], summary: "Get dataset rows (paginated)", responses: { "200": { description: "Row list" } } },
    post: { tags: ["Datasets"], summary: "Add rows to dataset", responses: { "200": { description: "Rows added" } } },
    put: { tags: ["Datasets"], summary: "Update row", responses: { "200": { description: "Row updated" } } },
    delete: { tags: ["Datasets"], summary: "Delete rows", responses: { "200": { description: "Rows deleted" } } },
  },
  "/api/datasets/runs": {
    get: { tags: ["Datasets"], summary: "List dataset runs", responses: { "200": { description: "Run list" } } },
    post: { tags: ["Datasets"], summary: "Create dataset run", responses: { "200": { description: "Run created" } } },
  },
  "/api/datasets/runs/{runId}": {
    get: {
      tags: ["Datasets"],
      summary: "Get run with results",
      parameters: [{ name: "runId", in: "path", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "Run details" } },
    },
    put: { tags: ["Datasets"], summary: "Update run", parameters: [{ name: "runId", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Run updated" } } },
    delete: { tags: ["Datasets"], summary: "Delete run", parameters: [{ name: "runId", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Run deleted" } } },
  },
  "/api/datasets/runs/{runId}/export": {
    get: {
      tags: ["Datasets"],
      summary: "Export run results as CSV",
      parameters: [{ name: "runId", in: "path", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "CSV file" } },
    },
  },

  // ── Agents ──
  "/api/agent-config": {
    get: { tags: ["Agents"], summary: "List project-agent configs", responses: { "200": { description: "Config list" } } },
    put: { tags: ["Agents"], summary: "Upsert project-agent config", responses: { "200": { description: "Config saved" } } },
    delete: { tags: ["Agents"], summary: "Delete project-agent config", responses: { "200": { description: "Config deleted" } } },
  },
  "/api/agent-templates": {
    get: { tags: ["Agents"], summary: "List agent templates", responses: { "200": { description: "Template list" } } },
    post: { tags: ["Agents"], summary: "Create agent template", responses: { "200": { description: "Template created" } } },
    put: { tags: ["Agents"], summary: "Update agent template", responses: { "200": { description: "Template updated" } } },
    delete: { tags: ["Agents"], summary: "Delete agent template", responses: { "200": { description: "Template deleted" } } },
  },

  // ── Settings ──
  "/api/settings": {
    get: { tags: ["Settings"], summary: "Get app settings", responses: { "200": { description: "Settings key-value pairs" } } },
    put: { tags: ["Settings"], summary: "Update app settings", responses: { "200": { description: "Settings saved" } } },
  },

  // ── Dashboard ──
  "/api/dashboard/layout": {
    get: { tags: ["Dashboard"], summary: "Get dashboard layout", responses: { "200": { description: "Layout data" } } },
    put: { tags: ["Dashboard"], summary: "Save dashboard layout", responses: { "200": { description: "Layout saved" } } },
  },
};

export const MY_PHENIX_INFO: OpenAPIV3_1.InfoObject = {
  title: "My Own Phenix API",
  version: "1.0.0",
  description: "Unified API for LLM observability, evaluation, and chat — powered by Arize Phoenix",
};

export const SECURITY_SCHEMES: OpenAPIV3_1.ComponentsObject["securitySchemes"] = {
  BearerAuth: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "Firebase ID Token",
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add lib/openapi-spec.ts
git commit -m "feat: add OpenAPI spec definitions for My Own Phenix endpoints"
```

---

### Task 6: Create Combined OpenAPI Endpoint

**Files:**
- Create: `app/api/openapi.json/route.ts`

- [ ] **Step 1: Create the endpoint that merges My Phenix + Phoenix specs**

```typescript
import { NextResponse } from "next/server";
import { MY_PHENIX_PATHS, MY_PHENIX_INFO, SECURITY_SCHEMES } from "@/lib/openapi-spec";

const PHOENIX = process.env.PHOENIX_URL ?? "http://localhost:6006";

// Tags to assign to Phoenix endpoints based on path patterns
function tagForPhoenixPath(path: string): string {
  if (path.includes("/span_annotations") || path.includes("/annotation")) return "Annotations";
  if (path.includes("/spans")) return "Traces & Spans";
  if (path.includes("/traces")) return "Traces & Spans";
  if (path.includes("/projects")) return "Projects";
  if (path.includes("/prompts") || path.includes("/prompt_versions")) return "Prompts";
  if (path.includes("/datasets") || path.includes("/experiments")) return "Datasets";
  return "Phoenix";
}

export async function GET() {
  // Fetch Phoenix OpenAPI spec
  let phoenixPaths: Record<string, unknown> = {};
  let phoenixSchemas: Record<string, unknown> = {};

  try {
    const res = await fetch(`${PHOENIX}/openapi.json`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const phoenixSpec = await res.json();
      // Rewrite paths: /v1/... → /api/v1/...
      for (const [path, methods] of Object.entries(phoenixSpec.paths ?? {})) {
        const newPath = `/api${path}`;
        const retagged: Record<string, unknown> = {};
        for (const [method, op] of Object.entries(methods as Record<string, any>)) {
          retagged[method] = { ...op, tags: [tagForPhoenixPath(path)] };
        }
        phoenixPaths[newPath] = retagged;
      }
      phoenixSchemas = phoenixSpec.components?.schemas ?? {};
    }
  } catch {}

  const combined = {
    openapi: "3.1.0",
    info: MY_PHENIX_INFO,
    paths: { ...phoenixPaths, ...MY_PHENIX_PATHS },
    components: {
      schemas: phoenixSchemas,
      securitySchemes: SECURITY_SCHEMES,
    },
    security: [{ BearerAuth: [] }],
    tags: [
      { name: "Auth", description: "Authentication" },
      { name: "Chat", description: "Chat threads and messages" },
      { name: "Projects", description: "Phoenix projects" },
      { name: "Traces & Spans", description: "Trace and span data" },
      { name: "Annotations", description: "Human and LLM annotations" },
      { name: "Evaluations", description: "Eval prompts and backfill" },
      { name: "Datasets", description: "Datasets and batch runs" },
      { name: "Prompts", description: "Prompt version management" },
      { name: "Providers", description: "LLM provider API keys" },
      { name: "Agents", description: "Agent templates and configs" },
      { name: "Settings", description: "App configuration" },
      { name: "Dashboard", description: "Dashboard layout" },
    ],
  };

  return NextResponse.json(combined);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/openapi.json/
git commit -m "feat: add combined OpenAPI spec endpoint"
```

---

### Task 7: Create Swagger UI Page

**Files:**
- Create: `app/api/docs/page.tsx`

- [ ] **Step 1: Create the Swagger UI page**

```typescript
"use client";

import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-white">
      <SwaggerUI url="/api/openapi.json" />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/docs/
git commit -m "feat: add Swagger UI page at /api/docs"
```

---

### Task 8: Install openapi-types + Build Verification

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install openapi-types for TypeScript definitions**

```bash
npm install openapi-types
```

- [ ] **Step 2: Run build**

```bash
npx next build
```

Expected: Build succeeds. Routes include `/api/v1/[...path]`, `/api/openapi.json`, `/api/docs`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add openapi-types dependency"
```

---

### Task 9: Add API Docs Link

**Files:**
- Modify: `components/nav.tsx`

- [ ] **Step 1: Add a small docs link in the nav**

Add a link to `/api/docs` in the nav bar, near the right side. Use a `FileText` or `Book` icon from lucide-react.

```tsx
<a
  href="/api/docs"
  target="_blank"
  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-base font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
>
  <FileText className="h-4 w-4" />
  API
</a>
```

Place it before the Sign out button in the authenticated section.

- [ ] **Step 2: Commit**

```bash
git add components/nav.tsx
git commit -m "feat: add API docs link to nav bar"
```
