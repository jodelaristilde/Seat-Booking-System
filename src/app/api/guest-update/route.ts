import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// PUT { id, vip?, meal? }  - mark a guest VIP, or set their meal choice
// Login required (not in the middleware's public list).
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ success: false, message: "Guest not found" }, { status: 400 });
    const data: { vip?: boolean; meal?: string | null } = {};
    if (typeof body.vip === "boolean") data.vip = body.vip;
    if (typeof body.meal === "string" || body.meal === null) {
      const m = typeof body.meal === "string" ? body.meal.trim().slice(0, 40) : "";
      data.meal = m || null;
    }
    const guest = await db.users.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: guest });
  } catch (error) {
    console.error("Guest update:", error);
    return NextResponse.json({ success: false, message: "Could not update the guest" }, { status: 500 });
  }
}
