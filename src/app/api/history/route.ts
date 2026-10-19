export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { readLog } from "@/lib/history";
import { NextResponse } from "next/server";

// GET -> the open event's history, newest first (login required)
export async function GET() {
  try {
    return NextResponse.json({ success: true, data: await readLog(await activeEventId()) });
  } catch (error) {
    console.error("History:", error);
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}
