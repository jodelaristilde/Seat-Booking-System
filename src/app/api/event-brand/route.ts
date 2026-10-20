export const dynamic = "force-dynamic";

import { brandsFor, setBrand } from "@/lib/brand";
import { NextResponse } from "next/server";

// GET -> { brands: { [eventId]: "vip" } }   PUT { id, brand: "vip" | "seating4u" }  (login required)
export async function GET() {
  return NextResponse.json({ success: true, brands: await brandsFor() });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (typeof body?.id !== "string" || (body.brand !== "vip" && body.brand !== "seating4u"))
    return NextResponse.json({ success: false, message: "Bad request" }, { status: 400 });
  await setBrand(body.id, body.brand);
  return NextResponse.json({ success: true });
}
