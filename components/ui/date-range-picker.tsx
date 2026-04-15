"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";
import { DayPicker, type DateRange as DayPickerDateRange } from "react-day-picker";
import { ko } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DateRange {
  from: Date;
  to: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getPresetRange(days: number): DateRange {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

function formatDateKo(date: Date): string {
  return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

const PRESETS = [
  { label: "오늘", days: 1 },
  { label: "7일", days: 7 },
  { label: "30일", days: 30 },
] as const;

function detectPreset(range: DateRange): string | null {
  for (const preset of PRESETS) {
    const expected = getPresetRange(preset.days);
    if (
      Math.abs(range.from.getTime() - expected.from.getTime()) < 60_000 &&
      Math.abs(range.to.getTime() - expected.to.getTime()) < 60_000
    ) {
      return preset.label;
    }
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [selecting, setSelecting] = React.useState<DayPickerDateRange | undefined>(
    { from: value.from, to: value.to }
  );
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Close on click outside
  React.useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  // Sync internal selection when value changes externally
  React.useEffect(() => {
    setSelecting({ from: value.from, to: value.to });
  }, [value.from, value.to]);

  const activePreset = detectPreset(value);

  const displayLabel = activePreset
    ? activePreset
    : `${formatDateKo(value.from)} – ${formatDateKo(value.to)}`;

  function handlePreset(days: number) {
    onChange(getPresetRange(days));
    setOpen(false);
  }

  function handleSelect(range: DayPickerDateRange | undefined) {
    setSelecting(range);
    if (range?.from && range?.to) {
      const from = new Date(range.from);
      from.setHours(0, 0, 0, 0);
      const to = new Date(range.to);
      to.setHours(23, 59, 59, 999);
      onChange({ from, to });
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={cn("relative inline-block", className)}>
      {/* Trigger row */}
      <div className="flex items-center gap-1">
        {PRESETS.map((preset) => (
          <Button
            key={preset.label}
            size="sm"
            variant={activePreset === preset.label ? "default" : "ghost"}
            onClick={() => handlePreset(preset.days)}
          >
            {preset.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant={activePreset ? "ghost" : "outline"}
          onClick={() => setOpen((v) => !v)}
          className="gap-1.5"
        >
          <CalendarDays className="size-3.5" />
          {!activePreset && displayLabel}
        </Button>
      </div>

      {/* Calendar popup */}
      {open && (
        <div
          className={cn(
            "absolute right-0 z-50 mt-2 rounded-lg border bg-popover p-3 shadow-md",
            "animate-in fade-in-0 zoom-in-95"
          )}
        >
          <DayPicker
            mode="range"
            locale={ko}
            selected={selecting}
            onSelect={handleSelect}
            numberOfMonths={2}
            defaultMonth={
              selecting?.from
                ? new Date(selecting.from.getFullYear(), selecting.from.getMonth() - 1, 1)
                : undefined
            }
            classNames={{
              root: "text-sm text-foreground",
              months: "flex gap-4",
              month: "space-y-3",
              month_caption: "flex items-center justify-center pt-1 font-medium",
              caption_label: "text-sm font-medium",
              nav: "flex items-center gap-1",
              button_previous:
                "absolute left-1 top-1 inline-flex size-7 items-center justify-center rounded-md hover:bg-accent",
              button_next:
                "absolute right-1 top-1 inline-flex size-7 items-center justify-center rounded-md hover:bg-accent",
              month_grid: "w-full border-collapse",
              weekdays: "flex",
              weekday: "w-8 text-center text-xs text-muted-foreground",
              weeks: "mt-1",
              week: "flex",
              day: "relative p-0",
              day_button:
                "inline-flex size-8 items-center justify-center rounded-md text-sm hover:bg-accent hover:text-accent-foreground focus:outline-none",
              selected:
                "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary/90",
              range_start: "rounded-l-md [&>button]:bg-primary [&>button]:text-primary-foreground",
              range_end: "rounded-r-md [&>button]:bg-primary [&>button]:text-primary-foreground",
              range_middle: "bg-accent/50 rounded-none",
              today: "[&>button]:font-semibold [&>button]:underline",
              outside: "opacity-40",
              disabled: "opacity-30 pointer-events-none",
            }}
          />
        </div>
      )}
    </div>
  );
}
