import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/feedback/stats?project=X
 *
 * Returns:
 * - totalResponses: assistant messages in project
 * - totalFeedback: messages with any feedback
 * - downCount: messages with "down" feedback
 */
export async function GET(request: NextRequest) {
  const project = request.nextUrl.searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "project required" }, { status: 400 });
  }

  const totalResponses = await prisma.message.count({
    where: { role: "assistant", thread: { project } },
  });

  const allFeedback = await prisma.messageFeedback.findMany({
    where: { message: { role: "assistant", thread: { project } } },
    select: { value: true },
  });

  return NextResponse.json({
    totalResponses,
    totalFeedback: allFeedback.length,
    downCount: allFeedback.filter((f) => f.value === "down").length,
  });
}
