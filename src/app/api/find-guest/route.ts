export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { matches, matchesAny } from "@/lib/fold";
import { heldKeys } from "@/lib/guestNotes";
import { generalQrEventIds, isOpenForGuests } from "@/lib/guestAccess";

// Used by the public "find my seat" page.
// Returns at most 5 matches and needs at least 2 letters,
// so nobody can download the whole guest list from here.
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const q = params.get("q")?.trim() ?? "";
    // all=1: the general QR code (no event chosen) searches every event and
    // says which event each match belongs to
    const all = params.get("all") === "1";
    if (q.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Only events open to guests: a past event (or one closed by hand) can't be
    // searched, so a guest from last week's party can't find a seat this week.
    let where: { eventId: string } | { eventId: { in: string[] } };
    if (all) {
      // the general QR code: every event that is open right now
      where = { eventId: { in: [...(await generalQrEventIds())] } };
    } else {
      // an event's own QR code (?event=…), else this phone's remembered event
      const asked = params.get("event");
      const eventId = asked || (await activeEventId());
      if (!(await isOpenForGuests(eventId))) {
        return NextResponse.json({ success: true, data: [], closed: true });
      }
      where = { eventId };
    }
    // Match names while ignoring accents ("nadege" finds "Nadège"): compare
    // the names here, then load the (at most 5) matches
    const names = await db.users.findMany({
      where,
      select: { id: true, firstname: true, lastname: true },
    });
    const full = (g: { firstname: string; lastname: string }) => `${g.firstname} ${g.lastname}`;
    let hits = names.filter((g: { firstname: string; lastname: string }) => matches(full(g), q.slice(0, 80)));
    // nothing for every word (a name said out loud and half misheard): any word
    if (!hits.length && q.trim().includes(" "))
      hits = names.filter((g: { firstname: string; lastname: string }) => matchesAny(full(g), q.slice(0, 80)));
    const ids = hits.slice(0, 5).map((g: { id: string }) => g.id);
    const guests = await db.users.findMany({
      where: { id: { in: ids } },
      include: {
        seat: {
          include: {
            table: true,
          },
        },
      },
      take: 5,
    });

    // Add each guest's event name (shown when matches come from different events)
    const evIds = [...new Set(guests.map((g: { eventId: string | null }) => g.eventId).filter(Boolean))] as string[];
    const events = evIds.length
      ? await db.event.findMany({ where: { id: { in: evIds } }, select: { id: true, name: true } })
      : [];
    const nameOf = new Map(events.map((e: { id: string; name: string }) => [e.id, e.name] as const));
    // Guests with a note are sent to the welcome desk: their seat is hidden
    // until the desk checks them in
    const held = await heldKeys();
    const data = guests.map((g: { id: string; eventId: string | null; seat: { isReceived: boolean }[] }) => {
      const hold = held.has(`${g.eventId}:${g.id}`) && !g.seat?.some((s) => s.isReceived);
      return {
        ...g,
        ...(hold ? { seat: [] } : {}),
        eventName: g.eventId ? nameOf.get(g.eventId) ?? null : null,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: `Search failed ${error}` },
      { status: 500 }
    );
  }
}
