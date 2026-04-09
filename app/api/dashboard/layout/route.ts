import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const record = await prisma.dashboardLayout.findUnique({
    where: { userId },
  });

  return NextResponse.json({ layout: record?.layout ?? null });
}

export async function PUT(req: NextRequest) {
  const { userId, layout } = await req.json();

  if (!userId || !layout) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const record = await prisma.dashboardLayout.upsert({
    where: { userId },
    update: { layout },
    create: { userId, layout },
  });

  return NextResponse.json({ layout: record.layout });
}
