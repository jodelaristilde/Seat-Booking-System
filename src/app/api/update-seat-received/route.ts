import { db } from "@/lib/db"
import { type NextRequest, NextResponse } from "next/server"

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { seatId, isReceived } = body

    // Several seats at once (a whole table arrives): { seatIds: [...], isReceived }
    if (Array.isArray(body?.seatIds)) {
      const ids = body.seatIds.filter((x: unknown): x is string => typeof x === "string").slice(0, 100)
      const r = await db.seat.updateMany({ where: { id: { in: ids }, isBooked: true }, data: { isReceived: !!isReceived } })
      return NextResponse.json({ success: true, count: r.count })
    }

    const updatedSeat = await db.seat.update({
      where: {
        id: seatId,
      },
      data: {
        isReceived: isReceived, // Changed from isRecieved to isReceived
      },
      include: {
        table: true,
        user: true,
      },
    })

    return NextResponse.json({
      success: true,
      data: updatedSeat,
    })
  } catch (error) {
    console.error("Error updating seat received status:", error)
    return NextResponse.json(
      {
        success: false,
        message: "Failed to update seat received status",
      },
      { status: 500 },
    )
  }
}

