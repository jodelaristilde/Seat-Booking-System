"use client";

// Read-only live view for the client (bride, family, host): who sits where and
// who has arrived, updating by itself. Opened from a private link the
// organizer shares: /live?t=...
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { applyBrand } from "@/lib/useBrand";
import { matches } from "@/lib/fold";

type Guest = { name: string; arrived: boolean; vip: boolean };
type Data = {
  event: { name: string; date: string | null; brand: "vip" | "seating4u" };
  tables: { name: string; guests: Guest[] }[];
  total: number;
  arrived: number;
  at: string;
};

function Live() {
  const t = useSearchParams().get("t");
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const j = await fetch(`/api/live?t=${encodeURIComponent(t ?? "")}`)
      .then((r) => r.json())
      .catch(() => null);
    if (j?.success) {
      setD(j);
      setErr("");
      applyBrand(j.event.brand);
    } else if (j) setErr(j.message || "This link is not valid.");
  }, [t]);
  useEffect(() => {
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), 10000);
    return () => clearInterval(id);
  }, [load]);

  const shown = useMemo(() => {
    if (!d) return [];
    if (!q.trim()) return d.tables;
    return d.tables
      .map((tb) => ({ ...tb, guests: matches(tb.name, q) ? tb.guests : tb.guests.filter((g) => matches(g.name, q)) }))
      .filter((tb) => tb.guests.length);
  }, [d, q]);

  if (err) return <p className="mx-auto mt-24 max-w-md rounded-xl border bg-white p-6 text-center text-lg font-semibold">{err}</p>;
  if (!d) return <p className="p-10 text-center text-zinc-500">Loading…</p>;
  const pct = d.total ? Math.round((d.arrived / d.total) * 100) : 0;

  return (
    <div className="guest-page min-h-screen bg-zinc-100 text-zinc-900">
      <div className="sticky top-0 z-10 border-b bg-white px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <BrandLogo width={170} style={{ height: "auto", maxHeight: 64 }} />
          <div className="mr-auto">
            <h1 className="text-xl font-bold leading-tight">{d.event.name}</h1>
            <p className="text-xs text-zinc-500">
              Live · updated {new Date(d.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
          </div>
          <div className="min-w-[14rem] flex-1 sm:flex-none">
            <div className="flex items-baseline justify-between text-sm">
              <b className="text-lg tabular-nums">
                {d.arrived} of {d.total} arrived
              </b>
              <span className="tabular-nums text-zinc-500">{pct}%</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-zinc-200">
              <div className="h-2 rounded-full bg-green-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a name or table…" className="h-9 w-full rounded-md border pl-8 pr-2 text-sm" />
          </div>
        </div>
      </div>
      <div className="mx-auto grid max-w-6xl gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((tb) => {
          const here = tb.guests.filter((g) => g.arrived).length;
          const full = here === tb.guests.length;
          return (
            <div key={tb.name} className={`rounded-xl border-2 bg-white p-3 ${full ? "border-green-400" : "border-zinc-200"}`}>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-lg font-extrabold">{tb.name}</span>
                <span className={`text-sm font-semibold tabular-nums ${full ? "text-green-700" : "text-zinc-500"}`}>
                  {here}/{tb.guests.length}
                </span>
              </div>
              <ul className="space-y-0.5 text-sm">
                {tb.guests.map((g, i) => (
                  <li key={i} className={`flex items-center gap-1.5 ${g.arrived ? "font-semibold text-zinc-900" : "text-zinc-500"}`}>
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${g.arrived ? "bg-green-600 text-white" : "border border-zinc-300"}`}>
                      {g.arrived ? "✓" : ""}
                    </span>
                    {g.vip && <span className="text-amber-500">★</span>}
                    {g.name}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {!shown.length && <p className="text-zinc-500">No match.</p>}
      </div>
      <p className="pb-6 text-center text-xs text-zinc-400">View only · updates every 10 seconds</p>
    </div>
  );
}

export default function LivePage() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-zinc-500">Loading…</p>}>
      <Live />
    </Suspense>
  );
}
