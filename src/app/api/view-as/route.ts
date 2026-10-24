export const dynamic = "force-dynamic";

import { authOptions } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { roleOf } from "@/lib/roles";
import { getServerSession } from "next-auth";
import { encode } from "next-auth/jwt";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// "View as" (admin only): see the app exactly as a planner or a check-in
// helper sees it, without their password. The admin's own login is kept aside
// and "Back to admin" puts it back.
// GET    -> { viewing: { name, role } | null }
// POST   { id } -> start viewing as that account
// DELETE -> back to admin
const STASH = "seating4u_admin_session";
const SECURE_NAME = "__Secure-next-auth.session-token";
// the login cookie's name: "__Secure-…" on https (the live site), plain on localhost
let usesSecure = process.env.NODE_ENV === "production";
const secure = () => usesSecure;
const sessionCookie = () => (usesSecure ? SECURE_NAME : "next-auth.session-token");
async function detect() {
  const jar = await cookies();
  if (jar.get(SECURE_NAME)) usesSecure = true;
  else if (jar.get("next-auth.session-token")) usesSecure = false;
}
const VIEWING = "seating4u_viewing"; // name shown in the bar (not secret)

export async function GET() {
  const jar = await cookies();
  if (!jar.get(STASH)) return NextResponse.json({ success: true, viewing: null });
  try {
    return NextResponse.json({ success: true, viewing: JSON.parse(jar.get(VIEWING)?.value ?? "null") });
  } catch {
    return NextResponse.json({ success: true, viewing: { name: "?", role: "" } });
  }
}

export async function POST(req: Request) {
  await detect();
  const session = await getServerSession(authOptions);
  if (session?.user?.email !== "admin") return NextResponse.json({ success: false, message: "Admin only" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const user = typeof b?.id === "string" ? await db.user.findUnique({ where: { id: b.id } }) : null;
  if (!user || user.email === "admin") return NextResponse.json({ success: false, message: "Account not found" }, { status: 404 });
  const role = await roleOf(user.id);
  const jar = await cookies();
  const mine = jar.get(sessionCookie())?.value;
  if (!mine) return NextResponse.json({ success: false, message: "Please log in again" }, { status: 401 });
  const maxAge = 4 * 60 * 60; // 4 hours, then log in again
  const token = await encode({
    token: { sub: user.id, id: user.id, name: user.name ?? user.email, email: user.email, role },
    secret: process.env.NEXTAUTH_SECRET!,
    maxAge,
  });
  const res = NextResponse.json({ success: true });
  const opts = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: secure(), maxAge };
  res.cookies.set(STASH, mine, opts); // the admin's own login, kept aside
  res.cookies.set(sessionCookie(), token, opts);
  res.cookies.set(VIEWING, JSON.stringify({ name: user.name || user.email, role: role === "staff" ? "Check-in staff" : "Event planner" }), {
    ...opts,
    httpOnly: false,
  });
  return res;
}

export async function DELETE() {
  await detect();
  const jar = await cookies();
  const mine = jar.get(STASH)?.value;
  const res = NextResponse.json({ success: true });
  const opts = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: secure() };
  if (mine) res.cookies.set(sessionCookie(), mine, { ...opts, maxAge: 30 * 24 * 60 * 60 });
  res.cookies.set(STASH, "", { ...opts, maxAge: 0 });
  res.cookies.set(VIEWING, "", { ...opts, httpOnly: false, maxAge: 0 });
  return res;
}
