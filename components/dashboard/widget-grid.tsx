"use client";

import {
  ResponsiveGridLayout,
  useContainerWidth,
  type LayoutItem,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

export type { LayoutItem };

export interface WidgetConfig {
  id: string;
  type: string;
  title: string;
}

interface WidgetGridProps {
  widgets: WidgetConfig[];
  layouts: LayoutItem[];
  onLayoutChange: (layouts: readonly LayoutItem[]) => void;
  onRemoveWidget: (id: string) => void;
  renderWidget: (widget: WidgetConfig) => React.ReactNode;
}

export function WidgetGrid({
  widgets,
  layouts,
  onLayoutChange,
  onRemoveWidget,
  renderWidget,
}: WidgetGridProps) {
  const { width, containerRef } = useContainerWidth();

  return (
    <div ref={containerRef}>
      {width > 0 && (
        <ResponsiveGridLayout
          className="layout"
          width={width}
          layouts={{ lg: layouts }}
          breakpoints={{ lg: 1200, md: 996, sm: 768 }}
          cols={{ lg: 12, md: 8, sm: 4 }}
          rowHeight={80}
          onLayoutChange={(layout) => onLayoutChange(layout)}
          dragConfig={{ handle: ".widget-drag-handle" }}
        >
          {widgets.map((w) => (
            <div
              key={w.id}
              className="overflow-hidden rounded-xl border bg-card shadow-sm"
            >
              <div className="widget-drag-handle flex cursor-grab items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-medium">{w.title}</span>
                <button
                  onClick={() => onRemoveWidget(w.id)}
                  className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                >
                  &times;
                </button>
              </div>
              <div className="h-[calc(100%-2.5rem)] p-3">
                {renderWidget(w)}
              </div>
            </div>
          ))}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
