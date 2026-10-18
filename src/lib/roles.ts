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
