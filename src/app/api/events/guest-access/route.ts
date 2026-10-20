export const dynamic = "force-dynamic";

import { closedEventIds, forcedOpenIds, isPast, setGuestClosed } from "@/lib/guestAccess";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// GET -> { [eventId]: { open, past, closed } }   (login required)
// PUT { id, closed }  close / reopen guest check-in for one event
export async function GET() {
  const [events, closed, forced] = await Promise.all([
    db.event.findMany({ select: { id: true, date: true } }),
    closedEventIds(),
    forcedOpenIds(),
  ]);
  const data: Record<string, { open: boolean; past: boolean; closed: boolean; date: string | null }> = {};
  for (const e of events as { id: string; date: string | null }[]) {
    const past = isPast(e.date) && !forced.has(e.id);
    data[e.id] = { open: !past && !closed.has(e.id), past, closed: closed.has(e.id), date: e.date };
  }
  return NextResponse.json({ success: true, data });
}

export async function PUT(req: Request) {
  const body = await req.json();
  if (typeof body?.id !== "string" || typeof body?.closed !== "boolean")
    return NextResponse.json({ success: false, message: "Bad request" }, { status: 400 });
  await setGuestClosed(body.id, body.closed);
  return NextResponse.json({ success: true });
}
