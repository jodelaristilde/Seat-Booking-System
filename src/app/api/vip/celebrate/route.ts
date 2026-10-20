export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { saveVipTable, vipTable } from "@/lib/vip";
import { NextResponse } from "next/server";

// PUT { tableId, done }: the birthday / sparkler presentation is done (staff allowed)
export async function PUT(req: Request) {
  const b = await req.json().catch(() => null);
  if (typeof b?.tableId !== "string") return NextResponse.json({ success: false }, { status: 400 });
  const ev = await activeEventId();
  const t = await vipTable(ev, b.tableId);
  if (!t.celebration) return NextResponse.json({ success: false }, { status: 404 });
  t.celebration.done = b.done !== false;
  await saveVipTable(ev, b.tableId, t);
  return NextResponse.json({ success: true });
}
