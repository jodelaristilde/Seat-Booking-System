import { NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const SHAPES = ["round", "square", "rectangle"]

type Incoming = {
  name?: unknown
  x?: unknown
  y?: unknown
  shape?: unknown
  seats?: unknown
}

// POST - put tables on the floor plan.
// body: { tables: [{ name, x, y, shape, seats }] }
// - A table whose name already exists is moved there (and its shape updated).
//   Its seats and bookings are not touched.
// - A new name creates a new table with that many seats.
// - removeOthers: true deletes every table NOT in the list (new venue = new tables).
//   Guests stay in the guest list; they just lose their old seat.
// Login required (not in the middleware's public list).
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const list: Incoming[] = Array.isArray(body?.tables) ? body.tables : []

    const clamp = (n: number) => Math.min(100, Math.max(0, n))
    const seen = new Set<string>()
    const items = []
    for (const t of list) {
      const name = typeof t.name === "string" ? t.name.trim().slice(0, 60) : ""
      if (!name || seen.has(name.toLowerCase())) continue
      if (typeof t.x !== "number" || typeof t.y !== "number") continue
      if (!Number.isFinite(t.x) || !Number.isFinite(t.y)) continue
      seen.add(name.toLowerCase())
      const seats =
        typeof t.seats === "number" && Number.isFinite(t.seats)
          ? Math.min(20, Math.max(1, Math.round(t.seats)))
          : 10
      const shape =
        typeof t.shape === "string" && SHAPES.includes(t.shape) ? t.shape : "round"
      items.push({ name, x: clamp(t.x), y: clamp(t.y), shape, seats })
    }

    if (items.length === 0) {
      return NextResponse.json(
        { success: false, message: "No tables to save" },
        { status: 400 }
      )
    }

    const existing = await prisma.table.findMany({ select: { id: true, name: true } })
    const byName = new Map(existing.map((t: { id: string; name: string }) => [t.name.trim().toLowerCase(), t.id] as const))

    let removed = 0
    if (body?.removeOthers === true) {
      const keep = new Set(items.map((it) => it.name.toLowerCase()))
      const goneIds = existing
        .filter((t: { id: string; name: string }) => !keep.has(t.name.trim().toLowerCase()))
        .map((t: { id: string }) => t.id)
      if (goneIds.length) {
        await prisma.$transaction([
          prisma.seat.deleteMany({ where: { tableId: { in: goneIds } } }),
          prisma.table.deleteMany({ where: { id: { in: goneIds } } }),
        ])
        removed = goneIds.length
      }
    }

    let created = 0
    let moved = 0
    for (const it of items) {
      const id = byName.get(it.name.toLowerCase())
      if (id) {
        await prisma.table.update({
          where: { id },
          data: { posX: it.x, posY: it.y, shape: it.shape },
        })
        moved++
      } else {
        await prisma.table.create({
          data: {
            name: it.name,
            posX: it.x,
            posY: it.y,
            shape: it.shape,
            Seat: {
              create: Array.from({ length: it.seats }, (_, i) => ({
                seat: i + 1,
                isBooked: false,
                isReceived: false,
              })),
            },
          },
        })
        created++
      }
    }

    return NextResponse.json({ success: true, created, moved, removed })
  } catch (error) {
    console.error("Error applying floor plan:", error)
    return NextResponse.json(
      { success: false, message: "Failed to save the tables" },
      { status: 500 }
    )
  }
}
