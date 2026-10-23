"use client";

// Seating chart for the venue: page 1 is the floor plan with every table
// number and how many guests sit there; then every table with its guests
// (meals and allergies for the kitchen), then an A–Z list "name → table".
// Print it or save as PDF for the venue manager, catering and staff.
// /dashboard/venue-chart (login required)
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

type SeatRow = {
  id: string;
  seat: number;
  isBooked: boolean;
  isReceived: boolean;
  table: { id: string; name: string };
  user: { id: string; firstname: string; lastname: string; vip?: boolean; meal?: string | null } | null;
};
type Pos = { id: string; name: string; posX: number | null; posY: number | null };
type Guest = { id: string; name: string; last: string; first: string; vip: boolean; meal: string; seat: number };
type Table = { id: string; name: string; seats: number; guests: Guest[]; x: number | null; y: number | null };

const shortName = (n: string) => n.replace(/^table\s*/i, "") || n;

export default function VenueChart() {
  const [tables, setTables] = useState<Table[]>([]);
  const [picture, setPicture] = useState<string | null>(null);
  const [aspect, setAspect] = useState(0.62);
  const [allergies, setAllergies] = useState<Record<string, string>>({});
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [showMap, setShowMap] = useState(true);
  const [showMeals, setShowMeals] = useState(true);
  const [showIndex, setShowIndex] = useState(true);
  const [printedAt] = useState(() => new Date().toLocaleString());

  useEffect(() => {
    (async () => {
      try {
        const [s, p, e, al, fm] = await Promise.all([
          fetch("/api/get-seat").then((r) => r.json()),
          fetch("/api/table-positions").then((r) => r.json()).catch(() => null),
          fetch("/api/events").then((r) => r.json()).catch(() => null),
          fetch("/api/allergies").then((r) => r.json()).catch(() => null),
          fetch("/api/floor-map").then((r) => r.json()).catch(() => null),
        ]);
        if (al?.success) setAllergies(al.data ?? {});
        if (e?.success) {
          const ev = e.events.find((x: { id: string }) => x.id === e.activeId);
          setEventName(ev?.name ?? "");
          setEventDate(ev?.date ?? "");
        }
        const pic: string | null = fm?.image?.data ?? null;
        if (pic) {
          const img = new Image();
          img.onload = () => img.naturalWidth && setAspect(img.naturalHeight / img.naturalWidth);
          img.src = pic;
          setPicture(pic);
        }
        const pos = new Map<string, Pos>(((p?.success ? p.data : []) as Pos[]).map((x) => [x.id, x]));
        const byTable = new Map<string, Table>();
        for (const st of (s?.success ? s.data : []) as SeatRow[]) {
          let t = byTable.get(st.table.id);
          if (!t) {
            const ps = pos.get(st.table.id);
            t = { id: st.table.id, name: st.table.name, seats: 0, guests: [], x: ps?.posX ?? null, y: ps?.posY ?? null };
            byTable.set(st.table.id, t);
          }
          t.seats++;
          if (st.isBooked && st.user)
            t.guests.push({
              id: st.user.id,
              first: st.user.firstname,
              last: st.user.lastname,
              name: `${st.user.firstname} ${st.user.lastname}`.trim(),
              vip: !!st.user.vip,
              meal: st.user.meal ?? "",
              seat: st.seat,
            });
        }
        const list = [...byTable.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
        list.forEach((t) => t.guests.sort((a, b) => a.seat - b.seat));
        setTables(list);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const total = tables.reduce((n, t) => n + t.guests.length, 0);
  const placed = tables.filter((t) => t.x != null && t.y != null);
  const index = useMemo(
    () =>
      tables
        .flatMap((t) => t.guests.map((g) => ({ ...g, table: t.name })))
        .sort((a, b) => `${a.last} ${a.first}`.localeCompare(`${b.last} ${b.first}`, undefined, { sensitivity: "base" })),
    [tables]
  );
  // meals: totals for the kitchen
  const meals = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of index) if (g.meal) m.set(g.meal, (m.get(g.meal) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [index]);

  if (loading) return <p className="p-8 text-zinc-500">Loading…</p>;

  const head = (title: string) => (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b-2 border-black pb-1.5">
      <div>
        <h1 className="text-xl font-bold">
          {eventName || "Seating chart"}
          {eventDate && <span className="ml-2 text-base font-normal text-zinc-600">{eventDate}</span>}
        </h1>
        <p className="text-sm text-zinc-600">{title}</p>
      </div>
      <p className="text-xs text-zinc-500">Printed {printedAt}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-white text-black">
      <style>{`@media print { .no-print { display: none !important } @page { margin: 9mm } .avoid { break-inside: avoid } .page { break-after: page } .page:last-child { break-after: auto } }
        .chart, .chart * { color: #000 } `}</style>
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-zinc-50 px-6 py-3 text-zinc-900">
        <Link href="/dashboard" className="inline-flex items-center gap-1 rounded border bg-white px-3 py-1.5 text-sm hover:bg-zinc-100">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1 rounded bg-lime-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-lime-700"
        >
          <Printer className="h-4 w-4" /> Print / save as PDF
        </button>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={showMap} onChange={(e) => setShowMap(e.target.checked)} /> Floor plan page
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={showMeals} onChange={(e) => setShowMeals(e.target.checked)} /> Meals &amp; allergies
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={showIndex} onChange={(e) => setShowIndex(e.target.checked)} /> A–Z list (name → table)
        </label>
      </div>

      <div className="chart mx-auto max-w-5xl bg-white px-6 py-6">
        {!tables.length && <p className="text-zinc-500">No tables yet.</p>}

        {/* 1. The floor plan with table numbers */}
        {showMap && tables.length > 0 && (
          <section className="page">
            {head(`Floor plan · ${tables.length} tables · ${total} guests seated`)}
            {placed.length ? (
              <div className="relative w-full overflow-hidden border border-zinc-300" style={{ aspectRatio: `1 / ${aspect}`, maxHeight: "165mm", marginInline: "auto" }}>
                {picture && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={picture} alt="Floor plan" className="absolute inset-0 h-full w-full object-fill opacity-60" />
                )}
                {placed.map((t) => (
                  <div
                    key={t.id}
                    className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 border-black bg-white leading-none shadow"
                    style={{ left: `${t.x}%`, top: `${t.y}%`, width: "2.6rem", height: "2.6rem" }}
                  >
                    <span className="text-base font-extrabold">{shortName(t.name)}</span>
                    <span className="text-[9px] font-semibold">
                      {t.guests.length}/{t.seats}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">The tables are not placed on a floor plan yet.</p>
            )}
            {placed.length > 0 && placed.length < tables.length && (
              <p className="mt-1 text-xs text-zinc-500">
                Not on the plan: {tables.filter((t) => t.x == null || t.y == null).map((t) => t.name).join(", ")}
              </p>
            )}
            <p className="mt-1 text-xs text-zinc-500">In each circle: table number, and guests / seats.</p>
            {showMeals && meals.length > 0 && (
              <p className="mt-2 text-sm">
                <b>Meals:</b> {meals.map(([m, n]) => `${m} ${n}`).join(" · ")}
              </p>
            )}
          </section>
        )}

        {/* 2. Every table with its guests */}
        {tables.length > 0 && (
          <section className="page">
            {head("Guests by table · ★ VIP · ⚠ allergy")}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 print:grid-cols-3">
              {tables.map((t) => (
                <div key={t.id} className="avoid rounded border border-black p-2">
                  <div className="mb-1 flex items-baseline justify-between border-b border-zinc-400 pb-0.5">
                    <b className="text-base">{t.name}</b>
                    <span className="text-xs tabular-nums">
                      {t.guests.length}/{t.seats}
                    </span>
                  </div>
                  {!t.guests.length && <p className="text-xs text-zinc-500">No guests</p>}
                  <ol className="space-y-0.5 text-[12px] leading-tight">
                    {t.guests.map((g) => (
                      <li key={g.id} className="flex gap-1">
                        <span className="w-4 shrink-0 text-right text-zinc-500 tabular-nums">{g.seat}</span>
                        <span className="flex-1">
                          {g.vip && "★ "}
                          {g.name}
                          {showMeals && (g.meal || allergies[g.id]) && (
                            <span className="block text-[10px] text-zinc-600">
                              {g.meal}
                              {allergies[g.id] && <b className="ml-1">⚠ {allergies[g.id]}</b>}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 3. A–Z: name → table */}
        {showIndex && index.length > 0 && (
          <section className="page">
            {head(`Guests A–Z · ${index.length} guests`)}
            <div className="columns-2 gap-6 text-[12px] md:columns-3 print:columns-3">
              {index.map((g) => (
                <div key={g.id} className="avoid flex justify-between gap-2 border-b border-zinc-200 py-0.5">
                  <span>
                    <b>{g.last}</b>, {g.first}
                    {g.vip && " ★"}
                  </span>
                  <span className="whitespace-nowrap font-bold">{shortName(g.table)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
