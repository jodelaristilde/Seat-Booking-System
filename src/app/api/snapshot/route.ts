export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { restoreSnapshot, saveSnapshot, snapshotInfo } from "@/lib/snapshot";
import { NextResponse } from "next/server";

// GET -> the last saved copy of the open event { label, at } (or null)
// POST { label } -> save a copy now (before a big change)
// PUT -> undo: put the copy back
// (login required; not for check-in staff)
export async function GET() {
  return NextResponse.json({ success: true, snapshot: await snapshotInfo(await activeEventId()) });
}
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const label = typeof b?.label === "string" ? b.label.slice(0, 60) : "a big change";
  await saveSnapshot(await activeEventId(), label);
  return NextResponse.json({ success: true });
}
export async function PUT() {
  try {
    const r = await restoreSnapshot(await activeEventId());
    if (!r) return NextResponse.json({ success: false, message: "Nothing to undo" }, { status: 404 });
    return NextResponse.json({ success: true, label: r.label });
  } catch (e) {
    console.error("undo", e);
    return NextResponse.json({ success: false, message: "Could not undo. Nothing was changed." }, { status: 500 });
  }
}
