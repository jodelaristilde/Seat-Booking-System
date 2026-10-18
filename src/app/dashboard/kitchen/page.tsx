"use client";

// Kitchen screen: live, for the caterer. Meals per table for the guests who
// have ARRIVED, with allergies in red. Updates by itself every few seconds.
// /dashboard/kitchen (login required)
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Maximize } from "lucide-react";

type SeatRow = {
  id: string;
  seat: number;
  isBooked: boolean;
  isReceived: boolean;
  table: { id: string; name: string };
  user: { id: string; firstname: string; lastname: string; vip?: boolean; meal?: string | null } | null;
};

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const byTable = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
const count = (meals: string[]) => {
  const m = new Map<string, number>();
  for (const x of meals) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

export default function Kitchen() {
  const { data: seatsRes, isLoading } = useSWR<{ success: boolean; data: SeatRow[] }>("/api/get-seat", fetcher, {
    refreshInterval: 3000,
  });
  const { data: alRes } = useSWR<{ success: boolean; data: Record<string, string> }>("/api/allergies", fetcher, {
    refreshInterval: 10000,
  });
  const allergies = alRes?.data ?? {};
  const [onlyArrived, setOnlyArrived] = useState(true);

  const seats = useMemo(() => (seatsRes?.success ? seatsRes.data : []).filter((s) => s.isBooked && s.user), [seatsRes]);
  const tables = useMemo(() => {
    const m = new Map<string, { name: string; all: SeatRow[] }>();
    for (const s of seats) {
      const t = m.get(s.table.id) ?? { name: s.table.name, all: [] };
      t.all.push(s);
      m.set(s.table.id, t);
    }
    return [...m.values()].sort((a, b) => byTable(a.name, b.name));
  }, [seats]);

  const here = seats.filter((s) => s.isReceived);
  const mealOf = (s: SeatRow) => s.user!.meal?.trim() || "No meal chosen";
  const totalNow = count(here.map(mealOf));
  const totalLeft = count(seats.filter((s) => !s.isReceived).map(mealOf));

  const fullScreen = () => document.documentElement.requestFullscreen?.().catch(() => undefined);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-5 py-3">
        <Link href="/dashboard" className="inline-flex items-center gap-1 rounded border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="mr-auto text-xl font-extrabold">Kitchen · meals to serve</h1>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyArrived} onChange={(e) => setOnlyArrived(e.target.checked)} className="h-4 w-4" />
          Only guests who have arrived
        </label>
        <button onClick={fullScreen} className="inline-flex items-center gap-1 rounded border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
          <Maximize className="h-4 w-4" /> Full screen
        </button>
      </div>

      {isLoading ? (
        <p className="p-8 text-zinc-400">Loading…</p>
      ) : (
        <div className="p-5">
          {/* totals */}
          <div className="mb-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-green-700 p-4">
              <div className="text-xs font-bold uppercase tracking-widest text-green-100">Arrived: serve now · {here.length} guests</div>
              <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-2xl font-extrabold">
                {totalNow.length ? totalNow.map(([m, n]) => <span key={m}>{n} {m}</span>) : <span className="text-green-200">Nobody yet</span>}
              </div>
            </div>
            <div className="rounded-xl bg-zinc-800 p-4">
              <div className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                Still expected · {seats.length - here.length} guests
              </div>
              <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-2xl font-bold text-zinc-200">
                {totalLeft.length ? totalLeft.map(([m, n]) => <span key={m}>{n} {m}</span>) : <span>Everyone is here</span>}
              </div>
            </div>
          </div>

          {/* tables */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tables.map((t) => {
              const arrived = t.all.filter((s) => s.isReceived);
              const list = onlyArrived ? arrived : t.all;
              if (onlyArrived && !arrived.length) return null;
              const done = arrived.length === t.all.length;
              const al = list.filter((s) => allergies[s.user!.id]);
              return (
                <div key={t.name} className={`rounded-xl border-2 p-3 ${done ? "border-green-500 bg-green-950" : "border-zinc-700 bg-zinc-900"}`}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-extrabold">{t.name}</span>
                    <span className={`text-sm font-bold ${done ? "text-green-400" : "text-zinc-400"}`}>
                      {done ? "✓ all here" : `${arrived.length}/${t.all.length} here`}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-xl font-bold">
                    {count(list.map(mealOf)).map(([m, n]) => (
                      <span key={m}>
                        {n} {m}
                      </span>
                    ))}
                  </div>
                  {al.length > 0 && (
                    <div className="mt-2 rounded-lg bg-red-600 px-2 py-1 text-sm font-bold">
                      {al.map((s) => (
                        <div key={s.id}>
                          ⚠ {s.user!.firstname} {s.user!.lastname} (seat {s.seat}): {allergies[s.user!.id]}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {onlyArrived && !here.length && <p className="mt-4 text-zinc-400">Tables appear here as soon as their guests arrive.</p>}
        </div>
      )}
    </div>
  );
}
