export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { db } from "@/lib/db";
import { partyOf } from "@/lib/party";
import { NextResponse } from "next/server";

// POST { userId, tableId }: move a guest (and the people in their party) to
// another table: the first empty seats there, a seat is added if it is full.
// Arrived stays arrived. (login required; not for check-in staff)
export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => null);
    if (typeof b?.userId !== "string" || typeof b?.tableId !== "string")
      return NextResponse.json({ success: false, message: "Bad request" }, { status: 400 });
    const eventId = await activeEventId();
    const table = await db.table.findFirst({ where: { id: b.tableId, eventId }, include: { Seat: { orderBy: { seat: "asc" } } } });
    if (!table) return NextResponse.json({ success: false, message: "Table not found" }, { status: 404 });
    // the guest, plus their party (+1s) if they lead one
    const ids = [b.userId, ...(await partyOf(eventId, b.userId))];
    const current = (await db.seat.findMany({ where: { userId: { in: ids }, isBooked: true }, include: { table: true } })) as {
      id: string;
      userId: string;
      isReceived: boolean;
      tableId: string;
      table: { eventId: string | null };
    }[];
    if (current.some((s) => s.table.eventId !== eventId))
      return NextResponse.json({ success: false, message: "Guest not in this event" }, { status: 400 });
    const moving = current.filter((s) => s.tableId !== table.id);
    // guests with no seat yet are seated too
    const seatedIds = new Set(current.map((s) => s.userId));
    const unseated = ids.filter((id) => !seatedIds.has(id));
    const people = [...moving.map((s) => ({ userId: s.userId, isReceived: s.isReceived, from: s.id })), ...unseated.map((id) => ({ userId: id, isReceived: false, from: null as string | null }))];
    if (!people.length) return NextResponse.json({ success: true, moved: 0, table: table.name });

    const free = (table.Seat as { id: string; isBooked: boolean; seat: number }[]).filter((s) => !s.isBooked).map((s) => s.id);
    let next = table.Seat.length;
    await db.$transaction(async (tx: Pick<typeof db, "seat">) => {
      for (const p of people) {
        if (p.from) await tx.seat.update({ where: { id: p.from }, data: { isBooked: false, isReceived: false, userId: null } });
        const seatId = free.shift();
        if (seatId) await tx.seat.update({ where: { id: seatId }, data: { isBooked: true, isReceived: p.isReceived, userId: p.userId } });
        else await tx.seat.create({ data: { tableId: table.id, seat: ++next, isBooked: true, isReceived: p.isReceived, userId: p.userId } });
      }
    });
    return NextResponse.json({ success: true, moved: people.length, table: table.name, addedSeats: Math.max(0, people.length - (table.Seat.length - (table.Seat as { isBooked: boolean }[]).filter((s) => s.isBooked).length)) });
  } catch (e) {
    console.error("move-guest", e);
    return NextResponse.json({ success: false, message: "Could not move the guest. Nothing was changed." }, { status: 500 });
  }
}
