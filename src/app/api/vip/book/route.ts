export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { db } from "@/lib/db";
import { money, saveVipTable, text, vipTable } from "@/lib/vip";
import { NextResponse } from "next/server";

// POST { tableId, host, phone?, partySize, minimum?, server?, promoter? }: book a table
//   under the host's name. The host is added to the guest list, seated at the
//   table, so the door (and the host's phone) finds them by name.
// DELETE { tableId }: free the table (the host's booking is removed).  (full access only)
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const host = text(b?.host, 60);
  if (typeof b?.tableId !== "string" || !host) return NextResponse.json({ success: false, message: "Type the host's name" }, { status: 400 });
  const ev = await activeEventId();
  const table = await db.table.findFirst({ where: { id: b.tableId, eventId: ev }, include: { Seat: { orderBy: { seat: "asc" } } } });
  if (!table) return NextResponse.json({ success: false, message: "Table not found" }, { status: 404 });
  const t = await vipTable(ev, table.id);
  const party = Math.min(100, Math.max(1, Math.round(Number(b.partySize) || 1)));

  // the host as a guest at this table (new booking, or the host's name changed)
  const parts = host.split(/\s+/);
  const firstname = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0];
  const lastname = parts.length > 1 ? parts[parts.length - 1] : "";
  let hostGuestId = t.hostGuestId;
  if (hostGuestId) {
    const g = await db.users.findUnique({ where: { id: hostGuestId } });
    if (g) await db.users.update({ where: { id: hostGuestId }, data: { firstname, lastname } });
    else hostGuestId = undefined;
  }
  if (!hostGuestId) {
    const g = await db.users.create({ data: { firstname, lastname, eventId: ev, vip: true } });
    hostGuestId = g.id;
    const free = (table.Seat as { id: string; isBooked: boolean }[]).find((s) => !s.isBooked);
    if (free) await db.seat.update({ where: { id: free.id }, data: { isBooked: true, userId: g.id } });
    else await db.seat.create({ data: { tableId: table.id, seat: table.Seat.length + 1, isBooked: true, isReceived: false, userId: g.id } });
  }
  const next = {
    ...t,
    status: "booked" as const,
    host,
    phone: text(b.phone, 30),
    partySize: party,
    arrived: Math.min(t.arrived ?? 0, party),
    ...("minimum" in b ? { minimum: money(b.minimum) } : {}),
    ...("server" in b ? { server: text(b.server) } : {}),
    ...("promoter" in b ? { promoter: text(b.promoter) } : {}),
    hostGuestId,
  };
  await saveVipTable(ev, table.id, next);
  return NextResponse.json({ success: true, info: next });
}

export async function DELETE(req: Request) {
  const b = await req.json().catch(() => null);
  if (typeof b?.tableId !== "string") return NextResponse.json({ success: false }, { status: 400 });
  const ev = await activeEventId();
  const t = await vipTable(ev, b.tableId);
  if (t.hostGuestId) {
    await db.seat.updateMany({ where: { userId: t.hostGuestId }, data: { isBooked: false, isReceived: false, userId: null } });
    await db.users.deleteMany({ where: { id: t.hostGuestId } });
  }
  await saveVipTable(ev, b.tableId, { minimum: t.minimum, server: t.server, status: "open" });
  return NextResponse.json({ success: true });
}
