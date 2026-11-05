"use client";

// "Show the way" at the desk: the same map the guest sees on their phone
// (the door, the green line, the little walking person and their table
// flashing), opened for one guest on this computer. Nothing is checked in.
// Open it with: window.dispatchEvent(new CustomEvent("seating4u:show-way", { detail: seatId }))
import { useEffect, useState } from "react";
import { X } from "lucide-react";

export function showWay(seatId: string) {
  window.dispatchEvent(new CustomEvent("seating4u:show-way", { detail: seatId }));
}

export function ShowWayDialog() {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const open = async (e: Event) => {
      const seatId = (e as CustomEvent<string>).detail;
      if (!seatId) return;
      const j = await fetch("/api/events").then((r) => r.json()).catch(() => null);
      const ev = j?.activeId ? `event=${encodeURIComponent(j.activeId)}&` : "";
      setSrc(`/seat-scanning?${ev}show=${encodeURIComponent(seatId)}`);
    };
    const closed = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data === "seating4u:way-closed") setSrc(null);
    };
    window.addEventListener("seating4u:show-way", open);
    window.addEventListener("message", closed);
    return () => {
      window.removeEventListener("seating4u:show-way", open);
      window.removeEventListener("message", closed);
    };
  }, []);
  useEffect(() => {
    if (!src) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setSrc(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [src]);
  if (!src) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={() => setSrc(null)}>
      <div
        className="relative h-[min(88vh,820px)] w-[min(96vw,1200px)] overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <iframe src={src} title="The way to the table" className="h-full w-full border-0" />
        <button
          type="button"
          onClick={() => setSrc(null)}
          className="absolute right-3 bottom-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-zinc-700 shadow ring-1 ring-zinc-300 hover:bg-zinc-50"
          aria-label="Close"
          title="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
