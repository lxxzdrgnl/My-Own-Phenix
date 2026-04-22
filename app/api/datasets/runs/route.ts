import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const datasetId = request.nextUrl.searchParams.get("datasetId");
  if (!datasetId) return NextResponse.json({ error: "datasetId required" }, { status: 400 });

  try {
    const runs = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT id, agentSource, evalNames, status, createdAt
      FROM DatasetRun WHERE datasetId = ${datasetId}
      ORDER BY createdAt DESC
    `;
    return NextResponse.json({ runs });
  } catch (e) {
    console.error("[runs GET] error:", e);
    return NextResponse.json({ runs: [] });
  }
}

export async function POST(request: NextRequest) {
  const { datasetId, agentSource, evalNames } = await request.json();
  if (!datasetId || !agentSource) {
    return NextResponse.json({ error: "datasetId and agentSource required" }, { status: 400 });
  }

  try {
    const id = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const evalNamesJson = JSON.stringify(evalNames ?? []);
    await prisma.$executeRaw`
      INSERT INTO DatasetRun (id, datasetId, agentSource, evalNames, status, rowResults, createdAt)
      VALUES (${id}, ${datasetId}, ${agentSource}, ${evalNamesJson}, 'running', '[]', CURRENT_TIMESTAMP)
    `;
    return NextResponse.json({ run: { id, datasetId, agentSource, evalNames: evalNames ?? [], status: "running" } }, { status: 201 });
  } catch (e) {
    console.error("[runs POST] error:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
