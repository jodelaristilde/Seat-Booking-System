// app/api/get-seat-checkin/route.ts
import { db } from "@/lib/db"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const seatId = req.nextUrl.searchParams.get("seatId")
    
    if (!seatId) {
      return NextResponse.json(
        {
          success: false,
          message: "Seat ID is required",
        },
        { status: 400 },
      )
    }
    const seat = await db.seat.findUnique({
      where: {
        id: seatId,
      },
      include: {
        table: {
          select: {
            id: true,
            name: true,
            notes: true, // Add this line
            eventId: true,
          }
        },
        user: true,
      },
    })
    if (!seat) {
      return NextResponse.json(
        {
          success: false,
          message: "Seat not found",
        },
        { status: 404 },
      )
    }
    // first names of the others at the same table (the planner can turn this off per event)
    let tablemates: string[] = []
    const off = seat.table?.eventId
      ? await db.setting.findUnique({ where: { key: `tablemates:${seat.table.eventId}` } })
      : null
    if (seat.table?.id && off?.value !== "off") {
      const others = await db.seat.findMany({
        where: { tableId: seat.table.id, isBooked: true, NOT: { id: seat.id } },
        select: { seat: true, user: { select: { firstname: true, lastname: true } } },
        orderBy: { seat: "asc" },
      })
      tablemates = (others as { user: { firstname: string; lastname: string } | null }[])
        .filter((o) => o.user)
        .map((o) => `${o.user!.firstname} ${o.user!.lastname.trim().charAt(0)}${o.user!.lastname.trim() ? "." : ""}`.trim())
        .slice(0, 14)
    }
    return NextResponse.json({
      success: true,
      data: seat,
      tablemates,
    })
  } catch (error) {
    console.error("Error fetching seat:", error)
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch seat information",
      },
      { status: 500 },
    )
  }
}