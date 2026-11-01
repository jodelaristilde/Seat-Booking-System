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
      table: { select: { id: true, name: true, posX: true, posY: true, sizeW: true, sizeH: true, shape: true, eventId: true } },
    },
  });
  const t = seat?.table;
  if (!t) return NextResponse.json({ success: false, message: "Seat not found" }, { status: 404 });
  const ev = t.eventId
    ? await db.event.findUnique({ where: { id: t.eventId }, select: { entrances: true } })
    : null;
  const entrances = Array.isArray(ev?.entrances) ? (ev!.entrances as { x: number; y: number; dir?: number }[]) : [];

  // What the way must go around: the other tables, and the stage, bar... of
  // a room drawn in the room builder (only where they are, no names)
  const obstacles: { x: number; y: number; w: number | null; h: number | null; round: boolean; fixed?: boolean }[] = [];
  if (t.eventId) {
    const others = await db.table.findMany({
      where: { eventId: t.eventId, NOT: [{ posX: null }, { id: t.id }] },
      select: { name: true, posX: true, posY: true, sizeW: true, sizeH: true, shape: true },
    });
    for (const o of others as { name: string; posX: number | null; posY: number | null; sizeW: number | null; sizeH: number | null; shape: string | null }[]) {
      if (o.posX == null || o.posY == null) continue;
      obstacles.push({ x: o.posX, y: o.posY, w: o.sizeW, h: o.sizeH, round: (o.shape ?? "round") !== "rectangle" });
    }
    const room = await db.setting.findUnique({ where: { key: `room:${t.eventId}` } });
    try {
      const items = room ? (JSON.parse(room.value)?.items as { kind: string; x: number; y: number; w: number; h: number }[]) : [];
      const solid = new Set(["stage", "head", "bar", "buffet", "dj", "cake", "gifts", "photo", "restroom", "kitchen"]);
      for (const it of items ?? [])
        if (solid.has(it.kind) && [it.x, it.y, it.w, it.h].every(Number.isFinite))
          obstacles.push({ x: it.x, y: it.y, w: it.w, h: it.h, round: false, fixed: true });
    } catch {
      /* no room drawn */
    }
  }
  return NextResponse.json({
    success: true,
    eventId: t.eventId,
    table: { name: t.name, x: t.posX, y: t.posY, w: t.sizeW, h: t.sizeH, shape: t.shape },
    entrances,
    obstacles,
  });
}
