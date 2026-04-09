import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const messages = await prisma.message.findMany({
    where: { threadId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ messages });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { role, content } = await req.json();

  if (!role || !content) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const message = await prisma.message.create({
    data: { threadId: id, role, content },
  });

  // Update thread's updatedAt
  await prisma.thread.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ message });
}
