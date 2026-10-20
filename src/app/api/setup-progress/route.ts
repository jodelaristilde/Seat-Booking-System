export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// Where the open event is in its setup (for the setup steps bar).
// GET -> { event, flags, counts }   PUT { flags }  (login required)
type Flags = { noFloorPlan?: boolean; noEntrance?: boolean; checked?: boolean };

async function readFlags(eventId: string): Promise<Flags> {
  const row = await db.setting.findUnique({ where: { key: `setup:${eventId}` } });
  try {
    return row ? JSON.parse(row.value) : {};
  } catch {
    return {};
  }
}

export async function GET() {
  const eventId = await activeEventId();
  const [event, pictures, tables, guests, seated, flags, seats, freeSeats] = await Promise.all([
    db.event.findUnique({ where: { id: eventId }, select: { id: true, name: true, date: true, entrances: true } }),
    db.image.count({ where: { eventId } }),
    db.table.count({ where: { eventId } }),
    db.users.count({ where: { eventId } }),
    db.users.count({ where: { eventId, seat: { some: { isBooked: true } } } }),
    readFlags(eventId),
    db.seat.count({ where: { table: { eventId } } }),
    db.seat.count({ where: { table: { eventId }, isBooked: false } }),
  ]);
  const entrances = Array.isArray(event?.entrances) ? (event!.entrances as unknown[]).length : 0;
  return NextResponse.json({
    success: true,
    event: { id: eventId, name: event?.name ?? "", date: event?.date ?? null },
    flags,
    counts: { pictures, tables, entrances, guests, unseated: guests - seated, seats, freeSeats },
  });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const eventId = await activeEventId();
  const now = await readFlags(eventId);
  const next: Flags = { ...now };
  for (const k of ["noFloorPlan", "noEntrance", "checked"] as const) if (typeof body?.flags?.[k] === "boolean") next[k] = body.flags[k];
  const key = `setup:${eventId}`;
  await db.setting.upsert({ where: { key }, update: { value: JSON.stringify(next) }, create: { key, value: JSON.stringify(next) } });
  return NextResponse.json({ success: true, flags: next });
}
