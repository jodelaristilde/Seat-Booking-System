"use client";

// History: who checked in whom, and when (desk, staff accounts, guests' phones),
// plus desk notes. A check-in can be undone from here.
// /dashboard/history (login required)
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, RefreshCcw } from "lucide-react";
import { matches } from "@/lib/fold";
import { toast } from "sonner";

type Entry = {
  at: string;
  by: string;
  action: "arrived" | "undo" | "desk-note" | "added";
  guest: string;
  table?: string;
  seatId?: string;
  detail?: string;
};
const fetcher = (u: string) => fetch(u).then((r) => r.json());
const LABEL: Record<Entry["action"], { text: string; cls: string }> = {
  arrived: { text: "Checked in", cls: "bg-green-100 text-green-800" },
  undo: { text: "Undone", cls: "bg-zinc-200 text-zinc-700" },
  "desk-note": { text: "Desk note", cls: "bg-amber-100 text-amber-800" },
  added: { text: "Added at the desk", cls: "bg-sky-100 text-sky-800" },
};

export default function History() {
  const { data, mutate, isLoading } = useSWR<{ success: boolean; data: Entry[] }>("/api/history", fetcher, {
    refreshInterval: 5000,
  });
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const entries = useMemo(() => data?.data ?? [], [data]);
  const shown = useMemo(
    () => entries.filter((e) => !q || matches(`${e.guest} ${e.table ?? ""} ${e.by} ${e.detail ?? ""}`, q)),
    [entries, q]
  );
  // the latest entry per seat decides whether "Undo" still makes sense
  const latestBySeat = useMemo(() => {
    const m = new Map<string, Entry>();
    for (const e of entries) if (e.seatId && (e.action === "arrived" || e.action === "undo") && !m.has(e.seatId)) m.set(e.seatId, e);
    return m;
  }, [entries]);

  const undo = async (e: Entry) => {
    if (!e.seatId || !window.confirm(`Undo the check-in of ${e.guest}? They go back to the guest list as not arrived.`)) return;
    setBusy(e.seatId);
    try {
      const r = await fetch("/api/update-seat-received", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatId: e.seatId, isReceived: false }),
      }).then((x) => x.json());
      if (!r.success) throw new Error(r.message);
      toast.success(`${e.guest} is back on the list`);
      mutate();
    } catch (err) {
      toast.error("Could not undo", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-zinc-50 px-6 py-3">
        <Link href="/dashboard" className="inline-flex items-center gap-1 rounded border bg-white px-3 py-1.5 text-sm hover:bg-zinc-100">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a guest, table or staff name…"
          className="w-64 rounded border px-3 py-1.5 text-sm"
        />
        <button onClick={() => mutate()} className="inline-flex items-center gap-1 rounded border bg-white px-3 py-1.5 text-sm hover:bg-zinc-100">
          <RefreshCcw className="h-4 w-4" /> Refresh
        </button>
      </div>
      <div className="mx-auto max-w-4xl px-6 py-6">
        <h1 className="text-3xl font-bold">History</h1>
        <p className="mb-5 text-zinc-600">Who checked in whom, and when. Newest first. Updates by itself.</p>
        {isLoading ? (
          <p className="text-zinc-500">Loading…</p>
        ) : !shown.length ? (
          <p className="text-zinc-500">Nothing yet. Check-ins and desk notes appear here as they happen.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">What</th>
                <th className="py-2 pr-3">Guest</th>
                <th className="py-2 pr-3">Table</th>
                <th className="py-2 pr-3">By</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((e, i) => {
                const l = LABEL[e.action] ?? LABEL.arrived;
                const canUndo = e.action === "arrived" && e.seatId && latestBySeat.get(e.seatId) === e;
                return (
                  <tr key={i} className="border-b border-zinc-100 align-top">
                    <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-zinc-600">
                      {new Date(e.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${l.cls}`}>{l.text}</span>
                      {e.detail && <div className="mt-0.5 text-xs text-zinc-600">{e.detail}</div>}
                    </td>
                    <td className="py-2 pr-3 font-medium">{e.guest}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{e.table ?? ""}</td>
                    <td className="py-2 pr-3 text-zinc-600">{e.by}</td>
                    <td className="py-2 text-right">
                      {canUndo && (
                        <button
                          onClick={() => undo(e)}
                          disabled={busy === e.seatId}
                          className="rounded border px-2 py-0.5 text-xs font-semibold hover:bg-red-50 hover:text-red-700"
                        >
                          {busy === e.seatId ? "…" : "Undo"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
