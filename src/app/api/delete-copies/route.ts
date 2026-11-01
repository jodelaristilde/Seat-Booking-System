import { activeEventId } from "@/lib/event";
import { saveSnapshot } from "@/lib/snapshot";
import { db } from "@/lib/db";
import { fold } from "@/lib/fold";
import { NextResponse } from "next/server";

// The same guest list imported twice: keep one of each name (the one with a
// seat, if any) and delete the extra copies. Open event only; can be undone.
export async function POST() {
  try {
    const eventId = await activeEventId();
    const guests = await db.users.findMany({
      where: { eventId },
      select: { id: true, firstname: true, lastname: true, seat: { select: { id: true, isReceived: true } } },
      orderBy: { id: "asc" },
    });
    const groups = new Map<string, typeof guests>();
    for (const g of guests) {
      const k = fold(`${g.firstname} ${g.lastname}`);
      if (k) groups.set(k, [...(groups.get(k) ?? []), g]);
    }
    const extra: string[] = [];
    for (const l of groups.values()) {
      if (l.length < 2) continue;
      // keep: arrived first, then seated, then the first one
      const keep = [...l].sort((a, b) => score(b) - score(a))[0];
      for (const g of l) if (g.id !== keep.id) extra.push(g.id);
    }
    if (!extra.length) return NextResponse.json({ success: true, count: 0 });
    await saveSnapshot(eventId, "Delete extra copies");
    await db.$transaction([
      db.seat.updateMany({ where: { userId: { in: extra } }, data: { userId: null, isBooked: false, isReceived: false } }),
      db.users.deleteMany({ where: { id: { in: extra }, eventId } }),
    ]);
    return NextResponse.json({ success: true, count: extra.length });
  } catch (e) {
    console.error("delete-copies", e);
    return NextResponse.json({ success: false, message: "Could not delete the copies" }, { status: 500 });
  }
}

const score = (g: { seat: { isReceived: boolean }[] }) => (g.seat.some((s) => s.isReceived) ? 2 : g.seat.length ? 1 : 0);
