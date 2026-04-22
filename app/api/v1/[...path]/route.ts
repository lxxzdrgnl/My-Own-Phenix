import { NextRequest, NextResponse } from "next/server";

const PHOENIX = process.env.PHOENIX_URL ?? "http://localhost:6006";

async function proxyToPhoenix(req: NextRequest, method: string) {
  const segments = req.nextUrl.pathname.replace("/api/v1/", "/v1/");
  const search = req.nextUrl.search;
  const url = `${PHOENIX}${segments}${search}`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const options: RequestInit = { method, headers, signal: AbortSignal.timeout(15000) };

  if (method !== "GET" && method !== "HEAD") {
    options.body = await req.text();
  }

  const res = await fetch(url, options);
  const data = await res.text();

  return new NextResponse(data, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
  });
}

export async function GET(req: NextRequest) { return proxyToPhoenix(req, "GET"); }
export async function POST(req: NextRequest) { return proxyToPhoenix(req, "POST"); }
export async function PUT(req: NextRequest) { return proxyToPhoenix(req, "PUT"); }
export async function DELETE(req: NextRequest) { return proxyToPhoenix(req, "DELETE"); }
export async function PATCH(req: NextRequest) { return proxyToPhoenix(req, "PATCH"); }
