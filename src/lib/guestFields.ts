import { db } from "@/lib/db";

// Which optional guest details this event uses (the Excel template only has
// those columns). First Name, Last Name and Table are always there.
export const OPTIONAL_FIELDS = ["meal", "allergy", "vip", "note", "party"] as const;
export type GuestField = (typeof OPTIONAL_FIELDS)[number];
export type GuestFields = Record<GuestField, boolean>;
export const NO_FIELDS: GuestFields = { meal: false, allergy: false, vip: false, note: false, party: false };

export async function guestFields(eventId: string): Promise<GuestFields & { chosen: boolean }> {
  const row = await db.setting.findUnique({ where: { key: `fields:${eventId}` } });
  if (!row) return { ...NO_FIELDS, chosen: false };
  try {
    return { ...NO_FIELDS, ...JSON.parse(row.value), chosen: true };
  } catch {
    return { ...NO_FIELDS, chosen: false };
  }
}

export async function saveGuestFields(eventId: string, f: Partial<GuestFields>) {
  const v: GuestFields = { ...NO_FIELDS };
  for (const k of OPTIONAL_FIELDS) v[k] = !!f[k];
  const key = `fields:${eventId}`;
  await db.setting.upsert({ where: { key }, update: { value: JSON.stringify(v) }, create: { key, value: JSON.stringify(v) } });
  return v;
}
