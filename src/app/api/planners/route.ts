export const dynamic = "force-dynamic";

import { authOptions } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { staffIds } from "@/lib/roles";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

// GET -> every event planner with their events, guests, helpers and last
// login (admin only). Also the check-in staff, with whose team they are on.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.email !== "admin") return NextResponse.json({ success: false }, { status: 403 });
  const [users, staff, settings, events] = await Promise.all([
    db.user.findMany({ select: { id: true, email: true, name: true, createdAt: true } }),
    staffIds(),
    db.setting.findMany({
      where: { OR: [{ key: { startsWith: "evowner:" } }, { key: { startsWith: "staffowner:" } }, { key: { startsWith: "lastlogin:" } }] },
    }),
    db.event.findMany({ select: { id: true, name: true, date: true } }),
  ]);
  type U = { id: string; email: string; name: string | null; createdAt: Date };
  type S = { key: string; value: string };
  const evOwner = new Map<string, string>();
  const staffOwner = new Map<string, string>();
  const last = new Map<string, string>();
  for (const s of settings as S[]) {
    if (s.key.startsWith("evowner:")) evOwner.set(s.key.slice(8), s.value);
    else if (s.key.startsWith("staffowner:")) staffOwner.set(s.key.slice(11), s.value);
    else last.set(s.key.slice(10), s.value);
  }
  const counts = new Map<string, { guests: number; arrived: number }>();
  for (const e of events as { id: string }[]) {
    const [guests, arrived] = await Promise.all([
      db.users.count({ where: { eventId: e.id } }),
      db.seat.count({ where: { isReceived: true, table: { is: { eventId: e.id } } } }),
    ]);
    counts.set(e.id, { guests, arrived });
  }
  const planners = (users as U[])
    .filter((u) => u.email !== "admin" && !staff.has(u.id))
    .map((u) => {
      const evs = (events as { id: string; name: string; date: string | null }[]).filter((e) => evOwner.get(e.id) === u.id);
      return {
        id: u.id,
        name: u.name || u.email,
        email: u.email,
        created: u.createdAt,
        lastLogin: last.get(u.id) ?? null,
        events: evs.map((e) => ({ name: e.name, date: e.date, ...counts.get(e.id) })),
        guests: evs.reduce((n, e) => n + (counts.get(e.id)?.guests ?? 0), 0),
        helpers: (users as U[]).filter((h) => staff.has(h.id) && staffOwner.get(h.id) === u.id).map((h) => h.name || h.email),
      };
    })
    .sort((a, b) => (b.lastLogin ?? "").localeCompare(a.lastLogin ?? ""));
  const helpers = (users as U[])
    .filter((u) => staff.has(u.id))
    .map((u) => ({
      id: u.id,
      name: u.name || u.email,
      email: u.email,
      lastLogin: last.get(u.id) ?? null,
      team: staffOwner.get(u.id) ? (users as U[]).find((x) => x.id === staffOwner.get(u.id))?.name ?? "?" : "Admin",
    }));
  const unowned = (events as { id: string }[]).filter((e) => !evOwner.get(e.id)).length;
  return NextResponse.json({ success: true, planners, helpers, adminEvents: unowned });
}
