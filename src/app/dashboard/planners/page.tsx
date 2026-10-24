"use client";

// Admin: every event planner at a glance (events, guests, helpers, last login),
// with "View as" to see exactly what they see. /dashboard/planners
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { viewAs } from "@/components/ViewAsBar";

type Planner = {
  id: string;
  name: string;
  email: string;
  lastLogin: string | null;
  events: { name: string; date: string | null; guests?: number; arrived?: number }[];
  guests: number;
  helpers: string[];
};
type Helper = { id: string; name: string; email: string; lastLogin: string | null; team: string };

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

export default function Planners() {
  const [data, setData] = useState<{ planners: Planner[]; helpers: Helper[]; adminEvents: number } | null>(null);
  useEffect(() => {
    fetch("/api/planners")
      .then((r) => r.json())
      .then((j) => j?.success && setData(j))
      .catch(() => undefined);
  }, []);
  const btn = "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm font-semibold hover:bg-zinc-50";
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white px-4 py-3">
        <Link href="/dashboard" className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm hover:bg-zinc-50">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="mr-auto text-lg font-bold">Planners</h1>
        <Link href="/dashboard/manage-users" className="text-sm underline">
          Add or change accounts
        </Link>
      </div>
      <div className="mx-auto max-w-5xl space-y-6 p-4">
        {!data && <p className="text-zinc-500">Loading…</p>}
        {data && (
          <>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border bg-white p-3">
                <div className="text-3xl font-extrabold">{data.planners.length}</div>
                <div className="text-sm text-zinc-500">event planners</div>
              </div>
              <div className="rounded-xl border bg-white p-3">
                <div className="text-3xl font-extrabold">{data.planners.reduce((n, p) => n + p.events.length, 0)}</div>
                <div className="text-sm text-zinc-500">their events</div>
              </div>
              <div className="rounded-xl border bg-white p-3">
                <div className="text-3xl font-extrabold">{data.helpers.length}</div>
                <div className="text-sm text-zinc-500">check-in staff</div>
              </div>
            </div>
            {data.adminEvents > 0 && (
              <p className="text-sm text-zinc-500">
                {data.adminEvents} event{data.adminEvents === 1 ? "" : "s"} still belong to you (no planner). Give one to a planner in the Events list
                (Owner box).
              </p>
            )}

            <section className="space-y-3">
              {!data.planners.length && <p className="text-zinc-500">No event planners yet. Add one in Manage users.</p>}
              {data.planners.map((p) => (
                <div key={p.id} className="rounded-xl border bg-white p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <b className="text-lg">{p.name}</b>
                    <span className="text-sm text-zinc-500">{p.email}</span>
                    <span className={`text-sm ${p.lastLogin && ago(p.lastLogin) !== "never" ? "text-zinc-600" : "text-red-600"}`}>
                      Last login: {ago(p.lastLogin)}
                    </span>
                    <button onClick={() => viewAs(p.id)} className={`${btn} ml-auto border-orange-300 text-orange-700`}>
                      <Eye className="h-4 w-4" /> View as {p.name.split(" ")[0]}
                    </button>
                  </div>
                  <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <b>{p.events.length} event{p.events.length === 1 ? "" : "s"}</b> · {p.guests} guests
                      <ul className="mt-1 space-y-0.5 text-zinc-600">
                        {p.events.map((e, i) => (
                          <li key={i}>
                            {e.name}
                            {e.date ? ` · ${e.date}` : ""} · {e.guests ?? 0} guests{e.arrived ? `, ${e.arrived} arrived` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <b>{p.helpers.length} check-in staff</b>
                      <p className="mt-1 text-zinc-600">{p.helpers.join(", ") || "None yet"}</p>
                    </div>
                  </div>
                </div>
              ))}
            </section>

            {data.helpers.length > 0 && (
              <section className="rounded-xl border bg-white">
                <p className="border-b px-4 py-2 font-semibold">Check-in staff</p>
                <ul>
                  {data.helpers.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-2 text-sm last:border-b-0">
                      <b>{h.name}</b>
                      <span className="text-zinc-500">team: {h.team}</span>
                      <span className="text-zinc-500">last login: {ago(h.lastLogin)}</span>
                      <button onClick={() => viewAs(h.id)} className={`${btn} ml-auto border-orange-300 text-orange-700`}>
                        <Eye className="h-4 w-4" /> View as
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
