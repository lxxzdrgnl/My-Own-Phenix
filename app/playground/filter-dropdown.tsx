"use client";

interface FilterDropdownProps {
  spanKinds: Set<string>;
  contentFilter: string;
  projectId: string;
  onClose: () => void;
  onSpanKindChange: (next: Set<string>) => void;
  onContentFilterChange: (value: string) => void;
  onClearSelected: () => void;
}

function saveFilters(pid: string, kinds: Set<string>, content: string) {
  if (!pid) return;
  localStorage.setItem(
    `pg_filter_${pid}`,
    JSON.stringify({ kinds: [...kinds], content }),
  );
}

export function FilterDropdown({
  spanKinds,
  contentFilter,
  projectId,
  onClose,
  onSpanKindChange,
  onContentFilterChange,
  onClearSelected,
}: FilterDropdownProps) {
  const top =
    (document.getElementById("filter-btn")?.getBoundingClientRect().bottom ??
      0) + 6;
  const left =
    document.getElementById("filter-btn")?.getBoundingClientRect().left ?? 0;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-72 overflow-hidden rounded-xl border bg-background shadow-xl"
        style={{ top, left }}
      >
        <div className="border-b px-3 py-2.5">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Span Kind
          </p>
          <div className="flex flex-wrap gap-1">
            {["ALL", "LLM", "CHAIN", "RETRIEVER", "PROMPT"].map((kind) => {
              const isAll = kind === "ALL";
              const active = isAll ? spanKinds.size === 0 : spanKinds.has(kind);
              return (
                <button
                  key={kind}
                  onClick={() => {
                    let next: Set<string>;
                    if (isAll) {
                      next = new Set();
                    } else {
                      next = new Set(spanKinds);
                      if (active) next.delete(kind);
                      else next.add(kind);
                    }
                    onSpanKindChange(next);
                    saveFilters(projectId, next, contentFilter);
                    onClearSelected();
                  }}
                  className={`rounded-md border px-2 py-1 text-xs font-mono transition-all ${
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground hover:border-foreground/40"
                  }`}
                >
                  {kind}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-3 py-2.5">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Content
          </p>
          <div className="flex flex-col gap-0.5">
            {[
              { value: "ALL", label: "All" },
              { value: "RAG", label: "RAG only" },
              { value: "PLAYGROUND", label: "Playground only" },
            ].map(({ value, label }) => {
              const active = contentFilter === value;
              return (
                <button
                  key={value}
                  onClick={() => {
                    onContentFilterChange(value);
                    saveFilters(projectId, spanKinds, value);
                    onClearSelected();
                  }}
                  className={`rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                    active
                      ? "bg-foreground/8 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {active && <span className="mr-1.5">•</span>}
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
