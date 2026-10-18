export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { setAllergy } from "@/lib/allergies";
import { db } from "@/lib/db";
import { fold } from "@/lib/fold";
import { NextResponse } from "next/server";

// POST { rows: [{ firstname, lastname, meal?, allergy?, vip? }] }
// Fills in meal / allergy / VIP for guests ALREADY on the list of the open
// event, matched by first + last name (accents and capitals ignored).
// Never adds guests, so nobody is doubled. Empty cells change nothing.
type Row = { firstname?: unknown; lastname?: unknown; meal?: unknown; allergy?: unknown; vip?: unknown };
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());
const YES = ["yes", "y", "x", "1", "true", "vip", "oui", "si", "wi"];
const NO = ["no", "n", "0", "false", "non"];

export async function POST(req: Request) {
  try {
    const eventId = await activeEventId();
    const body = await req.json();
    const rows: Row[] = Array.isArray(body?.rows) ? body.rows.slice(0, 3000) : [];
    if (!rows.length) return NextResponse.json({ success: false, message: "No rows in the file" }, { status: 400 });

    const guests = await db.users.findMany({ where: { eventId }, select: { id: true, firstname: true, lastname: true } });
    const byName = new Map<string, string[]>();
    for (const g of guests as { id: string; firstname: string; lastname: string }[]) {
      const k = `${fold(g.firstname)}|${fold(g.lastname)}`;
      byName.set(k, [...(byName.get(k) ?? []), g.id]);
    }

    let updated = 0;
    const notFound: string[] = [];
    for (const r of rows) {
      const first = str(r.firstname), last = str(r.lastname);
      if (!first || !last) continue;
      const ids = byName.get(`${fold(first)}|${fold(last)}`);
      if (!ids) {
        notFound.push(`${first} ${last}`);
        continue;
      }
      const meal = str(r.meal).slice(0, 40);
      const vipRaw = str(r.vip).toLowerCase();
      const data: { meal?: string; vip?: boolean } = {};
      if (meal) data.meal = meal;
      if (YES.includes(vipRaw)) data.vip = true;
      else if (NO.includes(vipRaw)) data.vip = false;
      const allergy = str(r.allergy);
      for (const id of ids) {
        if (Object.keys(data).length) await db.users.update({ where: { id }, data });
        if (allergy) await setAllergy(eventId, id, allergy);
      }
      if (Object.keys(data).length || allergy) updated += ids.length;
    }
    return NextResponse.json({ success: true, updated, notFound });
  } catch (error) {
    console.error("Update guests:", error);
    return NextResponse.json({ success: false, message: "Could not update the guests" }, { status: 500 });
  }
}
