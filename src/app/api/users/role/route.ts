import { authOptions } from "@/lib/auth.config";
import { setStaff } from "@/lib/roles";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

// PUT { id, staff: true|false }  admin only: make an account check-in only, or give full access back
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.email !== "admin") return new NextResponse("Unauthorized", { status: 401 });
  const body = await req.json();
  if (typeof body?.id !== "string" || typeof body?.staff !== "boolean")
    return NextResponse.json({ success: false, message: "Bad request" }, { status: 400 });
  await setStaff(body.id, body.staff);
  return NextResponse.json({ success: true });
}
