export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// The room drawn in the room builder (stage, dance floor, bar, doors…), so it
// can be opened and changed again. Kept in the Setting table ("room:<eventId>").
// GET -> { layout }   PUT { layout }   (login required)
export async function GET() {
  const key = `room:${await activeEventId()}`;
  const row = await db.setting.findUnique({ where: { key } });
  let layout = null;
  try {
    layout = row ? JSON.parse(row.value) : null;
  } catch {
    layout = null;
  }
  return NextResponse.json({ success: true, layout });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const layout = body?.layout;
  if (!layout || typeof layout !== "object") return NextResponse.json({ success: false, message: "Nothing to save" }, { status: 400 });
  const value = JSON.stringify(layout);
  if (value.length > 200_000) return NextResponse.json({ success: false, message: "The room is too big to save" }, { status: 400 });
  const key = `room:${await activeEventId()}`;
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  return NextResponse.json({ success: true });
}
