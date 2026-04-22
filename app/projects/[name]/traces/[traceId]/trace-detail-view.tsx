"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchTraceTrees, type TraceTree } from "@/lib/phoenix";
import { SpanTreeView } from "@/components/span-tree-view";
import { LoadingState } from "@/components/ui/empty-state";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function TraceDetailView({ projectName, traceId }: { projectName: string; traceId: string }) {
  const [traces, setTraces] = useState<TraceTree[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchTraceTrees(projectName);
      setTraces(result.filter((t) => t.traceId === traceId));
    } catch {}
    setLoading(false);
  }, [projectName, traceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <Link href={`/projects/${encodeURIComponent(projectName)}`} className="rounded p-1.5 transition-colors hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Trace Detail</h1>
          <p className="text-xs font-mono text-muted-foreground">{traceId}</p>
        </div>
      </div>
      {loading && <LoadingState />}
      {!loading && traces.length > 0 && (
        <SpanTreeView traces={traces} projectName={projectName} onRefresh={load} />
      )}
      {!loading && traces.length === 0 && (
        <p className="text-sm text-muted-foreground">Trace not found.</p>
      )}
    </div>
  );
}
