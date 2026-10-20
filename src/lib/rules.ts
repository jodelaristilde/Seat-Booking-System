import { db } from "@/lib/db";
import type { Rule } from "@/lib/seatPlan";

// Seating rules of an event, kept in the Setting table ("rules:<eventId>").
export async function readRules(eventId: string): Promise<Rule[]> {
  const row = await db.setting.findUnique({ where: { key: `rules:${eventId}` } });
  try {
    const list = row ? JSON.parse(row.value) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function writeRules(eventId: string, rules: Rule[]) {
  const key = `rules:${eventId}`;
  const value = JSON.stringify(rules);
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}
