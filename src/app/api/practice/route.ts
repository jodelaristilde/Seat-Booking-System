export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { activeEventId, EVENT_COOKIE } from "@/lib/event";
import { eventVisible, ownerForNew, setEventOwner, viewerScope } from "@/lib/eventAccess";
import { NextResponse } from "next/server";

// A practice event with sample guests, to learn without risk.
// GET -> { practice: true } when the open event is a practice event
// POST -> make one and open it
// DELETE -> delete the open practice event (only a practice event)
const KEY = (id: string) => `practice:${id}`;
const GUESTS = [
  ["Jodel", "Aristilde", true], ["Fritz", "Aristilde", false], ["Jaeden", "Aristilde", false], ["Kyla", "Aristilde", false],
  ["Marie", "Joseph", false], ["Pierre", "Joseph", false], ["Ana", "Lopez", false], ["Luis", "Lopez", false],
  ["Grace", "Miller", false], ["Tom", "Miller", false], ["Nadia", "Paul", false], ["Kevin", "Paul", false],
  ["Sarah", "Brown", false], ["David", "Brown", false], ["Emma", "Lee", false], ["Chris", "Lee", false],
] as const;
const MEALS = ["Chicken", "Fish", "Beef", "Veg"];

export async function GET() {
  const id = await activeEventId();
  const row = await db.setting.findUnique({ where: { key: KEY(id) } });
  return NextResponse.json({ success: true, practice: !!row });
}

export async function POST() {
  const scope = await viewerScope();
  const ev = await db.event.create({ data: { name: "Practice event (sample guests)" } });
  const owner = ownerForNew(scope);
  if (owner) await setEventOwner(ev.id, owner);
  await db.setting.create({ data: { key: KEY(ev.id), value: "1" } });
  // 4 round tables of 6, spread over the room
  const spots = [[25, 30], [75, 30], [25, 72], [75, 72]];
  for (let i = 0; i < 4; i++) {
    await db.table.create({
      data: {
        name: `Table ${i + 1}`, eventId: ev.id, posX: spots[i][0], posY: spots[i][1], shape: "round",
        Seat: { create: Array.from({ length: 6 }, (_, k) => ({ seat: k + 1, isBooked: false, isReceived: false })) },
      },
    });
  }
  // guests on the list, not seated yet: try "Seat everyone"
  await db.users.createMany({
    data: GUESTS.map(([f, l, vip], i) => ({ firstname: f, lastname: l, vip, meal: MEALS[i % 4], eventId: ev.id })),
  });
  const res = NextResponse.json({ success: true, id: ev.id });
  res.cookies.set(EVENT_COOKIE, ev.id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}

export async function DELETE() {
  const id = await activeEventId();
  if (!(await db.setting.findUnique({ where: { key: KEY(id) } })) || !(await eventVisible(await viewerScope(), id)))
    return NextResponse.json({ success: false, message: "Only a practice event can be deleted here." }, { status: 400 });
  await db.seat.deleteMany({ where: { table: { is: { eventId: id } } } });
  await db.seat.updateMany({ where: { user: { is: { eventId: id } } }, data: { userId: null, isBooked: false, isReceived: false } });
  await db.users.deleteMany({ where: { eventId: id } });
  await db.table.deleteMany({ where: { eventId: id } });
  await db.image.deleteMany({ where: { eventId: id } });
  await db.event.delete({ where: { id } });
  await db.setting.deleteMany({ where: { key: { in: [KEY(id), `evowner:${id}`, `snapshot:${id}`] } } });
  // back to the person's real event
  const res = NextResponse.json({ success: true });
  res.cookies.set(EVENT_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
