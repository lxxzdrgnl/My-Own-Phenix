import { NextRequest, NextResponse } from "next/server";

const PHOENIX = process.env.PHOENIX_URL ?? "http://localhost:6006";

export async function POST(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") ?? "/graphql";
  const body = await req.text();

  const res = await fetch(`${PHOENIX}${path}`, {
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
  const path = req.nextUrl.searchParams.get("path") ?? "/v1/prompts";

  const res = await fetch(`${PHOENIX}${path}`, {
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
  const path = req.nextUrl.searchParams.get("path") ?? "";

  const res = await fetch(`${PHOENIX}${path}`, {
    method: "DELETE",
    signal: AbortSignal.timeout(10000),
  });

  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
