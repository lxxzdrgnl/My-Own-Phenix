"use client";

import {
  AssistantRuntimeProvider,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  CompositeAttachmentAdapter,
} from "@assistant-ui/react";
import { useLangGraphRuntime } from "@assistant-ui/react-langgraph";
import { useRef, useState, useCallback, useEffect } from "react";
import { PanelLeftClose, PanelLeft, X, Plus, LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

import { createThread, sendMessage } from "@/lib/chatApi";
import { Thread } from "@/components/assistant-ui/thread";
import { Nav } from "@/components/nav";
import { useAuth } from "@/lib/auth-context";

const attachmentAdapter = new CompositeAttachmentAdapter([
  new SimpleImageAttachmentAdapter(),
  new SimpleTextAttachmentAdapter(),
]);

interface DbThread {
  id: string;
  title: string;
  langGraphThreadId: string;
  createdAt: string;
}

interface HistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function Assistant() {
  const { user } = useAuth();
  const threadIdRef = useRef<string | null>(null);
  const activeDbIdRef = useRef<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("sidebar_open");
    return saved !== null ? saved === "true" : true;
  });
  const [threads, setThreads] = useState<DbThread[]>([]);
  const [activeThreadDbId, setActiveThreadDbId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const [runtimeKey, setRuntimeKey] = useState(0);

  // Keep ref in sync with state
  useEffect(() => {
    activeDbIdRef.current = activeThreadDbId;
  }, [activeThreadDbId]);

  const refreshThreads = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/user-threads?userId=${user.uid}`);
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads ?? []);
      }
    } catch {}
  }, [user]);

  useEffect(() => {
    if (user) {
      refreshThreads();
    } else {
      setThreads([]);
    }
  }, [user, refreshThreads]);

  // Save a message to Prisma
  const saveMessage = useCallback(async (threadDbId: string, role: string, content: string) => {
    try {
      await fetch(`/api/user-threads/${threadDbId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, content }),
      });
    } catch {}
  }, []);

  const runtime = useLangGraphRuntime({
    adapters: {
      attachments: attachmentAdapter,
    },
    stream: async function* (messages, { command }) {
      if (!threadIdRef.current) {
        const { thread_id } = await createThread();
        threadIdRef.current = thread_id;

        if (user) {
          const firstMessage = messages[messages.length - 1];
          const rawText =
            typeof firstMessage?.content === "string"
              ? firstMessage.content
              : Array.isArray(firstMessage?.content)
                ? firstMessage.content
                    .filter((p: unknown) => (p as { type: string }).type === "text")
                    .map((p: unknown) => (p as { text: string }).text)
                    .join(" ")
                : "새 대화";
          const title = rawText.slice(0, 30) || "새 대화";

          try {
            const res = await fetch("/api/user-threads", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: user.uid,
                langGraphThreadId: thread_id,
                title,
              }),
            });
            const data = await res.json();
            const saved: DbThread = data.thread;
            if (saved?.id) {
              activeDbIdRef.current = saved.id;
              setActiveThreadDbId(saved.id);
              setThreads((prev) => [saved, ...prev]);
            }
          } catch {}
        }
      }

      // Save user message to Prisma
      const lastMsg = messages[messages.length - 1];
      const userText =
        typeof lastMsg?.content === "string"
          ? lastMsg.content
          : Array.isArray(lastMsg?.content)
            ? lastMsg.content
                .filter((p: unknown) => (p as { type: string }).type === "text")
                .map((p: unknown) => (p as { text: string }).text)
                .join(" ")
            : "";
      if (activeDbIdRef.current && userText) {
        saveMessage(activeDbIdRef.current, "user", userText);
      }

      // Send all history + new message to LangGraph for context
      const allMessages = [
        ...history.map((m) => ({
          type: m.role === "user" ? "human" : "assistant",
          content: m.content,
        })),
        ...messages.slice(-1),
      ];

      // 새 메시지를 보내면 히스토리를 비움 (runtime이 이후 메시지를 관리)
      setHistory([]);

      const generator = await sendMessage({
        threadId: threadIdRef.current,
        messages: allMessages,
        command,
      });

      let assistantResponse = "";
      for await (const event of generator) {
        const e = event.event as string;
        if (e !== "messages/partial") continue;

        // Capture the latest assistant response
        const data = event.data as any;
        if (Array.isArray(data)) {
          const lastAiMsg = data[data.length - 1];
          if (lastAiMsg?.content) {
            assistantResponse = typeof lastAiMsg.content === "string"
              ? lastAiMsg.content
              : JSON.stringify(lastAiMsg.content);
          }
        }

        yield event;
      }

      // Save assistant response to Prisma
      if (activeDbIdRef.current && assistantResponse) {
        saveMessage(activeDbIdRef.current, "assistant", assistantResponse);
      }
    },
  });

  const handleSelectThread = useCallback(async (thread: DbThread) => {
    // 먼저 현재 화면 비우고 runtime 리마운트
    threadIdRef.current = thread.langGraphThreadId;
    setActiveThreadDbId(thread.id);
    setHistory([]);
    setRuntimeKey((k) => k + 1);

    // 그 다음 메시지 로드
    try {
      const res = await fetch(`/api/user-threads/${thread.id}/messages`);
      if (res.ok) {
        const data = await res.json();
        setHistory(
          (data.messages ?? []).map((m: any) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        );
      }
    } catch {
      setHistory([]);
    }
  }, []);

  const handleNewChat = useCallback(() => {
    threadIdRef.current = null;
    setActiveThreadDbId(null);
    setHistory([]);
    setRuntimeKey((k) => k + 1);
  }, []);

  const handleDeleteThread = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/user-threads/${id}`, { method: "DELETE" });
        setThreads((prev) => prev.filter((t) => t.id !== id));
        if (activeThreadDbId === id) {
          threadIdRef.current = null;
          setActiveThreadDbId(null);
          setHistory([]);
        }
      } catch {}
    },
    [activeThreadDbId],
  );

  return (
    <AssistantRuntimeProvider key={runtimeKey} runtime={runtime}>
      <div className="flex h-dvh flex-col">
        <Nav />
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          {user && sidebarOpen && (
            <div className="flex w-64 flex-col border-r bg-muted/30 shrink-0">
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <span className="text-sm font-semibold">대화 기록</span>
                <button
                  onClick={() => { setSidebarOpen(false); localStorage.setItem("sidebar_open", "false"); }}
                  className="rounded p-1 hover:bg-muted transition-colors"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>
              <div className="px-2 py-2">
                <button
                  onClick={handleNewChat}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  새 대화
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
                {threads.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    대화 기록이 없습니다.
                  </p>
                )}
                {threads.map((thread) => (
                  <div
                    key={thread.id}
                    className={`group flex items-center justify-between rounded-md px-3 py-2 text-sm cursor-pointer transition-colors ${
                      activeThreadDbId === thread.id
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted"
                    }`}
                    onClick={() => handleSelectThread(thread)}
                  >
                    <span className="truncate flex-1 pr-1">{thread.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteThread(thread.id);
                      }}
                      className="shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive transition-all"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Logout */}
              <div className="border-t px-2 py-2">
                <button
                  onClick={() => signOut(auth)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  로그아웃
                </button>
              </div>
            </div>
          )}

          {user && !sidebarOpen && (
            <button
              onClick={() => { setSidebarOpen(true); localStorage.setItem("sidebar_open", "true"); }}
              className="absolute top-14 left-2 z-10 rounded-md p-1.5 hover:bg-muted transition-colors"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          )}

          {/* Main chat area */}
          <div className="flex-1 min-h-0 flex flex-col">
            {/* 이전 대화 히스토리 */}
            {history.length > 0 && (
              <div className="flex-shrink-0 overflow-y-auto">
                <div className="mx-auto max-w-[44rem] px-4 pt-4">
                  {history.map((msg) => (
                    <div
                      key={msg.id}
                      className={
                        msg.role === "user"
                          ? "mx-auto w-full max-w-[44rem] grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 py-3 [&:where(>*)]:col-start-2"
                          : "mx-auto w-full max-w-[44rem] py-3"
                      }
                    >
                      {msg.role === "user" ? (
                        <div className="col-start-2 min-w-0">
                          <div className="wrap-break-word rounded-2xl bg-muted px-4 py-2.5 text-foreground">
                            {msg.content}
                          </div>
                        </div>
                      ) : (
                        <div className="wrap-break-word px-2 text-foreground leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex-1 min-h-0">
              <Thread showWelcome={history.length === 0} />
            </div>
          </div>
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}
