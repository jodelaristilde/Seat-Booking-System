"use client";

// A small "?" next to a title: click it for a short tip about this screen.
import { useEffect, useRef, useState } from "react";

export function HelpTip({ children, side = "left" }: { children: React.ReactNode; side?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="keep-ink flex h-5 w-5 items-center justify-center rounded-full border border-blue-300 bg-blue-50 text-xs font-bold text-blue-700 hover:bg-blue-100"
        aria-label="Help for this screen"
        title="Help"
      >
        ?
      </button>
      {open && (
        <span
          className={`keep-ink absolute top-7 z-[90] w-72 rounded-lg border border-blue-200 bg-white p-3 text-left text-sm font-normal leading-snug text-zinc-800 shadow-xl ${
            side === "left" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
