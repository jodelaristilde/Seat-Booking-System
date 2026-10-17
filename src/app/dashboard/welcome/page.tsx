"use client";

// Welcome TV: open this on a TV / tablet at the entrance (logged in).
// Each time a guest checks in, it shows "Welcome, Name! You're at Table 9"
// with the floor plan and the way from the door to their table.
// Between guests: the event name, the logo and how many have arrived.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Maximize, ArrowLeft } from "lucide-react";

type SeatRow = {
  id: string;
  isBooked: boolean;
  isReceived: boolean;
  table: { id: string; name: string; posX: number | null; posY: number | null; sizeW: number | null; sizeH: number | null; shape: string | null };
  user: { firstname: string; lastname: string; vip?: boolean } | null;
};
type Welcome = { id: string; name: string; table: SeatRow["table"]; vip: boolean };

const SHOW_MS = 7000;

export default function WelcomeTV() {
  const [eventName, setEventName] = useState("");
  const [picture, setPicture] = useState<string | null>(null);
  const [entrances, setEntrances] = useState<{ x: number; y: number }[]>([]);
  const [counts, setCounts] = useState({ came: 0, total: 0 });
  const [current, setCurrent] = useState<Welcome | null>(null);
  const queue = useRef<Welcome[]>([]);
  const known = useRef<Set<string> | null>(null);
  const showing = useRef(false);
  const [clock, setClock] = useState("");

  // event name, floor plan, entrances
  useEffect(() => {
    fetch("/api/events").then((r) => r.json()).then((j) => {
      if (j.success) setEventName(j.events.find((e: { id: string }) => e.id === j.activeId)?.name ?? "");
    }).catch(() => undefined);
    fetch("/api/floor-map").then((r) => r.json()).then((j) => j.image && setPicture(j.image.data)).catch(() => undefined);
    fetch("/api/event-entrance").then((r) => r.json()).then((j) => j.success && setEntrances(j.entrances)).catch(() => undefined);
    const t = setInterval(() => setClock(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })), 1000);
    return () => clearInterval(t);
  }, []);

  const next = () => {
    const w = queue.current.shift();
    if (!w) {
      showing.current = false;
      setCurrent(null);
      return;
    }
    showing.current = true;
    setCurrent(w);
    setTimeout(next, SHOW_MS);
  };

  // check for new arrivals every 3 seconds
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const j = await fetch("/api/get-seat", { cache: "no-store" }).then((r) => r.json());
        if (!j.success && !Array.isArray(j.data)) return;
        const seats: SeatRow[] = j.data ?? [];
        const booked = seats.filter((s) => s.isBooked);
        const arrived = booked.filter((s) => s.isReceived);
        setCounts({ came: arrived.length, total: booked.length });
        const ids = new Set(arrived.map((s) => s.id));
        if (known.current === null) {
          known.current = ids; // people already here when the screen opened: no welcome
          return;
        }
        const fresh = arrived.filter((s) => !known.current!.has(s.id));
        known.current = ids;
        for (const s of fresh) {
          queue.current.push({
            id: s.id,
            name: `${s.user?.firstname ?? ""} ${s.user?.lastname ?? ""}`.trim() || "Guest",
            table: s.table,
            vip: !!s.user?.vip,
          });
        }
        if (fresh.length && !showing.current) next();
      } catch {
        /* try again next time */
      }
    };
    poll();
    const t = setInterval(() => !stop && poll(), 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goFull = () => document.documentElement.requestFullscreen?.().catch(() => undefined);

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950 text-white">
      <style>{`
        @keyframes welcomeIn { from { opacity: 0; transform: translateY(30px) scale(.96) } to { opacity: 1; transform: none } }
        .welcome-in { animation: welcomeIn .7s cubic-bezier(.2,.8,.2,1) both }
        @keyframes wayDash { to { stroke-dashoffset: -36 } } .way-dash { animation: wayDash .9s linear infinite }
        @keyframes wayRing { 0%,100% { transform: scale(1) } 50% { transform: scale(1.2) } } .way-ring { animation: wayRing 1.2s ease-in-out infinite }
      `}</style>

      {/* small controls (hidden in full screen by moving the mouse away) */}
      <div className="absolute right-4 top-4 z-10 flex gap-2 opacity-30 transition-opacity hover:opacity-100">
        <Link href="/dashboard" className="flex items-center gap-1 rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <button onClick={goFull} className="flex items-center gap-1 rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
          <Maximize className="h-4 w-4" /> Full screen
        </button>
      </div>

      {/* top bar */}
      <div className="flex items-center justify-between px-10 pt-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="Seating4U" className="h-14 rounded bg-white px-2 py-1" />
        <div className="text-right">
          <div className="text-2xl font-semibold">{eventName}</div>
          <div className="text-lg text-emerald-300 tabular-nums">
            {counts.came} of {counts.total} guests arrived · {clock}
          </div>
        </div>
      </div>

      {current ? (
        <div key={current.id} className="welcome-in flex flex-1 items-center gap-10 px-10 pb-10">
          <div className="w-1/2">
            {current.vip && (
              <div className="mb-4 inline-block rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 px-5 py-2 text-xl font-extrabold text-amber-950">
                ⭐ VIP
              </div>
            )}
            <div className="text-4xl font-light text-emerald-200 xl:text-5xl">Welcome,</div>
            <div className="mt-2 text-6xl font-extrabold leading-tight xl:text-8xl">{current.name}!</div>
            <div className="mt-8 text-3xl font-light xl:text-4xl">You&apos;re at</div>
            <div className="text-7xl font-extrabold text-emerald-400 xl:text-9xl">{current.table.name}</div>
          </div>
          <div className="w-1/2">
            {picture && current.table.posX != null && current.table.posY != null ? (
              <div className="relative overflow-hidden rounded-2xl bg-white shadow-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={picture} alt="Floor plan" className="block w-full" />
                <Way t={current.table} entrances={entrances} />
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-10 text-center">
          <div className="text-3xl font-light text-emerald-200">Welcome to</div>
          <div className="mt-3 text-6xl font-extrabold xl:text-8xl">{eventName || "our event"}</div>
          <div className="mt-10 text-2xl text-zinc-300">Scan the QR code to find your seat</div>
        </div>
      )}
    </div>
  );
}

function Way({ t, entrances }: { t: SeatRow["table"]; entrances: { x: number; y: number }[] }) {
  const x = t.posX!;
  const y = t.posY!;
  const door = entrances.length
    ? [...entrances].sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]
    : null;
  const w = Math.max(5, (t.sizeW ?? 7) * 1.45);
  const round = (t.shape ?? "round") === "round";
  return (
    <div className="pointer-events-none absolute inset-0">
      {door && (
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <line x1={door.x} y1={door.y} x2={x} y2={y} stroke="white" strokeWidth={12} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <line x1={door.x} y1={door.y} x2={x} y2={y} stroke="#16a34a" strokeWidth={7} strokeLinecap="round" strokeDasharray="14 10" vectorEffect="non-scaling-stroke" className="way-dash" />
        </svg>
      )}
      <div
        className="absolute"
        style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, transform: "translate(-50%,-50%)", ...(t.sizeH && !round ? { height: `${t.sizeH * 1.45}%` } : { aspectRatio: "1" }) }}
      >
        <div className={`way-ring absolute inset-0 border-[6px] border-red-500 bg-red-500/20 shadow-[0_0_0_4px_white] ${round ? "rounded-full" : "rounded-lg"}`} />
      </div>
      {door && (
        <div
          className="absolute h-6 w-6 rounded-full bg-green-600 shadow-[0_0_0_5px_white]"
          style={{ left: `${door.x}%`, top: `${door.y}%`, transform: "translate(-50%,-50%)" }}
        />
      )}
    </div>
  );
}
