export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// Used by the public "find my seat" page.
// Returns at most 5 matches and needs at least 2 letters,
// so nobody can download the whole guest list from here.
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    const terms = q.split(/\s+/).filter(Boolean).slice(0, 4);

    const guests = await db.users.findMany({
      where: {
        AND: terms.map((t) => ({
          OR: [
            { firstname: { contains: t, mode: "insensitive" as const } },
            { lastname: { contains: t, mode: "insensitive" as const } },
          ],
        })),
      },
      include: {
        seat: {
          include: {
            table: true,
          },
        },
      },
      take: 5,
    });

    return NextResponse.json({ success: true, data: guests });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: `Search failed ${error}` },
      { status: 500 }
    );
  }
}
