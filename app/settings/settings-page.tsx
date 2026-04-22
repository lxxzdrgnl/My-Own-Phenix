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
