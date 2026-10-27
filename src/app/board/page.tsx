"use client";

// Arrivals board: put it on a TV or tablet at the entrance. Each guest who is
// checked in is welcomed by name with their table, VIPs in gold. Opened from
// the private live link: /board?t=...  (view only, updates by itself)
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Maximize, Volume2, VolumeX } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { applyBrand } from "@/lib/useBrand";

type Arrival = { id: string; name: string; table: string; vip: boolean; at: string };
type Data = { event: { name: string; brand: "vip" | "seating4u" }; total: number; arrived: number; recent: Arrival[] };

const SHOW_MS = 9000; // how long each big welcome stays on screen

function chime(vip: boolean) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const notes = vip ? [659.3, 830.6, 987.8, 1318.5] : [784, 1046.5];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.16;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.25, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.2);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 1.3);
    });
    setTimeout(() => ctx.close(), 2500);
  } catch {
    /* no sound on this device */
  }
}

function Board() {
  const t = useSearchParams().get("t");
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [sound, setSound] = useState(false);
  const [now, setNow] = useState<Arrival | null>(null); // the big welcome
  const queue = useRef<Arrival[]>([]);
  const known = useRef<Set<string> | null>(null);
  const soundRef = useRef(false);
  soundRef.current = sound;

  const load = useCallback(async () => {
    const j = await fetch(`/api/board?t=${encodeURIComponent(t ?? "")}`)
      .then((r) => r.json())
      .catch(() => null);
    if (!j) return; // no internet for a moment: keep what is on screen
    if (!j.success) return setErr(j.message || "This link is not valid.");
    setErr("");
    applyBrand(j.event.brand);
    setD(j);
    const list: Arrival[] = j.recent;
    if (!known.current) {
      known.current = new Set(list.map((a) => a.id)); // first load: don't replay old arrivals
      return;
    }
    const fresh = list.filter((a) => !known.current!.has(a.id)).reverse(); // oldest first
    fresh.forEach((a) => known.current!.add(a.id));
    queue.current.push(...fresh);
  }, [t]);

  useEffect(() => {
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [load]);

  // show the queued arrivals one after the other (faster when many arrive at once)
  const shownAt = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      const age = Date.now() - shownAt.current;
      const next = queue.current[0];
      if (next && age >= (queue.current.length > 1 ? 3500 : shownAt.current ? 4000 : 0)) {
        queue.current.shift();
        shownAt.current = Date.now();
        if (soundRef.current) chime(next.vip);
        setNow(next);
      } else if (!next && shownAt.current && age >= SHOW_MS) {
        shownAt.current = 0;
        setNow(null);
      }
    }, 300);
    return () => clearInterval(id);
  }, []);

  if (err) return <p className="mx-auto mt-24 max-w-md rounded-xl border bg-white p-6 text-center text-lg font-semibold">{err}</p>;
  if (!d) return <p className="p-10 text-center text-zinc-400">Loading…</p>;

  const pct = d.total ? Math.round((d.arrived / d.total) * 100) : 0;
  const latest = d.recent.slice(0, 8);

  return (
    <div className="board-page fixed inset-0 flex flex-col overflow-hidden bg-[#0f1a12] text-white">
      <style>{`
        @keyframes boardIn { 0% { opacity: 0; transform: translateY(30px) scale(.96) } 100% { opacity: 1; transform: none } }
        @keyframes boardGlow { 0%,100% { box-shadow: 0 0 40px rgba(251,191,36,.25) } 50% { box-shadow: 0 0 90px rgba(251,191,36,.55) } }
        .board-in { animation: boardIn .7s cubic-bezier(.2,.8,.2,1) both }
        .board-vip { animation: boardIn .7s cubic-bezier(.2,.8,.2,1) both, boardGlow 2.4s ease-in-out infinite }
      `}</style>

      {/* top: logo, event, count, controls */}
      <div className="flex items-center gap-4 px-[3vw] py-[2vh]">
        <BrandLogo dark width={200} style={{ height: "auto", maxHeight: 64 }} />
        <h1 className="mr-auto truncate text-[clamp(1.2rem,2.6vw,2.6rem)] font-bold">{d.event.name}</h1>
        <div className="text-right">
          <p className="text-[clamp(1rem,2vw,2rem)] font-extrabold tabular-nums">
            {d.arrived} <span className="font-normal text-white/60">of</span> {d.total}
          </p>
          <p className="text-sm text-white/60">guests arrived · {pct}%</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setSound((s) => !s);
              if (!sound) chime(false);
            }}
            className="rounded-lg border border-white/20 p-2 text-white/80 hover:bg-white/10"
            aria-label={sound ? "Sound off" : "Sound on"}
            title={sound ? "Sound off" : "Sound on"}
          >
            {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
          <button
            onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)}
            className="rounded-lg border border-white/20 p-2 text-white/80 hover:bg-white/10"
            aria-label="Full screen"
            title="Full screen"
          >
            <Maximize className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="mx-[3vw] h-1.5 rounded-full bg-white/10">
        <div className="h-1.5 rounded-full bg-lime-400 transition-all duration-1000" style={{ width: `${pct}%` }} />
      </div>

      {/* middle: the big welcome */}
      <div className="flex flex-1 items-center justify-center px-[4vw]">
        {now ? (
          <div
            key={now.id}
            className={`w-full max-w-[85vw] rounded-[2rem] px-[4vw] py-[5vh] text-center ${
              now.vip ? "board-vip border-4 border-amber-400 bg-gradient-to-b from-amber-500/25 to-amber-900/20" : "board-in border border-white/15 bg-white/5"
            }`}
          >
            <p className={`text-[clamp(1.2rem,3vw,3rem)] font-semibold uppercase tracking-[0.3em] ${now.vip ? "text-amber-300" : "text-lime-300"}`}>
              {now.vip ? "★ Welcome ★" : "Welcome"}
            </p>
            <p className="my-[2vh] break-words text-[clamp(2.5rem,8vw,8rem)] font-extrabold leading-none">{now.name}</p>
            <p className="text-[clamp(1.4rem,4vw,4rem)] text-white/85">
              Your table: <b className={now.vip ? "text-amber-300" : "text-lime-300"}>{now.table}</b>
            </p>
          </div>
        ) : (
          <div className="board-in text-center">
            <p className="text-[clamp(1.2rem,3vw,3rem)] uppercase tracking-[0.3em] text-lime-300">Welcome to</p>
            <p className="mt-[2vh] text-[clamp(2.5rem,7vw,7rem)] font-extrabold leading-tight">{d.event.name}</p>
            <p className="mt-[2vh] text-[clamp(1rem,2vw,2rem)] text-white/60">Please check in at the desk</p>
          </div>
        )}
      </div>

      {/* bottom: the last arrivals */}
      {latest.length > 0 && (
        <div className="border-t border-white/10 bg-black/25 px-[3vw] py-[2vh]">
          <p className="mb-2 text-sm uppercase tracking-widest text-white/50">Just arrived</p>
          <div className="flex flex-wrap gap-2">
            {latest.map((a) => (
              <span
                key={a.id}
                className={`rounded-full px-4 py-1.5 text-[clamp(.9rem,1.4vw,1.4rem)] ${
                  a.vip ? "bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/60" : "bg-white/10 text-white/90"
                }`}
              >
                {a.vip && "★ "}
                {a.name} <span className="text-white/50">· {a.table}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BoardPage() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-zinc-400">Loading…</p>}>
      <Board />
    </Suspense>
  );
}
