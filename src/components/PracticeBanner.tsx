"use client";

// Shown while the practice event is open: everything here is pretend.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GraduationCap } from "lucide-react";

export async function startPractice() {
  const r = await fetch("/api/practice", { method: "POST" }).then((x) => x.json()).catch(() => null);
  if (r?.success) {
    toast.success("Practice event ready: 16 sample guests and 4 tables. Try anything!");
    setTimeout(() => window.location.reload(), 700);
  } else toast.error("Could not make the practice event. Check your internet and try again.");
}

export function PracticeBanner() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    fetch("/api/practice")
      .then((r) => r.json())
      .then((j) => setOn(!!j?.practice))
      .catch(() => undefined);
  }, []);
  if (!on) return null;
  const end = async () => {
    if (!window.confirm("Delete the practice event and go back to your real event?")) return;
    const r = await fetch("/api/practice", { method: "DELETE" }).then((x) => x.json()).catch(() => null);
    if (r?.success) window.location.reload();
    else toast.error(r?.message ?? "Could not delete it");
  };
  return (
    <div className="keep-ink flex flex-wrap items-center gap-2 border-b border-sky-300 bg-sky-100 px-4 py-2 text-sm text-sky-950">
      <GraduationCap className="h-5 w-5 shrink-0" />
      <span className="flex-1">
        <b>Practice event.</b> These are sample guests: try importing, seating, checking in. Nothing here is real.
      </span>
      <button onClick={end} className="rounded-md bg-sky-700 px-3 py-1.5 font-semibold text-white hover:bg-sky-800">
        I&apos;m done: delete the practice event
      </button>
    </div>
  );
}
