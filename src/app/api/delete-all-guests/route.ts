import { activeEventId } from "@/lib/event";
import { saveSnapshot } from "@/lib/snapshot";
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Deletes every guest of the open event (the tables and the floor plan stay),
// so the planner can import a clean list. It can be undone.
export async function DELETE() {
  try {
    const eventId = await activeEventId();
    await saveSnapshot(eventId, "Delete all guests");
    // free their seats first, then delete the guests
    await prisma.seat.updateMany({
      where: { user: { is: { eventId } } },
      data: { userId: null, isBooked: false, isReceived: false },
    });
    const { count } = await prisma.users.deleteMany({ where: { eventId } });
    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error("Error deleting all guests:", error);
    return NextResponse.json({ success: false, message: "Could not delete the guests" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
