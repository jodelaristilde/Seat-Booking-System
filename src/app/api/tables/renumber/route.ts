export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// POST { after: 6 }: a numbered table was deleted; every table numbered higher
// moves down by one ("Table 7" -> "Table 6", "8" -> "7"...). Guests, notes and
// VIP bookings stay with their table, which just gets the new number.
// (login required; not for check-in staff)
const NUM = /^(\s*table\s*#?\s*|\s*)(\d+)\s*$/i;

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const after = Math.round(Number(b?.after));
  if (!Number.isFinite(after) || after < 0) return NextResponse.json({ success: false, message: "Bad request" }, { status: 400 });
  const eventId = await activeEventId();
  const tables = (await db.table.findMany({ where: { eventId }, select: { id: true, name: true } })) as { id: string; name: string }[];
  const used = new Set(tables.map((t) => t.name.trim().toLowerCase()));
  const moves = tables
    .map((t) => ({ t, m: t.name.match(NUM) }))
    .filter((x) => x.m && Number(x.m[2]) > after)
    .map((x) => ({ id: x.t.id, from: x.t.name, n: Number(x.m![2]), prefix: x.m![1] }))
    .sort((a, b2) => a.n - b2.n); // lowest first, so each new number is free
  let changed = 0;
  for (const mv of moves) {
    const to = `${mv.prefix.trim() ? mv.prefix.replace(/\s+$/, " ").replace(/^\s+/, "") : ""}${mv.n - 1}`.trim();
    if (used.has(to.toLowerCase())) continue; // that number is still taken: leave this one
    await db.table.update({ where: { id: mv.id }, data: { name: to } });
    used.delete(mv.from.trim().toLowerCase());
    used.add(to.toLowerCase());
    changed++;
  }
  return NextResponse.json({ success: true, changed });
}
