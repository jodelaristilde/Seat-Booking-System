export const dynamic = "force-dynamic";

import { authOptions } from "@/lib/auth.config";
import { readList, writeList } from "@/lib/listStore";
import { eventFromLiveToken } from "@/lib/liveLink";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

// Real reviews only: written by a host (from their report link) or a logged-in
// planner. Nothing shows on the homepage until the admin approves it.
// GET            -> approved reviews (public; for the homepage)
// GET ?all=1     -> every review (admin)
// POST { text, name, role, stars, t? }
// PUT { id, approved } (admin)
type Review = { id: string; at: string; name: string; role: string; stars: number; text: string; approved?: boolean };
const KEY = "reviews";
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function GET(req: Request) {
  const all = new URL(req.url).searchParams.get("all") === "1";
  const list = await readList<Review>(KEY);
  if (all) {
    const s = await getServerSession(authOptions);
    if (s?.user?.email !== "admin") return NextResponse.json({ success: false }, { status: 403 });
    return NextResponse.json({ success: true, reviews: list });
  }
  return NextResponse.json({ success: true, reviews: list.filter((r) => r.approved).slice(0, 12) });
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const s = await getServerSession(authOptions);
  // a host with a valid report link, or a logged-in account
  const fromHost = b?.t ? !!(await eventFromLiveToken(String(b.t))) : false;
  if (!fromHost && !s?.user) return NextResponse.json({ success: false, message: "Not allowed" }, { status: 401 });
  const text = clip(b?.text, 800);
  if (text.length < 5) return NextResponse.json({ success: false, message: "Please write a few words." }, { status: 400 });
  const r: Review = {
    id: Math.random().toString(36).slice(2, 10),
    at: new Date().toISOString(),
    name: clip(b?.name, 60) || "Anonymous",
    role: clip(b?.role, 60) || (fromHost ? "Host" : "Event planner"),
    stars: Math.min(5, Math.max(1, Math.round(Number(b?.stars) || 5))),
    text,
  };
  await writeList(KEY, [r, ...(await readList<Review>(KEY))], 300);
  return NextResponse.json({ success: true });
}

export async function PUT(req: Request) {
  const s = await getServerSession(authOptions);
  if (s?.user?.email !== "admin") return NextResponse.json({ success: false }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const list = await readList<Review>(KEY);
  const r = list.find((x) => x.id === b?.id);
  if (r) {
    if (b.delete) list.splice(list.indexOf(r), 1);
    else r.approved = !!b.approved;
  }
  await writeList(KEY, list, 300);
  return NextResponse.json({ success: true });
}
