import { NextResponse } from "next/server"
import {db} from "@/lib/db"
import { activeEventId } from "@/lib/event"

export async function POST(req: Request) {
  try {
    const { guestIds, tableId } = await req.json()
    if (!Array.isArray(guestIds) || !guestIds.length || typeof tableId !== "string") {
      return NextResponse.json({ success: false, message: "Pick guests and a table" }, { status: 400 })
    }
    // only the table and guests of the event you have open
    const eventId = await activeEventId()
    const table = await db.table.findFirst({ where: { id: tableId, eventId }, select: { id: true } })
    const mine = await db.users.count({ where: { id: { in: guestIds }, eventId } })
    if (!table || mine !== guestIds.length) {
      return NextResponse.json({ success: false, message: "That table or guest is not in this event" }, { status: 404 })
    }

    // Get all available seats for the table
    const availableSeats = await db.seat.findMany({
      where: {
        tableId: tableId,
        isBooked: false,
      },
      orderBy: {
        seat: "asc",
      },
    })

    if (availableSeats.length < guestIds.length) {
      return NextResponse.json({ success: false, message: `Not enough empty seats at this table (${availableSeats.length} left)` }, { status: 400 })
    }

    // Assign guests to seats
    const assignments = guestIds.map((guestId: string, index: number) => {
      return db.seat.update({
        where: { id: availableSeats[index].id },
        data: {
          isBooked: true,
          userId: guestId,
        },
      })
    })

    await db.$transaction(assignments)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error assigning guests:", error)
    return NextResponse.json({ success: false, message: "Failed to assign guests" }, { status: 500 })
  }
}

