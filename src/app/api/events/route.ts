import { db } from "@/lib/db";
import { activeEventId, setActiveEvent } from "@/lib/event";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
    await setActiveEvent(event.id);
    return NextResponse.json({ success: true, event });
  } catch (error) {
    console.error("Events POST:", error);
    return NextResponse.json({ success: false, message: "Could not create the event" }, { status: 500 });
  }
}

// PUT - open another event { id }, or rename one { id, name, date? }
export async function PUT(req: Request) {
  try {
    const body = await req.json();
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
    } else {
      await setActiveEvent(id);
    }
    return NextResponse.json({ success: true });
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
        { success: false, message: "Open another event first; the open event can't be deleted." },
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
