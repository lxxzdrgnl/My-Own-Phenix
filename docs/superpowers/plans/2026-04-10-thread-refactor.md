# Thread Component Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `components/assistant-ui/thread.tsx` (464 lines, mixed concerns) into a `thread/` subfolder with focused files.

**Architecture:** Create `components/assistant-ui/thread/` with four files: `index.tsx` (Thread root), `messages.tsx` (all message components — history and live together), `composer.tsx` (input area), `welcome.tsx` (welcome screen). The existing import path `@/components/assistant-ui/thread` continues to work via `index.tsx`.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, `@assistant-ui/react`

---

## File Map

| File | Responsibility |
|------|---------------|
| `components/assistant-ui/thread/index.tsx` | Thread root layout, viewport, history message list |
| `components/assistant-ui/thread/messages.tsx` | HistoryUserMessage, HistoryAssistantMessage, UserMessage, AssistantMessage, EditComposer, MessageError, BranchPicker, AssistantActionBar, UserActionBar |
| `components/assistant-ui/thread/composer.tsx` | Composer, ComposerAction |
| `components/assistant-ui/thread/welcome.tsx` | ThreadWelcome, ThreadSuggestions, ThreadScrollToBottom |
| ~~`components/assistant-ui/thread.tsx`~~ | Deleted after migration |

---

### Task 1: Create `welcome.tsx`

**Files:**
- Create: `components/assistant-ui/thread/welcome.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { ThreadPrimitive } from "@assistant-ui/react";
import { ArrowDownIcon } from "lucide-react";
import type { FC } from "react";
import { Button } from "@/components/ui/button";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";

export const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="aui-thread-scroll-to-bottom absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible dark:bg-background dark:hover:bg-accent"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const SUGGESTIONS = [
  {
    title: "부당해고를 당했어요",
    label: "어떻게 대응할 수 있나요?",
    prompt: "회사에서 부당해고를 당했습니다. 어떻게 대응할 수 있나요?",
  },
  {
    title: "전세 보증금을 못 돌려받고 있어요",
    label: "법적으로 어떤 조치를 취할 수 있나요?",
    prompt: "집주인이 전세 보증금을 돌려주지 않고 있습니다. 법적으로 어떤 조치를 취할 수 있나요?",
  },
  {
    title: "교통사고 합의금 산정",
    label: "적정 합의금은 얼마인가요?",
    prompt: "교통사고로 2주 진단을 받았습니다. 적정 합의금은 얼마인가요?",
  },
  {
    title: "명예훼손으로 고소 당했어요",
    label: "어떻게 대응해야 하나요?",
    prompt: "SNS에 올린 글로 명예훼손으로 고소를 당했습니다. 어떻게 대응해야 하나요?",
  },
] as const;

const ThreadSuggestions: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestions grid w-full @md:grid-cols-2 gap-2 pb-4">
      {SUGGESTIONS.map((suggestion, index) => (
        <div
          key={suggestion.prompt}
          className="aui-thread-welcome-suggestion-display fade-in slide-in-from-bottom-2 @md:nth-[n+3]:block nth-[n+3]:hidden animate-in fill-mode-both duration-200"
          style={{ animationDelay: `${100 + index * 50}ms` }}
        >
          <ThreadPrimitive.Suggestion prompt={suggestion.prompt} send asChild>
            <Button
              variant="ghost"
              className="aui-thread-welcome-suggestion h-auto w-full @md:flex-col flex-wrap items-start justify-start gap-1 rounded-2xl border px-4 py-3 text-left text-sm transition-colors hover:bg-muted"
              aria-label={suggestion.prompt}
            >
              <span className="aui-thread-welcome-suggestion-text-1 font-medium">
                {suggestion.title}
              </span>
              <span className="aui-thread-welcome-suggestion-text-2 text-muted-foreground">
                {suggestion.label}
              </span>
            </Button>
          </ThreadPrimitive.Suggestion>
        </div>
      ))}
    </div>
  );
};

export const ThreadWelcome: FC = () => {
  return (
    <div className="aui-thread-welcome-root mx-auto my-auto flex w-full max-w-(--thread-max-width) grow flex-col">
      <div className="aui-thread-welcome-center flex w-full grow flex-col items-center justify-center">
        <div className="aui-thread-welcome-message flex size-full flex-col justify-center px-4">
          <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in font-semibold text-2xl duration-200">
            Hello there!
          </h1>
          <p className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in text-muted-foreground text-xl delay-75 duration-200">
            Ask me anything about legal matters.
          </p>
        </div>
      </div>
      <ThreadSuggestions />
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add components/assistant-ui/thread/welcome.tsx
git commit -m "refactor: extract ThreadWelcome and ThreadScrollToBottom into thread/welcome.tsx"
```

---

### Task 2: Create `composer.tsx`

**Files:**
- Create: `components/assistant-ui/thread/composer.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import {
  AssistantIf,
  ComposerPrimitive,
} from "@assistant-ui/react";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { type FC, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/components/auth-modal";
import {
  ComposerAddAttachment,
  ComposerAttachments,
} from "@/components/assistant-ui/attachment";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { useAuth } from "@/lib/auth-context";

const ComposerAction: FC = () => {
  return (
    <div className="aui-composer-action-wrapper relative mx-2 mb-2 flex items-center justify-between">
      <ComposerAddAttachment />

      <AssistantIf condition={({ thread }) => !thread.isRunning}>
        <ComposerPrimitive.Send asChild>
          <TooltipIconButton
            tooltip="Send message"
            side="bottom"
            type="submit"
            variant="default"
            size="icon"
            className="aui-composer-send size-8 rounded-full"
            aria-label="Send message"
          >
            <ArrowUpIcon className="aui-composer-send-icon size-4" />
          </TooltipIconButton>
        </ComposerPrimitive.Send>
      </AssistantIf>

      <AssistantIf condition={({ thread }) => thread.isRunning}>
        <ComposerPrimitive.Cancel asChild>
          <Button
            type="button"
            variant="default"
            size="icon"
            className="aui-composer-cancel size-8 rounded-full"
            aria-label="Stop generating"
          >
            <SquareIcon className="aui-composer-cancel-icon size-3 fill-current" />
          </Button>
        </ComposerPrimitive.Cancel>
      </AssistantIf>
    </div>
  );
};

export const Composer: FC = () => {
  const { user } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const dismissedRef = useRef(false);

  const handleFocus = useCallback(() => {
    if (!user && !dismissedRef.current) {
      setShowAuthModal(true);
    }
  }, [user]);

  const handleModalClose = useCallback(() => {
    setShowAuthModal(false);
    dismissedRef.current = true;
  }, []);

  return (
    <>
      <AuthModal open={showAuthModal} onClose={handleModalClose} />
      <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
        <ComposerPrimitive.AttachmentDropzone className="aui-composer-attachment-dropzone flex w-full flex-col rounded-2xl border border-input bg-background px-1 pt-2 outline-none transition-shadow has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-ring/20 data-[dragging=true]:border-ring data-[dragging=true]:border-dashed data-[dragging=true]:bg-accent/50">
          <ComposerAttachments />
          <ComposerPrimitive.Input
            placeholder="Send a message..."
            className="aui-composer-input mb-1 max-h-32 min-h-14 w-full resize-none bg-transparent px-4 pt-2 pb-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-0"
            rows={1}
            autoFocus={!!user}
            onFocus={handleFocus}
            aria-label="Message input"
          />
          <ComposerAction />
        </ComposerPrimitive.AttachmentDropzone>
      </ComposerPrimitive.Root>
    </>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add components/assistant-ui/thread/composer.tsx
git commit -m "refactor: extract Composer into thread/composer.tsx"
```

---

### Task 3: Create `messages.tsx`

**Files:**
- Create: `components/assistant-ui/thread/messages.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AssistantIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
} from "@assistant-ui/react";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RefreshCwIcon,
} from "lucide-react";
import type { FC } from "react";
import { Button } from "@/components/ui/button";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { Reasoning, ReasoningGroup } from "@/components/assistant-ui/reasoning";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { UserMessageAttachments } from "@/components/assistant-ui/attachment";
import { cn } from "@/lib/utils";

// ─── Shared classes ──────────────────────────────────────────────────────────

const USER_BUBBLE_CLS =
  "aui-user-message-content wrap-break-word rounded-2xl bg-muted px-4 py-2.5 text-foreground text-sm";

const ASSISTANT_BODY_CLS =
  "aui-assistant-message-content wrap-break-word px-2 text-foreground text-sm leading-relaxed";

// ─── History messages (static, loaded from DB) ────────────────────────────────

export const HistoryUserMessage: FC<{ content: string }> = ({ content }) => (
  <div
    className="mx-auto grid w-full max-w-(--thread-max-width) auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 py-3 [&:where(>*)]:col-start-2"
    data-role="user"
  >
    <div className="relative col-start-2 min-w-0">
      <div className={USER_BUBBLE_CLS}>{content}</div>
    </div>
  </div>
);

export const HistoryAssistantMessage: FC<{ content: string }> = ({ content }) => (
  <div
    className="relative mx-auto w-full max-w-(--thread-max-width) py-3"
    data-role="assistant"
  >
    <div className={cn(ASSISTANT_BODY_CLS, "whitespace-pre-wrap")}>{content}</div>
  </div>
);

// ─── Live messages (via @assistant-ui/react primitives) ──────────────────────

const MessageError: FC = () => (
  <MessagePrimitive.Error>
    <ErrorPrimitive.Root className="aui-message-error-root mt-2 rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm dark:bg-destructive/5 dark:text-red-200">
      <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
    </ErrorPrimitive.Root>
  </MessagePrimitive.Error>
);

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({ className, ...rest }) => (
  <BranchPickerPrimitive.Root
    hideWhenSingleBranch
    className={cn(
      "aui-branch-picker-root mr-2 -ml-2 inline-flex items-center text-muted-foreground text-sm",
      className,
    )}
    {...rest}
  >
    <BranchPickerPrimitive.Previous asChild>
      <TooltipIconButton tooltip="Previous">
        <ChevronLeftIcon />
      </TooltipIconButton>
    </BranchPickerPrimitive.Previous>
    <span className="aui-branch-picker-state font-medium">
      <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
    </span>
    <BranchPickerPrimitive.Next asChild>
      <TooltipIconButton tooltip="Next">
        <ChevronRightIcon />
      </TooltipIconButton>
    </BranchPickerPrimitive.Next>
  </BranchPickerPrimitive.Root>
);

const AssistantActionBar: FC = () => (
  <ActionBarPrimitive.Root
    hideWhenRunning
    autohide="not-last"
    autohideFloat="single-branch"
    className="aui-assistant-action-bar-root col-start-3 row-start-2 -ml-1 flex gap-1 text-muted-foreground data-floating:absolute data-floating:rounded-md data-floating:border data-floating:bg-background data-floating:p-1 data-floating:shadow-sm"
  >
    <ActionBarPrimitive.Copy asChild>
      <TooltipIconButton tooltip="Copy">
        <AssistantIf condition={({ message }) => message.isCopied}>
          <CheckIcon />
        </AssistantIf>
        <AssistantIf condition={({ message }) => !message.isCopied}>
          <CopyIcon />
        </AssistantIf>
      </TooltipIconButton>
    </ActionBarPrimitive.Copy>
    <ActionBarPrimitive.Reload asChild>
      <TooltipIconButton tooltip="Refresh">
        <RefreshCwIcon />
      </TooltipIconButton>
    </ActionBarPrimitive.Reload>
    <ActionBarMorePrimitive.Root>
      <ActionBarMorePrimitive.Trigger asChild>
        <TooltipIconButton tooltip="More" className="data-[state=open]:bg-accent">
          <MoreHorizontalIcon />
        </TooltipIconButton>
      </ActionBarMorePrimitive.Trigger>
      <ActionBarMorePrimitive.Content
        side="bottom"
        align="start"
        className="aui-action-bar-more-content z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <ActionBarPrimitive.ExportMarkdown asChild>
          <ActionBarMorePrimitive.Item className="aui-action-bar-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
            <DownloadIcon className="size-4" />
            <span className="text-sm">Export as Markdown</span>
          </ActionBarMorePrimitive.Item>
        </ActionBarPrimitive.ExportMarkdown>
      </ActionBarMorePrimitive.Content>
    </ActionBarMorePrimitive.Root>
  </ActionBarPrimitive.Root>
);

export const AssistantMessage: FC = () => (
  <MessagePrimitive.Root
    className="aui-assistant-message-root fade-in slide-in-from-bottom-1 relative mx-auto w-full max-w-(--thread-max-width) animate-in py-3 duration-150"
    data-role="assistant"
  >
    <div className={ASSISTANT_BODY_CLS}>
      <MessagePrimitive.Parts
        components={{
          Text: MarkdownText,
          Reasoning,
          ReasoningGroup,
          tools: {
            by_name: { IntentOutput: () => null },
            Fallback: ToolFallback,
          },
        }}
      />
      <MessageError />
    </div>
    <div className="aui-assistant-message-footer mt-1 ml-2 flex">
      <BranchPicker />
      <AssistantActionBar />
    </div>
  </MessagePrimitive.Root>
);

const UserActionBar: FC = () => (
  <ActionBarPrimitive.Root
    hideWhenRunning
    autohide="not-last"
    className="aui-user-action-bar-root flex flex-col items-end"
  >
    <ActionBarPrimitive.Edit asChild>
      <TooltipIconButton tooltip="Edit" className="aui-user-action-edit p-4">
        <PencilIcon />
      </TooltipIconButton>
    </ActionBarPrimitive.Edit>
  </ActionBarPrimitive.Root>
);

export const UserMessage: FC = () => (
  <MessagePrimitive.Root
    className="aui-user-message-root fade-in slide-in-from-bottom-1 mx-auto grid w-full max-w-(--thread-max-width) animate-in auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 py-3 duration-150 [&:where(>*)]:col-start-2"
    data-role="user"
  >
    <UserMessageAttachments />
    <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
      <div className={USER_BUBBLE_CLS}>
        <MessagePrimitive.Parts />
      </div>
      <div className="aui-user-action-bar-wrapper absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-2">
        <UserActionBar />
      </div>
    </div>
    <BranchPicker className="aui-user-branch-picker col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
  </MessagePrimitive.Root>
);

export const EditComposer: FC = () => (
  <MessagePrimitive.Root className="aui-edit-composer-wrapper mx-auto flex w-full max-w-(--thread-max-width) flex-col px-2 py-3">
    <ComposerPrimitive.Root className="aui-edit-composer-root ml-auto flex w-full max-w-[85%] flex-col rounded-2xl bg-muted">
      <ComposerPrimitive.Input
        className="aui-edit-composer-input min-h-14 w-full resize-none bg-transparent p-4 text-foreground text-sm outline-none"
        autoFocus
      />
      <div className="aui-edit-composer-footer mx-3 mb-3 flex items-center gap-2 self-end">
        <ComposerPrimitive.Cancel asChild>
          <Button variant="ghost" size="sm">Cancel</Button>
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send asChild>
          <Button size="sm">Update</Button>
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  </MessagePrimitive.Root>
);
```

- [ ] **Step 2: Commit**

```bash
git add components/assistant-ui/thread/messages.tsx
git commit -m "refactor: extract all message components into thread/messages.tsx"
```

---

### Task 4: Create `index.tsx` and delete old `thread.tsx`

**Files:**
- Create: `components/assistant-ui/thread/index.tsx`
- Delete: `components/assistant-ui/thread.tsx`

- [ ] **Step 1: Create `index.tsx`**

```tsx
"use client";

import { AssistantIf, ThreadPrimitive } from "@assistant-ui/react";
import type { FC } from "react";
import {
  AssistantMessage,
  EditComposer,
  HistoryAssistantMessage,
  HistoryUserMessage,
  UserMessage,
} from "./messages";
import { Composer } from "./composer";
import { ThreadScrollToBottom, ThreadWelcome } from "./welcome";

export interface HistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export const Thread: FC<{
  showWelcome?: boolean;
  historyMessages?: HistoryMessage[];
  isFadingOut?: boolean;
}> = ({ showWelcome = true, historyMessages = [], isFadingOut = false }) => {
  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root @container flex h-full flex-col bg-background"
      style={{ ["--thread-max-width" as string]: "44rem" }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        className="aui-thread-viewport relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth px-4 pt-4"
      >
        <div
          className={`flex flex-1 flex-col transition-opacity duration-150 ${
            isFadingOut
              ? "opacity-0"
              : "opacity-100 animate-in fade-in duration-200"
          }`}
        >
          {showWelcome && historyMessages.length === 0 && (
            <AssistantIf condition={({ thread }) => thread.isEmpty}>
              <ThreadWelcome />
            </AssistantIf>
          )}

          {historyMessages.length > 0 && (
            <div className="mx-auto w-full max-w-(--thread-max-width) flex flex-col">
              {historyMessages.map((msg) =>
                msg.role === "user" ? (
                  <HistoryUserMessage key={msg.id} content={msg.content} />
                ) : (
                  <HistoryAssistantMessage key={msg.id} content={msg.content} />
                ),
              )}
            </div>
          )}

          <ThreadPrimitive.Messages
            components={{ UserMessage, EditComposer, AssistantMessage }}
          />
        </div>

        <ThreadPrimitive.ViewportFooter className="aui-thread-viewport-footer sticky bottom-0 mx-auto mt-auto flex w-full max-w-(--thread-max-width) flex-col gap-4 overflow-visible rounded-t-3xl bg-background pb-4 md:pb-6">
          <ThreadScrollToBottom />
          <Composer />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};
```

- [ ] **Step 2: Delete the old file**

```bash
rm components/assistant-ui/thread.tsx
```

- [ ] **Step 3: Verify build compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/assistant-ui/thread/index.tsx
git add -u components/assistant-ui/thread.tsx
git commit -m "refactor: replace thread.tsx monolith with thread/ folder structure"
```
