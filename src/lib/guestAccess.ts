import { db } from "@/lib/db";

// Can guests (on their phones, not logged in) look up seats in this event?
//  - closed by hand ("guestclosed:<eventId>" in the Setting table), or
//  - automatically once the event's date is more than a day in the past.
// The dashboard, reports and logged-in staff are never affected.

// "2026-10-17", "10/17/2026", "Oct 17, 2026"… -> a date, or null
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const t = s.trim();
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  const us = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) return new Date(Date.UTC(+us[3] < 100 ? 2000 + +us[3] : +us[3], +us[1] - 1, +us[2]));
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

export function isPast(date: string | null | undefined, now = new Date()): boolean {
  const d = parseDate(date);
  if (!d) return false;
  // a full day of grace, so an evening event keeps working past midnight in any time zone
  return d.getTime() + 2 * 24 * 3600 * 1000 < now.getTime();
}

// Reopened by hand after its date: stays open ("guestopen:<eventId>")
export async function forcedOpenIds(): Promise<Set<string>> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: "guestopen:" } }, select: { key: true } });
  return new Set(rows.map((r: { key: string }) => r.key.slice("guestopen:".length)));
}

export async function closedEventIds(): Promise<Set<string>> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: "guestclosed:" } }, select: { key: true } });
  return new Set(rows.map((r: { key: string }) => r.key.slice("guestclosed:".length)));
}

// ids of events guests may search right now
export async function openEventIds(): Promise<Set<string>> {
  const [events, closed, forced] = await Promise.all([
    db.event.findMany({ select: { id: true, date: true } }),
    closedEventIds(),
    forcedOpenIds(),
  ]);
  return new Set(
    (events as { id: string; date: string | null }[])
      .filter((e) => !closed.has(e.id) && (!isPast(e.date) || forced.has(e.id)))
      .map((e) => e.id)
  );
}

export async function isOpenForGuests(eventId: string | null | undefined): Promise<boolean> {
  if (!eventId) return false;
  const [ev, closed, forced] = await Promise.all([
    db.event.findUnique({ where: { id: eventId }, select: { date: true } }),
    db.setting.findUnique({ where: { key: `guestclosed:${eventId}` } }),
    db.setting.findUnique({ where: { key: `guestopen:${eventId}` } }),
  ]);
  return !!ev && !closed && (!isPast(ev.date) || !!forced);
}

// Close: guests can't look up seats. Open: they can, even after the event's
// date (the organizer chose to reopen it).
export async function setGuestClosed(eventId: string, closed: boolean) {
  const key = `guestclosed:${eventId}`;
  const open = `guestopen:${eventId}`;
  if (closed) {
    await db.setting.upsert({ where: { key }, update: { value: "1" }, create: { key, value: "1" } });
    await db.setting.deleteMany({ where: { key: open } });
  } else {
    await db.setting.deleteMany({ where: { key } });
    await db.setting.upsert({ where: { key: open }, update: { value: "1" }, create: { key: open, value: "1" } });
  }
}

// What the general Seating4U QR code (no event in it) may search: open events
// that have a date (today or later), plus the organizer's main event. An old
// event with no date is never reached this way, only through its own QR code.
export async function generalQrEventIds(): Promise<Set<string>> {
  const [events, closed, forced, main] = await Promise.all([
    db.event.findMany({ select: { id: true, date: true, createdAt: true } }),
    closedEventIds(),
    forcedOpenIds(),
    db.setting.findUnique({ where: { key: "activeEvent" } }),
  ]);
  const recent = Date.now() - 60 * 24 * 3600 * 1000;
  return new Set(
    (events as { id: string; date: string | null; createdAt: Date }[])
      .filter(
        (e) =>
          !closed.has(e.id) &&
          (forced.has(e.id) ||
            (!isPast(e.date) &&
              // a date, the main event, or an event made in the last 60 days
              (parseDate(e.date) || e.id === main?.value || new Date(e.createdAt).getTime() > recent)))
      )
      .map((e) => e.id)
  );
}
