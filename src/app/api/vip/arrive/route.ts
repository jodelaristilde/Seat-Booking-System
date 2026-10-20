export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { saveVipTable, vipTable } from "@/lib/vip";
import { NextResponse } from "next/server";

// PUT { tableId, delta: +1 / -1 }: count people in at the door (staff allowed)
export async function PUT(req: Request) {
  const b = await req.json().catch(() => null);
  const d = Math.round(Number(b?.delta));
  if (typeof b?.tableId !== "string" || !Number.isFinite(d)) return NextResponse.json({ success: false }, { status: 400 });
  const ev = await activeEventId();
  const t = await vipTable(ev, b.tableId);
  t.arrived = Math.max(0, Math.min(200, (t.arrived ?? 0) + d));
  await saveVipTable(ev, b.tableId, t);
  return NextResponse.json({ success: true, arrived: t.arrived });
}
