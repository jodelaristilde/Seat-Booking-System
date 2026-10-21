export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { brandOf } from "@/lib/brand";
import { eventFromLiveToken } from "@/lib/liveLink";
import { NextResponse } from "next/server";

// GET ?t=<token>: the read-only live view (public, with a valid link only):
// tables, who sits where, who has arrived. Nothing else (no notes, meals…).
export async function GET(req: Request) {
  const eventId = await eventFromLiveToken(new URL(req.url).searchParams.get("t"));
  if (!eventId) return NextResponse.json({ success: false, message: "This link is not valid anymore. Ask the organizer for a new one." }, { status: 404 });
  const [ev, tables] = await Promise.all([
    db.event.findUnique({ where: { id: eventId }, select: { name: true, date: true } }),
    db.table.findMany({
      where: { eventId },
      select: { name: true, Seat: { where: { isBooked: true }, select: { isReceived: true, user: { select: { firstname: true, lastname: true, vip: true } } } } },
    }),
  ]);
  type T = { name: string; Seat: { isReceived: boolean; user: { firstname: string; lastname: string; vip: boolean } | null }[] };
  const list = (tables as T[])
    .map((t) => ({
      name: t.name,
      guests: t.Seat.filter((s) => s.user)
        .map((s) => ({ name: `${s.user!.firstname} ${s.user!.lastname}`.trim(), arrived: s.isReceived, vip: !!s.user!.vip }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((t) => t.guests.length)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const all = list.flatMap((t) => t.guests);
  return NextResponse.json({
    success: true,
    event: { name: ev?.name ?? "", date: ev?.date ?? null, brand: await brandOf(eventId) },
    tables: list,
    total: all.length,
    arrived: all.filter((g) => g.arrived).length,
    at: new Date().toISOString(),
  });
}
