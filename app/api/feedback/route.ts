import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PHOENIX_ENDPOINT =
  process.env.PHOENIX_COLLECTOR_ENDPOINT ?? "http://localhost:6006";

async function uploadToPhoenix(
  spanId: string,
  projectName: string,
  value: string
) {
  const score = value === "up" ? 1.0 : 0.0;
  try {
    await fetch(
      `${PHOENIX_ENDPOINT}/v1/projects/${encodeURIComponent(projectName)}/span_annotations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [
            {
              span_id: spanId,
              name: "user_feedback",
              annotator_kind: "HUMAN",
              result: { score },
            },
          ],
        }),
      }
    );
  } catch {
    // fire-and-forget: ignore errors
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const messageId = searchParams.get("messageId");
  const userId = searchParams.get("userId");

  if (!messageId || !userId) {
    return NextResponse.json(
      { error: "messageId and userId are required" },
      { status: 400 }
    );
  }

  const feedback = await prisma.messageFeedback.findUnique({
    where: { messageId_userId: { messageId, userId } },
  });

  return NextResponse.json({ feedback });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { messageId, userId, value, spanId, projectName } = body as {
    messageId: string;
    userId: string;
    value: string;
    spanId?: string;
    projectName?: string;
  };

  if (!messageId || !userId || !value) {
    return NextResponse.json(
      { error: "messageId, userId, and value are required" },
      { status: 400 }
    );
  }

  const feedback = await prisma.messageFeedback.upsert({
    where: { messageId_userId: { messageId, userId } },
    create: { messageId, userId, value },
    update: { value },
  });

  if (spanId && projectName) {
    void uploadToPhoenix(spanId, projectName, value);
  }

  return NextResponse.json({ feedback });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { messageId, userId } = body as {
    messageId: string;
    userId: string;
  };

  if (!messageId || !userId) {
    return NextResponse.json(
      { error: "messageId and userId are required" },
      { status: 400 }
    );
  }

  await prisma.messageFeedback.delete({
    where: { messageId_userId: { messageId, userId } },
  });

  return NextResponse.json({ ok: true });
}
