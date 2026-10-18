export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// The words read from the open event's floor plan picture (redrawn on top
// when the picture is stretched). Stored in the Setting table.
// GET -> { success, data: { sig, labels } | null }     PUT { sig, labels }
export async function GET() {
  try {
    const row = await db.setting.findUnique({ where: { key: `labels:${await activeEventId()}` } });
    return NextResponse.json({ success: true, data: row ? JSON.parse(row.value) : null });
  } catch (error) {
    console.error("Floor labels:", error);
    return NextResponse.json({ success: false, data: null });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    if (typeof body?.sig !== "string" || !Array.isArray(body?.labels))
      return NextResponse.json({ success: false, message: "Bad request" }, { status: 400 });
    const labels = body.labels.slice(0, 200).map((l: Record<string, unknown>) => ({
      text: String(l.text ?? "").slice(0, 60),
      x: Number(l.x) || 0,
      y: Number(l.y) || 0,
      w: Number(l.w) || 0,
      h: Number(l.h) || 0,
      bg: /^#[0-9a-f]{6}$/i.test(String(l.bg)) ? l.bg : "#ffffff",
      fg: /^#[0-9a-f]{6}$/i.test(String(l.fg)) ? l.fg : "#222222",
    }));
    const key = `labels:${await activeEventId()}`;
    const value = JSON.stringify({ sig: body.sig, labels });
    await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Floor labels:", error);
    return NextResponse.json({ success: false, message: "Could not save" }, { status: 500 });
  }
}
