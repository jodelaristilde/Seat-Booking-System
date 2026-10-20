export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// How many guests a table at this venue really holds ("capacity:<eventId>").
// Set from the floor plan ("Up to 13 guests", or the chairs drawn) or by hand.
// GET -> { capacity: number | null }   PUT { capacity }  (login required)
export async function GET() {
  const row = await db.setting.findUnique({ where: { key: `capacity:${await activeEventId()}` } });
  const n = row ? Number(row.value) : NaN;
  return NextResponse.json({ success: true, capacity: Number.isFinite(n) && n > 0 ? n : null });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const key = `capacity:${await activeEventId()}`;
  const n = Math.round(Number(body?.capacity));
  if (!body?.capacity) {
    await db.setting.deleteMany({ where: { key } });
    return NextResponse.json({ success: true, capacity: null });
  }
  if (!Number.isFinite(n) || n < 1 || n > 40)
    return NextResponse.json({ success: false, message: "Use a number from 1 to 40" }, { status: 400 });
  await db.setting.upsert({ where: { key }, update: { value: String(n) }, create: { key, value: String(n) } });
  return NextResponse.json({ success: true, capacity: n });
}
