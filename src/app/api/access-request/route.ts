export const dynamic = "force-dynamic";

import { authOptions } from "@/lib/auth.config";
import { readList, writeList } from "@/lib/listStore";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

// "Request access" from the homepage (planners) or the venues page.
// POST (public) { name, company, email, phone, kind, message }
// GET / PUT { id, done } (admin)
type Req = { id: string; at: string; kind: string; name: string; company: string; email: string; phone: string; message: string; done?: boolean };
const KEY = "access-requests";
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  if (clip(b?.website, 10)) return NextResponse.json({ success: true }); // a bot filled the hidden field
  const r: Req = {
    id: Math.random().toString(36).slice(2, 10),
    at: new Date().toISOString(),
    kind: b?.kind === "venue" ? "venue" : "planner",
    name: clip(b?.name, 80),
    company: clip(b?.company, 120),
    email: clip(b?.email, 120),
    phone: clip(b?.phone, 40),
    message: clip(b?.message, 1500),
  };
  if (!r.name || (!r.email && !r.phone))
    return NextResponse.json({ success: false, message: "Please give your name and an email or phone number." }, { status: 400 });
  const list = await readList<Req>(KEY);
  // the same email many times in a few minutes: ignore
  if (r.email && list.some((x) => x.email === r.email && Date.now() - new Date(x.at).getTime() < 10 * 60_000))
    return NextResponse.json({ success: true });
  await writeList(KEY, [r, ...list]);
  return NextResponse.json({ success: true });
}

export async function GET() {
  const s = await getServerSession(authOptions);
  if (s?.user?.email !== "admin") return NextResponse.json({ success: false }, { status: 403 });
  return NextResponse.json({ success: true, requests: await readList<Req>(KEY) });
}

export async function PUT(req: Request) {
  const s = await getServerSession(authOptions);
  if (s?.user?.email !== "admin") return NextResponse.json({ success: false }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const list = await readList<Req>(KEY);
  const r = list.find((x) => x.id === b?.id);
  if (r) r.done = !!b.done;
  await writeList(KEY, list);
  return NextResponse.json({ success: true });
}
