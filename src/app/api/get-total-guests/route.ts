export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const guests = await db.users.count({ where: { eventId: await activeEventId() } });

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