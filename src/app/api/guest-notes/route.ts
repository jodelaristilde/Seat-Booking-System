export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { notesFor, setNote } from "@/lib/guestNotes";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// GET -> { success, data: { [guestId]: "note" } } for the open event (login required)
// PUT { id, note } or { items: [{ id, note }] }   ("" removes the note)
export async function GET() {
  try {
    return NextResponse.json({ success: true, data: await notesFor(await activeEventId()) });
  } catch (error) {
    console.error("Guest notes:", error);
    return NextResponse.json({ success: false, message: "Could not load notes" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const eventId = await activeEventId();
    const body = await req.json();
    const items: { id: string; note: string }[] = Array.isArray(body?.items) ? body.items : [{ id: body?.id, note: body?.note }];
    const clean = items
      .filter((i) => i && typeof i.id === "string")
      .slice(0, 2000)
      .map((i) => ({ id: i.id, note: typeof i.note === "string" ? i.note : "" }));
    if (!clean.length) return NextResponse.json({ success: false, message: "Guest not found" }, { status: 400 });
    const own = await db.users.findMany({ where: { id: { in: clean.map((i) => i.id) }, eventId }, select: { id: true } });
    const ok = new Set(own.map((g: { id: string }) => g.id));
    for (const i of clean) if (ok.has(i.id)) await setNote(eventId, i.id, i.note);
    return NextResponse.json({ success: true, count: ok.size });
  } catch (error) {
    console.error("Guest notes:", error);
    return NextResponse.json({ success: false, message: "Could not save the note" }, { status: 500 });
  }
}
