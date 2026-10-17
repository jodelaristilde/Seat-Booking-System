import { db } from "@/lib/db";
import { activeEventId } from "@/lib/event";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Pt = { x: number; y: number };
const clean = (v: unknown): Pt[] =>
  Array.isArray(v)
    ? v
        .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
        .slice(0, 6)
        .map((p) => ({ x: Math.min(100, Math.max(0, Number(p.x))), y: Math.min(100, Math.max(0, Number(p.y))) }))
    : [];

// Entrances of the event open on this computer (login required)
export async function GET() {
  const ev = await db.event.findUnique({ where: { id: await activeEventId() }, select: { entrances: true } });
  return NextResponse.json({ success: true, entrances: clean(ev?.entrances) });
}

// PUT { entrances: [{ x, y }] }  (% of the floor plan picture)
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const entrances = clean(body?.entrances);
    await db.event.update({ where: { id: await activeEventId() }, data: { entrances } });
    return NextResponse.json({ success: true, entrances });
  } catch (error) {
    console.error("Entrance save:", error);
    return NextResponse.json({ success: false, message: "Could not save the entrance" }, { status: 500 });
  }
}
