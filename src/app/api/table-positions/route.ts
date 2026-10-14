import { NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// GET - where every table sits on the floor plan
// (login required: this route is not in the middleware's public list)
export async function GET() {
  try {
    const tables = await prisma.table.findMany({
      select: { id: true, name: true, posX: true, posY: true },
    })
    return NextResponse.json({ success: true, data: tables })
  } catch (error) {
    console.error("Error fetching table positions:", error)
    return NextResponse.json(
      { success: false, message: "Failed to load table positions" },
      { status: 500 }
    )
  }
}

// PUT - save table positions: { positions: [{ id, x, y }] }
// x and y are percents (0-100) of the floor plan's width and height
export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const positions = Array.isArray(body?.positions) ? body.positions : null

    if (!positions) {
      return NextResponse.json(
        { success: false, message: "Positions are required" },
        { status: 400 }
      )
    }

    const clamp = (n: number) => Math.min(100, Math.max(0, n))
    const valid = positions.filter(
      (p: { id?: unknown; x?: unknown; y?: unknown }) =>
        typeof p?.id === "string" &&
        typeof p?.x === "number" &&
        typeof p?.y === "number" &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y)
    ) as { id: string; x: number; y: number }[]

    await prisma.$transaction(
      valid.map((p) =>
        prisma.table.update({
          where: { id: p.id },
          data: { posX: clamp(p.x), posY: clamp(p.y) },
        })
      )
    )

    return NextResponse.json({ success: true, saved: valid.length })
  } catch (error) {
    console.error("Error saving table positions:", error)
    return NextResponse.json(
      { success: false, message: "Failed to save table positions" },
      { status: 500 }
    )
  }
}
