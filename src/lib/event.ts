import { db } from "@/lib/db";

// Which event is open right now. Everything (tables, guests, floor plan,
// phone check-in) works on the open event only.
//
// The first time, an event is created and everything that existed before
// is put into it, so nothing is lost.
let cache: { id: string; at: number } | null = null;

export async function activeEventId(): Promise<string> {
  if (cache && Date.now() - cache.at < 10_000) return cache.id;
  let setting = await db.setting.findUnique({ where: { key: "activeEvent" } });
  let id = setting?.value;
  if (id) {
    const exists = await db.event.findUnique({ where: { id } });
    if (!exists) id = undefined;
  }
  if (!id) {
    const first = (await db.event.findFirst({ orderBy: { createdAt: "asc" } })) ??
      (await db.event.create({ data: { name: "My event" } }));
    id = first.id;
    setting = await db.setting.upsert({
      where: { key: "activeEvent" },
      update: { value: id },
      create: { key: "activeEvent", value: id },
    });
  }
  // Anything without an event (from before events existed) joins this one
  await Promise.all([
    db.table.updateMany({ where: { eventId: null }, data: { eventId: id } }),
    db.users.updateMany({ where: { eventId: null }, data: { eventId: id } }),
    db.image.updateMany({ where: { eventId: null }, data: { eventId: id } }),
  ]);
  cache = { id, at: Date.now() };
  return id;
}

export async function setActiveEvent(id: string) {
  await db.setting.upsert({
    where: { key: "activeEvent" },
    update: { value: id },
    create: { key: "activeEvent", value: id },
  });
  cache = { id, at: Date.now() };
}
