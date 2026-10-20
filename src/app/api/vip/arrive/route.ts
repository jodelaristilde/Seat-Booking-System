export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { db } from "@/lib/db";
import { logEntries, whoIs } from "@/lib/history";
import { saveVipTable, vipTable } from "@/lib/vip";
import { NextResponse, type NextRequest } from "next/server";

// PUT { tableId, delta: +1 / -1 }: count people in at the door (staff allowed).
// The first person in checks the host in (the dashboard pops up their name and
// the table turns green); back to 0 undoes it.
export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const d = Math.round(Number(b?.delta));
  if (typeof b?.tableId !== "string" || !Number.isFinite(d)) return NextResponse.json({ success: false }, { status: 400 });
  const ev = await activeEventId();
  const t = await vipTable(ev, b.tableId);
  t.arrived = Math.max(0, Math.min(200, (t.arrived ?? 0) + d));
  await saveVipTable(ev, b.tableId, t);

  if (t.hostGuestId) {
    const seat = await db.seat.findFirst({
      where: { userId: t.hostGuestId, isBooked: true },
      include: { table: true, user: true },
    });
    const here = t.arrived > 0;
    if (seat && seat.isReceived !== here) {
      await db.seat.update({ where: { id: seat.id }, data: { isReceived: here } });
      await logEntries(ev, [
        {
          at: new Date().toISOString(),
          by: await whoIs(req),
          action: here ? "arrived" : "undo",
          guest: `${seat.user?.firstname ?? ""} ${seat.user?.lastname ?? ""}`.trim(),
          table: seat.table?.name,
          seatId: seat.id,
          detail: "VIP door count",
        },
      ]);
    }
  }
  return NextResponse.json({ success: true, arrived: t.arrived });
}
