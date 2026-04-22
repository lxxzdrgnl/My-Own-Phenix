import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const userId = req.nextUrl.searchParams.get("userId");
  const project = req.nextUrl.searchParams.get("project") || "default";
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  try {
    const threads = await prisma.thread.findMany({
      where: { userId, project },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ threads });
  } catch (e) {
    console.error("GET /api/user-threads error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { userId, langGraphThreadId, title, project } = await req.json();

  if (!userId || !langGraphThreadId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  try {
    const thread = await prisma.thread.create({
      data: { userId, langGraphThreadId, title: title || "New Chat", project: project || "default" },
    });
    return NextResponse.json({ thread });
  } catch (e) {
    console.error("POST /api/user-threads error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
