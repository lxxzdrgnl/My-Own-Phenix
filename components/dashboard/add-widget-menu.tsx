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
