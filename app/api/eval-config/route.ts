import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const configs = await prisma.projectEvalConfig.findMany({
    where: { projectId },
  });

  return NextResponse.json({ configs });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const body = await request.json();
  const { projectId, evalName, enabled, template } = body as {
    projectId: string;
    evalName: string;
    enabled?: boolean;
    template?: string | null;
  };

  if (!projectId || !evalName) {
    return NextResponse.json({ error: "projectId and evalName required" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (enabled !== undefined) data.enabled = enabled;
  if (template !== undefined) data.template = template || null;

  const config = await prisma.projectEvalConfig.upsert({
    where: { projectId_evalName: { projectId, evalName } },
    create: { projectId, evalName, enabled: enabled ?? true, template: template || null },
    update: data,
  });

  return NextResponse.json({ config });
}
