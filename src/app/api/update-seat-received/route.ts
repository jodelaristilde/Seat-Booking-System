import { db } from "@/lib/db"
import { type NextRequest, NextResponse } from "next/server"
import { clientTime, logEntries, whoIs } from "@/lib/history"

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { seatId, isReceived } = body

    // Several seats at once (a whole table arrives): { seatIds: [...], isReceived }
    if (Array.isArray(body?.seatIds)) {
      const ids = body.seatIds.filter((x: unknown): x is string => typeof x === "string").slice(0, 100)
      const before = await db.seat.findMany({ where: { id: { in: ids }, isBooked: true }, include: { table: true, user: true } })
      const r = await db.seat.updateMany({ where: { id: { in: ids }, isBooked: true }, data: { isReceived: !!isReceived } })
      const by = await whoIs(req)
      const at = clientTime(body.at)
      await logEntries(
        before[0]?.table?.eventId,
        before
          .filter((s: { isReceived: boolean }) => s.isReceived !== !!isReceived)
          .map((s: { id: string; user: { firstname: string; lastname: string } | null; table: { name: string } }) => ({
            at,
            by,
            action: isReceived ? ("arrived" as const) : ("undo" as const),
            guest: `${s.user?.firstname ?? ""} ${s.user?.lastname ?? ""}`.trim(),
            table: s.table?.name,
            seatId: s.id,
            detail: isReceived ? "whole table / group" : undefined,
          }))
      )
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

    await logEntries(updatedSeat.table?.eventId, [
      {
        at: clientTime(body.at),
        by: await whoIs(req),
        action: isReceived ? "arrived" : "undo",
        guest: `${updatedSeat.user?.firstname ?? ""} ${updatedSeat.user?.lastname ?? ""}`.trim(),
        table: updatedSeat.table?.name,
        seatId: updatedSeat.id,
      },
    ])

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

