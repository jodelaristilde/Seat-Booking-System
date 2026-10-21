export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { db } from "@/lib/db";
import { partyOf } from "@/lib/party";
import { NextResponse } from "next/server";

// POST { userId, tableId }: move a guest (and the people in their party) to
// another table: the first empty seats there. A full table stays full: the
// move is refused and the organizer adds a seat first.
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
    if (free.length < people.length) {
      const msg = !free.length
        ? `${table.name} is full. Add a seat to it first, then drag the guest again.`
        : `${table.name} has only ${free.length} empty seat${free.length === 1 ? "" : "s"}, but ${people.length} people are moving (the guest and their party). Add ${people.length - free.length} seat${people.length - free.length === 1 ? "" : "s"} first.`;
      return NextResponse.json({ success: false, full: true, message: msg }, { status: 409 });
    }
    await db.$transaction(async (tx: Pick<typeof db, "seat">) => {
      for (const p of people) {
        if (p.from) await tx.seat.update({ where: { id: p.from }, data: { isBooked: false, isReceived: false, userId: null } });
        const seatId = free.shift();
        await tx.seat.update({ where: { id: seatId! }, data: { isBooked: true, isReceived: p.isReceived, userId: p.userId } });
      }
    });
    return NextResponse.json({ success: true, moved: people.length, table: table.name });
  } catch (e) {
    console.error("move-guest", e);
    return NextResponse.json({ success: false, message: "Could not move the guest. Nothing was changed." }, { status: 500 });
  }
}
