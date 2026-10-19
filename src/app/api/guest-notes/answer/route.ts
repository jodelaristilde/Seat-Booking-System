export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { setDeskAnswer } from "@/lib/guestNotes";
import { logEntries } from "@/lib/history";
import { db } from "@/lib/db";
import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

// POST { id, text }  The desk's answer (required) when it gives a guest with a
// note their seat: "Zelle", "Check", "Cash", "None" or anything typed.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, 200) : "";
    if (typeof body?.id !== "string" || !text)
      return NextResponse.json({ success: false, message: "Please write a note" }, { status: 400 });
    const eventId = await activeEventId();
    const guest = await db.users.findFirst({ where: { id: body.id, eventId }, select: { id: true } });
    if (!guest) return NextResponse.json({ success: false, message: "Guest not found" }, { status: 404 });
    const token = await getToken({ req });
    const by = (token?.name as string) || (token?.email as string) || "desk";
    await setDeskAnswer(eventId, guest.id, { text, by, at: new Date().toISOString() });
    const g = await db.users.findUnique({ where: { id: guest.id }, select: { firstname: true, lastname: true } });
    await logEntries(eventId, [
      { at: new Date().toISOString(), by, action: "desk-note", guest: `${g?.firstname ?? ""} ${g?.lastname ?? ""}`.trim(), detail: text },
    ]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Desk answer:", error);
    return NextResponse.json({ success: false, message: "Could not save" }, { status: 500 });
  }
}
