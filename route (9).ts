export const dynamic = "force-dynamic";

import { authOptions } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    const allUnits = await db.seat.findMany({
      include: {
        table: true,
        user: true,
      },
    });

    if (allUnits.length > 0) {
      // People who are not logged in (client view) only get seat status,
      // never guest names.
      const data = session
        ? allUnits
        : allUnits.map((seat) => ({ ...seat, user: null, userId: null }));

      return NextResponse.json({
        success: true,
        data,
      });
    } else {
      return NextResponse.json({
        success: false,
        message: "No units found",
      });
    }
  } catch (e) {
    return NextResponse.json({
      success: false,
      message: `Something went wrong! Please try again ${e}`,
    });
  }
}
