"use client";

import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown, FolderOpen, Plus, X } from "lucide-react";

interface ProjectSelectorProps {
  project: string;
  projects: { id: string; name: string }[];
  onChange: (name: string) => void;
  onAdd?: (name: string) => void;
  size?: "sm" | "md";
}

export function ProjectSelector({ project, projects, onChange, onAdd, size = "md" }: ProjectSelectorProps) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open && !adding) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
        setNewName("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, adding]);

  const isSm = size === "sm";

  const submitAdd = () => {
    if (newName.trim()) onAdd?.(newName.trim());
    setNewName("");
    setAdding(false);
  };

  // Adding mode: trigger area becomes an inline input with ✓ and ✕
  if (adding) {
    return (
      <div className="relative" ref={ref}>
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => { e.preventDefault(); submitAdd(); }}
        >
          <input
            ref={inputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setAdding(false); setNewName(""); } }}
            placeholder="프로젝트 이름"
            autoFocus
            className={`flex-1 min-w-0 rounded-lg border border-border bg-background font-medium placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/30 ${isSm ? "px-2.5 py-2 text-xs" : "px-3 py-1.5 text-sm"}`}
          />
          <button
            type="submit"
            className={`shrink-0 rounded-lg bg-foreground text-background transition-opacity hover:opacity-80 ${isSm ? "p-2" : "p-1.5"}`}
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setNewName(""); }}
            className={`shrink-0 rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${isSm ? "p-2" : "p-1.5"}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 rounded-lg border border-border/60 bg-muted/20 text-left transition-colors hover:bg-muted/40 ${isSm ? "px-2.5 py-2" : "px-3 py-1.5"}`}
      >
        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        <span className={`flex-1 truncate font-semibold ${isSm ? "text-xs" : "text-sm"}`}>{project}</span>
        <ChevronDown className={`h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className={`absolute ${isSm ? "left-0 right-0" : "left-0 min-w-[180px]"} top-full z-50 mt-1 overflow-hidden rounded-xl border bg-popover shadow-lg`}>
          <div className="max-h-48 overflow-y-auto py-1">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => { onChange(p.name); setOpen(false); }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 ${isSm ? "text-xs" : "text-sm"} font-medium transition-colors ${
                  project === p.name ? "bg-accent text-accent-foreground" : "text-foreground/80 hover:bg-muted"
                }`}
              >
                <span className="truncate">{p.name}</span>
                {project === p.name && <Check className="ml-auto h-3 w-3 shrink-0 text-foreground/50" />}
              </button>
            ))}
          </div>

          {onAdd && (
            <>
              <div className="border-t border-border/40" />
              <button
                onClick={() => { setOpen(false); setAdding(true); setTimeout(() => inputRef.current?.focus(), 0); }}
                className={`flex w-full items-center gap-2 px-3 py-2 ${isSm ? "text-xs" : "text-sm"} font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground`}
              >
                <Plus className="h-3 w-3" />
                <span>새 프로젝트</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
