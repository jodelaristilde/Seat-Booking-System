export const dynamic = "force-dynamic";

import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { NextResponse } from "next/server";

// "I forgot my password" (public)
// POST { email } -> emails a reset link (1 hour, works once). Needs the
//   RESEND_API_KEY setting on Vercel (free at resend.com); RESET_FROM = sender.
// PUT { t, password } -> sets the new password
const SECRET = () => process.env.NEXTAUTH_SECRET || "seating4u";
const sign = (id: string, exp: number, pw: string) =>
  createHmac("sha256", SECRET()).update(`${id}.${exp}.${pw.slice(-12)}`).digest("base64url");

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const email = typeof b?.email === "string" ? b.email.trim() : "";
  const key = process.env.RESEND_API_KEY;
  if (!key)
    return NextResponse.json({
      success: false,
      noEmail: true,
      message: "Password reset by email isn't turned on yet. Ask the person who gave you your login to set a new password.",
    });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({
      success: false,
      message: "Type the email address you log in with. (If your login is a username, ask the person who gave it to you.)",
    });
  const user = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (user) {
    const exp = Date.now() + 60 * 60 * 1000;
    const t = `${user.id}.${exp}.${sign(user.id, exp, user.password)}`;
    const link = `${new URL(req.url).origin}/reset?t=${encodeURIComponent(t)}`;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESET_FROM || "Seating4U <onboarding@resend.dev>",
        to: [user.email],
        subject: "Reset your Seating4U password",
        html: `<p>Hello ${user.name ?? ""},</p><p>Click this link to choose a new password (it works for 1 hour):</p><p><a href="${link}">${link}</a></p><p>Didn't ask for this? You can ignore this email.</p>`,
      }),
    }).catch((e) => console.error("reset email", e));
  }
  // same answer either way (nobody can test which emails have an account)
  return NextResponse.json({ success: true });
}

export async function PUT(req: Request) {
  const b = await req.json().catch(() => ({}));
  const [id, expS, sig] = String(b?.t ?? "").split(".");
  const exp = Number(expS);
  const pw = typeof b?.password === "string" ? b.password : "";
  if (pw.length < 6) return NextResponse.json({ success: false, message: "Use at least 6 characters." }, { status: 400 });
  const user = id ? await db.user.findUnique({ where: { id } }) : null;
  const good = user && exp > Date.now() && sig && (() => {
    const a = Buffer.from(sign(id, exp, user.password));
    const c = Buffer.from(sig);
    return a.length === c.length && timingSafeEqual(a, c);
  })();
  if (!good) return NextResponse.json({ success: false, message: "This link is too old or was already used. Ask for a new one." }, { status: 400 });
  await db.user.update({ where: { id }, data: { password: await hashPassword(pw) } });
  return NextResponse.json({ success: true });
}
