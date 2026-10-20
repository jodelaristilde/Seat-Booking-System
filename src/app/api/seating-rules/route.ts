export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { readRules, writeRules } from "@/lib/rules";
import type { Rule } from "@/lib/seatPlan";
import { NextResponse } from "next/server";

// GET -> { rules }   PUT { rules } (login required; not for check-in staff)
export async function GET() {
  return NextResponse.json({ success: true, rules: await readRules(await activeEventId()) });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const list: unknown[] = Array.isArray(body?.rules) ? body.rules : [];
  const rules: Rule[] = [];
  const seen = new Set<string>();
  for (const r of list as Partial<Rule>[]) {
    if (typeof r?.a !== "string" || typeof r?.b !== "string" || r.a === r.b) continue;
    if (r.kind !== "together" && r.kind !== "apart") continue;
    const k = [r.a, r.b].sort().join("|");
    if (seen.has(k)) continue; // one rule per pair
    seen.add(k);
    rules.push({ id: typeof r.id === "string" ? r.id.slice(0, 40) : Math.random().toString(36).slice(2, 10), a: r.a, b: r.b, kind: r.kind });
  }
  await writeRules(await activeEventId(), rules.slice(0, 500));
  return NextResponse.json({ success: true, rules });
}
