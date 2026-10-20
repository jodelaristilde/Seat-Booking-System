// A table is "over" when it has more guests than a table at this venue holds:
// the capacity set for the event, or else the usual number of seats.
export function usualSeats(seatCounts: number[]): number | null {
  if (!seatCounts.length) return null;
  const n = new Map<number, number>();
  for (const c of seatCounts) n.set(c, (n.get(c) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

export function overTables(
  tables: { name: string; seats: number; guests: number }[],
  capacity: number | null
): { name: string; guests: number; limit: number }[] {
  const limit = capacity ?? usualSeats(tables.map((t) => t.seats));
  if (!limit) return [];
  return tables.filter((t) => t.guests > limit).map((t) => ({ name: t.name, guests: t.guests, limit }));
}
