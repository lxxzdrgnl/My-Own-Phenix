import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const risks = await prisma.riskItem.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ risks });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { projectId, name, system, riskLevel, mitigation, status, assignee, dueDate } = body;

  if (!projectId || !name || !system || !riskLevel || !mitigation) {
    return NextResponse.json({ error: "projectId, name, system, riskLevel, and mitigation are required" }, { status: 400 });
  }

  const risk = await prisma.riskItem.create({
    data: {
      projectId,
      name,
      system,
      riskLevel,
      mitigation,
      status: status ?? "OPEN",
      assignee: assignee ?? null,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });

  return NextResponse.json({ risk }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, ...data } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = { ...data };
  if (data.dueDate) updateData.dueDate = new Date(data.dueDate);
  if (data.resolvedAt) updateData.resolvedAt = new Date(data.resolvedAt);

  const risk = await prisma.riskItem.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({ risk });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await prisma.riskItem.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
