"use client";

// Ready check: everything that could go wrong at the door, found the night before.
// /dashboard/ready-check (login required)
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCcw } from "lucide-react";
import { fold } from "@/lib/fold";

type SeatRow = {
  id: string;
  seat: number;
  isBooked: boolean;
  table: { id: string; name: string };
  user: { id: string; firstname: string; lastname: string; meal?: string | null } | null;
};
type Guest = { id: string; firstname: string; lastname: string; seat: { id: string }[]; meal?: string | null };
type Pos = { id: string; name: string; posX: number | null; posY: number | null };

type Check = {
  title: string;
  ok: boolean;
  level: "error" | "warn" | "info";
  okText: string;
  problem: string;
  items: string[];
  fix: string;
};

const name = (g: { firstname: string; lastname: string }) => `${g.firstname} ${g.lastname}`.trim();
const byTable = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

export default function ReadyCheck() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [eventName, setEventName] = useState("");
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const [s, g, p, e, ent, pic] = await Promise.all([
        fetch("/api/get-seat").then((r) => r.json()),
        fetch("/api/get-guests").then((r) => r.json()),
        fetch("/api/table-positions").then((r) => r.json()),
        fetch("/api/events").then((r) => r.json()),
        fetch("/api/event-entrance").then((r) => r.json()).catch(() => ({})),
        fetch("/api/floor-map").then((r) => r.json()).catch(() => ({})),
      ]);
      const seats: SeatRow[] = s.success ? s.data : [];
      const guests: Guest[] = g.success ? g.data : [];
      const pos: Pos[] = p.success ? p.data : [];
      const thisEvent = e.success ? e.events.find((x: { id: string }) => x.id === e.activeId) : null;
      if (thisEvent) setEventName(thisEvent.name ?? "");

      const out: Check[] = [];

      // 1. tables on top of each other (only one number shows)
      const placed = pos.filter((t) => t.posX != null && t.posY != null);
      const stacked: string[] = [];
      for (let i = 0; i < placed.length; i++)
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i], b = placed[j];
          if (Math.abs(a.posX! - b.posX!) < 3.5 && Math.abs(a.posY! - b.posY!) < 3.5)
            stacked.push(`${a.name} and ${b.name}`);
        }
      out.push({
        title: "Tables on top of each other",
        ok: stacked.length === 0,
        level: "error",
        okText: "Every table has its own spot.",
        problem: "These tables sit on the same spot, so one number hides the other:",
        items: stacked,
        fix: "Floor plan → Move tables → drag one of them to its real spot → Save layout.",
      });

      // 2. same table name twice
      const tableNames = new Map<string, string[]>();
      for (const t of pos) tableNames.set(fold(t.name), [...(tableNames.get(fold(t.name)) ?? []), t.name]);
      const dupTables = [...tableNames.values()].filter((v) => v.length > 1).map((v) => `${v[0]} (${v.length} tables)`);
      out.push({
        title: "Two tables with the same name",
        ok: dupTables.length === 0,
        level: "error",
        okText: "Every table name is different.",
        problem: "Guests and staff could go to the wrong table:",
        items: dupTables,
        fix: "Point at one of the tables, click the ⚙️ gear and rename it.",
      });

      // 3. the same guest name twice
      const byName = new Map<string, Guest[]>();
      for (const gu of guests) {
        const k = `${fold(gu.firstname)}|${fold(gu.lastname)}`;
        byName.set(k, [...(byName.get(k) ?? []), gu]);
      }
      const dupGuests = [...byName.values()]
        .filter((v) => v.length > 1)
        .map((v) => `${name(v[0])} (on the list ${v.length} times)`);
      out.push({
        title: "Guests on the list twice",
        ok: dupGuests.length === 0,
        level: "warn",
        okText: "No name appears twice.",
        problem: "These names appear more than once (maybe imported twice). If it is the same person, remove the extra one:",
        items: dupGuests,
        fix: "Search the name in Guest Names; delete the extra entry with the 🗑️ bin. Two different people with the same name are fine.",
      });

      // 4. guest with more than one seat
      const seatsOf = new Map<string, string[]>();
      for (const st of seats) if (st.isBooked && st.user) seatsOf.set(st.user.id, [...(seatsOf.get(st.user.id) ?? []), st.table.name]);
      const twice = guests
        .filter((gu) => (seatsOf.get(gu.id)?.length ?? 0) > 1)
        .map((gu) => `${name(gu)}: ${seatsOf.get(gu.id)!.join(", ")}`);
      out.push({
        title: "Guests with two seats",
        ok: twice.length === 0,
        level: "error",
        okText: "Every seated guest has exactly one seat.",
        problem: "These guests are seated in more than one place:",
        items: twice,
        fix: "Point at the wrong table and click × next to their name.",
      });

      // 5. guests without a table
      const unseated = guests.filter((gu) => !gu.seat?.length).map(name).sort();
      out.push({
        title: "Guests without a table",
        ok: unseated.length === 0,
        level: "warn",
        okText: "Every guest has a table.",
        problem: `${unseated.length} guest${unseated.length === 1 ? " has" : "s have"} no table yet. At the door they will see no seat:`,
        items: unseated,
        fix: "Menu → Assign Multiple, or point at a table and add them under Add guests.",
      });

      // 6. meals: only when meals are in use
      const withMeal = guests.filter((gu) => gu.meal?.trim()).length;
      const noMeal = guests.filter((gu) => !gu.meal?.trim()).map(name).sort();
      if (withMeal > 0)
        out.push({
          title: "Guests without a meal",
          ok: noMeal.length === 0,
          level: "warn",
          okText: "Every guest has a meal.",
          problem: `${noMeal.length} guest${noMeal.length === 1 ? " has" : "s have"} no meal chosen:`,
          items: noMeal,
          fix: "Point at their table and type the meal, or use Import Guests → Update meals / allergies.",
        });

      // 7. empty tables (just so you know)
      const tableGuests = new Map<string, { name: string; n: number }>();
      for (const st of seats) {
        const t = tableGuests.get(st.table.id) ?? { name: st.table.name, n: 0 };
        if (st.isBooked && st.user) t.n++;
        tableGuests.set(st.table.id, t);
      }
      const empty = [...tableGuests.values()].filter((t) => t.n === 0).map((t) => t.name).sort(byTable);
      out.push({
        title: "Empty tables",
        ok: empty.length === 0,
        level: "info",
        okText: "Every table has guests.",
        problem: "No guests are seated at these tables (fine if they are spare):",
        items: empty,
        fix: "Seat guests there, or delete the table if it is not needed.",
      });

      // 8. entrance for the phone's green line
      const hasEntrance = Array.isArray(ent?.entrances) && ent.entrances.length > 0;
      out.push({
        title: "Entrance for the guest phone map (required)",
        ok: hasEntrance,
        level: "error",
        okText: "Entrance set: guests see a green line to their table.",
        problem: "No entrance is set, so guests' phones only circle their table (no green line).",
        items: [],
        fix: "Floor plan → Set entrance → click the door on the plan.",
      });

      // 8b. event date: after it, guests can no longer look up seats on their phone
      out.push({
        title: "Event date",
        ok: !!thisEvent?.date,
        level: "warn",
        okText: `Date set (${thisEvent?.date}). After this date, guests can no longer look up seats on their phone.`,
        problem: "No date set. Without a date, guests from this event can look up seats until you close it by hand.",
        items: [],
        fix: "Click the event name at the top → rename (✏️) and add the date. Or set Guest check-in: Closed after the event.",
      });

      // 9. floor plan picture
      const hasPic = !!(pic?.image?.data || pic?.image?.original);
      out.push({
        title: "Floor plan picture",
        ok: hasPic,
        level: "info",
        okText: "The venue's floor plan is uploaded.",
        problem: "No floor plan picture yet: tables show on a blank background.",
        items: [],
        fix: "Click FLOOR MAP at the top and upload the venue's plan.",
      });

      setChecks(out);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const problems = checks?.filter((c) => !c.ok && c.level !== "info").length ?? 0;
  const style = (c: Check) =>
    c.ok
      ? { box: "border-green-200 bg-green-50", dot: "bg-green-600", icon: "✓" }
      : c.level === "error"
      ? { box: "border-red-300 bg-red-50", dot: "bg-red-600", icon: "!" }
      : c.level === "warn"
      ? { box: "border-amber-300 bg-amber-50", dot: "bg-amber-500", icon: "!" }
      : { box: "border-zinc-200 bg-zinc-50", dot: "bg-zinc-400", icon: "i" };

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-zinc-50 px-6 py-3">
        <Link href="/dashboard" className="inline-flex items-center gap-1 rounded border bg-white px-3 py-1.5 text-sm hover:bg-zinc-100">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <button
          onClick={run}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded border bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50"
        >
          <RefreshCcw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Check again
        </button>
      </div>
      <div className="mx-auto max-w-3xl px-6 py-6">
        <h1 className="text-3xl font-bold">Ready check</h1>
        <p className="mb-5 text-zinc-600">{eventName ? `${eventName} · ` : ""}Run this the night before, and again in the morning.</p>

        {!checks ? (
          <p className="text-zinc-500">Checking…</p>
        ) : (
          <>
            <div
              className={`mb-5 rounded-xl px-5 py-4 text-lg font-bold ${
                problems ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-800"
              }`}
            >
              {problems ? `${problems} thing${problems === 1 ? "" : "s"} to fix before the event` : "✓ All set. You're ready for the event!"}
            </div>
            <div className="space-y-3">
              {checks.map((c) => {
                const st = style(c);
                return (
                  <div key={c.title} className={`rounded-lg border p-4 ${st.box}`}>
                    <div className="flex items-center gap-3">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${st.dot}`}>
                        {st.icon}
                      </span>
                      <span className="font-semibold">{c.title}</span>
                      {!c.ok && c.items.length > 0 && (
                        <span className="ml-auto rounded-full bg-white px-2 text-sm font-bold">{c.items.length}</span>
                      )}
                    </div>
                    <p className="ml-9 mt-1 text-sm text-zinc-700">{c.ok ? c.okText : c.problem}</p>
                    {!c.ok && c.items.length > 0 && (
                      <ul className="ml-9 mt-2 max-h-48 list-inside list-disc overflow-y-auto text-sm">
                        {c.items.map((it, i) => (
                          <li key={i}>{it}</li>
                        ))}
                      </ul>
                    )}
                    {!c.ok && <p className="ml-9 mt-2 text-sm font-medium text-zinc-800">How to fix: {c.fix}</p>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
