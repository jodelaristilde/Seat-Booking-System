import { db } from "@/lib/db";

// Allergies are kept in the Setting table (key "allergy:<eventId>:<guestId>"),
// so no database change is needed. One row per guest: two people editing at
// the same time never overwrite each other.
const keyOf = (eventId: string, guestId: string) => `allergy:${eventId}:${guestId}`;

export async function allergiesFor(eventId: string): Promise<Record<string, string>> {
  const prefix = `allergy:${eventId}:`;
  const rows = await db.setting.findMany({ where: { key: { startsWith: prefix } } });
  const out: Record<string, string> = {};
  for (const r of rows as { key: string; value: string }[]) {
    if (r.value) out[r.key.slice(prefix.length)] = r.value;
  }
  return out;
}

export async function setAllergy(eventId: string, guestId: string, text: string | null | undefined) {
  const value = (text ?? "").trim().slice(0, 60);
  const key = keyOf(eventId, guestId);
  if (!value) {
    await db.setting.deleteMany({ where: { key } });
    return;
  }
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}
