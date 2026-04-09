import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { uid, email, name } = await req.json();

  if (!uid || !email) {
    return NextResponse.json({ error: "Missing uid or email" }, { status: 400 });
  }

  const user = await prisma.user.upsert({
    where: { id: uid },
    update: { email, name },
    create: { id: uid, email, name },
  });

  return NextResponse.json({ user });
}
