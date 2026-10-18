export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { allergiesFor, setAllergy } from "@/lib/allergies";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// GET  -> { success, data: { [guestId]: "Nut allergy" } } for the open event
// PUT  { id, allergy }                       one guest ("" clears it)
// PUT  { items: [{ id, allergy }, ...] }     several guests at once
// Login required (not in the middleware's public list).
export async function GET() {
  try {
    const eventId = await activeEventId();
    return NextResponse.json({ success: true, data: await allergiesFor(eventId) });
  } catch (error) {
    console.error("Allergies:", error);
    return NextResponse.json({ success: false, message: "Could not load allergies" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const eventId = await activeEventId();
    const body = await req.json();
    const items: { id: string; allergy: string }[] = Array.isArray(body?.items)
      ? body.items
      : [{ id: body?.id, allergy: body?.allergy }];
    const clean = items
      .filter((i) => i && typeof i.id === "string")
      .slice(0, 2000)
      .map((i) => ({ id: i.id, allergy: typeof i.allergy === "string" ? i.allergy : "" }));
    if (!clean.length) return NextResponse.json({ success: false, message: "Guest not found" }, { status: 400 });
    // only guests of this event
    const own = await db.users.findMany({ where: { id: { in: clean.map((i) => i.id) }, eventId }, select: { id: true } });
    const ok = new Set(own.map((g: { id: string }) => g.id));
    for (const i of clean) if (ok.has(i.id)) await setAllergy(eventId, i.id, i.allergy);
    return NextResponse.json({ success: true, count: ok.size });
  } catch (error) {
    console.error("Allergies:", error);
    return NextResponse.json({ success: false, message: "Could not save the allergy" }, { status: 500 });
  }
}
