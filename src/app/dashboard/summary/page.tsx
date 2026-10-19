"use client";

// After the event: when guests arrived, no-shows per table, meals actually served.
// /dashboard/summary (login required)
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Lock, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

type SeatRow = {
  id: string;
  isBooked: boolean;
  isReceived: boolean;
  table: { id: string; name: string };
  user: { id: string; firstname: string; lastname: string; meal?: string | null } | null;
};
type Entry = { at: string; by?: string; action: string; seatId?: string; guest: string; table?: string; detail?: string };
type Guest = { id: string; firstname: string; lastname: string; seat: unknown[]; vip?: boolean; meal?: string | null };

const byTable = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
const BAR = "#16a34a"; // one series: one hue
const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function Summary() {
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [log, setLog] = useState<Entry[]>([]);
  const [eventName, setEventName] = useState("");
  const [eventId, setEventId] = useState("");
  const [closed, setClosed] = useState(false);
  const [closing, setClosing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, h, e, ga] = await Promise.all([
          fetch("/api/get-seat").then((r) => r.json()),
          fetch("/api/history").then((r) => r.json()).catch(() => ({})),
          fetch("/api/events").then((r) => r.json()),
          fetch("/api/events/guest-access").then((r) => r.json()).catch(() => ({})),
        ]);
        if (s.success) setSeats(s.data);
        if (h?.success) setLog(h.data);
        if (e.success) {
          setEventId(e.activeId);
          setEventName(e.events.find((x: { id: string }) => x.id === e.activeId)?.name ?? "");
          if (ga?.success) setClosed(!ga.data?.[e.activeId]?.open);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const seated = useMemo(() => seats.filter((s) => s.isBooked && s.user), [seats]);
  const arrived = seated.filter((s) => s.isReceived);

  // the time each guest arrived: their latest check-in in the history (if not undone)
  const arrivalTimes = useMemo(() => {
    const latest = new Map<string, Entry>();
    for (const e of [...log].sort((a, b) => a.at.localeCompare(b.at)))
      if (e.seatId && (e.action === "arrived" || e.action === "undo")) latest.set(e.seatId, e);
    const here = new Set(arrived.map((s) => s.id));
    return [...latest.values()].filter((e) => e.action === "arrived" && e.seatId && here.has(e.seatId)).map((e) => new Date(e.at));
  }, [log, arrived]);

  // arrivals per 15 minutes
  const buckets = useMemo(() => {
    if (!arrivalTimes.length) return [];
    const step = 15 * 60_000;
    const t0 = Math.floor(Math.min(...arrivalTimes.map((d) => d.getTime())) / step) * step;
    const t1 = Math.floor(Math.max(...arrivalTimes.map((d) => d.getTime())) / step) * step;
    const n = Math.min(96, Math.round((t1 - t0) / step) + 1);
    const out = Array.from({ length: n }, (_, i) => ({ start: new Date(t0 + i * step), count: 0 }));
    for (const d of arrivalTimes) {
      const i = Math.min(n - 1, Math.round((Math.floor(d.getTime() / step) * step - t0) / step));
      out[i].count++;
    }
    return out;
  }, [arrivalTimes]);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const peak = buckets.reduce((p, b) => (b.count > (p?.count ?? -1) ? b : p), buckets[0]);

  const tables = useMemo(() => {
    const m = new Map<string, { name: string; seated: number; came: number }>();
    for (const s of seated) {
      const t = m.get(s.table.id) ?? { name: s.table.name, seated: 0, came: 0 };
      t.seated++;
      if (s.isReceived) t.came++;
      m.set(s.table.id, t);
    }
    return [...m.values()].sort((a, b) => byTable(a.name, b.name));
  }, [seated]);

  const meals = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of arrived) {
      const k = s.user!.meal?.trim() || "No meal chosen";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [arrived]);

  // Close out: download a full backup, then stop guest check-in for this event
  const closeOut = async () => {
    if (!confirm(`Close out "${eventName}"?\n\n1. A full backup Excel file downloads.\n2. Guest check-in closes: guests can no longer look up seats on their phone.\n\nYou can reopen it any time (click the event name at the top).`)) return;
    setClosing(true);
    try {
      const [g, al, nt, rv] = await Promise.all([
        fetch("/api/get-guests").then((r) => r.json()),
        fetch("/api/allergies").then((r) => r.json()).catch(() => ({})),
        fetch("/api/guest-notes").then((r) => r.json()).catch(() => ({})),
        fetch("/api/rsvp-links").then((r) => r.json()).catch(() => ({})),
      ]);
      const guests: Guest[] = g.success ? g.data : [];
      const allergies: Record<string, string> = al?.success ? al.data : {};
      const notes: Record<string, string> = nt?.success ? nt.data ?? {} : {};
      const answers: Record<string, { text: string; by?: string }> = nt?.success ? nt.answers ?? {} : {};
      const rsvps: Record<string, { coming?: string; meal?: string; allergy?: string }> = rv?.success ? rv.rsvps ?? {} : {};
      const seatOf = new Map(seated.map((s) => [s.user!.id, s]));
      const wb = XLSX.utils.book_new();
      const add = (name: string, rows: Record<string, unknown>[]) =>
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ "": "(none)" }]), name);
      add("Summary", [
        { Item: "Event", Value: eventName },
        { Item: "Backup made", Value: new Date().toLocaleString() },
        { Item: "Guests on the list", Value: guests.length },
        { Item: "Seated", Value: seated.length },
        { Item: "Arrived", Value: arrived.length },
        { Item: "Did not come", Value: seated.length - arrived.length },
        ...meals.map(([m, n]) => ({ Item: `Meal served: ${m}`, Value: n })),
      ]);
      add(
        "All guests",
        [...guests]
          .sort((a, b) => `${a.lastname} ${a.firstname}`.localeCompare(`${b.lastname} ${b.firstname}`))
          .map((gu) => {
            const st = seatOf.get(gu.id);
            const t = st ? log.find((e) => e.seatId === st.id && e.action === "arrived") : undefined;
            return {
              "First Name": gu.firstname,
              "Last Name": gu.lastname,
              Table: st?.table.name ?? "",
              Meal: gu.meal ?? "",
              Allergy: allergies[gu.id] ?? "",
              VIP: gu.vip ? "Yes" : "",
              Note: notes[gu.id] ?? "",
              "Desk note": answers[gu.id]?.text ?? "",
              RSVP: rsvps[gu.id]?.coming ?? "",
              Arrived: st ? (st.isReceived ? "Yes" : "No") : "No seat",
              "Arrived at": t ? new Date(t.at).toLocaleString() : "",
              "Checked in by": t?.by ?? "",
            };
          })
      );
      add("By table", tables.map((t) => ({ Table: t.name, Seated: t.seated, Arrived: t.came, "Did not come": t.seated - t.came })));
      add(
        "History",
        log.map((e) => ({ Time: new Date(e.at).toLocaleString(), By: e.by ?? "", What: e.action, Guest: e.guest, Table: e.table ?? "", Detail: e.detail ?? "" }))
      );
      const safe = (eventName || "event").replace(/[^\w\- ]+/g, "").trim() || "event";
      XLSX.writeFile(wb, `${safe} - FULL BACKUP ${new Date().toISOString().slice(0, 10)}.xlsx`);
      const r = await fetch("/api/events/guest-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: eventId, closed: true }),
      }).then((x) => x.json());
      if (r?.success) {
        setClosed(true);
        toast.success("Event closed out: backup downloaded and guest check-in closed.");
      } else toast.error("Backup downloaded, but guest check-in could not be closed. Try again.");
    } catch {
      toast.error("Something went wrong. Nothing was closed.");
    } finally {
      setClosing(false);
    }
  };

  if (loading) return <p className="p-8 text-zinc-500">Loading…</p>;
  const noShow = seated.length - arrived.length;
  const pct = seated.length ? Math.round((arrived.length / seated.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <style>{`@media print { .no-print { display: none !important } }`}</style>
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-zinc-50 px-6 py-3">
        <Link href="/dashboard" className="inline-flex items-center gap-1 rounded border bg-white px-3 py-1.5 text-sm hover:bg-zinc-100">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1 rounded bg-lime-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-lime-700"
        >
          <Printer className="h-4 w-4" /> Print / save as PDF
        </button>
        <button
          onClick={closeOut}
          disabled={closing || !eventId}
          className="inline-flex items-center gap-1 rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          <Lock className="h-4 w-4" /> {closing ? "Closing…" : "Close out event"}
        </button>
        <span className="text-xs text-zinc-500">
          {closed ? "Guest check-in is closed for this event." : "Downloads a full backup, then closes guest check-in."}
        </span>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-6">
        <h1 className="text-3xl font-bold">Arrival summary</h1>
        <p className="mb-5 text-zinc-600">{eventName}</p>

        {/* headline numbers */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Seated guests", String(seated.length)],
            ["Arrived", `${arrived.length} (${pct}%)`],
            ["Did not come", String(noShow)],
            ["Busiest 15 min", peak ? `${fmtTime(peak.start)} · ${peak.count}` : "–"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-zinc-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{k}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{v}</div>
            </div>
          ))}
        </div>

        {/* arrivals over time */}
        <h2 className="mb-1 text-lg font-bold">Guests arriving, every 15 minutes</h2>
        {!buckets.length ? (
          <p className="mb-8 text-sm text-zinc-500">
            No arrival times yet. Times are recorded for every check-in from now on (History).
          </p>
        ) : (
          <div className="mb-2">
            <div className="relative flex h-52 items-end gap-[2px] border-b border-zinc-300 pt-6" role="img" aria-label="Arrivals per 15 minutes">
              {buckets.map((b, i) => (
                <div
                  key={i}
                  className="relative flex h-full flex-1 items-end"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  <div
                    className="w-full rounded-t-[4px]"
                    style={{ height: `${(b.count / max) * 100}%`, minHeight: b.count ? 2 : 0, background: BAR, opacity: hover === null || hover === i ? 1 : 0.55 }}
                  />
                  {hover === i && (
                    <div className="absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border bg-white px-2 py-1 text-xs shadow">
                      <b className="tabular-nums">{b.count}</b> arrived · {fmtTime(b.start)}–{fmtTime(new Date(b.start.getTime() + 15 * 60_000))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-zinc-500 tabular-nums">
              <span>{fmtTime(buckets[0].start)}</span>
              <span>{fmtTime(buckets[buckets.length - 1].start)}</span>
            </div>
            {arrivalTimes.length < arrived.length && (
              <p className="mt-1 text-xs text-zinc-500">
                {arrived.length - arrivalTimes.length} check-in(s) happened before times were recorded and are not in the chart.
              </p>
            )}
          </div>
        )}

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          {/* per table */}
          <div>
            <h2 className="mb-2 text-lg font-bold">Who came, by table</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-1.5">Table</th>
                  <th className="py-1.5 text-right">Arrived</th>
                  <th className="py-1.5 text-right">Did not come</th>
                </tr>
              </thead>
              <tbody>
                {tables.map((t) => (
                  <tr key={t.name} className="border-b border-zinc-100">
                    <td className="py-1.5 font-medium">{t.name}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {t.came}/{t.seated}
                    </td>
                    <td className={`py-1.5 text-right tabular-nums ${t.seated - t.came ? "font-semibold" : "text-zinc-400"}`}>
                      {t.seated - t.came}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* meals actually served */}
          <div>
            <h2 className="mb-2 text-lg font-bold">Meals served (guests who came)</h2>
            <table className="w-full text-sm">
              <tbody>
                {meals.map(([m, n]) => (
                  <tr key={m} className="border-b border-zinc-100">
                    <td className="py-1.5">{m}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">{n}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-1.5 font-bold">Total</td>
                  <td className="py-1.5 text-right font-bold tabular-nums">{arrived.length}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-zinc-500">Useful for checking the caterer&apos;s bill.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
