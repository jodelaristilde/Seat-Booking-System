import { db } from "@/lib/db";

// Account access, kept in the Setting table ("role:<userId>" = "staff"), so
// no database change is needed. No row = full access.
// "staff" = check-in only: can check guests in, add a last-minute guest and
// set meals / allergies / VIP, but cannot delete anything or change tables.
export type Role = "full" | "staff";

export async function roleOf(userId: string): Promise<Role> {
  try {
    const row = await db.setting.findUnique({ where: { key: `role:${userId}` } });
    return row?.value === "staff" ? "staff" : "full";
  } catch {
    return "full";
  }
}

export async function setStaff(userId: string, staff: boolean) {
  const key = `role:${userId}`;
  if (staff) await db.setting.upsert({ where: { key }, update: { value: "staff" }, create: { key, value: "staff" } });
  else await db.setting.deleteMany({ where: { key } });
}

export async function staffIds(): Promise<Set<string>> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: "role:" }, value: "staff" } });
  return new Set(rows.map((r: { key: string }) => r.key.slice(5)));
}

// Who created a check-in staff account ("staffowner:<staffId>" = owner's user
// id), so a regular user only sees and manages their own helpers.
export async function setStaffOwner(staffId: string, ownerId: string) {
  const key = `staffowner:${staffId}`;
  await db.setting.upsert({ where: { key }, update: { value: ownerId }, create: { key, value: ownerId } });
}

export async function staffOwnedBy(ownerId: string): Promise<Set<string>> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: "staffowner:" }, value: ownerId } });
  return new Set(rows.map((r: { key: string }) => r.key.slice("staffowner:".length)));
}

// The "team" an account belongs to: an organizer is their own team; a check-in
// staff login belongs to the organizer who made it (or "admin" when the admin
// made it). Everyone on a team may manage the team's check-in staff logins.
export async function teamOf(userId: string): Promise<string> {
  if ((await roleOf(userId)) !== "staff") return userId;
  const row = await db.setting.findUnique({ where: { key: `staffowner:${userId}` } });
  return row?.value ?? "admin";
}

export async function teamStaff(team: string): Promise<Set<string>> {
  if (team !== "admin") return staffOwnedBy(team);
  const [all, owned] = await Promise.all([
    staffIds(),
    db.setting.findMany({ where: { key: { startsWith: "staffowner:" } } }),
  ]);
  const has = new Set((owned as { key: string }[]).map((r) => r.key.slice("staffowner:".length)));
  return new Set([...all].filter((id) => !has.has(id)));
}

// May this logged-in account manage (reset / delete) that account?
// admin: anyone; an organizer or one of their check-in staff: the team's
// check-in staff logins (not their own login).
export async function mayManage(session: { user?: { id?: string; email?: string | null } } | null, targetId: string) {
  const me = session?.user?.id;
  if (!me) return false;
  if (session?.user?.email === "admin") return true;
  if (targetId === me) return false;
  if ((await roleOf(targetId)) !== "staff") return false;
  return (await teamStaff(await teamOf(me))).has(targetId);
}
