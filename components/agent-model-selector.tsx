"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, Search, Bot } from "lucide-react";

interface AgentOption {
  id: string;
  name: string;
  description?: string;
  agentType: string;
}

interface Model {
  id: string;
  name: string;
}

interface ModelFamily {
  label: string;
  models: Model[];
}

interface Provider {
  name: string;
  icon: string;
  families: ModelFamily[];
}

const PROVIDERS: Provider[] = [
  {
    name: "OpenAI",
    icon: "openai",
    families: [
      {
        label: "GPT-5.4",
        models: [
          { id: "gpt-5.4", name: "gpt-5.4" },
          { id: "gpt-5.4-pro", name: "gpt-5.4-pro" },
          { id: "gpt-5.4-mini", name: "gpt-5.4-mini" },
          { id: "gpt-5.4-nano", name: "gpt-5.4-nano" },
        ],
      },
      {
        label: "GPT-5.x",
        models: [
          { id: "gpt-5.2", name: "gpt-5.2" },
          { id: "gpt-5.2-pro", name: "gpt-5.2-pro" },
          { id: "gpt-5.1", name: "gpt-5.1" },
          { id: "gpt-5", name: "gpt-5" },
          { id: "gpt-5-pro", name: "gpt-5-pro" },
          { id: "gpt-5-mini", name: "gpt-5-mini" },
          { id: "gpt-5-nano", name: "gpt-5-nano" },
        ],
      },
      {
        label: "GPT-4.1",
        models: [
          { id: "gpt-4.1", name: "gpt-4.1" },
          { id: "gpt-4.1-mini", name: "gpt-4.1-mini" },
          { id: "gpt-4.1-nano", name: "gpt-4.1-nano" },
        ],
      },
      {
        label: "GPT-4o",
        models: [
          { id: "gpt-4o", name: "gpt-4o" },
          { id: "gpt-4o-mini", name: "gpt-4o-mini" },
        ],
      },
      {
        label: "GPT-4 / 3.5",
        models: [
          { id: "gpt-4-turbo", name: "gpt-4-turbo" },
          { id: "gpt-4", name: "gpt-4" },
          { id: "gpt-3.5-turbo", name: "gpt-3.5-turbo" },
        ],
      },
      {
        label: "o-series",
        models: [
          { id: "o3-pro", name: "o3-pro" },
          { id: "o3", name: "o3" },
          { id: "o3-mini", name: "o3-mini" },
          { id: "o4-mini", name: "o4-mini" },
          { id: "o1-pro", name: "o1-pro" },
          { id: "o1", name: "o1" },
        ],
      },
    ],
  },
  {
    name: "Anthropic",
    icon: "anthropic",
    families: [
      {
        label: "Claude",
        models: [
          { id: "claude-opus-4-6", name: "claude-opus-4.6" },
          { id: "claude-sonnet-4-6", name: "claude-sonnet-4.6" },
          { id: "claude-haiku-4-5-20251001", name: "claude-haiku-4.5" },
        ],
      },
    ],
  },
  {
    name: "Google",
    icon: "google",
    families: [
      {
        label: "Gemini",
        models: [
          { id: "gemini-2.5-pro", name: "gemini-2.5-pro" },
          { id: "gemini-2.5-flash", name: "gemini-2.5-flash" },
          { id: "gemini-2.0-flash", name: "gemini-2.0-flash" },
        ],
      },
    ],
  },
  {
    name: "xAI",
    icon: "xai",
    families: [
      {
        label: "Grok",
        models: [
          { id: "grok-3", name: "grok-3" },
          { id: "grok-3-mini", name: "grok-3-mini" },
        ],
      },
    ],
  },
];

function ProviderIcon({ icon, className }: { icon: string; className?: string }) {
  const size = className ?? "h-4 w-4";
  switch (icon) {
    case "openai":
      return (
        <svg className={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
        </svg>
      );
    case "anthropic":
      return (
        <svg className={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767L16.906 20.48h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm1.21 5.175l-2.33 5.998h4.658l-2.328-5.998z" />
        </svg>
      );
    case "google":
      return (
        <svg className={size} viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
      );
    case "xai":
      return (
        <svg className={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.04 3h4.05l7.92 12.27L21.96 3H24L14.52 18.84 17.64 24h-4.08l-2.61-4.32L8.34 24H6.3l3.15-5.16z" />
        </svg>
      );
    default:
      return null;
  }
}

export function AgentModelSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [activeProviders, setActiveProviders] = useState<Set<string>>(new Set());
  const [agents, setAgents] = useState<AgentOption[]>([]);

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

    fetch("/api/agent-config")
      .then((r) => r.json())
      .then((data) => {
        setAgents(
          (data.configs ?? []).map((c: any) => ({
            id: c.id,
            name: c.template?.name || c.alias?.trim() || c.project,
            description: c.template?.description || c.project,
            agentType: c.agentType,
          })),
        );
      })
      .catch(() => {});
  }, []);

  const displayLabel = (() => {
    if (value.startsWith("agent:")) {
      const agentId = value.replace("agent:", "");
      const agent = agents.find((a) => a.id === agentId);
      return agent ? agent.name : value;
    }
    if (value.startsWith("llm:")) {
      return value.replace("llm:", "");
    }
    return value || "Select...";
  })();

  const isAgent = value.startsWith("agent:");

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const q = search.toLowerCase();
  const isSearching = q.length > 0;

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-9 w-full items-center gap-2 rounded-md border bg-background px-2.5 text-sm outline-none transition focus:ring-1 focus:ring-ring"
      >
        {isAgent ? (
          <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <span className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="flex-1 truncate text-left font-mono text-sm">{displayLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-10 z-50 w-72 overflow-hidden rounded-xl border bg-background shadow-xl">
          {/* Search */}
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models or agents..."
              className="h-6 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {/* Agents section */}
            {agents.length > 0 &&
              (() => {
                const filtered = isSearching
                  ? agents.filter(
                      (a) =>
                        a.name.toLowerCase().includes(q) ||
                        a.description?.toLowerCase().includes(q),
                    )
                  : agents;
                if (filtered.length === 0) return null;

                const isExpanded = isSearching || expandedSection === "agents";

                return (
                  <div>
                    <button
                      onClick={() =>
                        setExpandedSection(isExpanded && !isSearching ? null : "agents")
                      }
                      className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted"
                    >
                      <ChevronRight
                        className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      />
                      <Bot className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-sm font-medium">Agents</span>
                      <span className="ml-auto text-[11px] tabular-nums text-muted-foreground/50">
                        {filtered.length}
                      </span>
                    </button>
                    {isExpanded &&
                      filtered.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => {
                            onChange(`agent:${a.id}`);
                            setOpen(false);
                            setSearch("");
                          }}
                          className={`flex w-full items-center gap-2 py-1.5 pl-10 pr-3 text-left text-sm transition-colors ${
                            value === `agent:${a.id}`
                              ? "bg-foreground/8 font-medium"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate">{a.name}</p>
                            <p className="truncate text-[10px] text-muted-foreground/50">
                              {a.agentType}
                            </p>
                          </div>
                        </button>
                      ))}
                  </div>
                );
              })()}

            {/* Divider between agents and providers */}
            {agents.length > 0 && <div className="my-1 border-t" />}

            {/* LLM Providers */}
            {PROVIDERS.map((provider) => {
              const isDisabled = !activeProviders.has(provider.name.toLowerCase());

              if (isSearching) {
                const matches = provider.families.flatMap((f) =>
                  f.models.filter(
                    (m) =>
                      m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
                  ),
                );
                if (matches.length === 0) return null;

                return (
                  <div key={provider.name}>
                    <div className="flex items-center gap-2 px-3 pt-2 pb-1">
                      <ProviderIcon icon={provider.icon} className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        {provider.name}
                      </span>
                    </div>
                    {matches.map((m) => (
                      <button
                        key={m.id}
                        disabled={isDisabled}
                        onClick={() => {
                          onChange(`llm:${m.id}`);
                          setOpen(false);
                          setSearch("");
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-sm transition-colors ${
                          isDisabled
                            ? "cursor-not-allowed opacity-30"
                            : value === `llm:${m.id}`
                              ? "bg-foreground/8 font-medium"
                              : "hover:bg-muted"
                        }`}
                      >
                        <span className="w-3" />
                        {m.name}
                      </button>
                    ))}
                  </div>
                );
              }

              const isProviderExpanded = expandedSection === provider.name;

              return (
                <div key={provider.name}>
                  <button
                    onClick={() => {
                      if (isDisabled) return;
                      setExpandedSection(isProviderExpanded ? null : provider.name);
                      setExpandedFamily(null);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                      isDisabled ? "cursor-not-allowed opacity-30" : "hover:bg-muted"
                    }`}
                  >
                    <ChevronRight
                      className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${isProviderExpanded ? "rotate-90" : ""}`}
                    />
                    <ProviderIcon icon={provider.icon} className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-sm font-medium">{provider.name}</span>
                  </button>

                  {isProviderExpanded &&
                    provider.families.map((family) => {
                      const familyKey = `${provider.name}/${family.label}`;
                      const isFamilyExpanded = expandedFamily === familyKey;

                      return (
                        <div key={familyKey}>
                          <button
                            onClick={() =>
                              setExpandedFamily(isFamilyExpanded ? null : familyKey)
                            }
                            className="flex w-full items-center gap-2 py-1.5 pl-8 pr-3 text-left transition-colors hover:bg-muted"
                          >
                            <ChevronRight
                              className={`h-2.5 w-2.5 shrink-0 text-muted-foreground transition-transform ${isFamilyExpanded ? "rotate-90" : ""}`}
                            />
                            <span className="text-sm text-muted-foreground">{family.label}</span>
                            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground/50">
                              {family.models.length}
                            </span>
                          </button>

                          {isFamilyExpanded &&
                            family.models.map((m) => (
                              <button
                                key={m.id}
                                onClick={() => {
                                  onChange(`llm:${m.id}`);
                                  setOpen(false);
                                  setSearch("");
                                }}
                                className={`flex w-full items-center py-1.5 pl-14 pr-3 text-left font-mono text-sm transition-colors ${
                                  value === `llm:${m.id}`
                                    ? "bg-foreground/8 font-medium"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                }`}
                              >
                                {m.name}
                              </button>
                            ))}
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
