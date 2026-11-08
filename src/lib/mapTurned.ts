import { db } from "@/lib/db";

// The floor map turned around (upside down) for an event, to match the way
// the room is seen. The guests' phone map is turned the same way.
export const mapTurnedKey = (eventId: string) => `mapTurned:${eventId}`;

export async function isTurned(eventId: string) {
  const s = await db.setting.findUnique({ where: { key: mapTurnedKey(eventId) } }).catch(() => null);
  return s?.value === "on";
}
