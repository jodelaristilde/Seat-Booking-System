import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { eventVisible, ownerForNew, setEventOwner, viewerScope } from "@/lib/eventAccess";

// Which event a request is about.
//
// Several events can run at the same time: each computer (and each guest's
// phone, from that event's QR code) remembers its event in a cookie.
// Without the cookie, the default event is used (the first one).
//
// The first time, a default event is created and everything that existed
// before is put into it, so nothing is lost.
export const EVENT_COOKIE = "seating4u_event";

let defaultCache: { id: string; at: number } | null = null;
const known = new Map<string, number>(); // event ids seen recently

async function defaultEventId(): Promise<string> {
  if (defaultCache && Date.now() - defaultCache.at < 10_000) return defaultCache.id;
  const setting = await db.setting.findUnique({ where: { key: "activeEvent" } });
  let id = setting?.value;
  if (id && !(await db.event.findUnique({ where: { id } }))) id = undefined;
  if (!id) {
    const first =
      (await db.event.findFirst({ orderBy: { createdAt: "asc" } })) ??
      (await db.event.create({ data: { name: "My event" } }));
    id = first.id;
    await db.setting.upsert({
      where: { key: "activeEvent" },
      update: { value: id },
      create: { key: "activeEvent", value: id },
    });
  }
  // Anything without an event (from before events existed) joins the default
  await Promise.all([
    db.table.updateMany({ where: { eventId: null }, data: { eventId: id } }),
    db.users.updateMany({ where: { eventId: null }, data: { eventId: id } }),
    db.image.updateMany({ where: { eventId: null }, data: { eventId: id } }),
  ]);
  defaultCache = { id, at: Date.now() };
  return id;
}

export async function eventExists(id: string): Promise<boolean> {
  const seen = known.get(id);
  if (seen && Date.now() - seen < 10_000) return true;
  const ok = !!(await db.event.findUnique({ where: { id } }));
  if (ok) known.set(id, Date.now());
  return ok;
}

export async function activeEventId(): Promise<string> {
  const fallback = await defaultEventId();
  let chosen: string | undefined;
  try {
    chosen = (await cookies()).get(EVENT_COOKIE)?.value;
  } catch {
    chosen = undefined;
  }
  // A logged-in user (not the admin) only ever works in their own events
  const scope = await viewerScope();
  if (scope && !scope.admin) {
    if (chosen && (await eventExists(chosen)) && (await eventVisible(scope, chosen))) return chosen;
    if (await eventVisible(scope, fallback)) return fallback;
    const all = await db.event.findMany({ orderBy: { createdAt: "asc" }, select: { id: true } });
    for (const e of all as { id: string }[]) if (await eventVisible(scope, e.id)) return e.id;
    // a brand-new user: their first event
    const owner = ownerForNew(scope);
    const ev = await db.event.create({ data: { name: "My event" } });
    if (owner) await setEventOwner(ev.id, owner);
    known.set(ev.id, Date.now());
    return ev.id;
  }
  if (chosen && (await eventExists(chosen))) return chosen;
  return fallback;
}

// The default event (used by devices that haven't picked one)
export async function setDefaultEvent(id: string) {
  await db.setting.upsert({
    where: { key: "activeEvent" },
    update: { value: id },
    create: { key: "activeEvent", value: id },
  });
  defaultCache = null;
}
