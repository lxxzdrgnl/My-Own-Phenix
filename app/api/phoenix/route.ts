import { NextRequest, NextResponse } from "next/server";

const PHOENIX = process.env.PHOENIX_URL ?? "http://localhost:6006";

function buildPhoenixUrl(req: NextRequest): string {
  const params = new URLSearchParams(req.nextUrl.search);
  const path = params.get("path") ?? "/v1/prompts";
  params.delete("path");

  // Forward remaining query params to Phoenix
  const remaining = params.toString();
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
