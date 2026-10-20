export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { closeVipCall } from "@/lib/vip";
import { NextResponse } from "next/server";

// PUT { key }: a guest's call has been handled (staff allowed)
export async function PUT(req: Request) {
  const b = await req.json().catch(() => null);
  if (typeof b?.key !== "string") return NextResponse.json({ success: false }, { status: 400 });
  const ok = await closeVipCall(await activeEventId(), b.key);
  return NextResponse.json({ success: ok }, { status: ok ? 200 : 404 });
}
