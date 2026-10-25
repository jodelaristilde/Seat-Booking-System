"use client";

// Admin: every event planner at a glance (events, guests, helpers, last login),
// with "View as" to see exactly what they see. /dashboard/planners
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Eye, Star, Trash2 } from "lucide-react";
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
type Req = { id: string; at: string; kind: string; name: string; company: string; email: string; phone: string; message: string; done?: boolean };
type Review = { id: string; at: string; name: string; role: string; stars: number; text: string; approved?: boolean };
type Helper = { id: string; name: string; email: string; lastLogin: string | null; team: string };

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

export default function Planners() {
  const [data, setData] = useState<{ planners: Planner[]; helpers: Helper[]; adminEvents: number } | null>(null);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const loadExtras = () => {
    fetch("/api/access-request").then((r) => r.json()).then((j) => j?.success && setReqs(j.requests)).catch(() => undefined);
    fetch("/api/reviews?all=1").then((r) => r.json()).then((j) => j?.success && setReviews(j.reviews)).catch(() => undefined);
  };
  useEffect(() => {
    fetch("/api/planners")
      .then((r) => r.json())
      .then((j) => j?.success && setData(j))
      .catch(() => undefined);
    loadExtras();
  }, []);
  const put = async (url: string, body: object) => {
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => undefined);
    loadExtras();
  };
  const openReqs = reqs.filter((r) => !r.done);
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

        {/* requests from the homepage / venues page */}
        <section className="rounded-xl border bg-white">
          <p className="border-b px-4 py-2 font-semibold">
            Requests for access {openReqs.length > 0 && <span className="ml-1 rounded-full bg-lime-600 px-2 text-sm text-white">{openReqs.length} new</span>}
          </p>
          {!reqs.length && <p className="px-4 py-3 text-sm text-zinc-500">None yet. They come from the homepage and the venues page.</p>}
          <ul>
            {reqs.slice(0, 50).map((r) => (
              <li key={r.id} className={`border-b px-4 py-3 text-sm last:border-b-0 ${r.done ? "opacity-50" : ""}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.kind === "venue" ? "bg-sky-100 text-sky-800" : "bg-lime-100 text-lime-800"}`}>
                    {r.kind === "venue" ? "Venue" : "Planner"}
                  </span>
                  <b>{r.name}</b>
                  {r.company && <span>{r.company}</span>}
                  {r.email && <a href={`mailto:${r.email}`} className="text-blue-700 underline">{r.email}</a>}
                  {r.phone && <a href={`tel:${r.phone}`} className="text-blue-700 underline">{r.phone}</a>}
                  <span className="text-zinc-400">{new Date(r.at).toLocaleDateString()}</span>
                  <button onClick={() => put("/api/access-request", { id: r.id, done: !r.done })} className={`${btn} ml-auto`}>
                    <Check className="h-4 w-4" /> {r.done ? "Not done" : "Done"}
                  </button>
                </div>
                {r.message && <p className="mt-1 whitespace-pre-wrap text-zinc-700">{r.message}</p>}
              </li>
            ))}
          </ul>
        </section>
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

        {/* reviews: approve to show them on the homepage */}
        <section className="rounded-xl border bg-white">
          <p className="border-b px-4 py-2 font-semibold">Reviews (only approved ones show on the homepage)</p>
          {!reviews.length && <p className="px-4 py-3 text-sm text-zinc-500">No reviews yet. Hosts can leave one on their report; planners from their menu.</p>}
          <ul>
            {reviews.map((r) => (
              <li key={r.id} className="border-b px-4 py-3 text-sm last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex text-amber-500">
                    {Array.from({ length: r.stars }, (_, i) => (
                      <Star key={i} className="h-4 w-4 fill-current" />
                    ))}
                  </span>
                  <b>{r.name}</b> <span className="text-zinc-500">{r.role}</span>
                  <span className="text-zinc-400">{new Date(r.at).toLocaleDateString()}</span>
                  <button
                    onClick={() => put("/api/reviews", { id: r.id, approved: !r.approved })}
                    className={`${btn} ml-auto ${r.approved ? "border-green-400 bg-green-50 text-green-800" : ""}`}
                  >
                    {r.approved ? "✓ On the homepage" : "Show on homepage"}
                  </button>
                  <button onClick={() => window.confirm("Delete this review?") && put("/api/reviews", { id: r.id, delete: true })} className="rounded p-1 text-red-600 hover:bg-red-50" aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 text-zinc-700">{r.text}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
