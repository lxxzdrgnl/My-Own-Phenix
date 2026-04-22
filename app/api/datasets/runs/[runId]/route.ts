import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

// GET — returns run metadata + results from DatasetRunResult table
export async function GET(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const auth = await requireAuth(_req);
  if (auth instanceof NextResponse) return auth;
  const { runId } = await params;
  try {
    const runRows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT id, datasetId, agentSource, evalNames, status, createdAt
      FROM DatasetRun WHERE id = ${runId}
    `;
    if (!runRows.length) return NextResponse.json({ error: "not found" }, { status: 404 });
    const run = runRows[0];

    // Read results from DatasetRunResult table
    const results = await prisma.$queryRaw<Array<{ rowIdx: number; response: string; query: string; evals: string }>>`
      SELECT rowIdx, response, query, evals FROM DatasetRunResult
      WHERE runId = ${runId} ORDER BY rowIdx ASC
    `;

    const rowResults = results.map(r => ({
      rowIdx: r.rowIdx,
      response: r.response,
      query: r.query,
      evals: JSON.parse(r.evals ?? "{}"),
    }));

    return NextResponse.json({
      ...run,
      evalNames: JSON.parse((run.evalNames as string) ?? "[]"),
      rowResults,
    });
  } catch (e) {
    console.error("[runs/[runId] GET] error:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

// PUT — update run status, evalNames, and/or upsert results
export async function PUT(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { runId } = await params;
  const body = await req.json();

  try {
    // Update run metadata
    const setParts: string[] = [];
    const values: unknown[] = [];
    if (body.status !== undefined) { setParts.push(`status = ?`); values.push(body.status); }
    if (body.evalNames !== undefined) { setParts.push(`evalNames = ?`); values.push(JSON.stringify(body.evalNames)); }

    if (setParts.length > 0) {
      values.push(runId);
      await prisma.$executeRawUnsafe(
        `UPDATE DatasetRun SET ${setParts.join(", ")} WHERE id = ?`,
        ...values
      );
    }

    // Upsert row results into DatasetRunResult
    if (body.rowResults !== undefined && Array.isArray(body.rowResults)) {
      const results: Array<{ rowIdx: number; response: string; query?: string; evals: Record<string, unknown> }> = body.rowResults;

      // Delete existing results for this run, then batch-insert new ones
      await prisma.$executeRaw`DELETE FROM DatasetRunResult WHERE runId = ${runId}`;

      const BATCH_SIZE = 500;
      for (let i = 0; i < results.length; i += BATCH_SIZE) {
        const chunk = results.slice(i, i + BATCH_SIZE);
        const sqlValues = chunk.map((r) => {
          const id = `rr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${r.rowIdx}`;
          const response = (r.response ?? "").replace(/'/g, "''");
          const query = (r.query ?? "").replace(/'/g, "''");
          const evals = JSON.stringify(r.evals ?? {}).replace(/'/g, "''");
          return `('${id}', '${runId}', ${r.rowIdx}, '${response}', '${query}', '${evals}')`;
        }).join(",");
        await prisma.$executeRawUnsafe(
          `INSERT INTO DatasetRunResult (id, runId, rowIdx, response, query, evals) VALUES ${sqlValues}`
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[runs/[runId] PUT] error:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const auth = await requireAuth(_req);
  if (auth instanceof NextResponse) return auth;
  const { runId } = await params;
  try {
    await prisma.$executeRaw`DELETE FROM DatasetRunResult WHERE runId = ${runId}`;
    await prisma.$executeRaw`DELETE FROM DatasetRun WHERE id = ${runId}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[runs/[runId] DELETE] error:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
