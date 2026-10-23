import { activeEventId } from "@/lib/event";
import { saveSnapshot } from "@/lib/snapshot";
import { NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function DELETE() {
  try {
    // Only the open event's tables (other events are not touched)
    const eventId = await activeEventId()
    await saveSnapshot(eventId, "Delete all tables") // so it can be undone
    await prisma.seat.deleteMany({ where: { table: { is: { eventId } } } })
    await prisma.table.deleteMany({ where: { eventId } })

    return NextResponse.json({ success: true, message: "All tables and seats deleted successfully" })
  } catch (error) {
    console.error("Error deleting all tables:", error)
    return NextResponse.json({ success: false, message: "Failed to delete all tables" }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

