export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { brandOf } from "@/lib/brand";
import { eventFromLiveToken } from "@/lib/liveLink";
import { readLog } from "@/lib/history";
import { NextResponse } from "next/server";

// GET ?t=<live token>: the arrivals board for a TV at the entrance (public,
// with the private live link only). Event name, how many arrived, and the
// latest arrivals with their table. Names only: nothing else about guests.
export async function GET(req: Request) {
  const eventId = await eventFromLiveToken(new URL(req.url).searchParams.get("t"));
  if (!eventId)
    return NextResponse.json({ success: false, message: "This link is not valid anymore. Ask the organizer for a new one." }, { status: 404 });

  const [ev, seats, log] = await Promise.all([
    db.event.findUnique({ where: { id: eventId }, select: { name: true } }),
    db.seat.findMany({
      where: { isBooked: true, table: { eventId } },
      select: { id: true, isReceived: true, table: { select: { name: true } }, user: { select: { firstname: true, lastname: true, vip: true } } },
    }),
    readLog(eventId),
  ]);
  type S = { id: string; isReceived: boolean; table: { name: string }; user: { firstname: string; lastname: string; vip: boolean } | null };
  const list = (seats as S[]).filter((s) => s.user);
  const bySeat = new Map(list.map((s) => [s.id, s]));

  // newest first; an "undo" cancels the arrival logged before it
  const undone = new Set<string>();
  const recent: { id: string; name: string; table: string; vip: boolean; at: string }[] = [];
  const seen = new Set<string>();
  for (const e of log) {
    if (!e.seatId) continue;
    if (e.action === "undo") {
      if (!seen.has(e.seatId)) undone.add(e.seatId);
      continue;
    }
    if (e.action !== "arrived" || seen.has(e.seatId)) continue;
    seen.add(e.seatId);
    const s = bySeat.get(e.seatId);
    if (!s || !s.isReceived || undone.has(e.seatId)) continue;
    recent.push({
      id: `${e.seatId}:${e.at}`,
      name: `${s.user!.firstname} ${s.user!.lastname}`.trim(),
      table: s.table.name,
      vip: !!s.user!.vip,
      at: e.at,
    });
    if (recent.length >= 12) break;
  }

  return NextResponse.json({
    success: true,
    event: { name: ev?.name ?? "", brand: await brandOf(eventId) },
    total: list.length,
    arrived: list.filter((s) => s.isReceived).length,
    recent,
    at: new Date().toISOString(),
  });
}
