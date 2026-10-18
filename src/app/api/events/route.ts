import { db } from "@/lib/db";
import { activeEventId, EVENT_COOKIE } from "@/lib/event";
import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export const dynamic = "force-dynamic";

// This computer works on event `id` from now on (others are not affected)
function withEventCookie(res: NextResponse, id: string) {
  res.cookies.set(EVENT_COOKIE, id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}

// Events: each has its own floor plan, tables and guests.
// Login required (not in the middleware's public list).

// GET - all events, with which one is open
export async function GET() {
  try {
    const active = await activeEventId();
    const events = await db.event.findMany({ orderBy: { createdAt: "desc" } });
    const counts = await Promise.all(
      events.map(async (e: { id: string }) => ({
        id: e.id,
        tables: await db.table.count({ where: { eventId: e.id } }),
        guests: await db.users.count({ where: { eventId: e.id } }),
      }))
    );
    return NextResponse.json({
      success: true,
      activeId: active,
      events: events.map((e: { id: string; name: string; date: string | null; createdAt: Date }) => ({
        ...e,
        ...counts.find((c) => c.id === e.id),
      })),
    });
  } catch (error) {
    console.error("Events GET:", error);
    return NextResponse.json({ success: false, message: "Could not load events" }, { status: 500 });
  }
}

// POST - new event { name, date? }; it becomes the open event
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
    if (!name) return NextResponse.json({ success: false, message: "Please give the event a name" }, { status: 400 });
    await activeEventId(); // make sure older data is already filed under an event
    const date = typeof body?.date === "string" && body.date.trim() ? body.date.trim().slice(0, 40) : null;
    const event = await db.event.create({ data: { name, date } });
    return withEventCookie(NextResponse.json({ success: true, event }), event.id);
  } catch (error) {
    console.error("Events POST:", error);
    return NextResponse.json({ success: false, message: "Could not create the event" }, { status: 500 });
  }
}

// PUT - open another event { id }, or rename one { id, name, date? }
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    // check-in staff may open another event, but not rename one
    if (typeof body?.name === "string" && body.name.trim()) {
      const token = await getToken({ req });
      if (token?.role === "staff")
        return NextResponse.json({ success: false, message: "Check-in staff accounts can't rename events." }, { status: 403 });
    }
    const id = typeof body?.id === "string" ? body.id : "";
    const event = id ? await db.event.findUnique({ where: { id } }) : null;
    if (!event) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });
    if (typeof body.name === "string" && body.name.trim()) {
      await db.event.update({
        where: { id },
        data: {
          name: body.name.trim().slice(0, 80),
          ...(typeof body.date === "string" ? { date: body.date.trim().slice(0, 40) || null } : {}),
        },
      });
      return NextResponse.json({ success: true });
    }
    return withEventCookie(NextResponse.json({ success: true }), id);
  } catch (error) {
    console.error("Events PUT:", error);
    return NextResponse.json({ success: false, message: "Could not change the event" }, { status: 500 });
  }
}

// DELETE - remove an event and everything in it { id } (not the open one)
export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });
    if (id === (await activeEventId())) {
      return NextResponse.json(
        { success: false, message: "Open another event first; the event open on this computer can't be deleted." },
        { status: 400 }
      );
    }
    await db.seat.deleteMany({ where: { table: { is: { eventId: id } } } });
    await db.seat.updateMany({ where: { user: { is: { eventId: id } } }, data: { userId: null, isBooked: false, isReceived: false } });
    await db.users.deleteMany({ where: { eventId: id } });
    await db.table.deleteMany({ where: { eventId: id } });
    await db.image.deleteMany({ where: { eventId: id } });
    await db.event.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Events DELETE:", error);
    return NextResponse.json({ success: false, message: "Could not delete the event" }, { status: 500 });
  }
}
