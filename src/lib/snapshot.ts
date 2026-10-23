import { db } from "@/lib/db";

// Undo for big changes (Delete all tables, Import guests, Seat everyone):
// just before one, the open event's tables, seats and guests are copied into
// the Setting table ("snapshot:<eventId>"). Undo puts them back exactly
// (same ids, so meals, notes, allergies and parties still match).

type SeatRow = { id: string; tableId: string; seat: number; isBooked: boolean; isReceived: boolean; userId: string | null };
type TableRow = {
  id: string; name: string; notes: string | null; posX: number | null; posY: number | null; shape: string;
  sizeW: number | null; sizeH: number | null; eventId: string | null; Seat: SeatRow[];
};
type GuestRow = { id: string; firstname: string; lastname: string; eventId: string | null; vip: boolean; meal: string | null };
type Snap = { label: string; at: string; tables: TableRow[]; guests: GuestRow[] };

const key = (eventId: string) => `snapshot:${eventId}`;

export async function saveSnapshot(eventId: string, label: string) {
  const [tables, guests] = await Promise.all([
    db.table.findMany({ where: { eventId }, include: { Seat: true } }),
    db.users.findMany({ where: { eventId } }),
  ]);
  const value = JSON.stringify({ label, at: new Date().toISOString(), tables, guests } satisfies Snap);
  await db.setting.upsert({ where: { key: key(eventId) }, update: { value }, create: { key: key(eventId), value } });
}

export async function snapshotInfo(eventId: string): Promise<{ label: string; at: string } | null> {
  const row = await db.setting.findUnique({ where: { key: key(eventId) } });
  if (!row) return null;
  try {
    const s = JSON.parse(row.value) as Snap;
    return { label: s.label, at: s.at };
  } catch {
    return null;
  }
}

export async function restoreSnapshot(eventId: string): Promise<{ label: string } | null> {
  const row = await db.setting.findUnique({ where: { key: key(eventId) } });
  if (!row) return null;
  const s = JSON.parse(row.value) as Snap;
  await db.$transaction(async (tx: typeof db) => {
    await tx.seat.deleteMany({ where: { table: { is: { eventId } } } });
    await tx.seat.updateMany({ where: { user: { is: { eventId } } }, data: { userId: null, isBooked: false, isReceived: false } });
    await tx.table.deleteMany({ where: { eventId } });
    await tx.users.deleteMany({ where: { eventId } });
    if (s.guests.length)
      await tx.users.createMany({
        data: s.guests.map((g) => ({ id: g.id, firstname: g.firstname, lastname: g.lastname, eventId: g.eventId, vip: g.vip, meal: g.meal })),
      });
    for (const t of s.tables) {
      await tx.table.create({
        data: {
          id: t.id, name: t.name, notes: t.notes, posX: t.posX, posY: t.posY, shape: t.shape, sizeW: t.sizeW, sizeH: t.sizeH, eventId: t.eventId,
        },
      });
      if (t.Seat.length)
        await tx.seat.createMany({
          data: t.Seat.map((x) => ({ id: x.id, tableId: t.id, seat: x.seat, isBooked: x.isBooked, isReceived: x.isReceived, userId: x.userId })),
        });
    }
  }, { timeout: 60_000 });
  await db.setting.delete({ where: { key: key(eventId) } });
  return { label: s.label };
}
