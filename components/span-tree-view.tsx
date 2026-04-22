"use client";

import { useState } from "react";
import { type RawSpan, type TraceTree, type Annotation } from "@/lib/phoenix";
import { AnnotationBadges } from "@/components/annotation-badge";
import { AnnotationForm } from "@/components/annotation-form";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  ChevronDown,
  Bot,
  Link2,
  Search,
  MessageSquare,
  Box,
  Clock,
  Cpu,
  Coins,
  CheckCircle2,
  XCircle,
  Timer,
  Zap,
  Plus,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSec(ms: number): string {
  if (ms < 10) return `${ms.toFixed(2)}ms`;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

const SPAN_STYLES: Record<string, { icon: typeof Bot; bg: string; fg: string }> = {
  LLM:       { icon: Bot,            bg: "bg-[#e8f5e9] dark:bg-[#2d4a2e]",  fg: "text-[#2e7d32] dark:text-[#6fcf6f]" },
  CHAIN:     { icon: Link2,          bg: "bg-[#e3eafc] dark:bg-[#2e3a5b]",  fg: "text-[#3555c4] dark:text-[#6b8cff]" },
  RETRIEVER: { icon: Search,         bg: "bg-[#fce4ec] dark:bg-[#4a2d3a]",  fg: "text-[#b0446e] dark:text-[#e07baf]" },
  TOOL:      { icon: Box,            bg: "bg-[#fef3e2] dark:bg-[#4a3b2d]",  fg: "text-[#b57530] dark:text-[#e0a86b]" },
  PROMPT:    { icon: MessageSquare,  bg: "bg-[#f3e5f5] dark:bg-[#3b2d4a]",  fg: "text-[#7b40a0] dark:text-[#b07be0]" },
  DEFAULT:   { icon: Zap,            bg: "bg-muted",                         fg: "text-muted-foreground" },
};

function getSpanStyle(kind: string) {
  return SPAN_STYLES[kind.toUpperCase()] ?? SPAN_STYLES.DEFAULT;
}

function StatusIcon({ status }: { status: string }) {
  const ok = status === "OK" || status === "UNSET" || !status;
  return ok
    ? <CheckCircle2 className="size-3.5 text-emerald-500" />
    : <XCircle className="size-3.5 text-red-500" />;
}

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/** Extract a short user-facing input preview from raw span input */
function extractInputPreview(input: string, maxLen = 80): string {
  if (!input) return "";
  try {
    const parsed = JSON.parse(input);

    // LangGraph style: { messages: [{ type: "human", content: "..." }] }
    if (Array.isArray(parsed?.messages)) {
      for (const msg of parsed.messages) {
        // flat { type, content } or { role, content }
        if ((msg?.type === "human" || msg?.role === "user") && typeof msg?.content === "string") {
          return msg.content.trim().slice(0, maxLen);
        }
        // nested kwargs style: { kwargs: { content: "..." } }
        if (Array.isArray(msg)) {
          for (const m of msg) {
            const c = m?.kwargs?.content ?? "";
            const qMatch = c.match?.(/<question>([\s\S]*?)<\/question>/);
            if (qMatch) return qMatch[1].trim().slice(0, maxLen);
            if (c && m?.id?.includes("HumanMessage")) return c.trim().slice(0, maxLen);
          }
          const last = msg[msg.length - 1];
          if (last?.kwargs?.content) return last.kwargs.content.trim().slice(0, maxLen);
        }
      }
    }

    // OpenAI style: [{ role: "user", content: "..." }]
    if (Array.isArray(parsed)) {
      const userMsg = parsed.find((m: any) => m.role === "user" || m.type === "human");
      if (userMsg?.content) return userMsg.content.trim().slice(0, maxLen);
    }

    // { input: "..." } or { query: "..." }
    if (typeof parsed?.input === "string") return parsed.input.trim().slice(0, maxLen);
    if (typeof parsed?.query === "string") return parsed.query.trim().slice(0, maxLen);
  } catch {}
  // Plain text fallback
  return input.trim().slice(0, maxLen);
}

// ─── Span Tree Node (LangSmith style) ────────────────────────────────────────

function SpanNode({
  span,
  depth,
  isLast,
  selectedId,
  onSelect,
}: {
  span: RawSpan;
  depth: number;
  isLast: boolean;
  selectedId: string | null;
  onSelect: (span: RawSpan) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = span.children.length > 0;
  const isSelected = selectedId === span.spanId;
  const style = getSpanStyle(span.spanKind);
  const Icon = style.icon;

  return (
    <div className="relative">
      {/* Vertical connector line from parent */}
      {depth > 0 && (
        <div
          className="absolute top-0 w-px bg-border"
          style={{
            left: `${(depth - 1) * 24 + 19}px`,
            height: isLast ? "18px" : "100%",
          }}
        />
      )}

      {/* Horizontal connector line */}
      {depth > 0 && (
        <div
          className="absolute top-[18px] h-px bg-border"
          style={{
            left: `${(depth - 1) * 24 + 19}px`,
            width: "12px",
          }}
        />
      )}

      {/* Row */}
      <div
        onClick={() => onSelect(span)}
        className={cn(
          "relative flex items-center gap-1.5 py-1 pr-3 cursor-pointer rounded-md mx-1 transition-colors",
          isSelected
            ? "bg-accent"
            : "hover:bg-accent/50"
        )}
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
      >
        {/* Expand/collapse */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setExpanded(!expanded);
          }}
          className="flex size-4 shrink-0 items-center justify-center"
        >
          {hasChildren ? (
            expanded
              ? <ChevronDown className="size-3 text-muted-foreground" />
              : <ChevronRight className="size-3 text-muted-foreground" />
          ) : (
            <span className="size-3" />
          )}
        </button>

        {/* Icon */}
        <span className={cn("flex size-5 shrink-0 items-center justify-center rounded", style.bg)}>
          <Icon className={cn("size-3", style.fg)} />
        </span>

        {/* Name */}
        <span className="truncate text-[13px] font-medium leading-none">
          {span.name}
        </span>

        {/* Model badge (if LLM) */}
        {span.model && (
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {span.model}
          </span>
        )}

        {/* Status */}
        <StatusIcon status={span.status} />

        {/* Latency */}
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {formatSec(span.latency)}
        </span>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div className="relative">
          {span.children.map((child, i) => (
            <SpanNode
              key={child.spanId}
              span={child}
              depth={depth + 1}
              isLast={i === span.children.length - 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Root Span Header ────────────────────────────────────────────────────────

function RootHeader({ span, onDeleteAnnotation, onAnnotate }: { span: RawSpan; onDeleteAnnotation?: (spanId: string, name: string) => void; onAnnotate?: (spanId: string, annotations: Annotation[]) => void }) {
  const style = getSpanStyle(span.spanKind);
  const Icon = style.icon;

  // Count total tokens and cost from tree
  function sumTree(node: RawSpan): { prompt: number; completion: number; total: number; cost: number } {
    let p = node.promptTokens, c = node.completionTokens, t = node.totalTokens, cost = node.cost;
    for (const child of node.children) {
      const sub = sumTree(child);
      p += sub.prompt; c += sub.completion; t += sub.total; cost += sub.cost;
    }
    return { prompt: p, completion: c, total: t, cost };
  }
  const tokens = sumTree(span);

  return (
    <div className="px-3 py-3 border-b">
      <div className="flex items-center gap-2">
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded", style.bg)}>
          <Icon className={cn("size-3.5", style.fg)} />
        </span>
        <h3 className="text-sm font-semibold truncate">{span.name}</h3>
        <StatusIcon status={span.status} />
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Timer className="size-3" />
          {formatSec(span.latency)}
        </span>
        {tokens.total > 0 && (
          <span className="flex items-center gap-1">
            <Coins className="size-3" />
            {tokens.total.toLocaleString()}
          </span>
        )}
        {tokens.cost > 0 && (
          <span className="flex items-center gap-1">
            ${tokens.cost.toFixed(4)}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        {span.annotations.length > 0 && (
          <AnnotationBadges
            annotations={span.annotations}
            onDelete={onDeleteAnnotation ? (name) => onDeleteAnnotation(span.spanId, name) : undefined}
          />
        )}
        {onAnnotate && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAnnotate(span.spanId, span.annotations);
            }}
            className="rounded p-1 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
            title="Add annotation"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Span Detail Panel ───────────────────────────────────────────────────────

function SpanDetail({ span, onDeleteAnnotation, onAnnotate }: { span: RawSpan; onDeleteAnnotation?: (spanId: string, name: string) => void; onAnnotate?: (spanId: string, annotations: Annotation[]) => void }) {
  const [activeTab, setActiveTab] = useState<"input" | "output">("input");
  const style = getSpanStyle(span.spanKind);
  const Icon = style.icon;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cn("flex size-5 shrink-0 items-center justify-center rounded", style.bg)}>
            <Icon className={cn("size-3", style.fg)} />
          </span>
          <h3 className="text-sm font-semibold truncate">{span.name}</h3>
          <StatusIcon status={span.status} />
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {formatSec(span.latency)}
          </span>
          {span.model && (
            <span className="flex items-center gap-1">
              <Cpu className="size-3" />
              {span.model}
            </span>
          )}
          {span.totalTokens > 0 && (
            <span className="flex items-center gap-1">
              <Coins className="size-3" />
              {span.totalTokens.toLocaleString()} tokens
              <span className="text-muted-foreground/60">
                ({span.promptTokens} + {span.completionTokens})
              </span>
            </span>
          )}
          {span.cost > 0 && (
            <span className="flex items-center gap-1">
              ${span.cost.toFixed(4)}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {span.annotations.length > 0 && (
            <AnnotationBadges
              annotations={span.annotations}
              onDelete={onDeleteAnnotation ? (name) => onDeleteAnnotation(span.spanId, name) : undefined}
            />
          )}
          {onAnnotate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAnnotate(span.spanId, span.annotations);
              }}
              className="rounded p-1 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
              title="Add annotation"
            >
              <Plus className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {(["input", "output"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-xs font-medium border-b-2 transition-colors capitalize",
              activeTab === tab
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed font-mono text-foreground/80">
          {formatJson(activeTab === "input" ? span.input : span.output) || (
            <span className="text-muted-foreground italic">No {activeTab} data</span>
          )}
        </pre>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

function TraceAccordionItem({ trace, onDeleteAnnotation, onRefresh }: {
  trace: TraceTree;
  onDeleteAnnotation?: (spanId: string, name: string) => void;
  onRefresh?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedSpan, setSelectedSpan] = useState<RawSpan | null>(null);
  const [annotateSpanId, setAnnotateSpanId] = useState<string | null>(null);
  const [annotateAnnotations, setAnnotateAnnotations] = useState<Annotation[]>([]);

  function handleAnnotate(spanId: string, annotations: Annotation[]) {
    setAnnotateSpanId(spanId);
    setAnnotateAnnotations(annotations);
  }
  const style = getSpanStyle(trace.rootSpan.spanKind);
  const Icon = style.icon;

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Header row */}
      <div
        onClick={() => {
          setExpanded(!expanded);
          if (!expanded) setSelectedSpan(trace.rootSpan);
        }}
        className={cn(
          "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/40 cursor-pointer",
          expanded && "bg-accent/20"
        )}
      >
        {expanded
          ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        }
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded", style.bg)}>
          <Icon className={cn("size-3.5", style.fg)} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium shrink-0">{trace.rootSpan.name}</span>
            {(() => {
              const preview = extractInputPreview(trace.rootSpan.input);
              return preview ? (
                <span className="text-[12px] text-muted-foreground truncate">
                  — {preview}
                </span>
              ) : null;
            })()}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {new Date(trace.time).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            {trace.rootSpan.annotations.length > 0 && (
              <AnnotationBadges annotations={trace.rootSpan.annotations} />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAnnotate(trace.rootSpan.spanId, trace.rootSpan.annotations);
              }}
              className="rounded p-1 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
              title="Add annotation"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <StatusIcon status={trace.rootSpan.status} />
          <span className="text-[11px] tabular-nums text-muted-foreground">{formatSec(trace.latency)}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {trace.spanCount} span{trace.spanCount !== 1 && "s"}
          </span>
        </div>
      </div>

      {/* Expanded: tree + detail */}
      {expanded && (
        <div className="flex border-t" style={{ minHeight: "300px" }}>
          {/* Left: span tree — no scroll, drives container height */}
          <div className="w-[400px] shrink-0 border-r bg-card">
            <RootHeader span={trace.rootSpan} onDeleteAnnotation={onDeleteAnnotation} onAnnotate={handleAnnotate} />
            <div className="py-1">
              {trace.rootSpan.children.map((child, i) => (
                <SpanNode
                  key={child.spanId}
                  span={child}
                  depth={1}
                  isLast={i === trace.rootSpan.children.length - 1}
                  selectedId={selectedSpan?.spanId ?? null}
                  onSelect={setSelectedSpan}
                />
              ))}
            </div>
          </div>

          {/* Right: detail — scrolls independently, sticky to viewport */}
          <div className="flex-1 min-w-0 overflow-y-auto max-h-[600px]">
            {selectedSpan ? (
              <SpanDetail span={selectedSpan} onDeleteAnnotation={onDeleteAnnotation} onAnnotate={handleAnnotate} />
            ) : (
              <div className="flex h-full min-h-[300px] items-center justify-center text-sm text-muted-foreground">
                Select a span
              </div>
            )}
          </div>
        </div>
      )}
      <AnnotationForm
        open={!!annotateSpanId}
        onClose={() => setAnnotateSpanId(null)}
        spanId={annotateSpanId ?? ""}
        existingAnnotations={annotateAnnotations}
        onSaved={() => {
          setAnnotateSpanId(null);
          onRefresh?.();
        }}
      />
    </div>
  );
}

export function SpanTreeView({
  traces,
  projectName,
  onRefresh,
}: {
  traces: TraceTree[];
  projectName?: string;
  onRefresh?: () => void;
}) {
  async function handleDeleteAnnotation(spanId: string, annotationName: string) {
    if (!projectName) return;
    if (!confirm(`Delete "${annotationName}" annotation?`)) return;
    try {
      await fetch(`/api/v1/projects/${encodeURIComponent(projectName)}/span_annotations`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: annotationName, span_id: spanId }),
      });
      onRefresh?.();
    } catch {}
  }

  return (
    <div className="space-y-1.5">
      {traces.map((t) => (
        <TraceAccordionItem
          key={t.traceId}
          trace={t}
          onDeleteAnnotation={projectName ? handleDeleteAnnotation : undefined}
          onRefresh={onRefresh}
        />
      ))}
      {traces.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No traces found
        </p>
      )}
    </div>
  );
}
