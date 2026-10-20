export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { db } from "@/lib/db";
import { whoIs } from "@/lib/history";
import { addVipOrder, money, setVipOrderStatus, text } from "@/lib/vip";
import { NextResponse, type NextRequest } from "next/server";

// POST { tableId, items: [{ name, qty, price }] }: a bottle order (staff allowed)
// PUT { key, status: "served" | "void" | "new" }  (staff allowed)
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const ev = await activeEventId();
  if (typeof b?.tableId !== "string" || !(await db.table.findFirst({ where: { id: b.tableId, eventId: ev } })))
    return NextResponse.json({ success: false, message: "Table not found" }, { status: 400 });
  const items = (Array.isArray(b.items) ? b.items : [])
    .map((i: { name?: unknown; qty?: unknown; price?: unknown }) => ({
      name: text(i?.name, 60),
      qty: Math.min(50, Math.max(1, Math.round(Number(i?.qty) || 1))),
      price: money(i?.price),
    }))
    .filter((i: { name: string }) => i.name)
    .slice(0, 20);
  if (!items.length) return NextResponse.json({ success: false, message: "Pick at least one bottle" }, { status: 400 });
  const total = items.reduce((n: number, i: { qty: number; price: number }) => n + i.qty * i.price, 0);
  const key = await addVipOrder(ev, { tableId: b.tableId, items, total: money(total), by: await whoIs(req) });
  return NextResponse.json({ success: true, key, total });
}

export async function PUT(req: Request) {
  const b = await req.json().catch(() => null);
  if (typeof b?.key !== "string" || !["served", "void", "new"].includes(b?.status)) return NextResponse.json({ success: false }, { status: 400 });
  const ok = await setVipOrderStatus(await activeEventId(), b.key, b.status);
  return NextResponse.json({ success: ok }, { status: ok ? 200 : 404 });
}
