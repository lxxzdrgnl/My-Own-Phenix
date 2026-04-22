import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const userId = req.nextUrl.searchParams.get("userId");
  const project = req.nextUrl.searchParams.get("project") ?? "default";
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const record = await prisma.dashboardLayout.findUnique({
    where: { userId_project: { userId, project } },
  });

  return NextResponse.json({ layout: record?.layout ?? null });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { userId, project, layout } = await req.json();

  if (!userId || !layout) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const proj = project ?? "default";

  const record = await prisma.dashboardLayout.upsert({
    where: { userId_project: { userId, project: proj } },
    update: { layout },
    create: { userId, project: proj, layout },
  });

  return NextResponse.json({ layout: record.layout });
}
