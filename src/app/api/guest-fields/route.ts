export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { guestFields, saveGuestFields } from "@/lib/guestFields";
import { NextResponse } from "next/server";

// GET -> { fields }   PUT { fields }  (login required)
export async function GET() {
  return NextResponse.json({ success: true, fields: await guestFields(await activeEventId()) });
}

export async function PUT(req: Request) {
  const b = await req.json().catch(() => null);
  const fields = await saveGuestFields(await activeEventId(), b?.fields ?? {});
  return NextResponse.json({ success: true, fields: { ...fields, chosen: true } });
}
