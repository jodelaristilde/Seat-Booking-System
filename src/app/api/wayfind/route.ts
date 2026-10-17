import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/wayfind?seatId=...  (public: used on the guest's phone)
// Where the guest's table is on the floor plan, and where the entrances are,
// so the phone can draw the way. No names are returned.
export async function GET(req: Request) {
  const seatId = new URL(req.url).searchParams.get("seatId") ?? "";
  if (!seatId) return NextResponse.json({ success: false }, { status: 400 });
  const seat = await db.seat.findUnique({
    where: { id: seatId },
    select: {
      table: { select: { name: true, posX: true, posY: true, sizeW: true, sizeH: true, shape: true, eventId: true } },
    },
  });
  const t = seat?.table;
  if (!t) return NextResponse.json({ success: false, message: "Seat not found" }, { status: 404 });
  const ev = t.eventId
    ? await db.event.findUnique({ where: { id: t.eventId }, select: { entrances: true } })
    : null;
  const entrances = Array.isArray(ev?.entrances) ? (ev!.entrances as { x: number; y: number }[]) : [];
  return NextResponse.json({
    success: true,
    eventId: t.eventId,
    table: { name: t.name, x: t.posX, y: t.posY, w: t.sizeW, h: t.sizeH, shape: t.shape },
    entrances,
  });
}
