"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Settings2, Key, Bot, Activity, MessageSquare, FileText } from "lucide-react";
import { Nav } from "@/components/nav";
import { Sidebar } from "@/components/ui/sidebar";
import { GeneralSection } from "./general-section";
import { ProvidersSection } from "./providers-section";
import { AgentsSection } from "./agents-section";
import { EvalWorkerSection } from "./eval-worker-section";
import { ChatSection } from "./chat-section";

interface TabDef {
  id: string;
  label: string;
  icon: typeof Settings2;
  desc: string;
}

const TAB_GROUPS: { label: string; tabs: TabDef[] }[] = [
  {
    label: "App",
    tabs: [
      { id: "general", label: "General", icon: Settings2, desc: "Phoenix URL & basics" },
      { id: "providers", label: "Providers", icon: Key, desc: "LLM API keys" },
    ],
  },
  {
    label: "AI",
    tabs: [
      { id: "agents", label: "Agents", icon: Bot, desc: "Agent templates" },
      { id: "chat", label: "Chat", icon: MessageSquare, desc: "Project agent mapping" },
    ],
  },
  {
    label: "Eval",
    tabs: [
      { id: "eval-worker", label: "Eval Worker", icon: Activity, desc: "Background evaluator" },
    ],
  },
];

const ALL_TAB_IDS = TAB_GROUPS.flatMap((g) => g.tabs.map((t) => t.id));
type TabId = string;

export function SettingsPage() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab") ?? "general";
  const initialTab = ALL_TAB_IDS.includes(raw) ? raw : "general";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  return (
    <>
      <Nav />
      <div className="flex h-[calc(100vh-49px)]">
        {/* Sidebar */}
        <Sidebar className="py-4">
          {TAB_GROUPS.map((group, gi) => (
            <div key={group.label} className={cn(gi > 0 && "mt-3")}>
              <p className="mb-1.5 px-6 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/40">
                {group.label}
              </p>
              <div className="px-3 space-y-0.5">
                {group.tabs.map(({ id, label, icon: Icon, desc }) => {
                  const active = activeTab === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setActiveTab(id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-all",
                        active
                          ? "bg-accent font-medium"
                          : "text-muted-foreground hover:bg-accent/50",
                      )}
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium leading-tight">{label}</p>
                        <p className={cn("mt-0.5 text-[10px] leading-tight", active ? "text-muted-foreground" : "text-muted-foreground/40")}>
                          {desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Docs link at bottom */}
          <div className="mt-auto border-t px-3 py-3">
            <a
              href="/api/docs"
              target="_blank"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-muted-foreground/50 transition-colors hover:bg-accent/50 hover:text-foreground"
            >
              <FileText className="h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-tight">API Docs</p>
                <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground/40">Swagger / OpenAPI</p>
              </div>
            </a>
          </div>
        </Sidebar>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-8 py-8">
            {activeTab === "general" && <GeneralSection />}
            {activeTab === "providers" && <ProvidersSection />}
            {activeTab === "agents" && <AgentsSection />}
            {activeTab === "eval-worker" && <EvalWorkerSection />}
            {activeTab === "chat" && <ChatSection />}
          </div>
        </div>
      </div>
    </>
  );
}
