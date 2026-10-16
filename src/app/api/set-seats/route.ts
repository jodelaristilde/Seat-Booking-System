import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// POST { seats: 10, tableIds?: string[] }
// Gives every table (or just the listed ones) exactly that many seats.
// - Missing seats are added.
// - Extra seats are removed from the end, but a seat with a guest on it is
//   never removed (that table keeps the extra seat, and is reported back).
// - Seats are then numbered 1, 2, 3... again.
// Login required (not in the middleware's public list).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const target = Math.round(Number(body?.seats));
    if (!Number.isFinite(target) || target < 1 || target > 40) {
      return NextResponse.json(
        { success: false, message: "Seats must be a number from 1 to 40" },
        { status: 400 }
      );
    }
    const ids: string[] | null = Array.isArray(body?.tableIds)
      ? body.tableIds.filter((x: unknown) => typeof x === "string")
      : null;

    const tables = await db.table.findMany({
      where: ids ? { id: { in: ids } } : undefined,
      include: { Seat: { orderBy: { seat: "asc" } } },
    });

    let changed = 0;
    const keptExtra: string[] = [];
    for (const t of tables) {
      const seats = t.Seat;
      if (seats.length === target && seats.every((s, i) => s.seat === i + 1)) continue;
      changed++;
      await db.$transaction(async (tx) => {
        let list = [...seats];
        if (list.length > target) {
          // remove empty seats, starting from the highest number
          const removable = [...list].reverse().filter((s) => !s.isBooked);
          const toRemove = removable.slice(0, list.length - target).map((s) => s.id);
          if (toRemove.length) await tx.seat.deleteMany({ where: { id: { in: toRemove } } });
          list = list.filter((s) => !toRemove.includes(s.id));
          if (list.length > target) keptExtra.push(t.name);
        }
        // number them 1, 2, 3...
        for (let i = 0; i < list.length; i++) {
          if (list[i].seat !== i + 1) {
            await tx.seat.update({ where: { id: list[i].id }, data: { seat: i + 1 } });
          }
        }
        if (list.length < target) {
          await tx.seat.createMany({
            data: Array.from({ length: target - list.length }, (_, k) => ({
              tableId: t.id,
              seat: list.length + k + 1,
              isBooked: false,
              isReceived: false,
            })),
          });
        }
      });
    }

    return NextResponse.json({ success: true, tables: tables.length, changed, keptExtra });
  } catch (error) {
    console.error("Error setting seats:", error);
    return NextResponse.json(
      { success: false, message: `Could not change the seats: ${error}` },
      { status: 500 }
    );
  }
}
