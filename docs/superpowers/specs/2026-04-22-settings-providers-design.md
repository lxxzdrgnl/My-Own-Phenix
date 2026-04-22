# Settings Page: LLM Providers & Agents

## Overview

Replace environment-variable-based LLM configuration with a UI-driven Settings page. Users register LLM provider API keys through the UI, and all LLM calls (playground, eval, dataset runs) use DB-stored keys instead of `OPENAI_API_KEY` env var.

## Goals

- Manage LLM provider API keys from the UI (no env vars)
- Enable multi-provider support (OpenAI, Anthropic, Google, xAI)
- Per-eval model selection
- Reuse existing `ModelSelector` and agent modal patterns
- Consolidate agent template management into Settings

## Non-Goals

- Custom/self-hosted model endpoints (future)
- Per-user API key isolation (single-tenant assumption)
- Rate limiting or usage tracking

---

## Architecture

### New Route: `/settings`

Two-tab layout (left sidebar tabs):

| Tab | Content |
|-----|---------|
| **Providers** | Register/edit/delete LLM provider API keys |
| **Agents** | Existing `AgentTemplatesModal` content moved here as full page |

### Providers Tab

**Provider card list:**
- Each card: provider name, icon, masked API key (`sk-•••••abc`), status badge
- Actions: Edit key, Test connection, Delete
- "Add Provider" button → select provider type, enter API key

**Supported providers:**
| Provider | API Base | Auth Header |
|----------|----------|-------------|
| OpenAI | `https://api.openai.com/v1/chat/completions` | `Authorization: Bearer <key>` |
| Anthropic | `https://api.anthropic.com/v1/messages` | `x-api-key: <key>` |
| Google | `https://generativelanguage.googleapis.com/v1beta/models` | `x-goog-api-key: <key>` |
| xAI | `https://api.x.ai/v1/chat/completions` | `Authorization: Bearer <key>` |

### Agents Tab

- Directly embeds existing agent template management (from `AgentTemplatesModal`)
- Same CRUD functionality, page layout instead of modal
- Nav "Agents" button redirects to `/settings?tab=agents`

---

## Data Model

### New Prisma Model: `LlmProvider`

```prisma
model LlmProvider {
  id           String   @id @default(cuid())
  provider     String   @unique  // "openai" | "anthropic" | "google" | "xai"
  apiKey       String             // AES-256-GCM encrypted
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

### Modified Model: `EvalPrompt`

Add `model` field:
```prisma
model EvalPrompt {
  ...existing fields...
  model      String   @default("gpt-4o-mini")  // user-selectable eval model
}
```

---

## API Routes

### `GET /api/providers`
- Returns all providers (API key masked in response)
- For internal use (eval-worker): query param `?decrypt=true` returns full key (localhost only)

### `POST /api/providers`
- Body: `{ provider, apiKey }`
- Encrypts API key, saves to DB
- Returns provider with masked key

### `PUT /api/providers/[id]`
- Update API key or isActive status

### `DELETE /api/providers/[id]`
- Remove provider

### `POST /api/providers/test`
- Body: `{ provider, apiKey }`
- Makes a minimal API call to verify the key works
- Returns `{ success: boolean, error?: string }`

---

## API Key Security

- **Encryption**: AES-256-GCM with a key derived from `ENCRYPTION_SECRET` env var
- **Storage**: encrypted ciphertext + IV + auth tag stored as base64 string
- **Display**: always masked in API responses (`sk-•••••abc` — last 3 chars visible)
- **Decrypt**: only server-side, never sent to client unmasked
- One env var (`ENCRYPTION_SECRET`) replaces per-provider API key env vars

---

## Provider Adapter

A unified LLM call interface that routes to the correct provider API:

```typescript
// lib/llm-providers.ts

interface LlmRequest {
  provider: string;      // "openai" | "anthropic" | "google" | "xai"
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  responseFormat?: "json" | "text";
}

interface LlmResponse {
  content: string;
  usage: { promptTokens: number; completionTokens: number };
}

async function callLlm(req: LlmRequest): Promise<LlmResponse>
```

Each provider has its own adapter function handling:
- Request format translation (OpenAI format → Anthropic format, etc.)
- Auth header differences
- Response parsing

---

## Integration Changes

### ModelSelector (`components/model-selector.tsx`)
- Fetch registered providers from `/api/providers`
- Only enable providers that have an active API key in DB
- No code changes to the dropdown UI itself, just the `disabled` logic

### Playground (`app/api/llm/route.ts`)
- Replace `process.env.OPENAI_API_KEY` with DB lookup
- Use provider adapter to route based on model's provider

### Eval Backfill (`app/api/eval-backfill/route.ts`)
- Accept `model` parameter from eval config
- Use provider adapter instead of hardcoded OpenAI call

### Eval UI (`app/evaluations/evaluations-manager.tsx`)
- Add `ModelSelector` to eval create/edit form
- Store selected model in `EvalPrompt.model`

### Dataset Runs (`app/datasets/dataset-manager.tsx`)
- Agent selection dropdown reuses existing agent modal pattern
- LLM model options populated from registered providers

### Eval Worker (`eval-worker/worker.py`)
- Fetch API keys via `GET /api/providers?decrypt=true`
- Use appropriate SDK based on provider type

### Nav (`components/nav.tsx`)
- Replace "Agents" button → "Settings" link to `/settings`

---

## UI Specifications

### Settings Page Layout

```
┌──────────────────────────────────────────────────┐
│ Nav: [Dashboard] [Projects] [Eval] [Settings]    │
├──────────┬───────────────────────────────────────┤
│          │                                       │
│ Providers│  Provider Cards                       │
│          │  ┌──────────────────────────────┐     │
│ Agents   │  │ OpenAI      sk-•••abc [Active]│    │
│          │  │ [Test] [Edit] [Delete]        │    │
│          │  └──────────────────────────────┘     │
│          │  ┌──────────────────────────────┐     │
│          │  │ Anthropic   sk-•••xyz [Active]│    │
│          │  │ [Test] [Edit] [Delete]        │    │
│          │  └──────────────────────────────┘     │
│          │                                       │
│          │  [+ Add Provider]                     │
│          │                                       │
├──────────┴───────────────────────────────────────┤
```

### Color Rules (per CLAUDE.md strict palette)

- Cards: `bg-card`, `border-border`
- Text: `text-foreground`, `text-muted-foreground`
- Buttons: shared `Button` component variants (default, outline, destructive, ghost)
- Status badges: NORMAL(`#10b981`)/CRITICAL(`#ef4444`) as badge bg with white text only
- All other surfaces: monochrome only (`foreground`, `background`, `muted`, `accent`, `border`)
- No arbitrary Tailwind colors
