import { db } from "@/lib/db";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

// History of what happened at the desk and on guests' phones: who checked in
// whom, and when. Kept in the Setting table ("log:<eventId>:<time>:<random>"),
// so no database change is needed.
export type LogEntry = {
  at: string; // ISO time
  by: string; // account name, or "Guest's phone"
  action: "arrived" | "undo" | "desk-note" | "added";
  guest: string;
  table?: string;
  seatId?: string;
  detail?: string;
};

export async function whoIs(req: NextRequest): Promise<string> {
  try {
    const t = await getToken({ req });
    return (t?.name as string) || (t?.email as string) || "desk";
  } catch {
    return "desk";
  }
}

export async function logEntries(eventId: string | null | undefined, entries: LogEntry[]) {
  if (!eventId || !entries.length) return;
  try {
    await db.setting.createMany({
      data: entries.map((e) => ({
        key: `log:${eventId}:${e.at}:${Math.random().toString(36).slice(2, 8)}`,
        value: JSON.stringify(e),
      })),
      skipDuplicates: true,
    });
  } catch (error) {
    console.error("History log:", error); // never block a check-in because of the log
  }
}

export async function readLog(eventId: string): Promise<LogEntry[]> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: `log:${eventId}:` } } });
  const out: LogEntry[] = [];
  for (const r of rows as { value: string }[]) {
    try {
      out.push(JSON.parse(r.value));
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

// A time sent by the browser (a check-in made while offline), if believable
export function clientTime(at: unknown): string {
  const now = Date.now();
  const t = typeof at === "string" ? Date.parse(at) : NaN;
  return !isNaN(t) && t <= now + 60_000 && t > now - 24 * 3600_000 ? new Date(t).toISOString() : new Date(now).toISOString();
}
