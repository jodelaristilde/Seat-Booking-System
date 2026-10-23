export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { saveSnapshot } from "@/lib/snapshot";
import { db } from "@/lib/db";
import { partiesFor } from "@/lib/party";
import { readRules } from "@/lib/rules";
import { planSeating } from "@/lib/seatPlan";
import { NextResponse } from "next/server";

// POST { families: boolean, apply: boolean }
// Seats every guest who has no seat yet: parties (+1s), families (same last
// name, if asked) and "keep together" guests at one table; "keep apart" guests
// at different tables. Nobody who already has a seat is moved.
// apply: false = just show what would happen.
// addTables: { seats } = add as many new tables (with that many seats) as
// needed so everyone gets a seat.  (login required)
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
    const planGuests = (guests as { id: string; firstname: string; lastname: string }[]).map((g) => ({ ...g, tableId: seatOf.get(g.id) ?? null }));
    const planTables = (tables as T[]).map((t) => ({
      id: t.id,
      name: t.name,
      seats: t.Seat.length,
      free: (t.Seat as S[]).filter((s) => !s.isBooked).length,
    }));
    const opts = { families: body?.families !== false };
    let plan = planSeating(planGuests, planTables, rules, parties, opts);

    // Not enough room: add new tables ("Table 5", "Table 6"...) until everyone fits
    const per = Math.round(Number(body?.addTables?.seats));
    const added: { id: string; name: string; seats: number }[] = [];
    if (plan.notSeated.length && Number.isFinite(per) && per >= 1 && per <= 40) {
      const used = new Set(
        (tables as T[]).map((t) => t.name.match(/^\s*table\s*#?\s*(\d+)\s*$/i)?.[1]).filter(Boolean).map(Number)
      );
      const nextName = () => {
        let n = 1;
        while (used.has(n)) n++;
        used.add(n);
        return `Table ${n}`;
      };
      let k = Math.ceil(plan.notSeated.length / per);
      for (let tries = 0; tries < 60; tries++) {
        while (added.length < k) added.push({ id: `new${added.length}`, name: nextName(), seats: per });
        plan = planSeating(planGuests, [...planTables, ...added.map((a) => ({ ...a, free: a.seats }))], rules, parties, opts);
        if (!plan.notSeated.length) break;
        k++;
      }
      // tables nobody ended up at are not needed
      const usedIds = new Set(plan.moves.map((m) => m.tableId));
      for (let i = added.length - 1; i >= 0; i--) if (!usedIds.has(added[i].id)) added.splice(i, 1);
    }
    const name = new Map((guests as { id: string; firstname: string; lastname: string }[]).map((g) => [g.id, `${g.firstname} ${g.lastname}`]));
    const tName = new Map([...(tables as T[]).map((t) => [t.id, t.name] as const), ...added.map((a) => [a.id, a.name] as const)]);
    const perTable = new Map<string, string[]>();
    for (const m of plan.moves) perTable.set(m.tableId, [...(perTable.get(m.tableId) ?? []), name.get(m.guestId)!]);

    if (body?.apply === true && plan.moves.length) {
      await saveSnapshot(eventId, "Seat everyone"); // so it can be undone
      // the empty seats of each table, in seat order
      const emptySeats = new Map<string, string[]>();
      for (const t of tables as T[]) emptySeats.set(t.id, (t.Seat as S[]).filter((s) => !s.isBooked).map((s) => s.id));
      // create the new tables first (they show on the floor plan; move them into place with Move tables)
      for (const a of added) {
        const made = await db.table.create({
          data: {
            name: a.name,
            eventId,
            Seat: { create: Array.from({ length: a.seats }, (_, i) => ({ seat: i + 1, isBooked: false, isReceived: false })) },
          },
          include: { Seat: { orderBy: { seat: "asc" } } },
        });
        emptySeats.set(a.id, (made.Seat as { id: string }[]).map((x) => x.id));
      }
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
      addedTables: added.map((a) => ({ name: a.name, seats: a.seats })),
    });
  } catch (e) {
    console.error("auto-seat", e);
    return NextResponse.json({ success: false, message: "Could not seat the guests. Nothing was changed." }, { status: 500 });
  }
}
