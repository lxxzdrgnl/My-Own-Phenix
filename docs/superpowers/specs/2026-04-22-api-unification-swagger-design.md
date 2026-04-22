# API Unification + Swagger Documentation

## Overview

Unify all APIs (My Own Phenix + Phoenix) under a single port (3000) with a single Swagger UI at `/api/docs`. Users see one cohesive API, regardless of whether the endpoint is handled locally or proxied to Phoenix.

## Goals

- All API calls go through `localhost:3000` — no need to know about Phoenix port 6006
- Single Swagger UI at `/api/docs` showing all endpoints grouped by feature
- Phoenix API proxied through `/api/v1/[...path]` instead of `?path=` query param
- Feature-based tag grouping (not source-based) so it feels like one app

## Non-Goals

- Replacing Phoenix's internal API behavior
- Authentication/rate limiting on APIs (future)
- MCP server or CLI (future, built on top of this)

---

## Architecture

### 1. Phoenix Proxy Refactor

**Current:** `GET /api/phoenix?path=/v1/projects` → Phoenix
**New:** `GET /api/v1/projects` → Phoenix (clean REST path)

Implementation: Replace `app/api/phoenix/route.ts` with `app/api/v1/[...path]/route.ts`

```typescript
// app/api/v1/[...path]/route.ts
// Catches all /api/v1/* requests and proxies to Phoenix
// Supports GET, POST, PUT, DELETE
// Passes through query params, headers, body
```

Update all client-side code that calls `/api/phoenix?path=...` to use `/api/v1/...` directly.

### 2. OpenAPI Spec Generation

Create a combined OpenAPI 3.1 spec that includes:

**A. My Own Phenix endpoints** — manually defined in a spec file:
```
/api/user-threads          — Chat
/api/user-threads/{id}     — Chat
/api/llm                   — Chat
/api/feedback              — Chat
/api/providers             — Providers
/api/providers/{id}        — Providers
/api/providers/test        — Providers
/api/annotations           — Annotations
/api/eval-prompts          — Evaluations
/api/eval-backfill         — Evaluations
/api/eval-config           — Evaluations
/api/datasets              — Datasets
/api/datasets/rows         — Datasets
/api/datasets/runs         — Datasets
/api/datasets/runs/{runId} — Datasets
/api/agent-config          — Agents
/api/agent-templates       — Agents
/api/settings              — Settings
/api/dashboard/layout      — Dashboard
```

**B. Phoenix endpoints** — fetched from Phoenix's `/openapi.json` at build time, paths rewritten from `/v1/...` to `/api/v1/...`

**C. Merge** — combine both specs into one, with unified tag grouping.

### 3. Swagger UI

Serve Swagger UI at `/api/docs` using `swagger-ui-react` or a static HTML page that loads the combined spec.

Route: `app/api/docs/page.tsx` (or static)

### 4. Tag Grouping

All endpoints grouped by feature, not by source:

| Tag | Endpoints |
|-----|-----------|
| Projects | `/api/v1/projects`, `/api/v1/projects/{id}` |
| Traces & Spans | `/api/v1/projects/{name}/spans`, `/api/v1/traces/{id}` |
| Annotations | `/api/v1/span_annotations`, `/api/annotations` |
| Chat | `/api/user-threads`, `/api/llm`, `/api/feedback` |
| Evaluations | `/api/eval-prompts`, `/api/eval-backfill`, `/api/eval-config` |
| Datasets | `/api/datasets`, `/api/datasets/rows`, `/api/datasets/runs` |
| Providers | `/api/providers`, `/api/providers/{id}`, `/api/providers/test` |
| Agents | `/api/agent-config`, `/api/agent-templates` |
| Settings | `/api/settings` |
| Dashboard | `/api/dashboard/layout` |
| Auth | `/api/auth/sync`, `/api/auth/token` |

---

## Authentication

### Swagger Auth Flow

The app uses Firebase Auth. For Swagger UI API testing:

1. **Login endpoint:** `POST /api/auth/token` — accepts Firebase ID token, returns a session token or passes through
2. **Swagger "Authorize" button** — user enters Bearer token
3. **All subsequent requests** include `Authorization: Bearer <token>` header

### OpenAPI Security Scheme

```yaml
securityDefinitions:
  BearerAuth:
    type: http
    scheme: bearer
    bearerFormat: Firebase ID Token
```

Add to the combined OpenAPI spec so Swagger UI shows the "Authorize" button.

### Auth Tag

| Tag | Endpoints |
|-----|-----------|
| Auth | `/api/auth/sync` (POST), `/api/auth/token` (POST) |

---

## Client-Side Migration

All files that currently call `/api/phoenix?path=...` need to be updated:

### Files to update:
- `lib/phoenix.ts` — main Phoenix client (fetchProjects, fetchTraces, etc.)
- `app/api/eval-backfill/route.ts` — server-side Phoenix calls
- `app/api/feedback/route.ts` — span lookup
- `app/api/annotations/route.ts` — annotation upload
- `eval-worker/worker.py` — uses Phoenix URL directly (keep as-is, points to 6006)
- `app/settings/chat-section.tsx` — project list fetch

**Pattern change:**
```typescript
// Before
fetch(`/api/phoenix?path=/v1/projects/${name}/spans&limit=200`)

// After
fetch(`/api/v1/projects/${name}/spans?limit=200`)
```

Server-side code that calls Phoenix directly (using `process.env.PHOENIX_URL`) stays the same — only client-side proxy calls change.

---

## OpenAPI Spec File

Create `lib/openapi.ts` that:
1. Defines My Own Phenix endpoints as OpenAPI paths
2. At runtime, fetches Phoenix's `/openapi.json`
3. Rewrites Phoenix paths from `/v1/...` to `/api/v1/...`
4. Merges both into a single spec with unified tags
5. Serves at `GET /api/openapi.json`

### API endpoint for the spec:
```
GET /api/openapi.json → combined OpenAPI 3.1 spec
```

### Swagger UI page:
```
GET /api/docs → Swagger UI loading /api/openapi.json
```

---

## Implementation Order

1. Create `/api/v1/[...path]` catch-all proxy route
2. Update all client-side code to use new paths
3. Remove old `/api/phoenix` route
4. Create OpenAPI spec for My Own Phenix endpoints
5. Create merge logic to combine with Phoenix spec
6. Create `/api/openapi.json` endpoint
7. Create `/api/docs` Swagger UI page
8. Add link to docs in Nav or Settings
