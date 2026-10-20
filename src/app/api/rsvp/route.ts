export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { allergiesFor, setAllergy } from "@/lib/allergies";
import { isOpenForGuests } from "@/lib/guestAccess";
import { guestFromToken, rsvpsFor, setRsvp } from "@/lib/rsvp";
import { brandOf } from "@/lib/brand";
import { NextResponse } from "next/server";

// Public (guest's own link): GET ?t=…  -> name, event, current answers
//                            POST { t, coming, meal, allergy }
const MEALS = ["Chicken", "Fish", "Beef", "Veg", "Kids"];

async function load(t: string | null) {
  const id = guestFromToken(t);
  if (!id) return null;
  const g = await db.users.findUnique({ where: { id }, select: { id: true, firstname: true, lastname: true, meal: true, eventId: true } });
  if (!g?.eventId) return null;
  const ev = await db.event.findUnique({ where: { id: g.eventId }, select: { name: true, date: true } });
  return ev ? { g, ev } : null;
}

export async function GET(req: Request) {
  const x = await load(new URL(req.url).searchParams.get("t"));
  if (!x) return NextResponse.json({ success: false, message: "This link is not valid." }, { status: 404 });
  const { g, ev } = x;
  const [rs, al, open] = await Promise.all([rsvpsFor(g.eventId!), allergiesFor(g.eventId!), isOpenForGuests(g.eventId)]);
  return NextResponse.json({
    success: true,
    open,
    guest: { firstname: g.firstname, lastname: g.lastname, meal: g.meal ?? "", allergy: al[g.id] ?? "", coming: rs[g.id]?.coming ?? null },
    event: { name: ev.name, date: ev.date, brand: await brandOf(g.eventId) },
    meals: MEALS,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const x = await load(typeof body?.t === "string" ? body.t : null);
    if (!x) return NextResponse.json({ success: false, message: "This link is not valid." }, { status: 404 });
    const { g } = x;
    if (!(await isOpenForGuests(g.eventId)))
      return NextResponse.json({ success: false, message: "Replies for this event are closed." }, { status: 403 });
    const coming = body.coming === "no" ? "no" : body.coming === "yes" ? "yes" : null;
    if (!coming) return NextResponse.json({ success: false, message: "Please answer Yes or No." }, { status: 400 });
    await setRsvp(g.eventId!, g.id, coming);
    if (coming === "yes") {
      const meal = typeof body.meal === "string" ? body.meal.trim().slice(0, 40) : "";
      if (meal) await db.users.update({ where: { id: g.id }, data: { meal } });
      if (typeof body.allergy === "string") await setAllergy(g.eventId!, g.id, body.allergy);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("RSVP:", error);
    return NextResponse.json({ success: false, message: "Could not save. Please try again." }, { status: 500 });
  }
}
