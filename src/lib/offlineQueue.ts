"use client";

// Check-ins made while the internet is down are kept on this computer and
// sent as soon as it comes back. Each one keeps the time it really happened.
export type Pending = { seatId: string; isReceived: boolean; at: string };
const KEY = "seating4u-pending-checkins";

export function readPending(): Pending[] {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
export function writePending(list: Pending[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage not available */
  }
}
export function addPending(items: Pending[]) {
  // the latest action per seat wins
  const map = new Map(readPending().map((p) => [p.seatId, p]));
  for (const p of items) map.set(p.seatId, p);
  const list = [...map.values()];
  writePending(list);
  return list;
}
// A failed request that looks like "no connection" (not a server refusal)
export function isOffline(err: unknown) {
  return (typeof navigator !== "undefined" && navigator.onLine === false) || err instanceof TypeError;
}
