import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt, maskApiKey } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  const decryptParam = req.nextUrl.searchParams.get("decrypt");
  const providers = await prisma.llmProvider.findMany({ orderBy: { createdAt: "asc" } });

  const result = providers.map((p) => ({
    id: p.id,
    provider: p.provider,
    apiKey: decryptParam === "true" ? decrypt(p.apiKey) : maskApiKey(decrypt(p.apiKey)),
    isActive: p.isActive,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));

  return NextResponse.json({ providers: result });
}

export async function POST(req: NextRequest) {
  const { provider, apiKey } = (await req.json()) as { provider: string; apiKey: string };

  if (!provider || !apiKey) {
    return NextResponse.json({ error: "provider and apiKey required" }, { status: 400 });
  }

  const validProviders = ["openai", "anthropic", "google", "xai"];
  if (!validProviders.includes(provider)) {
    return NextResponse.json({ error: `Invalid provider. Must be one of: ${validProviders.join(", ")}` }, { status: 400 });
  }

  const existing = await prisma.llmProvider.findUnique({ where: { provider } });
  if (existing) {
    return NextResponse.json({ error: `Provider "${provider}" already registered. Use PUT to update.` }, { status: 409 });
  }

  const encrypted = encrypt(apiKey);
  const created = await prisma.llmProvider.create({
    data: { provider, apiKey: encrypted, isActive: true },
  });

  return NextResponse.json({
    id: created.id,
    provider: created.provider,
    apiKey: maskApiKey(apiKey),
    isActive: created.isActive,
  });
}
