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
  const { name, evalType, template, ruleConfig, isCustom } = body as {
    name: string;
    evalType?: string;
    template?: string;
    ruleConfig?: unknown;
    isCustom?: boolean;
  };

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const prompt = await prisma.evalPrompt.upsert({
    where: { name },
    create: {
      name,
      evalType: evalType ?? "llm_prompt",
      template: template ?? "",
      ruleConfig: ruleConfig ? JSON.stringify(ruleConfig) : "{}",
      isCustom: isCustom ?? false,
    },
    update: {
      ...(evalType !== undefined && { evalType }),
      ...(template !== undefined && { template }),
      ...(ruleConfig !== undefined && { ruleConfig: JSON.stringify(ruleConfig) }),
      ...(isCustom !== undefined && { isCustom }),
    },
  });

  return NextResponse.json({ prompt });
}

export async function DELETE(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  await prisma.evalPrompt.deleteMany({ where: { name } });
  return NextResponse.json({ ok: true });
}
