export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { db } from "@/lib/db";
import { vipCalls, vipMenu, vipOrders, vipStaff, vipTables, type VipCall, type VipOrder } from "@/lib/vip";
import { NextResponse } from "next/server";

// GET: everything the VIP board and the bar screen show (login required)
export async function GET() {
  const ev = await activeEventId();
  const [tables, info, orders, calls, menu, staff] = await Promise.all([
    db.table.findMany({ where: { eventId: ev }, include: { Seat: { select: { isBooked: true } } } }),
    vipTables(ev),
    vipOrders(ev),
    vipCalls(ev),
    vipMenu(ev),
    vipStaff(ev),
  ]);
  const spent = new Map<string, number>();
  for (const o of orders as VipOrder[]) if (o.status !== "void") spent.set(o.tableId, (spent.get(o.tableId) ?? 0) + (o.total || 0));
  const dayAgo = new Date(Date.now() - 18 * 3600 * 1000).toISOString();
  type T = { id: string; name: string; Seat: { isBooked: boolean }[] };
  return NextResponse.json({
    success: true,
    tables: (tables as T[])
      .map((t) => ({ id: t.id, name: t.name, seats: t.Seat.length, info: info[t.id] ?? {}, spent: spent.get(t.id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    orders,
    calls: (calls as VipCall[]).filter((c) => !c.done && c.at > dayAgo),
    menu,
    staff,
  });
}
