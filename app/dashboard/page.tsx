"use client";

import { useCallback, useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { useAuth } from "@/lib/auth-context";
import {
  WidgetGrid,
  type WidgetConfig,
  type LayoutItem,
} from "@/components/dashboard/widget-grid";
import { AddWidgetMenu } from "@/components/dashboard/add-widget-menu";
import { StatCard } from "@/components/dashboard/widgets/stat-card";
import { HighchartWidget } from "@/components/dashboard/widgets/highchart-widget";
import { fetchProjects } from "@/lib/phoenix";

interface AnnotationData {
  name: string;
  label: string;
  score: number;
  time: string;
}

interface SpanData {
  latency: number;
  status: string;
  time: string;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "w1", type: "hallucination", title: "Hallucination Rate" },
  { id: "w2", type: "qa_correctness", title: "QA Correctness" },
  { id: "w3", type: "total_queries", title: "Total Queries" },
  { id: "w4", type: "avg_latency", title: "Avg Response Time" },
];

const DEFAULT_LAYOUTS: LayoutItem[] = [
  { i: "w1", x: 0, y: 0, w: 6, h: 3 },
  { i: "w2", x: 6, y: 0, w: 6, h: 3 },
  { i: "w3", x: 0, y: 3, w: 3, h: 2 },
  { i: "w4", x: 3, y: 3, w: 3, h: 2 },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGETS);
  const [layouts, setLayouts] = useState<LayoutItem[]>(DEFAULT_LAYOUTS);
  const [annotations, setAnnotations] = useState<AnnotationData[]>([]);
  const [spans, setSpans] = useState<SpanData[]>([]);
  const [project, setProject] = useState("default");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch(`/api/dashboard/layout?userId=${user.uid}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.layout) {
          const parsed = JSON.parse(data.layout);
          setWidgets(parsed.widgets ?? DEFAULT_WIDGETS);
          setLayouts(parsed.layouts ?? DEFAULT_LAYOUTS);
        }
      })
      .catch(() => {});
  }, [user]);

  const saveLayout = useCallback(
    (newLayouts: readonly LayoutItem[], newWidgets?: WidgetConfig[]) => {
      const w = newWidgets ?? widgets;
      setLayouts([...newLayouts]);
      if (!user) return;
      fetch("/api/dashboard/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.uid,
          layout: JSON.stringify({ widgets: w, layouts: newLayouts }),
        }),
      }).catch(() => {});
    },
    [user, widgets],
  );

  useEffect(() => {
    async function load() {
      try {
        const spansRes = await fetch(
          `/api/phoenix?path=/v1/projects/${encodeURIComponent(project)}/spans&limit=500`,
        );
        const spansData = await spansRes.json();
        const allSpans: any[] = spansData.data ?? [];

        const spanList: SpanData[] = allSpans.map((s: any) => ({
          latency: s.end_time
            ? new Date(s.end_time).getTime() - new Date(s.start_time).getTime()
            : 0,
          status: s.status_code ?? "OK",
          time: s.start_time,
        }));
        setSpans(spanList);

        const rootSpans = allSpans.filter((s: any) => s.parent_id === null);
        const annResults: AnnotationData[] = [];
        await Promise.all(
          rootSpans.slice(0, 100).map((s: any) =>
            fetch(
              `/api/phoenix?path=/v1/projects/${encodeURIComponent(project)}/span_annotations&span_ids=${s.context.span_id}`,
            )
              .then((r) => r.json())
              .then((data) => {
                for (const a of data.data ?? []) {
                  annResults.push({
                    name: a.name,
                    label: a.result?.label ?? "",
                    score: a.result?.score ?? 0,
                    time: s.start_time,
                  });
                }
              })
              .catch(() => {}),
          ),
        );
        setAnnotations(annResults);
      } catch {}
    }
    load();
  }, [project]);

  const renderWidget = useCallback(
    (widget: WidgetConfig) => {
      const annByName = (name: string) =>
        annotations.filter((a) => a.name === name);

      switch (widget.type) {
        case "hallucination": {
          const data = annByName("hallucination");
          const scores = data.map((d) => d.score);
          return (
            <HighchartWidget
              options={{
                title: { text: undefined },
                xAxis: { categories: data.map((_, i) => `#${i + 1}`) },
                yAxis: { title: { text: "Score" }, min: 0, max: 1 },
                series: [
                  {
                    type: "line" as const,
                    name: "Hallucination",
                    data: scores,
                    color: "#ef4444",
                  },
                ],
              }}
            />
          );
        }
        case "qa_correctness": {
          const data = annByName("qa_correctness");
          const scores = data.map((d) => d.score);
          return (
            <HighchartWidget
              options={{
                title: { text: undefined },
                xAxis: { categories: data.map((_, i) => `#${i + 1}`) },
                yAxis: { title: { text: "Score" }, min: 0, max: 1 },
                series: [
                  {
                    type: "line" as const,
                    name: "QA Correctness",
                    data: scores,
                    color: "#22c55e",
                  },
                ],
              }}
            />
          );
        }
        case "rag_relevance": {
          const data = annByName("rag_relevance");
          return (
            <HighchartWidget
              options={{
                title: { text: undefined },
                chart: { type: "bar" },
                xAxis: { categories: ["Relevant", "Unrelated"] },
                yAxis: { title: { text: "Count" } },
                series: [
                  {
                    type: "bar" as const,
                    name: "Documents",
                    data: [
                      data.filter((d) => d.label === "relevant").length,
                      data.filter((d) => d.label === "unrelated").length,
                    ],
                    colorByPoint: true,
                    colors: ["#22c55e", "#ef4444"],
                  },
                ],
              }}
            />
          );
        }
        case "banned_word": {
          const data = annByName("banned_word");
          return (
            <HighchartWidget
              options={{
                title: { text: undefined },
                chart: { type: "bar" },
                xAxis: { categories: ["Clean", "Detected"] },
                yAxis: { title: { text: "Count" } },
                series: [
                  {
                    type: "bar" as const,
                    name: "Messages",
                    data: [
                      data.filter((d) => d.label === "clean").length,
                      data.filter((d) => d.label === "detected").length,
                    ],
                    colorByPoint: true,
                    colors: ["#22c55e", "#ef4444"],
                  },
                ],
              }}
            />
          );
        }
        case "total_queries":
          return <StatCard value={spans.length} label="Total Spans" />;
        case "avg_latency": {
          const avg =
            spans.length > 0
              ? Math.round(
                  spans.reduce((a, b) => a + b.latency, 0) / spans.length,
                )
              : 0;
          return <StatCard value={`${avg}ms`} label="Avg Latency" />;
        }
        case "error_rate": {
          const errors = spans.filter((s) => s.status === "ERROR").length;
          const rate = spans.length > 0 ? ((errors / spans.length) * 100).toFixed(1) : "0";
          return <StatCard value={`${rate}%`} label="Error Rate" />;
        }
        default:
          return <div className="text-muted-foreground text-sm">Unknown widget</div>;
      }
    },
    [annotations, spans],
  );

  const handleAddWidget = useCallback(
    (type: string, title: string) => {
      const id = `w${Date.now()}`;
      const newWidget = { id, type, title };
      const newLayout: LayoutItem = { i: id, x: 0, y: Infinity, w: 6, h: 3 };
      const newWidgets = [...widgets, newWidget];
      const newLayouts = [...layouts, newLayout];
      setWidgets(newWidgets);
      saveLayout(newLayouts, newWidgets);
    },
    [widgets, layouts, saveLayout],
  );

  const handleRemoveWidget = useCallback(
    (id: string) => {
      const newWidgets = widgets.filter((w) => w.id !== id);
      const newLayouts = layouts.filter((l) => l.i !== id);
      setWidgets(newWidgets);
      saveLayout(newLayouts, newWidgets);
    },
    [widgets, layouts, saveLayout],
  );

  return (
    <div className="flex h-dvh flex-col">
      <Nav />
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <AddWidgetMenu
          existingTypes={widgets.map((w) => w.type)}
          onAdd={handleAddWidget}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <WidgetGrid
          widgets={widgets}
          layouts={layouts}
          onLayoutChange={(l) => saveLayout(l)}
          onRemoveWidget={handleRemoveWidget}
          renderWidget={renderWidget}
        />
      </div>
    </div>
  );
}
