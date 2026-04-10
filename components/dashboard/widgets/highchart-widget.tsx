"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";

interface HighchartWidgetProps {
  options: Highcharts.Options;
}

/** Resolve CSS custom properties to actual color strings for Highcharts SVG */
function resolveVar(v: string, el: Element): string {
  if (!v || !v.startsWith("var(")) return v;
  const name = v.slice(4, -1).trim();
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  return raw || v;
}

function resolveColors(el: Element): string[] {
  return [
    resolveVar("var(--chart-1)", el),
    resolveVar("var(--chart-2)", el),
    resolveVar("var(--chart-3)", el),
    resolveVar("var(--chart-4)", el),
    resolveVar("var(--chart-5)", el),
  ];
}

function resolveThemeColors(el: Element) {
  return {
    muted: resolveVar("var(--muted-foreground)", el),
    fg: resolveVar("var(--foreground)", el),
    border: resolveVar("var(--border)", el),
    popover: resolveVar("var(--popover)", el),
    popoverFg: resolveVar("var(--popover-foreground)", el),
  };
}

export function HighchartWidget({ options }: HighchartWidgetProps) {
  const chartRef = useRef<HighchartsReact.RefObject>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setSize({ w: Math.floor(width), h: Math.floor(height) });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    chartRef.current?.chart?.reflow();
  }, [size]);

  const buildOptions = useCallback((): Highcharts.Options | null => {
    if (!size || !wrapperRef.current) return null;
    const el = wrapperRef.current;
    const colors = resolveColors(el);
    const t = resolveThemeColors(el);

    const isSmall = size.w < 240 || size.h < 160;
    const isTiny = size.w < 170 || size.h < 110;

    const theme: Highcharts.Options = {
      chart: {
        backgroundColor: "transparent",
        style: { fontFamily: "'Geist Sans', system-ui, sans-serif" },
        spacing: [8, 8, 8, 8],
      },
      credits: { enabled: false },
      legend: {
        enabled: !isSmall,
        itemStyle: { color: t.muted, fontWeight: "500", fontSize: "11px" },
        itemHoverStyle: { color: t.fg },
      },
      xAxis: {
        gridLineColor: t.border,
        lineColor: t.border,
        tickColor: t.border,
        labels: {
          enabled: !isTiny,
          style: { color: t.muted, fontSize: isSmall ? "9px" : "11px" },
        },
        title: { text: undefined },
      },
      yAxis: {
        gridLineColor: t.border,
        lineColor: t.border,
        labels: {
          enabled: !isTiny,
          style: { color: t.muted, fontSize: isSmall ? "9px" : "11px" },
        },
        title: isSmall ? { text: undefined } : undefined,
      },
      tooltip: {
        backgroundColor: t.popover,
        borderColor: t.border,
        borderRadius: 8,
        style: { color: t.popoverFg, fontSize: "13px" },
        shadow: { color: "rgba(0,0,0,0.08)", offsetX: 0, offsetY: 2, width: 8, opacity: 1 },
      },
      plotOptions: {
        series: {
          animation: { duration: 600, easing: "easeOutQuart" },
        },
        line: {
          lineWidth: 2,
          marker: { radius: isSmall ? 2 : 3, lineWidth: 0 },
        },
        area: {
          lineWidth: 2,
          fillOpacity: 0.12,
          marker: { radius: isSmall ? 1 : 2, lineWidth: 0 },
        },
        column: {
          borderRadius: 4,
          borderWidth: 0,
        },
        bar: {
          borderRadius: 4,
          borderWidth: 0,
        },
        pie: {
          borderWidth: 0,
          size: isTiny ? "65%" : isSmall ? "75%" : "85%",
          tooltip: {
            pointFormat: '<span style="color:{point.color}">\u25CF</span> {series.name}: <b>{point.y}</b> ({point.percentage:.1f}%)',
          },
          dataLabels: {
            enabled: !isTiny,
            format: "{point.name}: {point.percentage:.1f}%",
            distance: isSmall ? 4 : 8,
            style: { color: t.fg, fontSize: isSmall ? "10px" : "12px", fontWeight: "500", textOutline: "none" },
          },
        },
      },
      colors,
    };

    return {
      ...theme,
      ...options,
      chart: {
        ...theme.chart,
        ...options.chart,
        width: size.w,
        height: size.h,
      },
      colors: options.colors ?? colors,
      legend: { ...(theme.legend as object), ...(options.legend as object) },
      xAxis: { ...(theme.xAxis as object), ...(options.xAxis as object), ...(isSmall ? { title: { text: undefined } } : {}) },
      yAxis: { ...(theme.yAxis as object), ...(options.yAxis as object), ...(isSmall ? { title: { text: undefined } } : {}) },
      plotOptions: {
        ...(theme.plotOptions as object),
        ...(options.plotOptions as object),
        pie: {
          ...(theme.plotOptions?.pie as object),
          ...(options.plotOptions?.pie as object),
        },
      },
    };
  }, [options, size]);

  const merged = buildOptions();

  return (
    <div ref={wrapperRef} className="h-full w-full overflow-hidden">
      {merged && (
        <HighchartsReact
          highcharts={Highcharts}
          options={merged}
          ref={chartRef}
          updateArgs={[true, true, { duration: 0 }]}
        />
      )}
    </div>
  );
}
