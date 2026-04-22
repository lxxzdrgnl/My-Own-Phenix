import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — paginated rows from DatasetRow table
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const page = Math.max(0, parseInt(request.nextUrl.searchParams.get("page") ?? "0"));
  const pageSize = Math.min(500, Math.max(1, parseInt(request.nextUrl.searchParams.get("pageSize") ?? "50")));
  // all=1 returns every row (for generate/evaluate)
  const all = request.nextUrl.searchParams.get("all") === "1";

  try {
    // Dataset metadata
    const dsMeta = await prisma.$queryRaw<Array<Record<string, string>>>`
      SELECT headers, queryCol, contextCol, evalNames, evalOverrides, rowCount
      FROM Dataset WHERE id = ${id}
    `;
    if (!dsMeta.length) return NextResponse.json({ error: "not found" }, { status: 404 });
    const d = dsMeta[0];

    let datasetRows: Array<{ rowIndex: number; data: string }>;
    if (all) {
      datasetRows = await prisma.$queryRaw<Array<{ rowIndex: number; data: string }>>`
        SELECT rowIndex, data FROM DatasetRow WHERE datasetId = ${id} ORDER BY rowIndex ASC
      `;
    } else {
      const offset = page * pageSize;
      datasetRows = await prisma.$queryRaw<Array<{ rowIndex: number; data: string }>>`
        SELECT rowIndex, data FROM DatasetRow WHERE datasetId = ${id}
        ORDER BY rowIndex ASC LIMIT ${pageSize} OFFSET ${offset}
      `;
    }

    const totalResult = await prisma.$queryRaw<[{ c: number }]>`
      SELECT COUNT(*) as c FROM DatasetRow WHERE datasetId = ${id}
    `;
    const total = Number(totalResult[0]?.c ?? 0);

    const rows = datasetRows.map((r) => ({
      ...JSON.parse(r.data),
      _rowIndex: r.rowIndex,
    }));

    return NextResponse.json({
      rows,
      total,
      page,
      pageSize: all ? total : pageSize,
      headers: JSON.parse((d.headers as string) ?? "[]"),
      queryCol: (d.queryCol as string) ?? "",
      contextCol: (d.contextCol as string) ?? "",
      evalNames: JSON.parse((d.evalNames as string) ?? "[]"),
      evalOverrides: JSON.parse((d.evalOverrides as string) ?? "{}"),
    });
  } catch (e) {
    console.error("[datasets/rows GET] error:", e);
    return NextResponse.json({ error: "internal", rows: [], total: 0, page: 0, pageSize: 50, headers: [], queryCol: "", contextCol: "", evalNames: [], evalOverrides: {} }, { status: 500 });
  }
}

// PUT — edit a single row by rowIndex
export async function PUT(request: NextRequest) {
  const { id, rowIndex, data } = await request.json();
  if (!id || rowIndex === undefined || !data) {
    return NextResponse.json({ error: "id, rowIndex, and data required" }, { status: 400 });
  }

  try {
    const dataStr = JSON.stringify(data).replace(/'/g, "''");
    await prisma.$executeRawUnsafe(
      `UPDATE DatasetRow SET data = '${dataStr}' WHERE datasetId = ? AND rowIndex = ?`,
      id, rowIndex
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[datasets/rows PUT] error:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

// DELETE — delete row(s) by rowIndex or rowIndices (batch)
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { id, rowIndex, rowIndices } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const indices: number[] = rowIndices ?? (rowIndex !== undefined ? [rowIndex] : []);
    if (indices.length === 0) return NextResponse.json({ error: "rowIndex or rowIndices required" }, { status: 400 });

    // Delete all specified rows
    const placeholders = indices.map(() => "?").join(",");
    await prisma.$executeRawUnsafe(
      `DELETE FROM DatasetRow WHERE datasetId = ? AND rowIndex IN (${placeholders})`,
      id, ...indices
    );

    // Reindex: assign sequential rowIndex 0,1,2,... based on current order
    await prisma.$executeRawUnsafe(
      `UPDATE DatasetRow SET rowIndex = (
        SELECT COUNT(*) FROM DatasetRow AS dr2
        WHERE dr2.datasetId = DatasetRow.datasetId AND dr2.rowIndex < DatasetRow.rowIndex
      ) WHERE datasetId = ?`,
      id
    );

    // Update rowCount
    await prisma.$executeRawUnsafe(
      `UPDATE Dataset SET rowCount = (SELECT COUNT(*) FROM DatasetRow WHERE datasetId = ?), updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      id, id
    );

    return NextResponse.json({ ok: true, deleted: indices.length });
  } catch (e) {
    console.error("[datasets/rows DELETE] error:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

// POST — append rows
export async function POST(request: NextRequest) {
  const { id, rows: newRows } = await request.json();
  if (!id || !newRows) return NextResponse.json({ error: "id and rows required" }, { status: 400 });

  try {
    const maxResult = await prisma.$queryRaw<[{ m: number | null }]>`
      SELECT MAX(rowIndex) as m FROM DatasetRow WHERE datasetId = ${id}
    `;
    let nextIndex = (maxResult[0]?.m ?? -1) + 1;

    const BATCH_SIZE = 500;
    for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
      const chunk = newRows.slice(i, i + BATCH_SIZE);
      const values = chunk.map((row: Record<string, string>, j: number) => {
        const rowId = `dr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${nextIndex + i + j}`;
        return `('${rowId}', '${id}', ${nextIndex + i + j}, '${JSON.stringify(row).replace(/'/g, "''")}')`
      }).join(",");
      await prisma.$executeRawUnsafe(`INSERT INTO DatasetRow (id, datasetId, rowIndex, data) VALUES ${values}`);
    }

    await prisma.$executeRawUnsafe(
      `UPDATE Dataset SET rowCount = (SELECT COUNT(*) FROM DatasetRow WHERE datasetId = ?), updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      id, id
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[datasets/rows POST] error:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
