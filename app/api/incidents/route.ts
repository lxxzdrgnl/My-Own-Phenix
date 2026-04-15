import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const incidents = await prisma.incident.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ incidents });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { projectId, title, severity, status } = body;

  if (!projectId || !title || !severity) {
    return NextResponse.json({ error: "projectId, title, and severity are required" }, { status: 400 });
  }

  const incident = await prisma.incident.create({
    data: {
      projectId,
      title,
      severity,
      status: status ?? "OPEN",
    },
  });

  return NextResponse.json({ incident }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, ...data } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = { ...data };
  if (data.resolvedAt) updateData.resolvedAt = new Date(data.resolvedAt);

  const incident = await prisma.incident.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({ incident });
}
