import { NextResponse } from "next/server";
import { MY_PHENIX_PATHS, MY_PHENIX_INFO, SECURITY_SCHEMES } from "@/lib/openapi-spec";

const PHOENIX = process.env.PHOENIX_URL ?? "http://localhost:6006";

function tagForPhoenixPath(path: string): string {
  // Annotations (span, trace, session, document, experiment evals)
  if (path.includes("/span_annotations")) return "Annotations";
  if (path.includes("/trace_annotations")) return "Annotations";
  if (path.includes("/session_annotations")) return "Annotations";
  if (path.includes("/document_annotations")) return "Annotations";
  if (path.includes("/annotation_configs")) return "Annotations";
  if (path.includes("/experiment_evaluations")) return "Annotations";
  if (path.includes("/span_notes")) return "Annotations";

  // Traces & Spans
  if (path.includes("/spans")) return "Traces & Spans";
  if (path.includes("/traces")) return "Traces & Spans";

  // Sessions
  if (path.includes("/sessions")) return "Sessions";

  // Experiments & Datasets
  if (path.includes("/experiments")) return "Experiments";
  if (path.includes("/datasets")) return "Datasets";

  // Prompts
  if (path.includes("/prompts") || path.includes("/prompt_versions")) return "Prompts";

  // Users & Auth
  if (path.includes("/user")) return "Auth";
  if (path.includes("/secrets")) return "Settings";

  // Projects (must be after more specific paths that also contain /projects/)
  if (path.includes("/projects")) return "Projects";

  return "Other";
}

export async function GET() {
  let phoenixPaths: Record<string, unknown> = {};
  let phoenixSchemas: Record<string, unknown> = {};

  try {
    const res = await fetch(`${PHOENIX}/openapi.json`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const phoenixSpec = await res.json();
      for (const [path, methods] of Object.entries(phoenixSpec.paths ?? {})) {
        const newPath = `/api${path}`;
        const retagged: Record<string, unknown> = {};
        for (const [method, op] of Object.entries(methods as Record<string, any>)) {
          retagged[method] = { ...op, tags: [tagForPhoenixPath(path)] };
        }
        phoenixPaths[newPath] = retagged;
      }
      phoenixSchemas = phoenixSpec.components?.schemas ?? {};
    }
  } catch {}

  const combined = {
    openapi: "3.1.0",
    info: MY_PHENIX_INFO,
    paths: { ...phoenixPaths, ...MY_PHENIX_PATHS },
    components: {
      schemas: phoenixSchemas,
      securitySchemes: SECURITY_SCHEMES,
    },
    security: [{ BearerAuth: [] }],
    tags: [
      { name: "Auth", description: "Authentication and user management" },
      { name: "Chat", description: "Chat threads and messages" },
      { name: "Projects", description: "Project management" },
      { name: "Traces & Spans", description: "Trace and span data" },
      { name: "Annotations", description: "Span, trace, session, and document annotations" },
      { name: "Sessions", description: "Session management" },
      { name: "Evaluations", description: "Eval prompts and backfill" },
      { name: "Datasets", description: "Dataset management and rows" },
      { name: "Experiments", description: "Experiment runs and evaluations" },
      { name: "Prompts", description: "Prompt version management" },
      { name: "Providers", description: "LLM provider API keys" },
      { name: "Agents", description: "Agent templates and project configs" },
      { name: "Settings", description: "App configuration and secrets" },
      { name: "Dashboard", description: "Dashboard layout" },
    ],
  };

  return NextResponse.json(combined);
}
