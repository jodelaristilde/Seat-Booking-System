export const dynamic = "force-dynamic";

import { authOptions } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { activeEventId } from "@/lib/event";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

// "Report a problem": kept in the Setting table ("problems", newest first, last 300)
// POST { text, page }  any logged-in account
// GET                  admin: the list
// PUT { id, done }     admin: mark handled
type Problem = { id: string; at: string; who: string; event: string; page: string; text: string; device: string; done?: boolean };
const KEY = "problems";
async function readAll(): Promise<Problem[]> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  try {
    return row ? (JSON.parse(row.value) as Problem[]) : [];
  } catch {
    return [];
  }
}
async function writeAll(list: Problem[]) {
  const value = JSON.stringify(list.slice(0, 300));
  await db.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const b = await req.json().catch(() => ({}));
  const text = typeof b?.text === "string" ? b.text.trim().slice(0, 2000) : "";
  if (!text) return NextResponse.json({ success: false, message: "Please write what happened" }, { status: 400 });
  const evId = await activeEventId();
  const ev = await db.event.findUnique({ where: { id: evId }, select: { name: true } });
  const p: Problem = {
    id: Math.random().toString(36).slice(2, 10),
    at: new Date().toISOString(),
    who: session?.user?.name || session?.user?.email || "?",
    event: ev?.name ?? "",
    page: typeof b?.page === "string" ? b.page.slice(0, 200) : "",
    text,
    device: (req.headers.get("user-agent") ?? "").slice(0, 200),
  };
  await writeAll([p, ...(await readAll())]);
  return NextResponse.json({ success: true });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.email !== "admin") return NextResponse.json({ success: false }, { status: 403 });
  return NextResponse.json({ success: true, problems: await readAll() });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.email !== "admin") return NextResponse.json({ success: false }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const list = await readAll();
  const p = list.find((x) => x.id === b?.id);
  if (p) p.done = !!b.done;
  await writeAll(list);
  return NextResponse.json({ success: true });
}
