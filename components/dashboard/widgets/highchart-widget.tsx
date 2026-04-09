"use client";

import { useEffect, useRef } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";

interface HighchartWidgetProps {
  options: Highcharts.Options;
}

export function HighchartWidget({ options }: HighchartWidgetProps) {
  const chartRef = useRef<HighchartsReact.RefObject>(null);

  useEffect(() => {
    const chart = chartRef.current?.chart;
    if (chart?.container) {
      const observer = new ResizeObserver(() => chart.reflow());
      const container = chart.container.parentElement;
      if (container) observer.observe(container);
      return () => observer.disconnect();
    }
  }, []);

  return (
    <HighchartsReact
      highcharts={Highcharts}
      options={{
        chart: { style: { fontFamily: "inherit" }, backgroundColor: "transparent" },
        credits: { enabled: false },
        ...options,
      }}
      ref={chartRef}
      containerProps={{ style: { height: "100%", width: "100%" } }}
    />
  );
}
