"use client";

// Bar screen for nightclub VIP nights, on a tablet or TV behind the bar:
// guests calling from their table, bottle orders to bring out, and the
// celebrations coming up (birthdays, sparklers). Updates by itself.
// /dashboard/bar (login required; staff accounts can use it)
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Bell, BellOff, Check, PartyPopper, Wine, Hand } from "lucide-react";

type Info = { host?: string; server?: string; celebration?: { type: string; at: string; note?: string; done?: boolean } | null };
type VTable = { id: string; name: string; info: Info };
type Order = { key: string; tableId: string; items: { name: string; qty: number }[]; total: number; by: string; at: string; status: string };
type Call = { key: string; tableId: string; kind: "server" | "bottle"; at: string; guest?: string };

const ago = (iso: string, now: number) => {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : `${m} min ago`;
};
// "23:30" tonight (after midnight counts as later tonight)
const minutesUntil = (hhmm: string, now: Date) => {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h)) return null;
  const t = new Date(now);
  t.setHours(h, m || 0, 0, 0);
  let diff = Math.round((t.getTime() - now.getTime()) / 60000);
  if (diff < -12 * 60) diff += 24 * 60; // 01:00 seen at 22:00 is in 3 hours
  return diff;
};

export default function BarScreen() {
  const [tables, setTables] = useState<VTable[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [sound, setSound] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const audio = useRef<AudioContext | null>(null);

  const beep = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audio.current ??= new Ctx();
      const ctx = audio.current;
      [0, 0.18].forEach((d, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = i ? 1175 : 880;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + d);
        g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d + 0.16);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + d);
        o.stop(ctx.currentTime + d + 0.18);
      });
    } catch {
      /* no sound */
    }
  }, []);

  const load = useCallback(async () => {
    const j = await fetch("/api/vip").then((r) => r.json()).catch(() => null);
    if (!j?.success) return;
    setTables(j.tables);
    setOrders(j.orders);
    setCalls(j.calls);
    // something new since last time: sound
    const keys = new Set<string>([...j.calls.map((c: Call) => c.key), ...j.orders.filter((o: Order) => o.status === "new").map((o: Order) => o.key)]);
    if (seen.current && [...keys].some((k) => !seen.current!.has(k)) && sound) beep();
    seen.current = keys;
  }, [beep, sound]);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      setNow(new Date());
      if (document.visibilityState === "visible") load();
    }, 4000);
    return () => clearInterval(t);
  }, [load]);

  const name = (id: string) => tables.find((t) => t.id === id)?.name ?? "?";
  const server = (id: string) => tables.find((t) => t.id === id)?.info.server;
  const act = async (url: string, body: object, ok: string) => {
    const r = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((x) => x.json())
      .catch(() => null);
    if (r?.success) {
      toast.success(ok);
      load();
    } else toast.error("Could not save. Try again.");
  };

  const waiting = orders.filter((o) => o.status === "new").sort((a, b) => a.at.localeCompare(b.at));
  const parties = tables
    .filter((t) => t.info.celebration && !t.info.celebration.done)
    .map((t) => ({ t, mins: minutesUntil(t.info.celebration!.at, now) }))
    .sort((a, b) => (a.mins ?? 9999) - (b.mins ?? 9999));
  const col = "rounded-2xl border bg-white p-3";

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-white px-4 py-2">
        <Link href="/dashboard/vip" className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm hover:bg-zinc-50">
          <ArrowLeft className="h-4 w-4" /> VIP tables
        </Link>
        <h1 className="mr-auto text-lg font-bold">Bar screen</h1>
        <span className="text-2xl font-bold tabular-nums">{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
        <button
          onClick={() => {
            setSound((s) => !s);
            if (!sound) beep();
          }}
          className={`inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm font-semibold ${sound ? "bg-lime-600 text-white" : "border"}`}
        >
          {sound ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />} Sound {sound ? "on" : "off"}
        </button>
      </div>

      <div className="grid gap-3 p-3 lg:grid-cols-3">
        {/* guests calling */}
        <section className={col}>
          <h2 className="mb-2 flex items-center gap-2 text-xl font-bold">
            <Hand className="h-5 w-5" /> Tables calling <span className="ml-auto rounded-full bg-red-600 px-2 text-base text-white">{calls.length}</span>
          </h2>
          {!calls.length && <p className="text-zinc-500">Nobody is waiting.</p>}
          <ul className="space-y-2">
            {calls.map((c) => (
              <li key={c.key} className="flex items-center gap-3 rounded-xl border-2 border-red-300 bg-red-50 p-3">
                <span className="text-3xl font-extrabold">{name(c.tableId)}</span>
                <div className="flex-1 text-sm">
                  <b>{c.kind === "bottle" ? "Wants another bottle" : "Wants their server"}</b>
                  <div className="text-zinc-600">
                    {server(c.tableId) ? `${server(c.tableId)} · ` : ""}
                    {ago(c.at, now.getTime())}
                  </div>
                </div>
                <button onClick={() => act("/api/vip/call", { key: c.key }, "Done")} className="rounded-lg bg-zinc-900 px-3 py-2 font-semibold text-white">
                  <Check className="inline h-4 w-4" /> Done
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* orders to bring */}
        <section className={col}>
          <h2 className="mb-2 flex items-center gap-2 text-xl font-bold">
            <Wine className="h-5 w-5" /> Bottles to bring out <span className="ml-auto rounded-full bg-lime-600 px-2 text-base text-white">{waiting.length}</span>
          </h2>
          {!waiting.length && <p className="text-zinc-500">All served.</p>}
          <ul className="space-y-2">
            {waiting.map((o) => (
              <li key={o.key} className="rounded-xl border-2 border-lime-300 bg-lime-50 p-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-extrabold">{name(o.tableId)}</span>
                  <div className="flex-1">
                    {o.items.map((i, k) => (
                      <div key={k} className="text-lg font-semibold">
                        {i.qty}× {i.name}
                      </div>
                    ))}
                  </div>
                  <button onClick={() => act("/api/vip/order", { key: o.key, status: "served" }, "Served")} className="rounded-lg bg-zinc-900 px-3 py-2 font-semibold text-white">
                    <Check className="inline h-4 w-4" /> Served
                  </button>
                </div>
                <div className="mt-1 text-sm text-zinc-600">
                  {server(o.tableId) ? `${server(o.tableId)} · ` : ""}by {o.by} · {ago(o.at, now.getTime())}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* celebrations */}
        <section className={col}>
          <h2 className="mb-2 flex items-center gap-2 text-xl font-bold">
            <PartyPopper className="h-5 w-5" /> Celebrations
          </h2>
          {!parties.length && <p className="text-zinc-500">None planned.</p>}
          <ul className="space-y-2">
            {parties.map(({ t, mins }) => {
              const due = mins !== null && mins <= 5;
              return (
                <li key={t.id} className={`rounded-xl border-2 p-3 ${due ? "border-red-400 bg-red-50" : "border-amber-300 bg-amber-50"}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-extrabold">{t.name}</span>
                    <div className="flex-1">
                      <div className="text-lg font-bold">
                        {t.info.celebration!.type} · {t.info.celebration!.at}
                      </div>
                      <div className={`text-sm font-semibold ${due ? "text-red-700" : "text-amber-900"}`}>
                        {mins === null ? "" : mins > 0 ? `in ${mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}` : mins === 0 ? "now!" : `${-mins} min late`}
                      </div>
                    </div>
                    <button onClick={() => act("/api/vip/celebrate", { tableId: t.id, done: true }, "Done")} className="rounded-lg bg-zinc-900 px-3 py-2 font-semibold text-white">
                      <Check className="inline h-4 w-4" /> Done
                    </button>
                  </div>
                  {(t.info.celebration!.note || t.info.host) && (
                    <p className="mt-1 text-sm text-zinc-700">
                      {t.info.host ? `${t.info.host}'s table` : ""}
                      {t.info.celebration!.note ? ` · ${t.info.celebration!.note}` : ""}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
