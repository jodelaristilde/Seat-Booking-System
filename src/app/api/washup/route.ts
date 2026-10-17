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