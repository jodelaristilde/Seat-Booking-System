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

// A new user's first event. Several requests arrive together on the first
// page load: only one may create it. A Setting row ("firstevent:<user>") with a
// unique key decides who; the others wait for that event and use it.
const making = new Map<string, Promise<string>>();
function firstEventFor(owner: string | null): Promise<string> {
  const who = owner ?? "admin";
  const running = making.get(who);
  if (running) return running;
  const job = (async () => {
    const key = `firstevent:${who}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const id = `ev${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      let mine = false;
      try {
        await db.setting.create({ data: { key, value: id } });
        mine = true;
      } catch {
        mine = false; // someone else is making it
      }
      if (mine) {
        await db.event.create({ data: { id, name: "My event" } });
        if (owner) await setEventOwner(id, owner);
        known.set(id, Date.now());
        return id;
      }
      // wait for the other request's event (a few seconds at most)
      const row = await db.setting.findUnique({ where: { key } });
      const theirs = row?.value;
      for (let i = 0; theirs && i < 25; i++) {
        if (await db.event.findUnique({ where: { id: theirs } })) {
          known.set(theirs, Date.now());
          return theirs;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      // that event is gone (deleted): start over once
      await db.setting.deleteMany({ where: { key } });
    }
    const ev = await db.event.create({ data: { name: "My event" } });
    if (owner) await setEventOwner(ev.id, owner);
    return ev.id;
  })().finally(() => making.delete(who));
  making.set(who, job);
  return job;
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
    // a brand-new user: their first event (made once, even when the first
    // page load asks from several places at the same time)
    return firstEventFor(ownerForNew(scope));
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
