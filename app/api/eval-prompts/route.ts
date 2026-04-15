import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const prompts = await prisma.evalPrompt.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ prompts });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { name, template } = body as { name: string; template: string };

  if (!name || !template) {
    return NextResponse.json(
      { error: "name and template are required" },
      { status: 400 },
    );
  }

  const prompt = await prisma.evalPrompt.upsert({
    where: { name },
    create: { name, template },
    update: { template },
  });

  return NextResponse.json({ prompt });
}
