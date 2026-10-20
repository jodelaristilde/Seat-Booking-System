export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { money, saveVipTable, text, vipTable, type VipTable } from "@/lib/vip";
import { NextResponse } from "next/server";

// PUT { tableId, minimum?, server?, promoter?, celebration? }  (full access only)
export async function PUT(req: Request) {
  const b = await req.json().catch(() => null);
  if (typeof b?.tableId !== "string") return NextResponse.json({ success: false }, { status: 400 });
  const ev = await activeEventId();
  const t: VipTable = await vipTable(ev, b.tableId);
  if ("minimum" in b) t.minimum = money(b.minimum);
  if ("server" in b) t.server = text(b.server);
  if ("promoter" in b) t.promoter = text(b.promoter);
  if ("celebration" in b)
    t.celebration =
      b.celebration && text(b.celebration.type)
        ? { type: text(b.celebration.type, 40), at: text(b.celebration.at, 5), note: text(b.celebration.note, 120), done: false }
        : null;
  await saveVipTable(ev, b.tableId, t);
  return NextResponse.json({ success: true, info: t });
}
