import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const templates = await prisma.agentTemplate.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, description, agentType, endpoint, assistantId, evalPrompts } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const template = await prisma.agentTemplate.create({
    data: {
      name,
      description: description ?? "",
      agentType: agentType ?? "langgraph",
      endpoint: endpoint ?? "http://localhost:2024",
      assistantId: assistantId ?? "agent",
      evalPrompts: evalPrompts ? JSON.stringify(evalPrompts) : "{}",
    },
  });

  return NextResponse.json({ template });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, name, description, agentType, endpoint, assistantId, evalPrompts } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const template = await prisma.agentTemplate.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(agentType !== undefined && { agentType }),
      ...(endpoint !== undefined && { endpoint }),
      ...(assistantId !== undefined && { assistantId }),
      ...(evalPrompts !== undefined && { evalPrompts: JSON.stringify(evalPrompts) }),
    },
  });

  return NextResponse.json({ template });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await prisma.agentTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
