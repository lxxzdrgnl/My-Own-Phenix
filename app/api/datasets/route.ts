import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const datasets = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT id, name, fileName, headers, queryCol, contextCol, rowCount, createdAt, updatedAt
      FROM Dataset ORDER BY updatedAt DESC
    `;
    return NextResponse.json({ datasets });
  } catch (e) {
    console.error("[datasets GET] error:", e);
    return NextResponse.json({ datasets: [] });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, fileName, headers, queryCol, contextCol, rows } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const id = `ds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const rowsArr: Record<string, string>[] = rows ?? [];

    // Insert Dataset record (rows column left empty — data goes to DatasetRow)
    await prisma.$executeRaw`
      INSERT INTO Dataset (id, name, fileName, headers, queryCol, contextCol, evalNames, evalOverrides, rowCount, rows, createdAt, updatedAt)
      VALUES (${id}, ${name}, ${fileName ?? ""}, ${JSON.stringify(headers ?? [])}, ${queryCol ?? ""}, ${contextCol ?? ""}, '[]', '{}', ${rowsArr.length}, '[]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;

    // Batch-insert rows into DatasetRow (500 per chunk)
    const BATCH_SIZE = 500;
    for (let i = 0; i < rowsArr.length; i += BATCH_SIZE) {
      const chunk = rowsArr.slice(i, i + BATCH_SIZE);
      const values = chunk.map((row, j) => {
        const rowId = `dr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${i + j}`;
        return `('${rowId}', '${id}', ${i + j}, '${JSON.stringify(row).replace(/'/g, "''")}')`
      }).join(",");
      await prisma.$executeRawUnsafe(`INSERT INTO DatasetRow (id, datasetId, rowIndex, data) VALUES ${values}`);
    }

    return NextResponse.json({ dataset: { id, name } }, { status: 201 });
  } catch (e) {
    console.error("[datasets POST] error:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, ...data } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const setParts: string[] = [`updatedAt = CURRENT_TIMESTAMP`];
    const values: unknown[] = [];

    if (data.name !== undefined) { setParts.push(`name = ?`); values.push(data.name); }
    if (data.queryCol !== undefined) { setParts.push(`queryCol = ?`); values.push(data.queryCol); }
    if (data.contextCol !== undefined) { setParts.push(`contextCol = ?`); values.push(data.contextCol); }
    if (data.evalNames !== undefined) { setParts.push(`evalNames = ?`); values.push(JSON.stringify(data.evalNames)); }
    if (data.evalOverrides !== undefined) { setParts.push(`evalOverrides = ?`); values.push(JSON.stringify(data.evalOverrides)); }
    if (data.headers !== undefined) { setParts.push(`headers = ?`); values.push(JSON.stringify(data.headers)); }

    // If rows are passed (legacy: add-to-dataset with empty headers), insert into DatasetRow
    if (data.rows !== undefined && Array.isArray(data.rows)) {
      const rowsArr: Record<string, string>[] = data.rows;
      // Get current max rowIndex
      const maxResult = await prisma.$queryRaw<[{ m: number | null }]>`
        SELECT MAX(rowIndex) as m FROM DatasetRow WHERE datasetId = ${id}
      `;
      let nextIndex = (maxResult[0]?.m ?? -1) + 1;

      const BATCH_SIZE = 500;
      for (let i = 0; i < rowsArr.length; i += BATCH_SIZE) {
        const chunk = rowsArr.slice(i, i + BATCH_SIZE);
        const sqlValues = chunk.map((row, j) => {
          const rowId = `dr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${nextIndex + i + j}`;
          return `('${rowId}', '${id}', ${nextIndex + i + j}, '${JSON.stringify(row).replace(/'/g, "''")}')`
        }).join(",");
        await prisma.$executeRawUnsafe(`INSERT INTO DatasetRow (id, datasetId, rowIndex, data) VALUES ${sqlValues}`);
      }

      // Update rowCount
      const countResult = await prisma.$queryRaw<[{ c: number }]>`
        SELECT COUNT(*) as c FROM DatasetRow WHERE datasetId = ${id}
      `;
      setParts.push(`rowCount = ?`);
      values.push(Number(countResult[0]?.c ?? 0));
    }

    if (setParts.length > 1) {
      values.push(id);
      await prisma.$executeRawUnsafe(
        `UPDATE Dataset SET ${setParts.join(", ")} WHERE id = ?`,
        ...values
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[datasets PUT] error:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  try {
    await prisma.$executeRaw`DELETE FROM DatasetRow WHERE datasetId = ${id}`;
    await prisma.$executeRaw`DELETE FROM DatasetRun WHERE datasetId = ${id}`;
    await prisma.$executeRaw`DELETE FROM Dataset WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[datasets DELETE] error:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
