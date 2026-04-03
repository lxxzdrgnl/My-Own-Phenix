import { NextRequest, NextResponse } from "next/server";

const PHOENIX = process.env.PHOENIX_URL ?? "http://localhost:6006";

function buildPhoenixUrl(req: NextRequest): string {
  // Use raw search string to preserve repeated params like span_ids
  const raw = req.nextUrl.search; // e.g. ?path=/v1/foo&span_ids=a&span_ids=b
  const match = raw.match(/[?&]path=([^&]*)/);
  const path = match ? decodeURIComponent(match[1]) : "/v1/prompts";

  // Remove path= param, keep everything else
  const remaining = raw
    .replace(/[?&]path=[^&]*/, "")
    .replace(/^\?/, "")
    .replace(/^&/, "");

  return remaining ? `${PHOENIX}${path}?${remaining}` : `${PHOENIX}${path}`;
}

export async function POST(req: NextRequest) {
  const url = buildPhoenixUrl(req);
  const body = await req.text();

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(10000),
  });

  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(req: NextRequest) {
  const url = buildPhoenixUrl(req);

  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function DELETE(req: NextRequest) {
  const url = buildPhoenixUrl(req);

  const res = await fetch(url, {
    method: "DELETE",
    signal: AbortSignal.timeout(10000),
  });

  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
