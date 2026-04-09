# Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Firebase Auth (Google login), SQLite persistence (Prisma), chat history sidebar, and Phoenix metrics dashboard with draggable Highcharts widgets.

**Architecture:** Next.js App Router with API routes proxying to LangGraph/Phoenix. Firebase Auth for Google login only. SQLite via Prisma for user data, thread mapping, and dashboard layouts. react-grid-layout for widget positioning, Highcharts for charts.

**Tech Stack:** Firebase Auth, Prisma + SQLite, react-grid-layout, highcharts, highcharts-react-official

---

## File Structure

### New Files
- `lib/firebase.ts` — Firebase app + Auth initialization
- `lib/auth-context.tsx` — React AuthContext provider + useAuth hook
- `components/auth-modal.tsx` — "로그인이 필요합니다" modal
- `app/login/page.tsx` — Google login page
- `prisma/schema.prisma` — User, Thread, DashboardLayout models
- `lib/prisma.ts` — Prisma client singleton
- `app/api/auth/sync/route.ts` — POST: upsert user on login
- `app/api/threads/route.ts` — GET/POST: user thread CRUD
- `app/api/threads/[id]/route.ts` — DELETE: single thread
- `app/api/dashboard/layout/route.ts` — GET/PUT: widget layout
- `app/dashboard/page.tsx` — Dashboard page with widget grid
- `components/dashboard/widget-grid.tsx` — react-grid-layout wrapper
- `components/dashboard/widgets/stat-card.tsx` — Number stat widget
- `components/dashboard/widgets/highchart-widget.tsx` — Highcharts wrapper
- `components/dashboard/add-widget-menu.tsx` — Widget picker dropdown

### Modified Files
- `package.json` — Add new dependencies
- `app/layout.tsx` — Wrap with AuthProvider
- `app/assistant.tsx` — Add sidebar, auth gate on input
- `components/nav.tsx` — Add Dashboard tab + auth gate on nav links
- `components/assistant-ui/thread.tsx` — Add auth check on composer input focus
- `.env.local` / `.env.example` — Add Firebase config vars

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install production dependencies**

```bash
cd /home/rheon/Desktop/Semester/4-1/cpastone/my-own-phenix
npm install firebase prisma @prisma/client react-grid-layout highcharts highcharts-react-official
```

- [ ] **Step 2: Install dev dependencies**

```bash
npm install -D @types/react-grid-layout
```

- [ ] **Step 3: Verify build still works**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add firebase, prisma, react-grid-layout, highcharts deps"
```

---

## Task 2: Firebase Auth Setup

**Files:**
- Create: `lib/firebase.ts`
- Modify: `.env.local`
- Modify: `.env.example`

- [ ] **Step 1: Add Firebase env vars to `.env.example`**

Append to `.env.example`:
```
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
```

- [ ] **Step 2: Add Firebase env vars to `.env.local`**

Append to `.env.local`:
```
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=my-own-phenix.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=my-own-phenix
```

- [ ] **Step 3: Create `lib/firebase.ts`**

```typescript
import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
```

- [ ] **Step 4: Commit**

```bash
git add lib/firebase.ts .env.example
git commit -m "feat: add Firebase Auth config"
```

Note: Do NOT commit `.env.local`.

---

## Task 3: Auth Context + useAuth Hook

**Files:**
- Create: `lib/auth-context.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create `lib/auth-context.tsx`**

```typescript
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        fetch("/api/auth/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: u.uid,
            email: u.email,
            name: u.displayName,
          }),
        }).catch(() => {});
      }
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
```

- [ ] **Step 2: Wrap layout with AuthProvider**

Modify `app/layout.tsx` — wrap `{children}` with `<AuthProvider>`:

```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "My Own Phenix",
  description: "Legal RAG Chatbot + Phoenix Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/auth-context.tsx app/layout.tsx
git commit -m "feat: add AuthProvider context with Firebase listener"
```

---

## Task 4: Auth Modal Component

**Files:**
- Create: `components/auth-modal.tsx`

- [ ] **Step 1: Create `components/auth-modal.tsx`**

```typescript
"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

export function AuthModal({ open, onClose }: AuthModalProps) {
  const router = useRouter();
  const dismissedRef = useRef(false);

  const handleConfirm = useCallback(() => {
    router.push("/login");
    onClose();
  }, [router, onClose]);

  const handleCancel = useCallback(() => {
    dismissedRef.current = true;
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>로그인 필요</DialogTitle>
        <DialogDescription>
          로그인이 필요한 서비스입니다.
        </DialogDescription>
        <DialogFooter className="flex gap-2 sm:justify-end">
          <Button variant="outline" onClick={handleCancel}>
            취소
          </Button>
          <Button onClick={handleConfirm}>확인</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/auth-modal.tsx
git commit -m "feat: add auth-required modal component"
```

---

## Task 5: Login Page

**Files:**
- Create: `app/login/page.tsx`

- [ ] **Step 1: Create `app/login/page.tsx`**

```typescript
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.back();
    }
  }, [user, loading, router]);

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="flex flex-col items-center gap-6 rounded-2xl border p-10">
        <h1 className="text-2xl font-semibold">My Own Phenix</h1>
        <p className="text-muted-foreground text-sm">
          로그인하여 서비스를 이용하세요
        </p>
        <Button
          size="lg"
          className="w-full gap-2"
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          <svg className="size-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Google로 로그인
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat: add Google login page"
```

---

## Task 6: Prisma + SQLite Setup

**Files:**
- Create: `prisma/schema.prisma`
- Create: `lib/prisma.ts`

- [ ] **Step 1: Initialize Prisma**

```bash
cd /home/rheon/Desktop/Semester/4-1/cpastone/my-own-phenix
npx prisma init --datasource-provider sqlite
```

- [ ] **Step 2: Write `prisma/schema.prisma`**

Replace the generated file with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

model User {
  id        String           @id // Firebase uid
  email     String
  name      String?
  createdAt DateTime         @default(now())
  threads   Thread[]
  layout    DashboardLayout?
}

model Thread {
  id                String   @id @default(cuid())
  userId            String
  langGraphThreadId String
  title             String   @default("새 대화")
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  user              User     @relation(fields: [userId], references: [id])
}

model DashboardLayout {
  id        String   @id @default(cuid())
  userId    String   @unique
  layout    String   // JSON string
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id])
}
```

- [ ] **Step 3: Create `lib/prisma.ts`**

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 4: Run migration**

```bash
npx prisma migrate dev --name init
```

Expected: Creates `prisma/dev.db` and `prisma/migrations/` directory.

- [ ] **Step 5: Add `prisma/dev.db` to `.gitignore`**

Append to `.gitignore`:
```
prisma/dev.db
prisma/dev.db-journal
```

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/prisma.ts .gitignore
git commit -m "feat: add Prisma schema with SQLite (User, Thread, DashboardLayout)"
```

---

## Task 7: Auth Sync API Route

**Files:**
- Create: `app/api/auth/sync/route.ts`

- [ ] **Step 1: Create `app/api/auth/sync/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { uid, email, name } = await req.json();

  if (!uid || !email) {
    return NextResponse.json({ error: "Missing uid or email" }, { status: 400 });
  }

  const user = await prisma.user.upsert({
    where: { id: uid },
    update: { email, name },
    create: { id: uid, email, name },
  });

  return NextResponse.json({ user });
}
```

- [ ] **Step 2: Verify with curl (dev server running)**

```bash
curl -X POST http://localhost:3000/api/auth/sync \
  -H "Content-Type: application/json" \
  -d '{"uid":"test123","email":"test@example.com","name":"Test"}'
```

Expected: `{"user":{"id":"test123","email":"test@example.com",...}}`

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/sync/route.ts
git commit -m "feat: add auth sync API route for user upsert"
```

---

## Task 8: Thread API Routes

**Files:**
- Create: `app/api/threads/route.ts`
- Create: `app/api/threads/[id]/route.ts`

- [ ] **Step 1: Create `app/api/threads/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const threads = await prisma.thread.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ threads });
}

export async function POST(req: NextRequest) {
  const { userId, langGraphThreadId, title } = await req.json();

  if (!userId || !langGraphThreadId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const thread = await prisma.thread.create({
    data: { userId, langGraphThreadId, title: title || "새 대화" },
  });

  return NextResponse.json({ thread });
}
```

- [ ] **Step 2: Create `app/api/threads/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  await prisma.thread.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { title } = await req.json();

  const thread = await prisma.thread.update({
    where: { id },
    data: { title, updatedAt: new Date() },
  });

  return NextResponse.json({ thread });
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/threads/route.ts app/api/threads/\[id\]/route.ts
git commit -m "feat: add thread CRUD API routes"
```

---

## Task 9: Dashboard Layout API Route

**Files:**
- Create: `app/api/dashboard/layout/route.ts`

- [ ] **Step 1: Create `app/api/dashboard/layout/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const record = await prisma.dashboardLayout.findUnique({
    where: { userId },
  });

  return NextResponse.json({ layout: record?.layout ?? null });
}

export async function PUT(req: NextRequest) {
  const { userId, layout } = await req.json();

  if (!userId || !layout) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const record = await prisma.dashboardLayout.upsert({
    where: { userId },
    update: { layout },
    create: { userId, layout },
  });

  return NextResponse.json({ layout: record.layout });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/dashboard/layout/route.ts
git commit -m "feat: add dashboard layout GET/PUT API route"
```

---

## Task 10: Auth Gate on Chat Input + Nav

**Files:**
- Modify: `components/assistant-ui/thread.tsx`
- Modify: `components/nav.tsx`
- Modify: `app/assistant.tsx`

- [ ] **Step 1: Add auth modal trigger to the Composer in `thread.tsx`**

Add a wrapper around `ComposerPrimitive.Input` in the `Composer` component. Import `useAuth` and `AuthModal`, add state for modal. When input receives focus and user is null (and modal hasn't been dismissed this session), show the modal.

Replace the `Composer` component in `components/assistant-ui/thread.tsx`:

```typescript
// Add these imports at the top of thread.tsx
import { useAuth } from "@/lib/auth-context";
import { AuthModal } from "@/components/auth-modal";
import { useState, useRef, useCallback } from "react";
```

Then replace the existing `Composer` function:

```typescript
const Composer: FC = () => {
  const { user } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const dismissedRef = useRef(false);

  const handleFocus = useCallback(() => {
    if (!user && !dismissedRef.current) {
      setShowAuthModal(true);
    }
  }, [user]);

  const handleClose = useCallback(() => {
    dismissedRef.current = true;
    setShowAuthModal(false);
  }, []);

  return (
    <>
      <AuthModal open={showAuthModal} onClose={handleClose} />
      <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
        <ComposerPrimitive.AttachmentDropzone className="aui-composer-attachment-dropzone flex w-full flex-col rounded-2xl border border-input bg-background px-1 pt-2 outline-none transition-shadow has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-ring/20 data-[dragging=true]:border-ring data-[dragging=true]:border-dashed data-[dragging=true]:bg-accent/50">
          <ComposerAttachments />
          <ComposerPrimitive.Input
            placeholder="Send a message..."
            className="aui-composer-input mb-1 max-h-32 min-h-14 w-full resize-none bg-transparent px-4 pt-2 pb-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-0"
            rows={1}
            autoFocus={!!user}
            aria-label="Message input"
            onFocus={handleFocus}
          />
          <ComposerAction />
        </ComposerPrimitive.AttachmentDropzone>
      </ComposerPrimitive.Root>
    </>
  );
};
```

- [ ] **Step 2: Add auth gate to Nav links**

Modify `components/nav.tsx` — add auth check for non-chat links. If user clicks a protected tab while unauthenticated, show auth modal instead of navigating.

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  FlaskConical,
  FileText,
  FolderOpen,
  LayoutDashboard,
} from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { AuthModal } from "@/components/auth-modal";

const links = [
  { href: "/", label: "Chat", icon: MessageSquare, public: true },
  { href: "/playground", label: "Playground", icon: FlaskConical, public: false },
  { href: "/prompts", label: "Prompts", icon: FileText, public: false },
  { href: "/projects", label: "Projects", icon: FolderOpen, public: false },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, public: false },
];

export function Nav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const dismissedRef = useRef(false);

  const handleProtectedClick = useCallback(
    (e: React.MouseEvent) => {
      if (!user && !dismissedRef.current) {
        e.preventDefault();
        setShowAuthModal(true);
      }
    },
    [user],
  );

  const handleClose = useCallback(() => {
    dismissedRef.current = true;
    setShowAuthModal(false);
  }, []);

  return (
    <>
      <AuthModal open={showAuthModal} onClose={handleClose} />
      <nav className="flex items-center gap-1 border-b px-3 py-2">
        <span className="mr-3 text-sm font-bold tracking-tight">
          My Own Phenix
        </span>
        {links.map(({ href, label, icon: Icon, public: isPublic }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={isPublic ? undefined : handleProtectedClick}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/assistant-ui/thread.tsx components/nav.tsx
git commit -m "feat: add auth gate on composer focus and nav links"
```

---

## Task 11: Chat Sidebar with Thread History

**Files:**
- Modify: `app/assistant.tsx`
- Modify: `components/assistant-ui/thread-list.tsx`

- [ ] **Step 1: Update `app/assistant.tsx` to include sidebar and thread persistence**

```typescript
"use client";

import {
  AssistantRuntimeProvider,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  CompositeAttachmentAdapter,
} from "@assistant-ui/react";
import { useLangGraphRuntime } from "@assistant-ui/react-langgraph";
import { useRef, useState, useCallback, useEffect } from "react";
import { PanelLeftClose, PanelLeft } from "lucide-react";

import { createThread, sendMessage } from "@/lib/chatApi";
import { Thread } from "@/components/assistant-ui/thread";
import { ThreadList } from "@/components/assistant-ui/thread-list";
import { Nav } from "@/components/nav";
import { useAuth } from "@/lib/auth-context";

const attachmentAdapter = new CompositeAttachmentAdapter([
  new SimpleImageAttachmentAdapter(),
  new SimpleTextAttachmentAdapter(),
]);

interface SavedThread {
  id: string;
  langGraphThreadId: string;
  title: string;
  updatedAt: string;
}

export function Assistant() {
  const { user } = useAuth();
  const threadIdRef = useRef<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [threads, setThreads] = useState<SavedThread[]>([]);
  const [activeThreadDbId, setActiveThreadDbId] = useState<string | null>(null);

  // Fetch thread list
  const refreshThreads = useCallback(async () => {
    if (!user) return;
    const res = await fetch(`/api/threads?userId=${user.uid}`);
    const data = await res.json();
    setThreads(data.threads ?? []);
  }, [user]);

  useEffect(() => {
    refreshThreads();
  }, [refreshThreads]);

  const runtime = useLangGraphRuntime({
    adapters: {
      attachments: attachmentAdapter,
    },
    stream: async function* (messages, { command }) {
      if (!threadIdRef.current) {
        const { thread_id } = await createThread();
        threadIdRef.current = thread_id;

        // Save to DB if logged in
        if (user) {
          const firstMsg =
            messages[messages.length - 1]?.content?.toString().slice(0, 30) ||
            "새 대화";
          const res = await fetch("/api/threads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: user.uid,
              langGraphThreadId: thread_id,
              title: firstMsg,
            }),
          });
          const data = await res.json();
          setActiveThreadDbId(data.thread?.id ?? null);
          refreshThreads();
        }
      }

      const generator = await sendMessage({
        threadId: threadIdRef.current,
        messages: messages.slice(-1),
        command,
      });

      for await (const event of generator) {
        const e = event.event as string;
        if (e !== "messages/partial") continue;
        yield event;
      }
    },
  });

  const handleSelectThread = useCallback(
    (thread: SavedThread) => {
      threadIdRef.current = thread.langGraphThreadId;
      setActiveThreadDbId(thread.id);
    },
    [],
  );

  const handleNewChat = useCallback(() => {
    threadIdRef.current = null;
    setActiveThreadDbId(null);
  }, []);

  const handleDeleteThread = useCallback(
    async (id: string) => {
      await fetch(`/api/threads/${id}`, { method: "DELETE" });
      if (activeThreadDbId === id) {
        threadIdRef.current = null;
        setActiveThreadDbId(null);
      }
      refreshThreads();
    },
    [activeThreadDbId, refreshThreads],
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-dvh flex-col">
        <Nav />
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          {user && sidebarOpen && (
            <div className="flex w-64 flex-col border-r bg-muted/30">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-semibold">대화 기록</span>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent"
                >
                  <PanelLeftClose className="size-4" />
                </button>
              </div>
              <div className="border-b px-3 py-2">
                <button
                  onClick={handleNewChat}
                  className="w-full rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  + 새 대화
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {threads.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleSelectThread(t)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                      activeThreadDbId === t.id ? "bg-accent" : ""
                    }`}
                  >
                    <span className="flex-1 truncate">{t.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteThread(t.id);
                      }}
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                    >
                      &times;
                    </button>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sidebar toggle when closed */}
          {user && !sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="absolute left-2 top-14 z-10 rounded-md border bg-background p-1.5 text-muted-foreground shadow-sm hover:bg-accent"
            >
              <PanelLeft className="size-4" />
            </button>
          )}

          {/* Main chat area */}
          <div className="flex-1 min-h-0">
            <Thread />
          </div>
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/assistant.tsx
git commit -m "feat: add chat sidebar with thread history and new chat"
```

---

## Task 12: Dashboard Page + Widget Grid

**Files:**
- Create: `app/dashboard/page.tsx`
- Create: `components/dashboard/widget-grid.tsx`
- Create: `components/dashboard/add-widget-menu.tsx`

- [ ] **Step 1: Create `components/dashboard/widget-grid.tsx`**

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useAuth } from "@/lib/auth-context";

const ResponsiveGrid = WidthProvider(Responsive);

export interface WidgetConfig {
  id: string;
  type: string;
  title: string;
}

interface WidgetGridProps {
  widgets: WidgetConfig[];
  layouts: Layout[];
  onLayoutChange: (layouts: Layout[]) => void;
  onRemoveWidget: (id: string) => void;
  renderWidget: (widget: WidgetConfig) => React.ReactNode;
}

export function WidgetGrid({
  widgets,
  layouts,
  onLayoutChange,
  onRemoveWidget,
  renderWidget,
}: WidgetGridProps) {
  return (
    <ResponsiveGrid
      className="layout"
      layouts={{ lg: layouts }}
      breakpoints={{ lg: 1200, md: 996, sm: 768 }}
      cols={{ lg: 12, md: 8, sm: 4 }}
      rowHeight={80}
      onLayoutChange={(layout) => onLayoutChange(layout)}
      draggableHandle=".widget-drag-handle"
      isResizable
      isDraggable
    >
      {widgets.map((w) => (
        <div
          key={w.id}
          className="overflow-hidden rounded-xl border bg-card shadow-sm"
        >
          <div className="widget-drag-handle flex cursor-grab items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">{w.title}</span>
            <button
              onClick={() => onRemoveWidget(w.id)}
              className="rounded p-0.5 text-muted-foreground hover:text-destructive"
            >
              &times;
            </button>
          </div>
          <div className="h-[calc(100%-2.5rem)] p-3">{renderWidget(w)}</div>
        </div>
      ))}
    </ResponsiveGrid>
  );
}
```

- [ ] **Step 2: Create `components/dashboard/add-widget-menu.tsx`**

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";

const AVAILABLE_WIDGETS = [
  { type: "hallucination", title: "Hallucination Rate" },
  { type: "qa_correctness", title: "QA Correctness" },
  { type: "rag_relevance", title: "RAG Relevance" },
  { type: "banned_word", title: "Banned Word Detection" },
  { type: "total_queries", title: "Total Queries" },
  { type: "avg_latency", title: "Avg Response Time" },
  { type: "error_rate", title: "Error Rate" },
] as const;

interface AddWidgetMenuProps {
  existingTypes: string[];
  onAdd: (type: string, title: string) => void;
}

export function AddWidgetMenu({ existingTypes, onAdd }: AddWidgetMenuProps) {
  const [open, setOpen] = useState(false);

  const available = AVAILABLE_WIDGETS.filter(
    (w) => !existingTypes.includes(w.type),
  );

  if (available.length === 0) return null;

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="gap-1"
        onClick={() => setOpen(!open)}
      >
        <PlusIcon className="size-4" />
        위젯 추가
      </Button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border bg-popover p-1 shadow-md">
          {available.map((w) => (
            <button
              key={w.type}
              className="flex w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => {
                onAdd(w.type, w.title);
                setOpen(false);
              }}
            >
              {w.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/widget-grid.tsx components/dashboard/add-widget-menu.tsx
git commit -m "feat: add widget grid and add-widget menu components"
```

---

## Task 13: Dashboard Widget Components

**Files:**
- Create: `components/dashboard/widgets/stat-card.tsx`
- Create: `components/dashboard/widgets/highchart-widget.tsx`

- [ ] **Step 1: Create `components/dashboard/widgets/stat-card.tsx`**

```typescript
"use client";

interface StatCardProps {
  value: string | number;
  label: string;
  trend?: string;
}

export function StatCard({ value, label, trend }: StatCardProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1">
      <span className="text-3xl font-bold">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
      {trend && (
        <span className="text-xs text-muted-foreground">{trend}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `components/dashboard/widgets/highchart-widget.tsx`**

```typescript
"use client";

import { useEffect, useRef } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";

interface HighchartWidgetProps {
  options: Highcharts.Options;
}

export function HighchartWidget({ options }: HighchartWidgetProps) {
  const chartRef = useRef<HighchartsReact.RefObject>(null);

  useEffect(() => {
    const chart = chartRef.current?.chart;
    if (chart) {
      const observer = new ResizeObserver(() => chart.reflow());
      const container = chart.container.parentElement;
      if (container) observer.observe(container);
      return () => observer.disconnect();
    }
  }, []);

  return (
    <HighchartsReact
      highcharts={Highcharts}
      options={{
        chart: { style: { fontFamily: "inherit" }, backgroundColor: "transparent" },
        credits: { enabled: false },
        ...options,
      }}
      ref={chartRef}
      containerProps={{ style: { height: "100%", width: "100%" } }}
    />
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/widgets/stat-card.tsx components/dashboard/widgets/highchart-widget.tsx
git commit -m "feat: add stat card and highchart widget components"
```

---

## Task 14: Dashboard Page with Phoenix Data

**Files:**
- Create: `app/dashboard/page.tsx`

- [ ] **Step 1: Create `app/dashboard/page.tsx`**

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import type { Layout } from "react-grid-layout";
import { Nav } from "@/components/nav";
import { useAuth } from "@/lib/auth-context";
import {
  WidgetGrid,
  type WidgetConfig,
} from "@/components/dashboard/widget-grid";
import { AddWidgetMenu } from "@/components/dashboard/add-widget-menu";
import { StatCard } from "@/components/dashboard/widgets/stat-card";
import { HighchartWidget } from "@/components/dashboard/widgets/highchart-widget";
import { fetchProjects } from "@/lib/phoenix";

interface AnnotationData {
  name: string;
  label: string;
  score: number;
  time: string;
}

interface SpanData {
  latency: number;
  status: string;
  time: string;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "w1", type: "hallucination", title: "Hallucination Rate" },
  { id: "w2", type: "qa_correctness", title: "QA Correctness" },
  { id: "w3", type: "total_queries", title: "Total Queries" },
  { id: "w4", type: "avg_latency", title: "Avg Response Time" },
];

const DEFAULT_LAYOUTS: Layout[] = [
  { i: "w1", x: 0, y: 0, w: 6, h: 3 },
  { i: "w2", x: 6, y: 0, w: 6, h: 3 },
  { i: "w3", x: 0, y: 3, w: 3, h: 2 },
  { i: "w4", x: 3, y: 3, w: 3, h: 2 },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGETS);
  const [layouts, setLayouts] = useState<Layout[]>(DEFAULT_LAYOUTS);
  const [annotations, setAnnotations] = useState<AnnotationData[]>([]);
  const [spans, setSpans] = useState<SpanData[]>([]);
  const [project, setProject] = useState("default");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  // Load projects
  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => {});
  }, []);

  // Load saved layout
  useEffect(() => {
    if (!user) return;
    fetch(`/api/dashboard/layout?userId=${user.uid}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.layout) {
          const parsed = JSON.parse(data.layout);
          setWidgets(parsed.widgets ?? DEFAULT_WIDGETS);
          setLayouts(parsed.layouts ?? DEFAULT_LAYOUTS);
        }
      })
      .catch(() => {});
  }, [user]);

  // Save layout
  const saveLayout = useCallback(
    (newLayouts: Layout[], newWidgets?: WidgetConfig[]) => {
      const w = newWidgets ?? widgets;
      setLayouts(newLayouts);
      if (!user) return;
      fetch("/api/dashboard/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.uid,
          layout: JSON.stringify({ widgets: w, layouts: newLayouts }),
        }),
      }).catch(() => {});
    },
    [user, widgets],
  );

  // Fetch Phoenix data
  useEffect(() => {
    async function load() {
      try {
        // Get spans
        const spansRes = await fetch(
          `/api/phoenix?path=/v1/projects/${encodeURIComponent(project)}/spans&limit=500`,
        );
        const spansData = await spansRes.json();
        const allSpans: any[] = spansData.data ?? [];

        const spanList: SpanData[] = allSpans.map((s: any) => ({
          latency: s.end_time
            ? new Date(s.end_time).getTime() - new Date(s.start_time).getTime()
            : 0,
          status: s.status_code ?? "OK",
          time: s.start_time,
        }));
        setSpans(spanList);

        // Get annotations for root spans
        const rootSpans = allSpans.filter((s: any) => s.parent_id === null);
        const annResults: AnnotationData[] = [];
        await Promise.all(
          rootSpans.slice(0, 100).map((s: any) =>
            fetch(
              `/api/phoenix?path=/v1/projects/${encodeURIComponent(project)}/span_annotations&span_ids=${s.context.span_id}`,
            )
              .then((r) => r.json())
              .then((data) => {
                for (const a of data.data ?? []) {
                  annResults.push({
                    name: a.name,
                    label: a.result?.label ?? "",
                    score: a.result?.score ?? 0,
                    time: s.start_time,
                  });
                }
              })
              .catch(() => {}),
          ),
        );
        setAnnotations(annResults);
      } catch {
        // Phoenix might not be running
      }
    }
    load();
  }, [project]);

  // Widget renderers
  const renderWidget = useCallback(
    (widget: WidgetConfig) => {
      const annByName = (name: string) =>
        annotations.filter((a) => a.name === name);

      switch (widget.type) {
        case "hallucination": {
          const data = annByName("hallucination");
          const scores = data.map((d) => d.score);
          const rate =
            scores.length > 0
              ? (scores.filter((s) => s > 0.5).length / scores.length) * 100
              : 0;
          return (
            <HighchartWidget
              options={{
                title: { text: undefined },
                xAxis: { categories: data.map((_, i) => `#${i + 1}`) },
                yAxis: { title: { text: "Score" }, min: 0, max: 1 },
                series: [
                  {
                    type: "line",
                    name: "Hallucination",
                    data: scores,
                    color: "#ef4444",
                  },
                ],
              }}
            />
          );
        }
        case "qa_correctness": {
          const data = annByName("qa_correctness");
          const scores = data.map((d) => d.score);
          return (
            <HighchartWidget
              options={{
                title: { text: undefined },
                xAxis: { categories: data.map((_, i) => `#${i + 1}`) },
                yAxis: { title: { text: "Score" }, min: 0, max: 1 },
                series: [
                  {
                    type: "line",
                    name: "QA Correctness",
                    data: scores,
                    color: "#22c55e",
                  },
                ],
              }}
            />
          );
        }
        case "rag_relevance": {
          const data = annByName("rag_relevance");
          const scores = data.map((d) => d.score);
          const avg =
            scores.length > 0
              ? scores.reduce((a, b) => a + b, 0) / scores.length
              : 0;
          return (
            <HighchartWidget
              options={{
                title: { text: undefined },
                chart: { type: "bar" },
                xAxis: {
                  categories: ["Relevant", "Unrelated"],
                },
                yAxis: { title: { text: "Count" } },
                series: [
                  {
                    type: "bar",
                    name: "Documents",
                    data: [
                      data.filter((d) => d.label === "relevant").length,
                      data.filter((d) => d.label === "unrelated").length,
                    ],
                    colorByPoint: true,
                    colors: ["#22c55e", "#ef4444"],
                  },
                ],
              }}
            />
          );
        }
        case "banned_word": {
          const data = annByName("banned_word");
          return (
            <HighchartWidget
              options={{
                title: { text: undefined },
                chart: { type: "bar" },
                xAxis: { categories: ["Clean", "Detected"] },
                yAxis: { title: { text: "Count" } },
                series: [
                  {
                    type: "bar",
                    name: "Messages",
                    data: [
                      data.filter((d) => d.label === "clean").length,
                      data.filter((d) => d.label === "detected").length,
                    ],
                    colorByPoint: true,
                    colors: ["#22c55e", "#ef4444"],
                  },
                ],
              }}
            />
          );
        }
        case "total_queries":
          return (
            <StatCard
              value={spans.length}
              label="Total Spans"
            />
          );
        case "avg_latency": {
          const avg =
            spans.length > 0
              ? Math.round(
                  spans.reduce((a, b) => a + b.latency, 0) / spans.length,
                )
              : 0;
          return <StatCard value={`${avg}ms`} label="Avg Latency" />;
        }
        case "error_rate": {
          const errors = spans.filter((s) => s.status === "ERROR").length;
          const rate = spans.length > 0 ? ((errors / spans.length) * 100).toFixed(1) : "0";
          return <StatCard value={`${rate}%`} label="Error Rate" />;
        }
        default:
          return <div className="text-muted-foreground text-sm">Unknown widget</div>;
      }
    },
    [annotations, spans],
  );

  const handleAddWidget = useCallback(
    (type: string, title: string) => {
      const id = `w${Date.now()}`;
      const newWidget = { id, type, title };
      const newLayout: Layout = { i: id, x: 0, y: Infinity, w: 6, h: 3 };
      const newWidgets = [...widgets, newWidget];
      const newLayouts = [...layouts, newLayout];
      setWidgets(newWidgets);
      saveLayout(newLayouts, newWidgets);
    },
    [widgets, layouts, saveLayout],
  );

  const handleRemoveWidget = useCallback(
    (id: string) => {
      const newWidgets = widgets.filter((w) => w.id !== id);
      const newLayouts = layouts.filter((l) => l.i !== id);
      setWidgets(newWidgets);
      saveLayout(newLayouts, newWidgets);
    },
    [widgets, layouts, saveLayout],
  );

  return (
    <div className="flex h-dvh flex-col">
      <Nav />
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <AddWidgetMenu
          existingTypes={widgets.map((w) => w.type)}
          onAdd={handleAddWidget}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <WidgetGrid
          widgets={widgets}
          layouts={layouts}
          onLayoutChange={(l) => saveLayout(l)}
          onRemoveWidget={handleRemoveWidget}
          renderWidget={renderWidget}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: add dashboard page with Phoenix metrics and Highcharts widgets"
```

---

## Task 15: Final Integration + Build Verification

**Files:**
- Verify all files

- [ ] **Step 1: Run full build**

```bash
cd /home/rheon/Desktop/Semester/4-1/cpastone/my-own-phenix
npm run build
```

Expected: No errors.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Fix any issues found.

- [ ] **Step 3: Run prettier**

```bash
npm run prettier:fix
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: lint and format all new files"
```
