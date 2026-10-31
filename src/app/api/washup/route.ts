// app/api/washup/route.ts
import { activeEventId } from "@/lib/event";
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function DELETE() {
  try {
    // Delete in correct order due to foreign key constraints
    // First delete Seats (has foreign keys to Table and Users)
    // Only the open event (other events are not touched)
    const eventId = await activeEventId();
    await prisma.seat.deleteMany({ where: { table: { is: { eventId } } } });
    await prisma.seat.updateMany({ where: { user: { is: { eventId } } }, data: { userId: null, isBooked: false, isReceived: false } });

    // Then delete Users (guests)
    await prisma.users.deleteMany({ where: { eventId } });

    // Finally delete Tables
    await prisma.table.deleteMany({ where: { eventId } });

    // The floor map, the doors, the name and date, and the setup progress too:
    // the event starts again from step 1 like a new one
    await prisma.image.deleteMany({ where: { eventId } });
    await prisma.event.update({ where: { id: eventId }, data: { name: "New event", date: null, entrances: [] } });
    await prisma.setting.deleteMany({
      where: { OR: [{ key: `setup:${eventId}` }, { key: { startsWith: `log:${eventId}:` } }, { key: `snapshot:${eventId}` }] },
    });

    return NextResponse.json(
      { message: 'All data deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting data:', error);
    return NextResponse.json(
      { error: 'Failed to delete data' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}