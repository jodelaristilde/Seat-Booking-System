import { db } from "@/lib/db";
import { EVENT_COOKIE } from "@/lib/event";
import { NextResponse } from "next/server";
import { brandOf } from "@/lib/brand";

export const dynamic = "force-dynamic";

// GET /api/event-info?id=...  (public)
// Used by the guest check-in page opened from an event's QR code: returns
// only the event's name and date, and makes this phone use that event.
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ success: false }, { status: 400 });
  const ev = await db.event.findUnique({ where: { id }, select: { id: true, name: true, date: true } });
  if (!ev) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });
  const res = NextResponse.json({ success: true, event: { ...ev, brand: await brandOf(ev.id) } });
  res.cookies.set(EVENT_COOKIE, ev.id, { path: "/", maxAge: 60 * 60 * 24 * 7, sameSite: "lax" });
  return res;
}
