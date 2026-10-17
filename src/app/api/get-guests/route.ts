export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const eventId = await activeEventId();
    const guests = await db.users.findMany({
      where: { eventId },
      include: {
        seat: {
          include: {
            table: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      data: guests
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: `Failed to fetch guests ${error}`,
      },
      { status: 500 }
    );
  }
}