"use client";

import { useRef, useState, useEffect } from "react";

interface StatCardProps {
  value: string | number;
  label: string;
  trend?: string;
}

type SizeClass = "tiny" | "small" | "normal" | "large";

export function StatCard({ value, label, trend }: StatCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sizeClass, setSizeClass] = useState<SizeClass>("normal");

  useEffect(() => {
    // Observe the .react-grid-item ancestor to avoid feedback loops
    let el: HTMLElement | null = containerRef.current;
    while (el && !el.classList.contains("react-grid-item")) el = el.parentElement;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width < 150 || height < 100) setSizeClass("tiny");
      else if (width < 250 || height < 160) setSizeClass("small");
      else if (width > 450 && height > 300) setSizeClass("large");
      else setSizeClass("normal");
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const styles = {
    tiny:   { value: "text-lg",    label: "text-[9px]",  trend: "text-[8px] px-1.5 py-0",    gap: "gap-0.5" },
    small:  { value: "text-2xl",   label: "text-[11px]", trend: "text-[9px] px-1.5 py-0.5",  gap: "gap-1" },
    normal: { value: "text-5xl",   label: "text-sm",     trend: "text-xs px-2.5 py-0.5",     gap: "gap-2" },
    large:  { value: "text-7xl",   label: "text-lg",     trend: "text-base px-3 py-0.5",     gap: "gap-3" },
  };
  const s = styles[sizeClass];

  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full flex-col items-center justify-center ${s.gap} overflow-hidden px-2 py-1`}
    >
      <span
        className={`${s.value} font-black tabular-nums tracking-tighter truncate max-w-full`}
        style={{ fontFamily: "'Geist Mono', 'SF Mono', 'Fira Code', monospace" }}
      >
        {value}
      </span>
      <div className="flex flex-col items-center gap-0.5 max-w-full overflow-hidden">
        <span className={`${s.label} font-semibold uppercase tracking-widest text-muted-foreground/70 truncate max-w-full`}>
          {label}
        </span>
        {trend && sizeClass !== "tiny" && (
          <span className={`${s.trend} rounded-full border border-border/50 bg-muted/50 font-medium tabular-nums text-muted-foreground truncate max-w-full`}>
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}
