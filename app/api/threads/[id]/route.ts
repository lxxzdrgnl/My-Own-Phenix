import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  await prisma.thread.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { title } = await req.json();

  const thread = await prisma.thread.update({
    where: { id },
    data: { title, updatedAt: new Date() },
  });

  return NextResponse.json({ thread });
}
