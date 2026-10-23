export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { eventFromLiveToken } from "@/lib/liveLink";
import { readLog } from "@/lib/history";
import { NextResponse } from "next/server";

// GET ?t=<live link token>: the host's after-event report (public, with the
// client's private link only): who came, when, meals served. Read-only.
export async function GET(req: Request) {
  const eventId = await eventFromLiveToken(new URL(req.url).searchParams.get("t"));
  if (!eventId) return NextResponse.json({ success: false, message: "This link is not valid anymore. Ask the organizer for a new one." }, { status: 404 });
  const [ev, tables, log] = await Promise.all([
    db.event.findUnique({ where: { id: eventId }, select: { name: true, date: true } }),
    db.table.findMany({
      where: { eventId },
      select: { name: true, Seat: { where: { isBooked: true }, select: { id: true, isReceived: true, user: { select: { firstname: true, lastname: true, vip: true, meal: true } } } } },
    }),
    readLog(eventId).catch(() => []),
  ]);
  // each guest's arrival time: their latest check-in (if not undone)
  const latest = new Map<string, { at: string; action: string }>();
  for (const e of [...log].sort((a, b) => String(a.at).localeCompare(String(b.at))))
    if (e.seatId && (e.action === "arrived" || e.action === "undo")) latest.set(e.seatId, { at: String(e.at), action: e.action });
  type S = { id: string; isReceived: boolean; user: { firstname: string; lastname: string; vip: boolean; meal: string | null } | null };
  const list = (tables as { name: string; Seat: S[] }[])
    .map((t) => ({
      name: t.name,
      guests: t.Seat.filter((s) => s.user)
        .map((s) => {
          const l = latest.get(s.id);
          return {
            name: `${s.user!.firstname} ${s.user!.lastname}`.trim(),
            vip: !!s.user!.vip,
            meal: s.user!.meal ?? "",
            came: s.isReceived,
            at: s.isReceived && l?.action === "arrived" ? l.at : null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((t) => t.guests.length)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return NextResponse.json({ success: true, event: { name: ev?.name ?? "", date: ev?.date ?? null }, tables: list });
}
