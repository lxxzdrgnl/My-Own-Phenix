import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt, maskApiKey } from "@/lib/crypto";
import { requireAuth } from "@/lib/auth-server";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = (await req.json()) as { apiKey?: string; isActive?: boolean };

  const existing = await prisma.llmProvider.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (body.apiKey !== undefined) data.apiKey = encrypt(body.apiKey);
  if (body.isActive !== undefined) data.isActive = body.isActive;

  const updated = await prisma.llmProvider.update({ where: { id }, data });

  return NextResponse.json({
    id: updated.id,
    provider: updated.provider,
    apiKey: maskApiKey(decrypt(updated.apiKey)),
    isActive: updated.isActive,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  try {
    await prisma.llmProvider.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }
}
