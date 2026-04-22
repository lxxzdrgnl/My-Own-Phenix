import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";

const PHOENIX = process.env.PHOENIX_URL ?? "http://localhost:6006";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { spanId, name, label, score, explanation } = (await req.json()) as {
    spanId: string;
    name: string;
    label: string;
    score: number;
    explanation?: string;
  };

  if (!spanId || !name || !label) {
    return NextResponse.json({ error: "spanId, name, and label are required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${PHOENIX}/v1/span_annotations?sync=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [{
          span_id: spanId,
          name,
          annotator_kind: "HUMAN",
          result: { label, score: score ?? 0, explanation: explanation ?? "" },
        }],
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({ error: data.detail ?? `Phoenix error ${res.status}` }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to upload annotation" },
      { status: 500 },
    );
  }
}
