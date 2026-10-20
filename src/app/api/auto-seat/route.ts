export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { db } from "@/lib/db";
import { partiesFor } from "@/lib/party";
import { readRules } from "@/lib/rules";
import { planSeating } from "@/lib/seatPlan";
import { NextResponse } from "next/server";

// POST { families: boolean, apply: boolean }
// Seats every guest who has no seat yet: parties (+1s), families (same last
// name, if asked) and "keep together" guests at one table; "keep apart" guests
// at different tables. Nobody who already has a seat is moved.
// apply: false = just show what would happen.  (login required)
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const eventId = await activeEventId();
    const [tables, guests, rules, parties] = await Promise.all([
      db.table.findMany({ where: { eventId }, include: { Seat: { orderBy: { seat: "asc" } } } }),
      db.users.findMany({ where: { eventId }, select: { id: true, firstname: true, lastname: true } }),
      readRules(eventId),
      partiesFor(eventId),
    ]);
    type T = (typeof tables)[number];
    type S = T["Seat"][number];
    const seatOf = new Map<string, string>();
    for (const t of tables as T[]) for (const s of t.Seat as S[]) if (s.isBooked && s.userId) seatOf.set(s.userId, t.id);
    const plan = planSeating(
      (guests as { id: string; firstname: string; lastname: string }[]).map((g) => ({ ...g, tableId: seatOf.get(g.id) ?? null })),
      (tables as T[]).map((t) => ({
        id: t.id,
        name: t.name,
        seats: t.Seat.length,
        free: (t.Seat as S[]).filter((s) => !s.isBooked).length,
      })),
      rules,
      parties,
      { families: body?.families !== false }
    );
    const name = new Map((guests as { id: string; firstname: string; lastname: string }[]).map((g) => [g.id, `${g.firstname} ${g.lastname}`]));
    const tName = new Map((tables as T[]).map((t) => [t.id, t.name]));
    const perTable = new Map<string, string[]>();
    for (const m of plan.moves) perTable.set(m.tableId, [...(perTable.get(m.tableId) ?? []), name.get(m.guestId)!]);

    if (body?.apply === true && plan.moves.length) {
      // the empty seats of each table, in seat order
      const emptySeats = new Map<string, string[]>();
      for (const t of tables as T[]) emptySeats.set(t.id, (t.Seat as S[]).filter((s) => !s.isBooked).map((s) => s.id));
      const updates = plan.moves.map((m) => {
        const seatId = emptySeats.get(m.tableId)!.shift()!;
        return db.seat.update({ where: { id: seatId, isBooked: false }, data: { isBooked: true, userId: m.guestId } });
      });
      await db.$transaction(updates);
    }
    return NextResponse.json({
      success: true,
      applied: body?.apply === true,
      seated: plan.moves.length,
      tables: [...perTable.entries()]
        .map(([id, names]) => ({ table: tName.get(id)!, names }))
        .sort((a, b) => a.table.localeCompare(b.table, undefined, { numeric: true })),
      groups: plan.groups,
      notSeated: plan.notSeated.map((id) => name.get(id)!),
    });
  } catch (e) {
    console.error("auto-seat", e);
    return NextResponse.json({ success: false, message: "Could not seat the guests. Nothing was changed." }, { status: 500 });
  }
}
