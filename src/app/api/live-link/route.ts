export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { liveToken } from "@/lib/liveLink";
import { NextResponse } from "next/server";

// GET -> the client live-view link of the open event; POST -> a new link (the old one stops working)
// (login required; not for check-in staff)
export async function GET(req: Request) {
  const t = await liveToken(await activeEventId());
  return NextResponse.json({ success: true, link: `${new URL(req.url).origin}/live?t=${encodeURIComponent(t)}` });
}
export async function POST(req: Request) {
  const t = await liveToken(await activeEventId(), true);
  return NextResponse.json({ success: true, link: `${new URL(req.url).origin}/live?t=${encodeURIComponent(t)}` });
}
