import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get("project");

  // If no project specified, return all configs (for alias lookup)
  if (!project) {
    const configs = await prisma.agentConfig.findMany();
    return NextResponse.json({ configs });
  }

  const config = await prisma.agentConfig.findUnique({ where: { project } });
  return NextResponse.json({ config: config ?? null });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { project, alias, agentType, endpoint, assistantId } = body as {
    project: string;
    alias?: string;
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
      ...(agentType !== undefined && { agentType }),
      ...(endpoint !== undefined && { endpoint }),
      ...(assistantId !== undefined && { assistantId }),
    },
    create: {
      project,
      alias: alias || null,
      agentType: agentType ?? "langgraph",
      endpoint: endpoint ?? "http://localhost:2024",
      assistantId: assistantId ?? "agent",
    },
  });

  return NextResponse.json({ config });
}

export async function DELETE(req: NextRequest) {
  const project = req.nextUrl.searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project query param required" }, { status: 400 });
  }

  await prisma.agentConfig.deleteMany({ where: { project } });
  return NextResponse.json({ success: true });
}
