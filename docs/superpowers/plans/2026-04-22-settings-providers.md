# Settings Page: LLM Providers & Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/settings` page with Providers (API key management) and Agents tabs, replacing env-var-based LLM config and enabling multi-provider support.

**Architecture:** New `LlmProvider` Prisma model stores encrypted API keys. A provider adapter (`lib/llm-providers.ts`) routes LLM calls to the correct provider API. The existing `ModelSelector` reads registered providers to enable/disable options. Agents tab embeds existing `AgentTemplatesModal` content as a page section.

**Tech Stack:** Next.js App Router, Prisma/SQLite, Tailwind, Radix, existing shared UI components

---

### Task 1: Prisma Schema — Add LlmProvider Model + EvalPrompt.model Field

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add LlmProvider model and EvalPrompt.model field to schema**

```prisma
model LlmProvider {
  id        String   @id @default(cuid())
  provider  String   @unique  // "openai" | "anthropic" | "google" | "xai"
  apiKey    String             // encrypted
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Add to `EvalPrompt`:
```prisma
  model      String   @default("gpt-4o-mini")
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add_llm_provider_and_eval_model
```

Expected: Migration created, `LlmProvider` table exists, `EvalPrompt` has `model` column.

- [ ] **Step 3: Verify schema**

```bash
npx prisma studio
```

Check that `LlmProvider` table appears and `EvalPrompt` has a `model` column with default `gpt-4o-mini`.

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: add LlmProvider model and EvalPrompt.model field"
```

---

### Task 2: Encryption Utility

**Files:**
- Create: `lib/crypto.ts`

- [ ] **Step 1: Create encryption/decryption utility**

```typescript
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) throw new Error("ENCRYPTION_SECRET env var is required");
  return scryptSync(secret, "salt", 32);
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:ciphertext (all base64)
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decrypt(encoded: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = encoded.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function maskApiKey(key: string): string {
  if (key.length <= 6) return "••••••";
  return key.slice(0, 3) + "•••" + key.slice(-3);
}
```

- [ ] **Step 2: Add ENCRYPTION_SECRET to .env and .env.example**

In `.env.example`, add:
```
ENCRYPTION_SECRET=your_random_secret_at_least_32_chars
```

In `.env`, generate a real value:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add the output as `ENCRYPTION_SECRET=<generated_value>` in `.env`.

- [ ] **Step 3: Commit**

```bash
git add lib/crypto.ts .env.example
git commit -m "feat: add AES-256-GCM encryption utility for API keys"
```

---

### Task 3: Provider API Routes

**Files:**
- Create: `app/api/providers/route.ts`
- Create: `app/api/providers/[id]/route.ts`
- Create: `app/api/providers/test/route.ts`

- [ ] **Step 1: Create main providers route (GET + POST)**

`app/api/providers/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt, maskApiKey } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  const decryptParam = req.nextUrl.searchParams.get("decrypt");
  const providers = await prisma.llmProvider.findMany({ orderBy: { createdAt: "asc" } });

  const result = providers.map((p) => ({
    id: p.id,
    provider: p.provider,
    apiKey: decryptParam === "true" ? decrypt(p.apiKey) : maskApiKey(decrypt(p.apiKey)),
    isActive: p.isActive,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));

  return NextResponse.json({ providers: result });
}

export async function POST(req: NextRequest) {
  const { provider, apiKey } = (await req.json()) as { provider: string; apiKey: string };

  if (!provider || !apiKey) {
    return NextResponse.json({ error: "provider and apiKey required" }, { status: 400 });
  }

  const validProviders = ["openai", "anthropic", "google", "xai"];
  if (!validProviders.includes(provider)) {
    return NextResponse.json({ error: `Invalid provider. Must be one of: ${validProviders.join(", ")}` }, { status: 400 });
  }

  const existing = await prisma.llmProvider.findUnique({ where: { provider } });
  if (existing) {
    return NextResponse.json({ error: `Provider "${provider}" already registered. Use PUT to update.` }, { status: 409 });
  }

  const encrypted = encrypt(apiKey);
  const created = await prisma.llmProvider.create({
    data: { provider, apiKey: encrypted, isActive: true },
  });

  return NextResponse.json({
    id: created.id,
    provider: created.provider,
    apiKey: maskApiKey(apiKey),
    isActive: created.isActive,
  });
}
```

- [ ] **Step 2: Create single provider route (PUT + DELETE)**

`app/api/providers/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt, maskApiKey } from "@/lib/crypto";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { apiKey?: string; isActive?: boolean };

  const existing = await prisma.llmProvider.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (body.apiKey !== undefined) data.apiKey = encrypt(body.apiKey);
  if (body.isActive !== undefined) data.isActive = body.isActive;

  const updated = await prisma.llmProvider.update({ where: { id }, data });

  return NextResponse.json({
    id: updated.id,
    provider: updated.provider,
    apiKey: maskApiKey(decrypt(updated.apiKey)),
    isActive: updated.isActive,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    await prisma.llmProvider.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }
}
```

- [ ] **Step 3: Create test connection route**

`app/api/providers/test/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

const TEST_ENDPOINTS: Record<string, { url: string; buildRequest: (key: string) => { headers: Record<string, string>; body: string } }> = {
  openai: {
    url: "https://api.openai.com/v1/models",
    buildRequest: (key) => ({
      headers: { Authorization: `Bearer ${key}` },
      body: "",
    }),
  },
  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    buildRequest: (key) => ({
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    }),
  },
  google: {
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    buildRequest: (key) => ({
      headers: { "x-goog-api-key": key },
      body: "",
    }),
  },
  xai: {
    url: "https://api.x.ai/v1/models",
    buildRequest: (key) => ({
      headers: { Authorization: `Bearer ${key}` },
      body: "",
    }),
  },
};

export async function POST(req: NextRequest) {
  const { provider, apiKey } = (await req.json()) as { provider: string; apiKey: string };

  if (!provider || !apiKey) {
    return NextResponse.json({ error: "provider and apiKey required" }, { status: 400 });
  }

  const config = TEST_ENDPOINTS[provider];
  if (!config) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  try {
    const { headers, body } = config.buildRequest(apiKey);
    const method = body ? "POST" : "GET";
    const res = await fetch(config.url, {
      method,
      headers,
      ...(body ? { body } : {}),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok || res.status === 200 || res.status === 201) {
      return NextResponse.json({ success: true });
    }

    const data = await res.json().catch(() => ({}));
    return NextResponse.json({
      success: false,
      error: data.error?.message || `HTTP ${res.status}`,
    });
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : "Connection failed",
    });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/providers/
git commit -m "feat: add provider CRUD and test connection API routes"
```

---

### Task 4: Provider Adapter — Unified LLM Call Interface

**Files:**
- Create: `lib/llm-providers.ts`

- [ ] **Step 1: Create provider adapter with multi-provider support**

```typescript
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

export interface LlmRequest {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  responseFormat?: "json" | "text";
}

export interface LlmResponse {
  content: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// Map model ID prefix to provider name
const MODEL_PROVIDER_MAP: Record<string, string> = {
  "gpt-": "openai",
  "o1": "openai",
  "o3": "openai",
  "o4": "openai",
  "claude-": "anthropic",
  "gemini-": "google",
  "grok-": "xai",
};

export function getProviderForModel(modelId: string): string {
  for (const [prefix, provider] of Object.entries(MODEL_PROVIDER_MAP)) {
    if (modelId.startsWith(prefix)) return provider;
  }
  return "openai"; // fallback
}

async function getApiKey(provider: string): Promise<string> {
  const record = await prisma.llmProvider.findUnique({ where: { provider } });
  if (!record || !record.isActive) {
    throw new Error(`No active API key for provider "${provider}". Add one in Settings > Providers.`);
  }
  return decrypt(record.apiKey);
}

// ── OpenAI-compatible call (OpenAI, xAI) ──

async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  req: LlmRequest,
): Promise<LlmResponse> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.7,
  };
  if (req.responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

  return {
    content: data.choices?.[0]?.message?.content ?? "",
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    },
  };
}

// ── Anthropic call ──

async function callAnthropic(apiKey: string, req: LlmRequest): Promise<LlmResponse> {
  // Separate system message from user/assistant messages
  const systemMsgs = req.messages.filter((m) => m.role === "system");
  const otherMsgs = req.messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: 4096,
    messages: otherMsgs.map((m) => ({ role: m.role, content: m.content })),
    temperature: req.temperature ?? 0.7,
  };
  if (systemMsgs.length > 0) {
    body.system = systemMsgs.map((m) => m.content).join("\n");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

  const content = data.content?.map((c: { text: string }) => c.text).join("") ?? "";
  return {
    content,
    usage: {
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
      totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
    },
  };
}

// ── Google Gemini call ──

async function callGoogle(apiKey: string, req: LlmRequest): Promise<LlmResponse> {
  // Convert messages to Gemini format
  const systemMsgs = req.messages.filter((m) => m.role === "system");
  const otherMsgs = req.messages.filter((m) => m.role !== "system");

  const contents = otherMsgs.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { temperature: req.temperature ?? 0.7 },
  };
  if (systemMsgs.length > 0) {
    body.systemInstruction = { parts: [{ text: systemMsgs.map((m) => m.content).join("\n") }] };
  }
  if (req.responseFormat === "json") {
    (body.generationConfig as Record<string, unknown>).responseMimeType = "application/json";
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

  const content = data.candidates?.[0]?.content?.parts?.map((p: { text: string }) => p.text).join("") ?? "";
  return {
    content,
    usage: {
      promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
    },
  };
}

// ── Main entry point ──

export async function callLlm(req: LlmRequest): Promise<LlmResponse> {
  const provider = getProviderForModel(req.model);
  const apiKey = await getApiKey(provider);

  switch (provider) {
    case "openai":
      return callOpenAICompatible("https://api.openai.com/v1", apiKey, req);
    case "anthropic":
      return callAnthropic(apiKey, req);
    case "google":
      return callGoogle(apiKey, req);
    case "xai":
      return callOpenAICompatible("https://api.x.ai/v1", apiKey, req);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/** Get list of active provider names from DB */
export async function getActiveProviders(): Promise<string[]> {
  const providers = await prisma.llmProvider.findMany({
    where: { isActive: true },
    select: { provider: true },
  });
  return providers.map((p) => p.provider);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/llm-providers.ts
git commit -m "feat: add multi-provider LLM adapter with OpenAI, Anthropic, Google, xAI support"
```

---

### Task 5: Update LLM API Route to Use Provider Adapter

**Files:**
- Modify: `app/api/llm/route.ts`

- [ ] **Step 1: Replace hardcoded OpenAI call with provider adapter**

Replace the entire `app/api/llm/route.ts` with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { callLlm, getProviderForModel } from "@/lib/llm-providers";

const PHOENIX = process.env.PHOENIX_URL ?? "http://localhost:6006";

export async function POST(req: NextRequest) {
  const { messages, model, temperature, promptLabel } = await req.json();
  const usedModel = model || "gpt-4o-mini";

  const startTime = new Date().toISOString();

  try {
    const result = await callLlm({
      model: usedModel,
      messages,
      temperature: temperature ?? 0.7,
    });

    const endTime = new Date().toISOString();

    // Record span to Phoenix playground project
    try {
      const traceId = crypto.randomUUID().replace(/-/g, "");
      const spanId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

      await fetch(`${PHOENIX}/v1/projects/playground/spans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [
            {
              name: promptLabel || "playground-run",
              context: { trace_id: traceId, span_id: spanId },
              span_kind: "LLM",
              parent_id: null,
              start_time: startTime,
              end_time: endTime,
              status_code: "OK",
              status_message: "",
              attributes: {
                "input.value": JSON.stringify(messages),
                "output.value": result.content,
                "llm.model_name": usedModel,
                "llm.token_count.prompt": result.usage.promptTokens,
                "llm.token_count.completion": result.usage.completionTokens,
                "llm.token_count.total": result.usage.totalTokens,
                "metadata.source": "playground",
                "metadata.prompt_label": promptLabel || "",
              },
              events: [],
            },
          ],
        }),
      });
    } catch (e) {
      console.error("Failed to record playground span:", e);
    }

    // Return in OpenAI-compatible format for backward compat
    return NextResponse.json({
      choices: [{ message: { content: result.content } }],
      usage: {
        prompt_tokens: result.usage.promptTokens,
        completion_tokens: result.usage.completionTokens,
        total_tokens: result.usage.totalTokens,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "LLM call failed" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/llm/route.ts
git commit -m "refactor: use provider adapter in LLM API route"
```

---

### Task 6: Update Eval Backfill Route to Use Provider Adapter + Per-Eval Model

**Files:**
- Modify: `app/api/eval-backfill/route.ts`

- [ ] **Step 1: Replace hardcoded openaiEval with provider adapter**

In `app/api/eval-backfill/route.ts`, replace the imports and `OPENAI_API_KEY` / `openaiEval` function:

Remove these lines:
```typescript
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
```

and the `openaiEval` function (lines 42-55).

Add import at top:
```typescript
import { callLlm } from "@/lib/llm-providers";
```

Add new eval function:
```typescript
async function llmEval(messages: { role: string; content: string }[], model: string): Promise<Record<string, unknown>> {
  try {
    const result = await callLlm({
      model,
      messages,
      temperature: 0,
      responseFormat: "json",
    });
    return JSON.parse(result.content || "{}");
  } catch {
    return {};
  }
}
```

In the `POST` handler, remove the `OPENAI_API_KEY` check (lines 132-134).

Change the eval call (line 222) from:
```typescript
const r = await openaiEval(messages);
```
to:
```typescript
const r = await llmEval(messages, evalPrompt.model ?? "gpt-4o-mini");
```

- [ ] **Step 2: Commit**

```bash
git add app/api/eval-backfill/route.ts
git commit -m "refactor: use provider adapter in eval backfill, support per-eval model"
```

---

### Task 7: Settings Page — Layout with Providers and Agents Tabs

**Files:**
- Create: `app/settings/page.tsx`
- Create: `app/settings/settings-page.tsx`

- [ ] **Step 1: Create the settings page wrapper**

`app/settings/page.tsx`:
```typescript
import { SettingsPage } from "./settings-page";

export default function Page() {
  return <SettingsPage />;
}
```

- [ ] **Step 2: Create the settings page component with tab layout**

`app/settings/settings-page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Key, Bot } from "lucide-react";
import { ProvidersSection } from "./providers-section";
import { AgentsSection } from "./agents-section";

const TABS = [
  { id: "providers", label: "Providers", icon: Key },
  { id: "agents", label: "Agents", icon: Bot },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SettingsPage() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabId) || "providers";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  return (
    <div className="flex h-[calc(100vh-49px)]">
      {/* Sidebar */}
      <div className="w-48 shrink-0 border-r bg-muted/5 p-3 space-y-1">
        <p className="mb-3 px-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Settings
        </p>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
              activeTab === id
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "providers" && <ProvidersSection />}
        {activeTab === "agents" && <AgentsSection />}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/settings/
git commit -m "feat: add settings page layout with sidebar tabs"
```

---

### Task 8: Providers Section UI

**Files:**
- Create: `app/settings/providers-section.tsx`

- [ ] **Step 1: Create the providers section component**

```typescript
"use client";

import { useState, useCallback, useEffect } from "react";
import { Plus, Trash2, Pencil, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel, FormError } from "@/components/ui/form-field";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";

interface ProviderEntry {
  id: string;
  provider: string;
  apiKey: string; // masked
  isActive: boolean;
}

const PROVIDER_META: Record<string, { label: string; placeholder: string }> = {
  openai: { label: "OpenAI", placeholder: "sk-..." },
  anthropic: { label: "Anthropic", placeholder: "sk-ant-..." },
  google: { label: "Google", placeholder: "AIza..." },
  xai: { label: "xAI", placeholder: "xai-..." },
};

const PROVIDER_OPTIONS = Object.entries(PROVIDER_META).map(([value, { label }]) => ({ value, label }));

export function ProvidersSection() {
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<ProviderEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/providers");
      const data = await res.json();
      setProviders(data.providers ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(p: ProviderEntry) {
    if (!confirm(`Delete ${PROVIDER_META[p.provider]?.label || p.provider} provider?`)) return;
    await fetch(`/api/providers/${p.id}`, { method: "DELETE" });
    await load();
  }

  function handleEdit(p: ProviderEntry) {
    setEditTarget(p);
    setShowForm(true);
  }

  const registeredProviders = new Set(providers.map((p) => p.provider));

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold">LLM Providers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Register API keys to enable models from each provider.
        </p>
      </div>

      {loading && <LoadingState />}

      {!loading && (
        <div className="space-y-3">
          {providers.map((p) => (
            <div key={p.id} className="flex items-center gap-4 rounded-lg border px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {PROVIDER_META[p.provider]?.label || p.provider}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">{p.apiKey}</p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  p.isActive
                    ? "bg-[#10b981] text-white"
                    : "bg-[#ef4444] text-white"
                }`}
              >
                {p.isActive ? "Active" : "Inactive"}
              </span>
              <button onClick={() => handleEdit(p)} className="rounded p-1.5 transition-colors hover:bg-muted" title="Edit">
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <button onClick={() => handleDelete(p)} className="rounded p-1.5 transition-colors hover:bg-muted" title="Delete">
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          ))}

          {!loading && providers.length === 0 && (
            <EmptyState
              icon={Plus}
              title="No providers registered"
              description="Add an LLM provider to start using models in playground and evaluations."
            />
          )}

          <button
            onClick={() => { setEditTarget(null); setShowForm(true); }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed py-3 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            Add Provider
          </button>
        </div>
      )}

      {showForm && (
        <ProviderFormModal
          existing={editTarget}
          registeredProviders={registeredProviders}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
          onSave={() => { setShowForm(false); setEditTarget(null); load(); }}
        />
      )}
    </div>
  );
}

// ── Provider Form Modal ──

function ProviderFormModal({
  existing,
  registeredProviders,
  onClose,
  onSave,
}: {
  existing: ProviderEntry | null;
  registeredProviders: Set<string>;
  onClose: () => void;
  onSave: () => void;
}) {
  const isEdit = !!existing;
  const [provider, setProvider] = useState(existing?.provider ?? "");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [error, setError] = useState<string | undefined>();

  const availableProviders = PROVIDER_OPTIONS.filter(
    (o) => isEdit ? o.value === existing.provider : !registeredProviders.has(o.value),
  );

  async function handleTest() {
    if (!provider || !apiKey) { setError("Select a provider and enter an API key."); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ success: false, error: "Network error" });
    }
    setTesting(false);
  }

  async function handleSave() {
    if (!provider) { setError("Select a provider."); return; }
    if (!apiKey && !isEdit) { setError("Enter an API key."); return; }
    setError(undefined);
    setSaving(true);

    try {
      if (isEdit) {
        const body: Record<string, unknown> = {};
        if (apiKey) body.apiKey = apiKey;
        const res = await fetch(`/api/providers/${existing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const d = await res.json();
          setError(d.error ?? "Failed to update.");
          return;
        }
      } else {
        const res = await fetch("/api/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, apiKey }),
        });
        if (!res.ok) {
          const d = await res.json();
          setError(d.error ?? "Failed to save.");
          return;
        }
      }
      onSave();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} className="w-[480px]">
      <ModalHeader onClose={onClose}>
        {isEdit ? `Edit: ${PROVIDER_META[existing.provider]?.label}` : "Add Provider"}
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div>
            <FormLabel>Provider</FormLabel>
            <select
              value={provider}
              onChange={(e) => { setProvider(e.target.value); setTestResult(null); }}
              disabled={isEdit}
              className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select provider...</option>
              {availableProviders.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <FormLabel>API Key</FormLabel>
            <Input
              type="password"
              placeholder={PROVIDER_META[provider]?.placeholder ?? "Enter API key"}
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
            />
            {isEdit && (
              <p className="mt-1 text-xs text-muted-foreground">
                Leave blank to keep the current key. Current: {existing.apiKey}
              </p>
            )}
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
              testResult.success ? "border-[#10b981]/30 text-[#10b981]" : "border-[#ef4444]/30 text-[#ef4444]"
            }`}>
              {testResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {testResult.success ? "Connection successful" : testResult.error || "Connection failed"}
            </div>
          )}

          {error && <FormError message={error} />}

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || !provider || !apiKey}>
              {testing ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
              Test Connection
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : isEdit ? "Update" : "Add"}
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
git add app/settings/providers-section.tsx
git commit -m "feat: add providers section UI with CRUD and test connection"
```

---

### Task 9: Agents Section — Move from Modal to Settings Page

**Files:**
- Create: `app/settings/agents-section.tsx`

- [ ] **Step 1: Create agents section that reuses AgentTemplatesModal internals**

Extract the agent list/form logic from `AgentTemplatesModal` into a page-level section. Since the modal component has all the logic, the simplest approach is to render it as an inline section.

`app/settings/agents-section.tsx`:

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus, Pencil, Trash2, ChevronRight, ChevronDown, Bot,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormLabel, FormError } from "@/components/ui/form-field";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";

interface AgentEntry {
  id: string;
  name: string;
  description: string;
  agentType: string;
  endpoint: string;
  assistantId: string;
  evalPrompts: string;
}

const AGENT_TYPES = [
  { value: "langgraph", label: "LangGraph" },
  { value: "rest", label: "REST SSE" },
];

export function AgentsSection() {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [formModal, setFormModal] = useState<null | "create" | "edit">(null);
  const [editTarget, setEditTarget] = useState<AgentEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agent-templates");
      const data = await res.json();
      setAgents(data.templates ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(agent: AgentEntry) {
    if (!confirm(`Delete agent "${agent.name}" and disconnect all projects using it?`)) return;
    await fetch(`/api/agent-templates?id=${agent.id}`, { method: "DELETE" });
    await load();
  }

  function parseEvalPrompts(raw: string): Record<string, string> {
    try { return JSON.parse(raw); } catch { return {}; }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Agents</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Register and manage agent templates for projects and dataset runs.
        </p>
      </div>

      <button
        onClick={() => { setEditTarget(null); setFormModal("create"); }}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed py-3 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        Register New Agent
      </button>

      {loading && <LoadingState />}
      {!loading && agents.length === 0 && (
        <EmptyState icon={Bot} title="No agents registered" description="Register an agent to connect it to projects." />
      )}

      <div className="flex flex-col gap-2">
        {agents.map((a) => {
          const isExpanded = expanded === a.id;
          const prompts = parseEvalPrompts(a.evalPrompts);
          const promptKeys = Object.keys(prompts).filter((k) => prompts[k]);

          return (
            <div key={a.id} className="rounded-lg border">
              <div className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => setExpanded(isExpanded ? null : a.id)} className="rounded p-0.5 hover:bg-muted">
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{a.name}</p>
                  {a.description && <p className="truncate text-xs text-muted-foreground">{a.description}</p>}
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{a.agentType}</span>
                {promptKeys.length > 0 && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{promptKeys.length} eval prompts</span>
                )}
                <button onClick={() => { setEditTarget(a); setFormModal("edit"); }} className="rounded p-1.5 transition-colors hover:bg-muted" title="Edit">
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button onClick={() => handleDelete(a)} className="rounded p-1.5 transition-colors hover:bg-muted" title="Delete">
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>

              {isExpanded && (
                <div className="border-t px-4 py-3 space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-xs font-semibold uppercase text-muted-foreground">Endpoint</span>
                      <p className="mt-0.5 font-mono text-xs break-all">{a.endpoint}</p>
                    </div>
                    <div>
                      <span className="text-xs font-semibold uppercase text-muted-foreground">Assistant ID</span>
                      <p className="mt-0.5 font-mono text-xs">{a.assistantId}</p>
                    </div>
                  </div>
                  {promptKeys.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold uppercase text-muted-foreground">Eval Prompts</span>
                      {promptKeys.map((key) => (
                        <div key={key} className="mt-2">
                          <span className="mb-1 inline-block rounded bg-muted px-1.5 py-0.5 text-xs font-semibold uppercase">{key}</span>
                          <div className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-xs leading-relaxed">{prompts[key]}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {formModal === "create" && (
        <AgentFormModal mode="create" onClose={() => setFormModal(null)} onSave={() => { setFormModal(null); load(); }} />
      )}
      {formModal === "edit" && editTarget && (
        <AgentFormModal mode="edit" initial={editTarget} onClose={() => { setFormModal(null); setEditTarget(null); }} onSave={() => { setFormModal(null); setEditTarget(null); load(); }} />
      )}
    </div>
  );
}

// ── Agent Form Modal (create / edit) ──

function AgentFormModal({ mode, initial, onClose, onSave }: {
  mode: "create" | "edit";
  initial?: AgentEntry | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [agentType, setAgentType] = useState(initial?.agentType ?? "langgraph");
  const [endpoint, setEndpoint] = useState(initial?.endpoint ?? "http://localhost:2024");
  const [assistantId, setAssistantId] = useState(initial?.assistantId ?? "agent");
  const [evalHallucination, setEvalHallucination] = useState("");
  const [evalCitation, setEvalCitation] = useState("");
  const [evalToolCalling, setEvalToolCalling] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (initial?.evalPrompts) {
      try {
        const p = JSON.parse(initial.evalPrompts);
        setEvalHallucination(p.hallucination ?? "");
        setEvalCitation(p.citation ?? "");
        setEvalToolCalling(p.tool_calling ?? "");
      } catch {}
    }
  }, [initial]);

  async function handleSave() {
    if (!name.trim()) { setError("Name is required."); return; }
    if (!endpoint.trim()) { setError("Endpoint is required."); return; }
    setError(undefined);
    setSaving(true);

    const evalPrompts: Record<string, string> = {};
    if (evalHallucination.trim()) evalPrompts.hallucination = evalHallucination.trim();
    if (evalCitation.trim()) evalPrompts.citation = evalCitation.trim();
    if (evalToolCalling.trim()) evalPrompts.tool_calling = evalToolCalling.trim();

    try {
      const body: Record<string, unknown> = {
        name: name.trim(), description: description.trim(), agentType,
        endpoint: endpoint.trim(), assistantId: assistantId.trim(), evalPrompts,
      };
      if (mode === "edit" && initial?.id) body.id = initial.id;

      const res = await fetch("/api/agent-templates", {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed to save."); return; }
      onSave();
    } catch { setError("Network error."); } finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} className="w-[560px]">
      <ModalHeader onClose={onClose}>{mode === "create" ? "Register Agent" : `Edit: ${initial?.name}`}</ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div>
            <FormLabel>Agent Name</FormLabel>
            <Input placeholder="e.g. Legal RAG, Dexter, Custom Agent" value={name} onChange={(e) => setName(e.target.value)} disabled={mode === "edit"} />
          </div>
          <div>
            <FormLabel>Description</FormLabel>
            <Input placeholder="Short description of this agent" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FormLabel>Agent Type</FormLabel>
              <select value={agentType} onChange={(e) => setAgentType(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring">
                {AGENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <FormLabel>Assistant ID</FormLabel>
              <Input placeholder="agent" value={assistantId} onChange={(e) => setAssistantId(e.target.value)} />
            </div>
          </div>
          <div>
            <FormLabel>Endpoint URL</FormLabel>
            <Input placeholder="http://localhost:2024" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
          </div>
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2">Eval Prompts</p>
            <p className="text-xs text-muted-foreground mb-3">Custom eval prompts for this agent. Leave blank to use defaults. Use {"{{context}}"}, {"{{response}}"}, {"{{query}}"} as placeholders.</p>
            <div className="space-y-3">
              <div><FormLabel>Hallucination</FormLabel><Textarea rows={3} placeholder="Default prompt" value={evalHallucination} onChange={(e) => setEvalHallucination(e.target.value)} /></div>
              <div><FormLabel>Citation</FormLabel><Textarea rows={3} placeholder="Default prompt" value={evalCitation} onChange={(e) => setEvalCitation(e.target.value)} /></div>
              <div><FormLabel>Tool Calling</FormLabel><Textarea rows={3} placeholder="Default prompt" value={evalToolCalling} onChange={(e) => setEvalToolCalling(e.target.value)} /></div>
            </div>
          </div>
          {error && <FormError message={error} />}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : mode === "create" ? "Register" : "Save"}</Button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/settings/agents-section.tsx
git commit -m "feat: add agents section to settings page"
```

---

### Task 10: Update Nav — Replace Agents Button with Settings Link

**Files:**
- Modify: `components/nav.tsx`

- [ ] **Step 1: Replace the Agents modal button with a Settings nav link**

In `components/nav.tsx`:

1. Remove the `AgentTemplatesModal` import and `showTemplates` state.
2. Remove the `<AgentTemplatesModal>` rendering.
3. Add Settings to the `links` array.
4. Remove the Agents button from the right side.

Replace the `links` array (line 22-29):
```typescript
const links = [
  { href: "/", label: "Chat", icon: MessageSquare, public: true },
  { href: "/playground", label: "Playground", icon: FlaskConical, public: false },
  { href: "/projects", label: "Projects", icon: FolderOpen, public: false },
  { href: "/evaluations", label: "Evaluations", icon: SlidersHorizontal, public: false },
  { href: "/datasets", label: "Datasets", icon: Database, public: false },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, public: false },
  { href: "/settings", label: "Settings", icon: Settings2, public: false },
];
```

Import `Settings2` from `lucide-react` (replace `Bot` import since it's no longer needed in nav).

Remove from imports: `AgentTemplatesModal`.

Remove state: `const [showTemplates, setShowTemplates] = useState(false);`

Remove from JSX: `<AgentTemplatesModal open={showTemplates} onClose={() => setShowTemplates(false)} />`

Remove the Agents button block (lines 83-89):
```typescript
// DELETE THIS BLOCK:
<button
  onClick={() => setShowTemplates(true)}
  className="..."
>
  <Bot className="h-4 w-4" />
  Agents
</button>
```

- [ ] **Step 2: Commit**

```bash
git add components/nav.tsx
git commit -m "refactor: replace Agents modal button with Settings nav link"
```

---

### Task 11: ModelSelector — Dynamic Provider Enabling Based on DB

**Files:**
- Modify: `components/model-selector.tsx`

- [ ] **Step 1: Fetch active providers and use them to enable/disable**

Add a `useEffect` to fetch active providers from `/api/providers` and compute which providers are enabled.

Add state and fetch at the top of the `ModelSelector` component (after existing state):

```typescript
const [activeProviders, setActiveProviders] = useState<Set<string>>(new Set());

useEffect(() => {
  fetch("/api/providers")
    .then((r) => r.json())
    .then((data) => {
      const active = new Set<string>();
      for (const p of data.providers ?? []) {
        if (p.isActive) active.add(p.provider);
      }
      setActiveProviders(active);
    })
    .catch(() => {});
}, []);
```

Remove the static `disabled` property from the `PROVIDERS` array definition (lines 88, 101, 115).

Change the provider disabled check throughout the component. Replace all uses of `provider.disabled` with a computed check:

```typescript
const isDisabled = !activeProviders.has(provider.name.toLowerCase());
```

In the search results rendering (line 259), replace `provider.disabled` with `isDisabled`.

In the hierarchical view (line 289-294), replace `provider.disabled` with `isDisabled`.

- [ ] **Step 2: Commit**

```bash
git add components/model-selector.tsx
git commit -m "feat: dynamically enable ModelSelector providers based on registered API keys"
```

---

### Task 12: Eval UI — Add Model Selector to Eval Create/Edit

**Files:**
- Modify: `app/evaluations/evaluations-manager.tsx`

- [ ] **Step 1: Add model field to eval types and UI**

In the `EvalPrompt` interface, add:
```typescript
model: string;
```

In the eval create/edit form area, add a `ModelSelector` import and a model selection field. Find the section where eval prompts are created/edited and add:

```typescript
import { ModelSelector } from "@/components/model-selector";
```

Add state for model in the create form:
```typescript
const [newEvalModel, setNewEvalModel] = useState("gpt-4o-mini");
```

Add the `ModelSelector` component near the eval type/output mode selectors:
```tsx
<div>
  <FormLabel>Eval Model</FormLabel>
  <ModelSelector value={newEvalModel} onChange={setNewEvalModel} />
</div>
```

Include `model: newEvalModel` in the save/create API call body.

Also update the eval list display to show which model each eval uses.

- [ ] **Step 2: Update eval API to persist model field**

Ensure the eval CRUD API routes (`/api/evals` or wherever eval prompts are managed) read and write the `model` field from `EvalPrompt`.

- [ ] **Step 3: Commit**

```bash
git add app/evaluations/evaluations-manager.tsx
git commit -m "feat: add per-eval model selection in evaluations UI"
```

---

### Task 13: Dataset Manager — Populate Agent Dropdown from Registered Providers

**Files:**
- Modify: `app/datasets/dataset-manager.tsx`

- [ ] **Step 1: Fetch registered providers and add their models to agent dropdown**

In the `DatasetManager`, after `agentConfigs` are loaded, also fetch providers:

```typescript
const [providerModels, setProviderModels] = useState<{ provider: string; models: string[] }[]>([]);

useEffect(() => {
  fetch("/api/providers")
    .then((r) => r.json())
    .then((data) => {
      const models: { provider: string; models: string[] }[] = [];
      for (const p of data.providers ?? []) {
        if (!p.isActive) continue;
        // Map provider to available model list
        const modelMap: Record<string, string[]> = {
          openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "gpt-4.1-mini"],
          anthropic: ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
          google: ["gemini-2.5-flash", "gemini-2.0-flash"],
          xai: ["grok-3-mini", "grok-3"],
        };
        models.push({ provider: p.provider, models: modelMap[p.provider] ?? [] });
      }
      setProviderModels(models);
    })
    .catch(() => {});
}, []);
```

Replace the hardcoded `<option>` values in the agent select dropdown (lines 562-563):

```tsx
<select
  value={selectedAgent}
  onChange={e => setSelectedAgent(e.target.value)}
  className="h-8 w-52 rounded-md border bg-background px-2 text-xs"
>
  <optgroup label="Direct LLM">
    {providerModels.map(({ provider, models }) =>
      models.map((m) => (
        <option key={m} value={`llm:${m}`}>
          {provider.charAt(0).toUpperCase() + provider.slice(1)} · {m}
        </option>
      ))
    )}
  </optgroup>
  <optgroup label="Agents">
    {agentConfigs.map(c => (
      <option key={c.id} value={`agent:${c.id}`}>
        {c.template?.name || c.alias?.trim() || c.project} ({c.agentType})
      </option>
    ))}
  </optgroup>
</select>
```

- [ ] **Step 2: Update default selectedAgent to handle no providers case**

Change the initial state to be smarter:
```typescript
const [selectedAgent, setSelectedAgent] = useState("");
```

Set a default once providers load:
```typescript
useEffect(() => {
  if (!selectedAgent && providerModels.length > 0 && providerModels[0].models.length > 0) {
    setSelectedAgent(`llm:${providerModels[0].models[0]}`);
  }
}, [providerModels, selectedAgent]);
```

- [ ] **Step 3: Commit**

```bash
git add app/datasets/dataset-manager.tsx
git commit -m "feat: populate dataset agent dropdown from registered providers"
```

---

### Task 14: Update Dataset Run LLM Call to Use Provider Adapter

**Files:**
- Modify: `app/api/datasets/runs/route.ts` (or wherever LLM calls happen for dataset runs)

- [ ] **Step 1: Ensure dataset run LLM calls go through the provider adapter**

Check if dataset runs call `/api/llm` (which is already updated) or make direct OpenAI calls. If they go through `/api/llm`, no change needed — it already uses the provider adapter from Task 5.

If there are direct OpenAI calls in the dataset run flow, replace them with calls to the provider adapter or route them through `/api/llm`.

- [ ] **Step 2: Commit (if changes were needed)**

```bash
git add app/api/datasets/
git commit -m "refactor: route dataset run LLM calls through provider adapter"
```

---

### Task 15: Eval Worker (Python) — Fetch API Keys from Dashboard API

**Files:**
- Modify: `eval-worker/worker.py`

- [ ] **Step 1: Add function to fetch API key from dashboard**

Add near the top of the config section, after the existing env var definitions:

```python
def fetch_provider_key(provider: str) -> str:
    """Fetch decrypted API key from dashboard."""
    try:
        resp = httpx.get(f"{DASHBOARD_URL}/api/providers?decrypt=true", timeout=10)
        for p in resp.json().get("providers", []):
            if p["provider"] == provider and p.get("isActive", False):
                return p["apiKey"]
    except Exception as e:
        logger.warning("Failed to fetch %s key from dashboard: %s", provider, e)
    # Fallback to env var
    return os.environ.get("OPENAI_API_KEY", "")
```

- [ ] **Step 2: Replace hardcoded OPENAI_API_KEY usage**

Replace the line:
```python
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
```

With:
```python
def get_openai_key() -> str:
    key = fetch_provider_key("openai")
    if not key:
        key = os.environ.get("OPENAI_API_KEY", "")
    return key
```

Update the OpenAI client initialization (called lazily when needed):
```python
def get_openai_client():
    key = get_openai_key()
    return OpenAI(api_key=key)

def get_openai_model():
    key = get_openai_key()
    return OpenAIModel(model="gpt-4o-mini", api_key=key)
```

Replace all uses of the global `client`, `model`, `qa_eval`, `relevance_eval` with lazy initialization that calls these functions.

- [ ] **Step 3: Commit**

```bash
git add eval-worker/worker.py
git commit -m "refactor: eval worker fetches API keys from dashboard API"
```

---

### Task 16: Clean Up — Remove OPENAI_API_KEY Env Var Dependencies

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Update .env.example**

Replace:
```
OPENAI_API_KEY=your_openai_api_key
```

With:
```
# LLM API keys are now managed via Settings > Providers in the UI
# Only ENCRYPTION_SECRET is required for the encryption of stored keys
ENCRYPTION_SECRET=your_random_secret_at_least_32_chars

# Optional fallback for eval-worker if dashboard is unavailable
# OPENAI_API_KEY=your_openai_api_key
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: update .env.example for UI-managed provider keys"
```

---

### Task 17: Final Verification

- [ ] **Step 1: Start the app and verify Settings page loads**

```bash
npm run dev
```

Navigate to `http://localhost:3000/settings`. Verify:
- Providers tab shows with "Add Provider" button
- Agents tab shows existing agent templates
- Nav has "Settings" link instead of "Agents" button

- [ ] **Step 2: Test provider CRUD flow**

1. Add an OpenAI provider with a valid API key
2. Click "Test Connection" — should show success
3. Verify the key appears masked in the list
4. Navigate to Playground — OpenAI models should be enabled in ModelSelector
5. Add an Anthropic provider — Claude models should become enabled

- [ ] **Step 3: Test eval with selected model**

1. Go to Evaluations
2. Create/edit an eval — verify ModelSelector appears
3. Run a backfill — verify it uses the selected model

- [ ] **Step 4: Test dataset run with provider models**

1. Go to Datasets
2. Open agent dropdown — verify it shows models from registered providers
3. Run a dataset with a non-OpenAI model (if available)

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete settings page with providers and agents management"
```
