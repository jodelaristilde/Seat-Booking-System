import { db } from "@/lib/db";

// A guest's party: the people coming with them (+1, children), created as
// their own guests ("Jodel Aristilde +1") at the same table. Checking in the
// main guest checks in the whole party. Kept in the Setting table
// ("party:<eventId>:<mainGuestId>" = [companion ids]).
export async function setParty(eventId: string, leaderId: string, ids: string[]) {
  const key = `party:${eventId}:${leaderId}`;
  const value = JSON.stringify(ids);
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

export async function partyOf(eventId: string | null | undefined, leaderId: string | null | undefined): Promise<string[]> {
  if (!eventId || !leaderId) return [];
  const row = await db.setting.findUnique({ where: { key: `party:${eventId}:${leaderId}` } });
  try {
    return row ? (JSON.parse(row.value) as string[]) : [];
  } catch {
    return [];
  }
}

export async function partiesFor(eventId: string): Promise<Record<string, string[]>> {
  const prefix = `party:${eventId}:`;
  const rows = await db.setting.findMany({ where: { key: { startsWith: prefix } } });
  const out: Record<string, string[]> = {};
  for (const r of rows as { key: string; value: string }[]) {
    try {
      out[r.key.slice(prefix.length)] = JSON.parse(r.value);
    } catch {
      /* skip */
    }
  }
  return out;
}

// Seats of the companions of the guest sitting in this seat
export async function companionSeatIds(seatId: string): Promise<string[]> {
  const seat = await db.seat.findUnique({ where: { id: seatId }, select: { userId: true, table: { select: { eventId: true } } } });
  const ids = await partyOf(seat?.table?.eventId, seat?.userId);
  if (!ids.length) return [];
  const seats = await db.seat.findMany({ where: { userId: { in: ids }, isBooked: true }, select: { id: true } });
  return seats.map((s: { id: string }) => s.id);
}
