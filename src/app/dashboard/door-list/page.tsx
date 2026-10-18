"use client";

// Door list: every guest A–Z with their table, a tick box, VIP, meal and
// allergy. Print it as a paper backup for the desk (Wi-Fi down, laptop dies).
// /dashboard/door-list (login required)
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { matches } from "@/lib/fold";

type SeatRow = {
  id: string;
  seat: number;
  isBooked: boolean;
  isReceived: boolean;
  table: { id: string; name: string };
  user: { id: string; firstname: string; lastname: string; vip?: boolean; meal?: string | null } | null;
};
type Guest = { id: string; firstname: string; lastname: string; seat: unknown[]; vip?: boolean; meal?: string | null };
type Row = {
  key: string;
  id: string;
  first: string;
  last: string;
  table: string;
  seat: number | null;
  vip: boolean;
  meal: string;
  arrived: boolean;
};

const letterOf = (s: string) => {
  const c = s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
};

export default function DoorList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [allergies, setAllergies] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, { text: string }>>({});
  const [eventName, setEventName] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showArrived, setShowArrived] = useState(true);
  const [printedAt] = useState(() => new Date().toLocaleString());

  useEffect(() => {
    (async () => {
      try {
        const [s, g, e, al, nt] = await Promise.all([
          fetch("/api/get-seat").then((r) => r.json()),
          fetch("/api/get-guests").then((r) => r.json()),
          fetch("/api/events").then((r) => r.json()),
          fetch("/api/allergies").then((r) => r.json()).catch(() => ({})),
          fetch("/api/guest-notes").then((r) => r.json()).catch(() => ({})),
        ]);
        if (nt?.success && nt.data) setNotes(nt.data);
        if (nt?.success && nt.answers) setAnswers(nt.answers);
        const seats: SeatRow[] = s.success ? s.data : [];
        const guests: Guest[] = g.success ? g.data : [];
        if (al?.success) setAllergies(al.data);
        if (e.success) setEventName(e.events.find((x: { id: string }) => x.id === e.activeId)?.name ?? "");
        const out: Row[] = seats
          .filter((st) => st.isBooked && st.user)
          .map((st) => ({
            key: st.id,
            id: st.user!.id,
            first: st.user!.firstname,
            last: st.user!.lastname,
            table: st.table.name,
            seat: st.seat,
            vip: !!st.user!.vip,
            meal: st.user!.meal ?? "",
            arrived: st.isReceived,
          }));
        for (const gu of guests)
          if (!gu.seat?.length)
            out.push({ key: gu.id, id: gu.id, first: gu.firstname, last: gu.lastname, table: "", seat: null, vip: !!gu.vip, meal: gu.meal ?? "", arrived: false });
        out.sort((a, b) => `${a.last} ${a.first}`.localeCompare(`${b.last} ${b.first}`, undefined, { sensitivity: "base" }));
        setRows(out);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const shown = useMemo(
    () => rows.filter((r) => (showArrived || !r.arrived) && (!q || matches(`${r.first} ${r.last} ${r.table}`, q))),
    [rows, q, showArrived]
  );
  // group by first letter of the last name
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of shown) m.set(letterOf(r.last), [...(m.get(letterOf(r.last)) ?? []), r]);
    return [...m.entries()];
  }, [shown]);
  const arrived = rows.filter((r) => r.arrived).length;

  if (loading) return <p className="p-8 text-zinc-500">Loading…</p>;

  return (
    <div className="min-h-screen bg-white text-black">
      <style>{`@media print { .no-print { display: none !important } @page { margin: 10mm } .avoid { break-inside: avoid } }`}</style>
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-zinc-50 px-6 py-3">
        <Link href="/dashboard" className="inline-flex items-center gap-1 rounded border bg-white px-3 py-1.5 text-sm hover:bg-zinc-100">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1 rounded bg-lime-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-lime-700"
        >
          <Printer className="h-4 w-4" /> Print door list
        </button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a name or table…"
          className="w-56 rounded border px-3 py-1.5 text-sm"
        />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={showArrived} onChange={(e) => setShowArrived(e.target.checked)} />
          Include guests who already arrived
        </label>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b-2 border-black pb-2">
          <div>
            <h1 className="text-2xl font-bold">{eventName || "Door list"}: guests A–Z</h1>
            <p className="text-sm text-zinc-600">
              {rows.length} guests · {arrived} arrived when printed · ☐ tick as they come in · ★ VIP · ⚠ allergy
            </p>
          </div>
          <p className="text-xs text-zinc-500">Printed {printedAt}</p>
        </div>

        <div className="columns-1 gap-6 md:columns-2">
          {groups.map(([letter, list]) => (
            <div key={letter} className="mb-3">
              <div className="avoid mb-1 bg-zinc-900 px-2 py-0.5 text-sm font-extrabold text-white">{letter}</div>
              {list.map((r) => (
                <div key={r.key} className="avoid flex items-start gap-2 border-b border-zinc-300 py-1 text-[13px] leading-tight">
                  <span className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 border border-black text-center text-[10px] leading-3">
                    {r.arrived ? "✓" : ""}
                  </span>
                  <span className="flex-1">
                    <b>{r.last}</b>, {r.first}
                    {r.vip && <span className="ml-1">★</span>}
                    {(r.meal || allergies[r.id]) && (
                      <span className="block text-[11px] text-zinc-600">
                        {r.meal}
                        {allergies[r.id] && <b className="ml-1 text-red-700">⚠ {allergies[r.id]}</b>}
                      </span>
                    )}
                    {notes[r.id] && (
                      <span className="block text-[11px] font-bold text-amber-800">📝 {notes[r.id]}</span>
                    )}
                    {answers[r.id] && (
                      <span className="block text-[11px] font-bold text-green-800">✓ Desk: {answers[r.id].text}</span>
                    )}
                  </span>
                  <span className={`whitespace-nowrap text-right font-bold ${r.table ? "" : "text-red-700"}`}>
                    {r.table || "No table"}
                    {r.seat != null && <span className="block text-[10px] font-normal text-zinc-500">seat {r.seat}</span>}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
        {!shown.length && <p className="text-zinc-500">No guests found.</p>}
      </div>
    </div>
  );
}
