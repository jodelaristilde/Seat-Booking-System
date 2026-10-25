"use client";

// "Request access" form (homepage: planners; /venues: partner venues).
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

export function RequestForm({ kind = "planner" }: { kind?: "planner" | "venue" }) {
  const [f, setF] = useState({ name: "", company: "", email: "", phone: "", message: "", website: "" });
  const [state, setState] = useState<"" | "busy" | "sent" | "error">("");
  const [msg, setMsg] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("busy");
    const j = await fetch("/api/access-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, kind }),
    }).then((r) => r.json()).catch(() => null);
    if (j?.success) setState("sent");
    else {
      setState("error");
      setMsg(j?.message ?? "Could not send. Check your internet and try again.");
    }
  };
  if (state === "sent")
    return (
      <div className="rounded-2xl bg-white p-6 text-center text-zinc-900">
        <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-lime-600" />
        <p className="text-lg font-bold">Thank you! We received your request.</p>
        <p className="text-zinc-600">We&apos;ll contact you soon.</p>
      </div>
    );
  const input = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900";
  return (
    <form onSubmit={send} className="space-y-3 rounded-2xl bg-white p-5 text-left text-zinc-900 shadow-xl sm:p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <input required value={f.name} onChange={set("name")} placeholder="Your name" className={input} />
        <input value={f.company} onChange={set("company")} placeholder={kind === "venue" ? "Venue name" : "Company (optional)"} className={input} />
        <input type="email" value={f.email} onChange={set("email")} placeholder="Email" className={input} />
        <input value={f.phone} onChange={set("phone")} placeholder="Phone" className={input} />
      </div>
      <textarea value={f.message} onChange={set("message")} rows={3} placeholder={kind === "venue" ? "How many events a year? Anything we should know?" : "Your next event (date, number of guests)…"} className={input} />
      {/* hidden from people; bots fill it in */}
      <input value={f.website} onChange={set("website")} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <button disabled={state === "busy"} className="w-full rounded-lg bg-lime-600 py-3 text-lg font-bold text-white hover:bg-lime-700 disabled:opacity-60">
        {state === "busy" ? "Sending…" : kind === "venue" ? "Become a partner venue" : "Request access"}
      </button>
      {state === "error" && <p className="text-sm text-red-700">{msg}</p>}
    </form>
  );
}

