"use client";

import {
  GridLayout,
  useContainerWidth,
  collides,
  getAllCollisions,
  type LayoutItem,
  type Compactor,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { GripVertical, X, Settings2 } from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import React from "react";
import { getColorSlots, getViewModes } from "./widgets/registry";

export type { LayoutItem };

export type WidgetViewMode = "summary" | "trend" | "detail";

/** Widget colors as a simple array. colors[0]=C1, colors[1]=C2, etc. */
export type WidgetColors = string[];

export interface WidgetConfig {
  id: string;
  type: string;
  title: string;
}

/** Default fallback colors when nothing is set */
export const DEFAULT_COLORS: WidgetColors = ["oklch(0.65 0.15 250)", "oklch(0.70 0.12 195)"];

/** 2-color presets (for widgets with colorSlots=2) */
export const PAIR_PRESETS: { name: string; colors: [string, string] }[] = [
  { name: "Default",  colors: ["oklch(0.65 0.15 250)", "oklch(0.70 0.12 195)"] },
  { name: "Ocean",    colors: ["oklch(0.60 0.14 230)", "oklch(0.72 0.10 200)"] },
  { name: "Sunset",   colors: ["oklch(0.65 0.18 25)",  "oklch(0.72 0.15 55)"] },
  { name: "Forest",   colors: ["oklch(0.60 0.14 150)", "oklch(0.72 0.10 170)"] },
  { name: "Purple",   colors: ["oklch(0.58 0.18 290)", "oklch(0.70 0.12 310)"] },
  { name: "Mono",     colors: ["oklch(0.45 0.00 0)",   "oklch(0.65 0.00 0)"] },
];

/** Single-color presets (for widgets with colorSlots=1 or to fill all slots) */
export const SINGLE_PRESETS: { name: string; color: string }[] = [
  { name: "Blue",    color: "oklch(0.65 0.15 250)" },
  { name: "Teal",    color: "oklch(0.70 0.12 195)" },
  { name: "Orange",  color: "oklch(0.65 0.18 25)" },
  { name: "Green",   color: "oklch(0.60 0.14 150)" },
  { name: "Purple",  color: "oklch(0.58 0.18 290)" },
  { name: "Gray",    color: "oklch(0.50 0.00 0)" },
];

interface WidgetGridProps {
  widgets: WidgetConfig[];
  layouts: LayoutItem[];
  viewModes: Record<string, WidgetViewMode>;
  widgetColors: Record<string, WidgetColors>;
  onSaveLayout: (layouts: readonly LayoutItem[]) => void;
  onRemoveWidget: (id: string) => void;
  onViewModeChange: (id: string, mode: WidgetViewMode) => void;
  onColorChange: (id: string, colors: WidgetColors) => void;
  renderWidget: (widget: WidgetConfig, viewMode: WidgetViewMode, gridW: number, gridH: number, colors: WidgetColors) => React.ReactNode;
}

/** Ensure colors array has at least `slots` entries, filling with fallbacks */
function padColors(colors: WidgetColors | Record<string, string>, slots: number): WidgetColors {
  const fallbacks = ["oklch(0.65 0.10 120)", "oklch(0.65 0.10 180)", "oklch(0.65 0.10 60)", "oklch(0.55 0.12 15)"];
  // Migrate old object format {color1, color2, ...} to array
  const arr = Array.isArray(colors)
    ? colors
    : Object.keys(colors).sort().map((k) => (colors as Record<string, string>)[k]);
  const result = arr.length > 0 ? [...arr] : [...DEFAULT_COLORS];
  while (result.length < slots) {
    result.push(fallbacks[result.length - 2] ?? fallbacks[fallbacks.length - 1]);
  }
  return result;
}

/** Individual widget wrapper */
function WidgetCard({
  widget,
  viewMode,
  colors,
  gridW,
  gridH,
  onCycleMode,
  onSetMode,
  onRemove,
  onColorChange,
  renderWidget,
}: {
  widget: WidgetConfig;
  viewMode: WidgetViewMode;
  colors: WidgetColors;
  gridW: number;
  gridH: number;
  onCycleMode: () => void;
  onSetMode: (mode: WidgetViewMode) => void;
  onRemove: () => void;
  onColorChange: (colors: WidgetColors) => void;
  renderWidget: (widget: WidgetConfig, viewMode: WidgetViewMode, gridW: number, gridH: number, colors: WidgetColors) => React.ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [localColors, setLocalColors] = useState<WidgetColors>(colors);
  const [chartColors, setChartColors] = useState<WidgetColors>(colors);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local colors when parent colors change (e.g. preset applied)
  const prevColorsRef = useRef(colors);
  if (prevColorsRef.current !== colors) {
    prevColorsRef.current = colors;
    setLocalColors(colors);
    setChartColors(colors);
  }

  useEffect(() => {
    if (!optionsOpen) return;
    const handler = (e: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setOptionsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [optionsOpen]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setNarrow(width < 240);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const customModes = getViewModes(widget.type);
  const colorSlots = getColorSlots(widget.type);
  const DEFAULT_LABELS: Record<WidgetViewMode, string> = { summary: "Summary", trend: "Trend", detail: "Detail" };
  const VIEW_MODE_FULL: Record<string, string> = customModes?.labels ?? DEFAULT_LABELS;
  const VIEW_MODE_ORDER: WidgetViewMode[] = (customModes?.modes ?? ["summary", "trend", "detail"]) as WidgetViewMode[];
  const isSingleView = VIEW_MODE_ORDER.length <= 1;
  const paddedColors = padColors(localColors, colorSlots); // settings UI (instant)
  // Stable reference — only changes when chartColors changes (debounced)
  const paddedChartColors = useMemo(() => padColors(chartColors, colorSlots), [chartColors, colorSlots]);

  const applyColors = useCallback((next: WidgetColors) => {
    setLocalColors(next); // instant — updates color swatches in settings UI
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setChartColors(next); // debounced — triggers chart re-render
      onColorChange(next);  // debounced — saves to DB
    }, 120);
  }, [onColorChange]);

  return (
    <div
      ref={cardRef}
      className="group relative h-full overflow-visible rounded-2xl border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md"
    >
      <div
        className={`widget-drag-handle relative flex cursor-grab items-center gap-1.5 border-b border-border/40 ${narrow ? "px-2 py-1.5" : "px-4 py-2.5"}`}
      >
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100" />
        <span className={`${narrow ? "text-xs" : "text-sm"} font-semibold tracking-tight truncate`}>
          {widget.title}
        </span>
        {!isSingleView && (
          <button
            onClick={onCycleMode}
            className={`shrink-0 rounded-md border border-border/50 bg-muted/50 ${narrow ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"} font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted hover:text-foreground`}
          >
            {narrow ? (VIEW_MODE_FULL[viewMode] ?? viewMode)[0] : VIEW_MODE_FULL[viewMode] ?? viewMode}
          </button>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <div className="relative" ref={optionsRef}>
            <button
              onClick={() => setOptionsOpen(!optionsOpen)}
              className="rounded-lg p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
            {optionsOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border bg-popover p-1 shadow-xl">
                {!isSingleView && (
                  <>
                    {VIEW_MODE_ORDER.map((vm) => (
                      <button
                        key={vm}
                        onClick={() => { onSetMode(vm); setOptionsOpen(false); }}
                        className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                          viewMode === vm ? "bg-accent text-accent-foreground" : "hover:bg-accent"
                        }`}
                      >
                        {VIEW_MODE_FULL[vm]} View
                      </button>
                    ))}
                    <div className="my-1 border-t border-border/40" />
                  </>
                )}
                {/* Color settings */}
                <div className="px-2.5 py-1.5">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Colors</p>
                  {/* Presets */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {colorSlots === 2 ? (
                      PAIR_PRESETS.map((preset) => (
                        <button
                          key={preset.name}
                          title={preset.name}
                          onClick={() => applyColors([...preset.colors])}
                          className={`flex items-center gap-1 rounded-md border p-1 transition-colors ${paddedColors[0] === preset.colors[0] && paddedColors[1] === preset.colors[1] ? "border-foreground bg-accent" : "border-transparent hover:bg-muted"}`}
                        >
                          <span className="h-3.5 w-3.5 rounded-full" style={{ background: preset.colors[0] }} />
                          <span className="h-3.5 w-3.5 rounded-full" style={{ background: preset.colors[1] }} />
                        </button>
                      ))
                    ) : (
                      SINGLE_PRESETS.map((preset) => (
                        <button
                          key={preset.name}
                          title={preset.name}
                          onClick={() => applyColors(Array(colorSlots).fill(preset.color))}
                          className={`rounded-md border p-1 transition-colors ${paddedColors[0] === preset.color ? "border-foreground bg-accent" : "border-transparent hover:bg-muted"}`}
                        >
                          <span className="block h-4 w-4 rounded-full" style={{ background: preset.color }} />
                        </button>
                      ))
                    )}
                  </div>
                  {/* Individual pickers */}
                  <div className="flex flex-wrap items-center gap-2">
                    {paddedColors.slice(0, colorSlots).map((c, i) => (
                      <label key={i} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span className="font-medium">C{i + 1}</span>
                        <div className="relative">
                          <span className="block h-5 w-5 rounded-full border border-border/60" style={{ background: c }} />
                          <input
                            type="color"
                            value={c.startsWith("#") ? c : "#888888"}
                            onChange={(e) => {
                              const next = [...paddedColors];
                              next[i] = e.target.value;
                              applyColors(next);
                            }}
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          />
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="my-1 border-t border-border/40" />
                <button
                  onClick={() => { onRemove(); setOptionsOpen(false); }}
                  className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10"
                >
                  Remove Widget
                </button>
              </div>
            )}
          </div>
          <button
            onClick={onRemove}
            className="rounded-lg p-1 text-muted-foreground/50 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="relative h-[calc(100%-2.75rem)] overflow-hidden p-1">
        {/* eslint-disable-next-line react-hooks/exhaustive-deps */}
        {useMemo(() => renderWidget(widget, viewMode, gridW, gridH, paddedChartColors),
          // renderWidget identity changes only when annotations/spans change
          [renderWidget, widget.id, widget.type, viewMode, gridW, gridH, paddedChartColors]
        )}
      </div>
    </div>
  );
}

export function WidgetGrid({
  widgets,
  layouts,
  viewModes,
  widgetColors,
  onSaveLayout,
  onRemoveWidget,
  onViewModeChange,
  onColorChange,
  renderWidget,
}: WidgetGridProps) {
  const { width, containerRef } = useContainerWidth();
  const [localLayouts, setLocalLayouts] = useState<LayoutItem[]>(layouts);

  const hasLoadedRef = React.useRef(false);
  const savedLayoutRef = useRef<LayoutItem[]>([]);
  const draggingIdRef = useRef<string | null>(null);

  const prevLayoutsRef = React.useRef(layouts);
  if (prevLayoutsRef.current !== layouts) {
    prevLayoutsRef.current = layouts;
    hasLoadedRef.current = false;
    setLocalLayouts(layouts);
  }

  const ALL_MODES: WidgetViewMode[] = ["summary", "trend", "detail"];
  const cycleViewMode = useCallback((id: string) => {
    const w = widgets.find((w) => w.id === id);
    const custom = w ? getViewModes(w.type) : undefined;
    const modes = (custom?.modes ?? ALL_MODES) as WidgetViewMode[];
    const current = viewModes[id] ?? "summary";
    const idx = modes.indexOf(current);
    const next = modes[(idx + 1) % modes.length];
    onViewModeChange(id, next);
  }, [viewModes, onViewModeChange, widgets]);

  const compactor = React.useMemo<Compactor>(() => ({
    type: "vertical",
    allowOverlap: false,
    compact(layout, _cols) {
      const saved = savedLayoutRef.current;
      const dragId = draggingIdRef.current;
      if (!dragId || !saved.length) return layout;
      const dragItem = layout.find((l) => l.i === dragId);
      if (!dragItem) return layout;
      const others = layout
        .filter((l) => l.i !== dragId)
        .map((l) => {
          const orig = saved.find((s) => s.i === l.i);
          return orig ? { ...l, x: orig.x, y: orig.y, w: orig.w, h: orig.h } : l;
        })
        .sort((a, b) => a.y - b.y || a.x - b.x);
      const placed: LayoutItem[] = [dragItem];
      for (const item of others) {
        let candidate = { ...item };
        let conflicts = getAllCollisions(placed, candidate);
        while (conflicts.length > 0) {
          const bottom = Math.max(...conflicts.map((c) => c.y + c.h));
          candidate = { ...candidate, y: bottom };
          conflicts = getAllCollisions(placed, candidate);
        }
        placed.push(candidate);
      }
      return placed;
    },
  }), []);

  const cols = 10;
  const rowHeight = Math.floor(width / 10);

  return (
    <div ref={containerRef}>
      {width > 0 && (
        <GridLayout
          className="layout"
          width={width}
          layout={localLayouts}
          gridConfig={{ cols, rowHeight }}
          compactor={compactor}
          onLayoutChange={(layout) => {
            const items = layout as LayoutItem[];
            setLocalLayouts(items);
            if (!hasLoadedRef.current) { hasLoadedRef.current = true; return; }
            if (!draggingIdRef.current) onSaveLayout(items);
          }}
          onDragStart={(layout, _old, newItem) => {
            savedLayoutRef.current = layout.map((l) => ({ ...l } as LayoutItem));
            draggingIdRef.current = newItem?.i ?? null;
          }}
          onDragStop={(layout) => {
            draggingIdRef.current = null;
            const items = layout as LayoutItem[];
            setLocalLayouts(items);
            onSaveLayout(items);
          }}
          onResizeStart={(layout, _old, newItem) => {
            savedLayoutRef.current = layout.map((l) => ({ ...l } as LayoutItem));
            draggingIdRef.current = newItem?.i ?? null;
          }}
          onResizeStop={(layout) => {
            draggingIdRef.current = null;
            const items = layout as LayoutItem[];
            setLocalLayouts(items);
            onSaveLayout(items);
          }}
          dragConfig={{ handle: ".widget-drag-handle" }}
        >
          {widgets.map((w) => {
            const mode = viewModes[w.id] ?? "summary";
            const li = localLayouts.find((l) => l.i === w.id);
            const wColors = widgetColors[w.id] ?? DEFAULT_COLORS;
            return (
              <div key={w.id} className="overflow-visible">
                <WidgetCard
                  widget={w}
                  viewMode={mode}
                  colors={wColors}
                  gridW={li?.w ?? 1}
                  gridH={li?.h ?? 1}
                  onCycleMode={() => cycleViewMode(w.id)}
                  onSetMode={(m) => onViewModeChange(w.id, m)}
                  onRemove={() => onRemoveWidget(w.id)}
                  onColorChange={(c) => onColorChange(w.id, c)}
                  renderWidget={renderWidget}
                />
              </div>
            );
          })}
        </GridLayout>
      )}
    </div>
  );
}
