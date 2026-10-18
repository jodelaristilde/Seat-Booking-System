import { db } from "@/lib/db";

// A note on a guest ("see the bride's mother first", "balance not paid"…).
// While a guest has a note and has not arrived, their seat is HIDDEN from
// the phone check-in (they are sent to the welcome desk), and the desk sees
// the note with "Give them their seat? Yes / No" before checking them in.
// Kept in the Setting table ("hold:<eventId>:<guestId>"): no database change.
const keyOf = (eventId: string, guestId: string) => `hold:${eventId}:${guestId}`;

export async function notesFor(eventId: string): Promise<Record<string, string>> {
  const prefix = `hold:${eventId}:`;
  const rows = await db.setting.findMany({ where: { key: { startsWith: prefix } } });
  const out: Record<string, string> = {};
  for (const r of rows as { key: string; value: string }[]) if (r.value) out[r.key.slice(prefix.length)] = r.value;
  return out;
}

export async function setNote(eventId: string, guestId: string, text: string | null | undefined) {
  const value = (text ?? "").trim().slice(0, 300);
  const key = keyOf(eventId, guestId);
  if (!value) {
    await db.setting.deleteMany({ where: { key } });
    return;
  }
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

// "eventId:guestId" of every guest with a note (all events)
export async function heldKeys(): Promise<Set<string>> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: "hold:" } }, select: { key: true } });
  return new Set(rows.map((r: { key: string }) => r.key.slice(5)));
}

// Is this guest held (has a note)?
export async function isHeld(eventId: string | null | undefined, guestId: string | null | undefined) {
  if (!eventId || !guestId) return false;
  const row = await db.setting.findUnique({ where: { key: keyOf(eventId, guestId) } });
  return !!row?.value;
}

// What the desk wrote when it said "Yes" to a guest with a note
// ("Paid by Zelle", "Cash", "None"…), with who and when.
// Kept in the Setting table ("deskres:<eventId>:<guestId>").
export type DeskAnswer = { text: string; by: string; at: string };

export async function deskAnswersFor(eventId: string): Promise<Record<string, DeskAnswer>> {
  const prefix = `deskres:${eventId}:`;
  const rows = await db.setting.findMany({ where: { key: { startsWith: prefix } } });
  const out: Record<string, DeskAnswer> = {};
  for (const r of rows as { key: string; value: string }[]) {
    try {
      out[r.key.slice(prefix.length)] = JSON.parse(r.value);
    } catch {
      /* skip a broken row */
    }
  }
  return out;
}

export async function setDeskAnswer(eventId: string, guestId: string, a: DeskAnswer) {
  const key = `deskres:${eventId}:${guestId}`;
  const value = JSON.stringify(a);
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}
