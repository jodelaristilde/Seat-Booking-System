import { authOptions } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { roleOf } from "@/lib/roles";
import { getServerSession } from "next-auth";

// Who may see which event. Each event remembers who made it
// ("evowner:<eventId>" = user id) in the Setting table.
// - admin: every event
// - a regular user: only the events they made
// - check-in staff: the events of the user who made their login
//   (staff made by the admin, and the admin's own events: events with no owner
//   or owned by the admin)

export type Scope = { admin: true } | { admin: false; owner: string }; // owner: a user id, or "admin"

let adminIdCache: { id: string | null; at: number } | null = null;
async function adminUserId(): Promise<string | null> {
  if (adminIdCache && Date.now() - adminIdCache.at < 60_000) return adminIdCache.id;
  const u = await db.user.findUnique({ where: { email: "admin" }, select: { id: true } }).catch(() => null);
  adminIdCache = { id: u?.id ?? null, at: Date.now() };
  return adminIdCache.id;
}

export async function viewerScope(): Promise<Scope | null> {
  let session;
  try {
    session = await getServerSession(authOptions);
  } catch {
    return null;
  }
  const me = session?.user?.id;
  if (!me) return null; // not logged in (a guest's phone)
  if (session?.user?.email === "admin") return { admin: true };
  if ((await roleOf(me)) === "staff") {
    const row = await db.setting.findUnique({ where: { key: `staffowner:${me}` } });
    return { admin: false, owner: row?.value ?? "admin" };
  }
  return { admin: false, owner: me };
}

const ownerCache = new Map<string, { v: string | null; at: number }>();
export async function ownerOfEvent(eventId: string): Promise<string | null> {
  const c = ownerCache.get(eventId);
  if (c && Date.now() - c.at < 10_000) return c.v;
  const row = await db.setting.findUnique({ where: { key: `evowner:${eventId}` } });
  const v = row?.value ?? null;
  ownerCache.set(eventId, { v, at: Date.now() });
  return v;
}

export async function setEventOwner(eventId: string, ownerId: string | null) {
  const key = `evowner:${eventId}`;
  if (ownerId) await db.setting.upsert({ where: { key }, update: { value: ownerId }, create: { key, value: ownerId } });
  else await db.setting.deleteMany({ where: { key } });
  ownerCache.delete(eventId);
}

export async function eventVisible(scope: Scope | null, eventId: string): Promise<boolean> {
  if (!scope || scope.admin) return true;
  const o = await ownerOfEvent(eventId);
  if (scope.owner === "admin") return !o || o === (await adminUserId());
  return o === scope.owner;
}

// the user id a new event should belong to (null: the admin's)
export function ownerForNew(scope: Scope | null): string | null {
  if (!scope || scope.admin || scope.owner === "admin") return null;
  return scope.owner;
}
