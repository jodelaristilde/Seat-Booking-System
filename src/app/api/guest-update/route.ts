import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { activeEventId } from "@/lib/event";

// PUT { id, vip?, meal? }  - mark a guest VIP, or set their meal choice
// PUT { id, firstname, lastname } - fix the spelling of a guest's name
// PUT { ids: [...], vip }   - mark several guests VIP at once (a whole table)
// Login required (not in the middleware's public list).
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    if (Array.isArray(body?.ids) && typeof body.vip === "boolean") {
      const ids = body.ids.filter((x: unknown): x is string => typeof x === "string").slice(0, 200);
      if (!ids.length) return NextResponse.json({ success: false, message: "No guests" }, { status: 400 });
      const r = await db.users.updateMany({ where: { id: { in: ids }, eventId: await activeEventId() }, data: { vip: body.vip } });
      return NextResponse.json({ success: true, count: r.count });
    }
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ success: false, message: "Guest not found" }, { status: 400 });
    // only a guest of the event you have open
    const eventId = await activeEventId();
    const mine = await db.users.findFirst({ where: { id, eventId }, select: { id: true } });
    if (!mine) return NextResponse.json({ success: false, message: "Guest not found" }, { status: 404 });
    const data: { vip?: boolean; meal?: string | null; firstname?: string; lastname?: string } = {};
    if (typeof body.firstname === "string" || typeof body.lastname === "string") {
      const first = String(body.firstname ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
      const last = String(body.lastname ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
      if (!first && !last) return NextResponse.json({ success: false, message: "Type the guest's name" }, { status: 400 });
      data.firstname = first;
      data.lastname = last;
    }
    if (typeof body.vip === "boolean") data.vip = body.vip;
    if (typeof body.meal === "string" || body.meal === null) {
      const m = typeof body.meal === "string" ? body.meal.trim().slice(0, 40) : "";
      data.meal = m || null;
    }
    const guest = await db.users.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: guest });
  } catch (error) {
    console.error("Guest update:", error);
    return NextResponse.json({ success: false, message: "Could not update the guest" }, { status: 500 });
  }
}
