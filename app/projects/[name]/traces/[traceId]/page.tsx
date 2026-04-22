"use client";

import { use } from "react";
import { TraceDetailView } from "./trace-detail-view";

export default function TraceDetailPage({ params }: { params: Promise<{ name: string; traceId: string }> }) {
  const { name, traceId } = use(params);
  return <TraceDetailView projectName={decodeURIComponent(name)} traceId={decodeURIComponent(traceId)} />;
}
