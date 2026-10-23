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

// May this logged-in account manage (reset / delete) that account?
// admin: anyone but itself; a regular user: only check-in staff they created.
export async function mayManage(session: { user?: { id?: string; email?: string | null } } | null, targetId: string) {
  if (!session?.user?.id) return false;
  if (session.user.email === "admin") return true;
  if ((await roleOf(session.user.id)) === "staff") return false;
  return (await staffOwnedBy(session.user.id)).has(targetId) && (await roleOf(targetId)) === "staff";
}
