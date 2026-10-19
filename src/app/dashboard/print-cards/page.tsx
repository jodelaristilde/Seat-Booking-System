"use client";

// Printable table signs (big number + QR code to find your seat) and
// fold-over place cards (name + table). /dashboard/print-cards (login required)
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Printer } from "lucide-react";

type SeatRow = {
  id: string;
  seat: number;
  isBooked: boolean;
  table: { id: string; name: string };
  user: { id: string; firstname: string; lastname: string; vip?: boolean; meal?: string | null } | null;
};
const byTable = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
const short = (n: string) => n.replace(/^\s*table\s*#?\s*(?=\S)/i, "");

export default function PrintCards() {
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [eventName, setEventName] = useState("");
  const [eventId, setEventId] = useState("");
  const [kind, setKind] = useState<"signs" | "places">("signs");
  const [withMeal, setWithMeal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, e] = await Promise.all([
          fetch("/api/get-seat").then((r) => r.json()),
          fetch("/api/events").then((r) => r.json()),
        ]);
        if (s.success) setSeats(s.data);
        if (e.success) {
          setEventId(e.activeId);
          setEventName(e.events.find((x: { id: string }) => x.id === e.activeId)?.name ?? "");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const tables = useMemo(() => {
    const m = new Map<string, { name: string; guests: SeatRow[] }>();
    for (const s of seats) {
      const t = m.get(s.table.id) ?? { name: s.table.name, guests: [] };
      if (s.isBooked && s.user) t.guests.push(s);
      m.set(s.table.id, t);
    }
    return [...m.values()].sort((a, b) => byTable(a.name, b.name));
  }, [seats]);
  const guests = useMemo(
    () =>
      seats
        .filter((s) => s.isBooked && s.user)
        .sort((a, b) => byTable(a.table.name, b.table.name) || a.seat - b.seat),
    [seats]
  );
  const qr = typeof window === "undefined" ? "" : `${window.location.origin}/seat-scanning${eventId ? `?event=${eventId}` : ""}`;

  if (loading) return <p className="p-8 text-zinc-500">Loading…</p>;

  return (
    <div className="min-h-screen bg-zinc-100 text-black print:bg-white">
      <style>{`
        @media print {
          .no-print { display: none !important }
          @page { size: letter; margin: 0.4in }
          .sign { break-after: page; height: 9.6in }
          .places { gap: 0 !important }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-zinc-50 px-6 py-3">
        <Link href="/dashboard" className="inline-flex items-center gap-1 rounded border bg-white px-3 py-1.5 text-sm hover:bg-zinc-100">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="flex rounded-lg bg-zinc-200 p-0.5 text-sm font-semibold">
          {(
            [
              ["signs", `Table signs (${tables.length})`],
              ["places", `Place cards (${guests.length})`],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-md px-3 py-1 ${kind === k ? "bg-white shadow" : "text-zinc-600"}`}
            >
              {l}
            </button>
          ))}
        </div>
        {kind === "places" && (
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={withMeal} onChange={(e) => setWithMeal(e.target.checked)} />
            Show the meal (for the servers)
          </label>
        )}
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1 rounded bg-lime-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-lime-700"
        >
          <Printer className="h-4 w-4" /> Print
        </button>
        <span className="text-xs text-zinc-500">
          {kind === "signs" ? "One table per page." : "8 cards per page: cut on the lines, fold in the middle."}
        </span>
      </div>

      {kind === "signs" ? (
        <div className="mx-auto max-w-[8.5in] space-y-6 p-6 print:space-y-0 print:p-0">
          {tables.map((t) => (
            <div
              key={t.name}
              className="sign flex flex-col items-center justify-center rounded-xl bg-white p-10 text-center shadow print:rounded-none print:shadow-none"
              style={{ minHeight: "9.6in" }}
            >
              <p className="text-2xl font-semibold uppercase tracking-[0.3em] text-zinc-500">{eventName}</p>
              {/^\s*table/i.test(t.name) && <p className="mt-6 text-5xl font-light uppercase tracking-widest">Table</p>}
              <p className="font-extrabold leading-none" style={{ fontSize: short(t.name).length <= 3 ? "3.6in" : "1.2in" }}>
                {short(t.name)}
              </p>
              <div className="mt-8 flex items-center gap-5">
                <QRCodeSVG value={qr} size={130} level="M" />
                <p className="max-w-[3.2in] text-left text-xl font-semibold leading-snug text-zinc-700">
                  Not sure where you sit? Scan to find your seat.
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mx-auto max-w-[8.5in] p-6 print:p-0">
          <div className="places grid grid-cols-2 gap-3 bg-white print:grid">
            {guests.map((g) => (
              // a tent card: the top half is upside down, so both sides read once folded
              <div
                key={g.id}
                className="flex h-[2.4in] flex-col border border-dashed border-zinc-400"
                style={{ breakInside: "avoid" }}
              >
                <div className="flex flex-1 rotate-180 flex-col items-center justify-center border-b border-dotted border-zinc-300 text-center">
                  <p className="text-2xl font-bold">
                    {g.user!.firstname} {g.user!.lastname}
                  </p>
                  <p className="text-sm text-zinc-600">{g.table.name}</p>
                </div>
                <div className="flex flex-1 flex-col items-center justify-center text-center">
                  <p className="text-2xl font-bold">
                    {g.user!.vip && "★ "}
                    {g.user!.firstname} {g.user!.lastname}
                  </p>
                  <p className="text-sm text-zinc-600">
                    {g.table.name}
                    {withMeal && g.user!.meal ? ` · ${g.user!.meal}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {!guests.length && <p className="no-print p-6 text-zinc-500">No guests seated yet.</p>}
        </div>
      )}
    </div>
  );
}
