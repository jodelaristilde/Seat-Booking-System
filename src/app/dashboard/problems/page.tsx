"use client";

// Admin: the problems people reported from the app (menu → Report a problem).
// /dashboard/problems (admin only)
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";

type Problem = { id: string; at: string; who: string; event: string; page: string; text: string; device: string; done?: boolean };

export default function Problems() {
  const [list, setList] = useState<Problem[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const load = useCallback(async () => {
    const j = await fetch("/api/problems").then((r) => r.json()).catch(() => null);
    setList(j?.success ? j.problems : []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const mark = async (p: Problem) => {
    await fetch("/api/problems", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, done: !p.done }) });
    load();
  };
  const shown = (list ?? []).filter((p) => showDone || !p.done);
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white px-4 py-3">
        <Link href="/dashboard" className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm hover:bg-zinc-50">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="mr-auto text-lg font-bold">Problems reported</h1>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show handled
        </label>
      </div>
      <div className="mx-auto max-w-3xl space-y-3 p-4">
        {!list && <p className="text-zinc-500">Loading…</p>}
        {list && !shown.length && <p className="text-zinc-500">Nothing to look at. 🎉</p>}
        {shown.map((p) => (
          <div key={p.id} className={`rounded-xl border bg-white p-4 ${p.done ? "opacity-60" : ""}`}>
            <div className="mb-1 flex flex-wrap items-center gap-x-3 text-sm text-zinc-500">
              <b className="text-zinc-900">{p.who}</b>
              <span>{new Date(p.at).toLocaleString()}</span>
              {p.event && <span>Event: {p.event}</span>}
              {p.page && <span>Page: {p.page}</span>}
            </div>
            <p className="whitespace-pre-wrap">{p.text}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="truncate text-xs text-zinc-400" title={p.device}>
                {/iPhone|iPad/.test(p.device) ? "iPhone/iPad" : /Android/.test(p.device) ? "Android" : /Mac/.test(p.device) ? "Mac" : /Windows/.test(p.device) ? "Windows" : ""}
              </span>
              <button onClick={() => mark(p)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm hover:bg-zinc-50">
                <Check className="h-4 w-4" /> {p.done ? "Not handled" : "Handled"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
