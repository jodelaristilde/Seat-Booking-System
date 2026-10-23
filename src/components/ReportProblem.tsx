"use client";

// "Report a problem": the person writes what went wrong; the admin reads it
// later on /dashboard/problems (no phone call needed).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";

export const openReportProblem = () => window.dispatchEvent(new Event("seating4u:report-problem"));

export function ReportProblem() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("seating4u:report-problem", show);
    return () => window.removeEventListener("seating4u:report-problem", show);
  }, []);
  if (!open) return null;
  const send = async () => {
    if (!text.trim()) return toast.error("Write in a few words what happened");
    setBusy(true);
    const r = await fetch("/api/problems", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, page: window.location.pathname }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.success) {
      toast.success("Sent. Thank you! We'll look at it.");
      setText("");
      setOpen(false);
    } else toast.error("Could not send. Check your internet and try again.");
  };
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 text-zinc-900 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center">
          <h2 className="mr-auto text-lg font-bold">Report a problem</h2>
          <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-zinc-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-2 text-sm text-zinc-600">What were you trying to do, and what happened? Your event and this screen are added for you.</p>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="e.g. I imported my Excel file but table 5 is empty"
          className="w-full rounded-md border p-2 text-sm"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="rounded-md border px-3 py-2 text-sm">
            Cancel
          </button>
          <button onClick={send} disabled={busy} className="rounded-md bg-lime-600 px-4 py-2 text-sm font-semibold text-white hover:bg-lime-700 disabled:opacity-50">
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
