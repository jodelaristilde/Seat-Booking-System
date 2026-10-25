"use client";

// A short review (stars + a few words). Used by the host on their report page
// (with their private link) and by planners from the menu. The admin approves
// it before it shows on the homepage.
import { useEffect, useState } from "react";
import { Star, X } from "lucide-react";

export function ReviewForm({ t, defaultRole, onDone }: { t?: string; defaultRole: string; onDone?: () => void }) {
  const [stars, setStars] = useState(5);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<"" | "busy" | "sent" | "error">("");
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("busy");
    const j = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t, stars, text, name, role: defaultRole }),
    }).then((r) => r.json()).catch(() => null);
    setState(j?.success ? "sent" : "error");
    if (j?.success) setTimeout(() => onDone?.(), 1500);
  };
  if (state === "sent") return <p className="font-semibold text-green-700">Thank you for your review!</p>;
  return (
    <form onSubmit={send} className="space-y-2">
      <div className="flex gap-1" role="radiogroup" aria-label="Stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setStars(n)} aria-label={`${n} stars`}>
            <Star className={`h-7 w-7 ${n <= stars ? "fill-amber-400 text-amber-400" : "text-zinc-300"}`} />
          </button>
        ))}
      </div>
      <textarea required value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="How was it? A few words…" className="w-full rounded-md border p-2 text-sm" />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (shown with the review)" className="w-full rounded-md border p-2 text-sm" />
      <button disabled={state === "busy"} className="rounded-md bg-lime-600 px-4 py-2 text-sm font-semibold text-white hover:bg-lime-700 disabled:opacity-50">
        {state === "busy" ? "Sending…" : "Send my review"}
      </button>
      {state === "error" && <p className="text-sm text-red-700">Could not send. Try again.</p>}
    </form>
  );
}

// planners: menu → Leave a review
export const openReview = () => window.dispatchEvent(new Event("seating4u:review"));
export function ReviewDialog() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("seating4u:review", show);
    return () => window.removeEventListener("seating4u:review", show);
  }, []);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 text-zinc-900 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center">
          <h2 className="mr-auto text-lg font-bold">Leave a review</h2>
          <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-zinc-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-sm text-zinc-600">How is Seating4U working for you? With your OK, we may show it on our website.</p>
        <ReviewForm defaultRole="Event planner" onDone={() => setOpen(false)} />
      </div>
    </div>
  );
}
