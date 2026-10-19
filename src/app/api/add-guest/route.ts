import { activeEventId } from "@/lib/event";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { logEntries } from "@/lib/history";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

// POST { firstname, lastname, table?, seats?, vip?, meal?, arrived? }
// Adds a guest to the open event. With "table" (a name like "Table 5", or
// just "5"), the guest is also seated there: the table is found (or made,
// with `seats` seats, 10 by default) and the guest takes the first empty seat.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const firstname = typeof body.firstname === "string" ? body.firstname.trim() : "";
    const lastname = typeof body.lastname === "string" ? body.lastname.trim() : "";

    if (!firstname || !lastname) {
      return NextResponse.json(
        { error: "First name and last name are required" },
        { status: 400 }
      );
    }

    const eventId = await activeEventId();
    // optional columns from the Excel import: VIP (yes / x / 1) and Meal
    const vipRaw = String(body.vip ?? "").trim().toLowerCase();
    const vip = body.vip === true || ["yes", "y", "x", "1", "true", "vip", "oui", "si", "wi"].includes(vipRaw);
    const meal = typeof body.meal === "string" && body.meal.trim() ? body.meal.trim().slice(0, 40) : null;
    const newGuest = await db.users.create({
      data: { firstname, lastname, eventId, vip, meal },
    });

    // Optional: seat the guest at a table straight away
    const rawTable = body.table === undefined || body.table === null ? "" : String(body.table).trim();
    let seatedAt: string | null = null;
    if (rawTable) {
      const tableName = /^\d+$/.test(rawTable) ? `Table ${Number(rawTable)}` : rawTable.slice(0, 60);
      const perTable = Math.min(40, Math.max(1, Math.round(Number(body.seats) || 10)));
      let table = await db.table.findFirst({
        where: { eventId, name: { equals: tableName, mode: "insensitive" } },
        include: { Seat: { orderBy: { seat: "asc" } } },
      });
      if (!table) {
        table = await db.table.create({
          data: {
            name: tableName,
            eventId,
            Seat: {
              create: Array.from({ length: perTable }, (_, i) => ({ seat: i + 1, isBooked: false, isReceived: false })),
            },
          },
          include: { Seat: { orderBy: { seat: "asc" } } },
        });
      }
      const free = table.Seat.find((s: { isBooked: boolean }) => !s.isBooked);
      // a last-minute guest standing at the desk can be checked in right away
      const arrived = body.arrived === true;
      if (free) {
        await db.seat.update({ where: { id: free.id }, data: { isBooked: true, userId: newGuest.id, isReceived: arrived } });
      } else {
        // table is full: add one more seat for this guest
        const next = table.Seat.reduce((m: number, s: { seat: number }) => Math.max(m, s.seat), 0) + 1;
        await db.seat.create({
          data: { tableId: table.id, seat: next, isBooked: true, isReceived: arrived, userId: newGuest.id },
        });
      }
      seatedAt = table.name;
      if (arrived) {
        const tok = await getToken({ req: request }).catch(() => null);
        await logEntries(eventId, [
          {
            at: new Date().toISOString(),
            by: (tok?.name as string) || (tok?.email as string) || "desk",
            action: "added",
            guest: `${firstname} ${lastname}`,
            table: table.name,
            detail: "last-minute guest, checked in",
          },
        ]);
      }
    }

    return NextResponse.json({ success: true, data: newGuest, seatedAt });
  } catch (error) {
    console.error("Error adding guest:", error);
    return NextResponse.json({ error: "Failed to add guest" }, { status: 500 });
  }
}
