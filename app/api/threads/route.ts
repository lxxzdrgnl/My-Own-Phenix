import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const threads = await prisma.thread.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ threads });
}

export async function POST(req: NextRequest) {
  const { userId, langGraphThreadId, title } = await req.json();

  if (!userId || !langGraphThreadId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const thread = await prisma.thread.create({
    data: { userId, langGraphThreadId, title: title || "새 대화" },
  });

  return NextResponse.json({ thread });
}
