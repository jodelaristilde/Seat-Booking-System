"use client";

// The host's report after the event: how many came, when they arrived, who
// came at each table, and the meals served. Opened from the client's private
// link: /report?t=... Print it or save as PDF.
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { ReviewForm } from "@/components/ReviewForm";

type G = { name: string; vip: boolean; meal: string; came: boolean; at: string | null };
type Data = { event: { name: string; date: string | null }; tables: { name: string; guests: G[] }[] };
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function Report() {
  const t = useSearchParams().get("t");
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch(`/api/host-report?t=${encodeURIComponent(t ?? "")}`)
      .then((r) => r.json())
      .then((j) => (j?.success ? setD(j) : setErr(j?.message || "This link is not valid.")))
      .catch(() => setErr("Could not load the report."));
  }, [t]);

  const all = useMemo(() => d?.tables.flatMap((x) => x.guests) ?? [], [d]);
  const came = all.filter((g) => g.came);
  const times = came.filter((g) => g.at).map((g) => new Date(g.at!).getTime()).sort((a, b) => a - b);
  // arrivals per half hour
  const slots = useMemo(() => {
    if (!times.length) return [];
    const step = 30 * 60_000;
    const t0 = Math.floor(times[0] / step) * step;
    const n = Math.min(24, Math.floor((times[times.length - 1] - t0) / step) + 1);
    const out = Array.from({ length: n }, (_, i) => ({ at: new Date(t0 + i * step).toISOString(), n: 0 }));
    for (const x of times) out[Math.min(n - 1, Math.floor((x - t0) / step))].n++;
    return out;
  }, [times]);
  const meals = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of came) if (g.meal) m.set(g.meal, (m.get(g.meal) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [came]);

  if (err) return <p className="mx-auto mt-24 max-w-md rounded-xl border bg-white p-6 text-center text-lg font-semibold">{err}</p>;
  if (!d) return <p className="p-10 text-center text-zinc-500">Loading…</p>;
  const max = Math.max(1, ...slots.map((s) => s.n));
  return (
    <div className="min-h-screen bg-white text-black">
      <style>{`@media print { .no-print { display: none !important } @page { margin: 12mm } .avoid { break-inside: avoid } }`}</style>
      <div className="no-print flex justify-end gap-2 border-b bg-zinc-50 px-6 py-3">
        <button onClick={() => window.print()} className="inline-flex items-center gap-1 rounded bg-lime-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-lime-700">
          <Printer className="h-4 w-4" /> Print / save as PDF
        </button>
      </div>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between gap-4 border-b-2 border-black pb-3">
          <div>
            <h1 className="text-3xl font-bold">{d.event.name}</h1>
            <p className="text-zinc-600">{d.event.date ? `${d.event.date} · ` : ""}Thank you for celebrating with us</p>
          </div>
          <BrandLogo width={130} style={{ height: "auto", maxHeight: 56 }} />
        </div>

        <div className="mb-8 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl border p-4">
            <div className="text-4xl font-extrabold tabular-nums">{came.length}</div>
            <div className="text-sm text-zinc-600">guests came</div>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-4xl font-extrabold tabular-nums">{all.length}</div>
            <div className="text-sm text-zinc-600">guests invited</div>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-4xl font-extrabold tabular-nums">{all.length ? Math.round((came.length * 100) / all.length) : 0}%</div>
            <div className="text-sm text-zinc-600">came</div>
          </div>
        </div>

        {slots.length > 0 && (
          <section className="avoid mb-8">
            <h2 className="mb-1 text-xl font-bold">When guests arrived</h2>
            <p className="mb-3 text-sm text-zinc-600">
              First at {time(new Date(times[0]).toISOString())}, last at {time(new Date(times[times.length - 1]).toISOString())}.
            </p>
            <div className="flex h-40 items-end gap-1 border-b border-zinc-300">
              {slots.map((s) => (
                <div key={s.at} className="flex flex-1 flex-col items-center justify-end" title={`${time(s.at)}: ${s.n}`}>
                  {s.n > 0 && <span className="text-xs tabular-nums">{s.n}</span>}
                  <div className="w-full max-w-10 rounded-t bg-green-600" style={{ height: `${(s.n / max) * 120}px` }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1 text-[10px] text-zinc-500">
              {slots.map((s, i) => (
                <span key={s.at} className="flex-1 text-center">{i % 2 === 0 ? time(s.at) : ""}</span>
              ))}
            </div>
          </section>
        )}

        {meals.length > 0 && (
          <section className="avoid mb-8">
            <h2 className="mb-1 text-xl font-bold">Meals served</h2>
            <p className="text-lg">{meals.map(([m, n]) => `${n} ${m}`).join(" · ")}</p>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-xl font-bold">Who came, table by table</h2>
          <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
            {d.tables.map((tb) => {
              const here = tb.guests.filter((g) => g.came).length;
              return (
                <div key={tb.name} className="avoid rounded-lg border p-3">
                  <div className="mb-1 flex justify-between border-b pb-1">
                    <b>{tb.name}</b>
                    <span className="text-sm tabular-nums text-zinc-600">{here}/{tb.guests.length} came</span>
                  </div>
                  <ul className="space-y-0.5 text-sm">
                    {tb.guests.map((g, i) => (
                      <li key={i} className={`flex justify-between gap-2 ${g.came ? "" : "text-zinc-400"}`}>
                        <span>
                          {g.came ? "✓ " : "– "}
                          {g.vip && "★ "}
                          {g.name}
                        </span>
                        <span className="tabular-nums text-zinc-500">{g.at ? time(g.at) : g.came ? "" : "didn't come"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        <section className="no-print mt-10 rounded-xl border bg-zinc-50 p-5">
          <h2 className="mb-1 text-lg font-bold">How was your event?</h2>
          <p className="mb-3 text-sm text-zinc-600">A few words help us a lot. With your OK, we may show them on our website.</p>
          <ReviewForm t={t ?? ""} defaultRole="Host" />
        </section>
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-zinc-500">Loading…</p>}>
      <Report />
    </Suspense>
  );
}
