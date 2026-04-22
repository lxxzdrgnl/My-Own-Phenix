import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const auth = await requireAuth(_req);
  if (auth instanceof NextResponse) return auth;
  const { runId } = await params;

  try {
    const runRows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT id, datasetId, evalNames FROM DatasetRun WHERE id = ${runId}
    `;
    if (!runRows.length) return NextResponse.json({ error: "not found" }, { status: 404 });
    const run = runRows[0];

    const dsRows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT id, name, headers FROM Dataset WHERE id = ${run.datasetId}
    `;
    if (!dsRows.length) return NextResponse.json({ error: "dataset not found" }, { status: 404 });
    const dataset = dsRows[0];

    const headers: string[] = JSON.parse((dataset.headers as string) ?? "[]");

    // Read rows from DatasetRow table
    const datasetRows = await prisma.$queryRaw<Array<{ rowIndex: number; data: string }>>`
      SELECT rowIndex, data FROM DatasetRow WHERE datasetId = ${run.datasetId} ORDER BY rowIndex ASC
    `;
    const rows: Record<string, string>[] = datasetRows.map(r => JSON.parse(r.data));

    // Read results from DatasetRunResult table
    const resultRows = await prisma.$queryRaw<Array<{ rowIdx: number; response: string; evals: string }>>`
      SELECT rowIdx, response, evals FROM DatasetRunResult WHERE runId = ${runId} ORDER BY rowIdx ASC
    `;
    const rowResults = resultRows.map(r => ({
      rowIdx: r.rowIdx,
      response: r.response,
      evals: JSON.parse(r.evals ?? "{}") as Record<string, { label: string; score: number; explanation: string }>,
    }));

    const evalNames: string[] = JSON.parse((run.evalNames as string) ?? "[]");

    const csvHeaders = [...headers, "response"];
    for (const en of evalNames) {
      csvHeaders.push(`${en}_label`, `${en}_score`, `${en}_explanation`);
    }

    const csvRows: string[] = [csvHeaders.map(escapeCSV).join(",")];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const result = rowResults.find((r) => r.rowIdx === i);
      const cells: string[] = headers.map((h) => row[h] ?? "");
      cells.push(result?.response ?? "");
      for (const en of evalNames) {
        const ev = result?.evals?.[en];
        cells.push(ev?.label ?? "", String(ev?.score ?? ""), ev?.explanation ?? "");
      }
      csvRows.push(cells.map(escapeCSV).join(","));
    }

    const csv = csvRows.join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${dataset.name}-run-${runId.slice(0, 8)}.csv"`,
      },
    });
  } catch (e) {
    console.error("[export GET] error:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
