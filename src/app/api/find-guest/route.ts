export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

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

    const terms = q.split(/\s+/).filter(Boolean).slice(0, 4);

    const eventId = all ? undefined : await activeEventId();
    const guests = await db.users.findMany({
      where: {
        ...(eventId ? { eventId } : {}),
        AND: terms.map((t) => ({
          OR: [
            { firstname: { contains: t, mode: "insensitive" as const } },
            { lastname: { contains: t, mode: "insensitive" as const } },
          ],
        })),
      },
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
    const ids = [...new Set(guests.map((g: { eventId: string | null }) => g.eventId).filter(Boolean))] as string[];
    const events = ids.length
      ? await db.event.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];
    const nameOf = new Map(events.map((e: { id: string; name: string }) => [e.id, e.name] as const));
    const data = guests.map((g: { eventId: string | null }) => ({
      ...g,
      eventName: g.eventId ? nameOf.get(g.eventId) ?? null : null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: `Search failed ${error}` },
      { status: 500 }
    );
  }
}
