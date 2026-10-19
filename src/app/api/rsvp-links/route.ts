export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { db } from "@/lib/db";
import { rsvpToken, rsvpsFor } from "@/lib/rsvp";
import { NextResponse } from "next/server";

// GET (login required) -> each guest of the open event with their personal RSVP link
export async function GET(req: Request) {
  const eventId = await activeEventId();
  const origin = new URL(req.url).origin;
  const [guests, rs] = await Promise.all([
    db.users.findMany({ where: { eventId }, select: { id: true, firstname: true, lastname: true } }),
    rsvpsFor(eventId),
  ]);
  const data = (guests as { id: string; firstname: string; lastname: string }[])
    .sort((a, b) => `${a.lastname} ${a.firstname}`.localeCompare(`${b.lastname} ${b.firstname}`))
    .map((g) => ({
      id: g.id,
      firstname: g.firstname,
      lastname: g.lastname,
      link: `${origin}/rsvp?t=${encodeURIComponent(rsvpToken(g.id))}`,
      rsvp: rs[g.id]?.coming ?? "",
    }));
  return NextResponse.json({ success: true, data, rsvps: rs });
}
