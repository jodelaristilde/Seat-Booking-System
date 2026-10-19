import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isHeld } from "@/lib/guestNotes"
import { isOpenForGuests } from "@/lib/guestAccess"
import { logEntries } from "@/lib/history"

export async function POST(req: Request) {
  try {
    const { seatId } = await req.json()

    if (!seatId) {
      return NextResponse.json({ success: false, message: "Missing seatId" }, { status: 400 })
    }

    const seat = await db.seat.findUnique({ where: { id: seatId }, select: { userId: true, table: { select: { eventId: true } } } })
    if (seat && !(await isOpenForGuests(seat.table?.eventId))) {
      return NextResponse.json({ success: false, message: "Guest check-in for this event is closed." }, { status: 403 })
    }
    if (seat && (await isHeld(seat.table?.eventId, seat.userId))) {
      return NextResponse.json({ success: false, message: "Please see the desk." }, { status: 403 })
    }

    const updatedSeat = await db.seat.update({
      where: { id: seatId },
      data: { isReceived: true },
      include: { table: true, user: true },
    })
    await logEntries(updatedSeat.table?.eventId, [
      {
        at: new Date().toISOString(),
        by: "Guest's phone",
        action: "arrived",
        guest: `${updatedSeat.user?.firstname ?? ""} ${updatedSeat.user?.lastname ?? ""}`.trim(),
        table: updatedSeat.table?.name,
        seatId: updatedSeat.id,
      },
    ])

    return NextResponse.json({ success: true, data: updatedSeat })
  } catch (error) {
    console.error("Error marking arrival:", error)
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 })
  }
}
