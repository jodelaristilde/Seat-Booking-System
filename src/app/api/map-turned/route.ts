import { db } from "@/lib/db";
import { activeEventId } from "@/lib/event";
import { NextResponse } from "next/server";
import { isTurned, mapTurnedKey } from "@/lib/mapTurned";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ success: true, turned: await isTurned(await activeEventId()) });
}

// PUT { turned: true | false }
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const value = body?.turned === true ? "on" : "off";
    const key = mapTurnedKey(await activeEventId());
    await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
    return NextResponse.json({ success: true, turned: value === "on" });
  } catch (error) {
    console.error("Map turned save:", error);
    return NextResponse.json({ success: false, message: "Could not save" }, { status: 500 });
  }
}
