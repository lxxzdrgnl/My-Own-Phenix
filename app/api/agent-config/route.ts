import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const project = req.nextUrl.searchParams.get("project");

  // If no project specified, return all configs (for alias lookup)
  if (!project) {
    const configs = await prisma.agentConfig.findMany({ include: { template: true } });
    return NextResponse.json({ configs });
  }

  const config = await prisma.agentConfig.findUnique({ where: { project }, include: { template: true } });
  return NextResponse.json({ config: config ?? null });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  const { project, alias, templateId, agentType, endpoint, assistantId } = body as {
    project: string;
    alias?: string;
    templateId?: string | null;
    agentType?: string;
    endpoint?: string;
    assistantId?: string;
  };

  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }

  const config = await prisma.agentConfig.upsert({
    where: { project },
    update: {
      ...(alias !== undefined && { alias: alias || null }),
      ...(templateId !== undefined && { templateId: templateId || null }),
      ...(agentType !== undefined && { agentType }),
      ...(endpoint !== undefined && { endpoint }),
      ...(assistantId !== undefined && { assistantId }),
    },
    create: {
      project,
      alias: alias || null,
      templateId: templateId || null,
      agentType: agentType ?? "langgraph",
      endpoint: endpoint ?? "http://localhost:2024",
      assistantId: assistantId ?? "agent",
    },
  });

  return NextResponse.json({ config });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const project = req.nextUrl.searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project query param required" }, { status: 400 });
  }

  await prisma.agentConfig.deleteMany({ where: { project } });
  return NextResponse.json({ success: true });
}
