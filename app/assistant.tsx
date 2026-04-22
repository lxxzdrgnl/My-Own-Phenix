"use client";
import { apiFetch } from "@/lib/api-client";

import {
  AssistantRuntimeProvider,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  CompositeAttachmentAdapter,
} from "@assistant-ui/react";
import { useLangGraphRuntime } from "@assistant-ui/react-langgraph";
import { useRef, useState, useCallback, useEffect } from "react";
import { PanelLeftClose, PanelLeft, X, Plus, LogOut, Settings } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

import { createThread, sendMessage, createThreadRest, sendMessageRest } from "@/lib/chatApi";
import { Thread } from "@/components/assistant-ui/thread";
import { Nav } from "@/components/nav";
import { useAuth } from "@/lib/auth-context";
import { ProjectSelector } from "@/components/project-selector";
import { AgentConfigModal } from "@/components/agent-config-modal";
import { Sidebar, SidebarItemDiv } from "@/components/ui/sidebar";

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
  feedbackValue?: "up" | "down" | null;
}

interface AssistantProps {
  project?: string;
  projects?: { id: string; name: string }[];
  onProjectChange?: (project: string) => void;
  onProjectAdd?: (name: string) => void;
}

export function Assistant({ project = "default", projects = [], onProjectChange, onProjectAdd }: AssistantProps) {
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
  const historySentRef = useRef(false);
  const [runtimeKey, setRuntimeKey] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [agentConfig, setAgentConfig] = useState<{ endpoint: string; assistantId: string; agentType: string } | null>(null);
  const [agentConfigOpen, setAgentConfigOpen] = useState(false);

  // Keep ref in sync with state
  useEffect(() => {
    activeDbIdRef.current = activeThreadDbId;
  }, [activeThreadDbId]);

  const refreshThreads = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch(`/api/user-threads?userId=${user.uid}&project=${encodeURIComponent(project)}`);
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads ?? []);
      }
    } catch {}
  }, [user, project]);

  useEffect(() => {
    if (user) {
      refreshThreads();
    } else {
      setThreads([]);
    }
  }, [user, refreshThreads]);

  useEffect(() => {
    apiFetch(`/api/agent-config?project=${encodeURIComponent(project)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.config) {
          setAgentConfig({ endpoint: data.config.endpoint, assistantId: data.config.assistantId, agentType: data.config.agentType ?? "langgraph" });
        } else {
          setAgentConfig(null);
        }
      })
      .catch(() => setAgentConfig(null));
  }, [project]);

  // Reset chat state when project changes
  const prevProjectRef = useRef(project);
  if (prevProjectRef.current !== project) {
    prevProjectRef.current = project;
    threadIdRef.current = null;
    activeDbIdRef.current = null;
  }

  // Save a message to Prisma
  const saveMessage = useCallback(async (threadDbId: string, role: string, content: string) => {
    try {
      await apiFetch(`/api/user-threads/${threadDbId}/messages`, {
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
      if (!user) {
        yield { event: "messages/partial", data: [{ type: "ai", content: "Please sign in to use the chat." }] };
        return;
      }

      const isRest = agentConfig?.agentType === "rest";

      if (!threadIdRef.current) {
        const { thread_id } = isRest
          ? await createThreadRest()
          : await createThread(agentConfig?.endpoint);
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
                : "New Chat";
          const title = rawText.slice(0, 30) || "New Chat";

          try {
            const res = await apiFetch("/api/user-threads", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: user.uid,
                langGraphThreadId: thread_id,
                title,
                project,
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

      // Send history + new message to LangGraph for context (only on first message)
      const historyMessages = historySentRef.current
        ? []
        : history.map((m) => ({
            type: m.role === "user" ? ("human" as const) : ("ai" as const),
            content: m.content,
          }));
      const allMessages = [...historyMessages, ...messages.slice(-1)];
      historySentRef.current = true;

      const generator = isRest
        ? sendMessageRest({
            endpoint: agentConfig?.endpoint ?? "",
            threadId: threadIdRef.current,
            messages: allMessages,
            project,
          })
        : await sendMessage({
            threadId: threadIdRef.current,
            messages: allMessages,
            command,
            project,
            endpoint: agentConfig?.endpoint,
            assistantId: agentConfig?.assistantId,
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
    setIsFadingOut(true);

    // fade-out 애니메이션과 메시지 로딩을 병렬 처리
    const messagesPromise = apiFetch(`/api/user-threads/${thread.id}/messages`)
      .then((res) => (res.ok ? res.json() : { messages: [] }))
      .catch(() => ({ messages: [] }));

    const [data] = await Promise.all([
      messagesPromise,
      new Promise((resolve) => setTimeout(resolve, 150)),
    ]);

    const loadedMessages = (data.messages ?? []).map((m: any) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      feedbackValue: m.feedbackValue ?? null,
    }));

    threadIdRef.current = thread.langGraphThreadId;
    setActiveThreadDbId(thread.id);
    setHistory(loadedMessages);
    historySentRef.current = false;
    setRuntimeKey((k) => k + 1);
    setIsFadingOut(false);
  }, []);

  const handleNewChat = useCallback(() => {
    setIsFadingOut(true);
    setTimeout(() => {
      threadIdRef.current = null;
      setActiveThreadDbId(null);
      setHistory([]);
      historySentRef.current = false;
      setRuntimeKey((k) => k + 1);
      setIsFadingOut(false);
    }, 150);
  }, []);

  const handleDeleteThread = useCallback(
    async (id: string) => {
      try {
        await apiFetch(`/api/user-threads/${id}`, { method: "DELETE" });
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
    <AssistantRuntimeProvider key={`${project}-${runtimeKey}`} runtime={runtime}>
      <div className="flex h-dvh flex-col">
        <Nav />
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          {user && sidebarOpen && (
            <Sidebar>
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <span className="text-sm font-semibold">Chat History</span>
                <button
                  onClick={() => { setSidebarOpen(false); localStorage.setItem("sidebar_open", "false"); }}
                  className="rounded p-1 hover:bg-muted transition-colors"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>
              <div className="px-2 pt-2 flex items-center gap-1">
                <div className="flex-1">
                  <ProjectSelector
                    project={project}
                    projects={projects}
                    onChange={(name) => onProjectChange?.(name)}
                    onAdd={onProjectAdd}
                    size="sm"
                  />
                </div>
                <button
                  onClick={() => setAgentConfigOpen(true)}
                  className="shrink-0 rounded p-1.5 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  title="Agent Settings"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </div>
              <div className="px-2 py-2">
                <button
                  onClick={handleNewChat}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  New Chat
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
                {threads.length === 0 && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    No conversations yet.
                  </p>
                )}
                {threads.map((thread) => (
                  <SidebarItemDiv
                    key={thread.id}
                    active={activeThreadDbId === thread.id}
                    className="justify-between"
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
                  </SidebarItemDiv>
                ))}
              </div>

              {/* Logout */}
              <div className="border-t px-2 py-2">
                <button
                  onClick={() => signOut(auth)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </Sidebar>
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
          <div className="flex-1 min-h-0">
            <Thread showWelcome={history.length === 0} historyMessages={history} isFadingOut={isFadingOut} project={project} />
          </div>
        </div>
      </div>
      <AgentConfigModal
        open={agentConfigOpen}
        onClose={() => setAgentConfigOpen(false)}
        project={project}
        onSaved={(cfg) => setAgentConfig(cfg ? { ...cfg, agentType: cfg.agentType ?? "langgraph" } : null)}
      />
    </AssistantRuntimeProvider>
  );
}
