import { db } from "@/lib/db";

// A small list kept as JSON in one Setting row (newest first, capped).
export async function readList<T>(key: string): Promise<T[]> {
  const row = await db.setting.findUnique({ where: { key } });
  try {
    return row ? (JSON.parse(row.value) as T[]) : [];
  } catch {
    return [];
  }
}
export async function writeList<T>(key: string, list: T[], cap = 500) {
  const value = JSON.stringify(list.slice(0, cap));
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}
