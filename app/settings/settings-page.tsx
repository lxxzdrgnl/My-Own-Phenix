"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Key, Bot, Activity } from "lucide-react";
import { Nav } from "@/components/nav";
import { ProvidersSection } from "./providers-section";
import { AgentsSection } from "./agents-section";
import { EvalWorkerSection } from "./eval-worker-section";

const TABS = [
  {
    id: "providers",
    label: "Providers",
    icon: Key,
    desc: "API keys & models",
  },
  {
    id: "agents",
    label: "Agents",
    icon: Bot,
    desc: "Agent templates",
  },
  {
    id: "eval-worker",
    label: "Eval Worker",
    icon: Activity,
    desc: "Background evaluator",
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SettingsPage() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabId) || "providers";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  return (
    <>
      <Nav />
      <div className="flex h-[calc(100vh-49px)]">
        {/* Sidebar */}
        <div className="w-56 shrink-0 border-r p-4 space-y-1">
          <p className="mb-4 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">
            Settings
          </p>
          {TABS.map(({ id, label, icon: Icon, desc }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-all",
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", active ? "text-background/70" : "text-muted-foreground/60")} />
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">{label}</p>
                  <p className={cn("mt-0.5 text-[11px] leading-tight", active ? "text-background/50" : "text-muted-foreground/50")}>
                    {desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-8 py-8">
            {activeTab === "providers" && <ProvidersSection />}
            {activeTab === "agents" && <AgentsSection />}
            {activeTab === "eval-worker" && <EvalWorkerSection />}
          </div>
        </div>
      </div>
    </>
  );
}
