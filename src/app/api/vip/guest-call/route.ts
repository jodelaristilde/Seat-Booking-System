export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { brandOf } from "@/lib/brand";
import { isOpenForGuests } from "@/lib/guestAccess";
import { addVipCall, vipCalls } from "@/lib/vip";
import { NextResponse } from "next/server";

// POST { event, guestId, kind: "server" | "bottle" }  (public: the guest's phone)
// Only for a seated guest of an open Nightclub VIP event. The same table can't
// call for the same thing again while the last call is still waiting.
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const kind = b?.kind === "bottle" ? "bottle" : b?.kind === "server" ? "server" : null;
  if (typeof b?.event !== "string" || typeof b?.guestId !== "string" || !kind)
    return NextResponse.json({ success: false }, { status: 400 });
  const g = await db.users.findFirst({
    where: { id: b.guestId, eventId: b.event },
    select: { firstname: true, lastname: true, seat: { where: { isBooked: true }, select: { tableId: true } } },
  });
  const tableId = g?.seat?.[0]?.tableId;
  if (!g || !tableId) return NextResponse.json({ success: false, message: "No table found" }, { status: 404 });
  if ((await brandOf(b.event)) !== "vip" || !(await isOpenForGuests(b.event)))
    return NextResponse.json({ success: false, message: "Not available" }, { status: 403 });
  const waiting = (await vipCalls(b.event)).some((c) => !c.done && c.tableId === tableId && c.kind === kind);
  if (!waiting) await addVipCall(b.event, { tableId, kind, guest: `${g.firstname} ${g.lastname}`.trim() });
  return NextResponse.json({ success: true, already: waiting });
}
