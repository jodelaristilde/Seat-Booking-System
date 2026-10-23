"use client";

// Nightclub VIP board: every table with its booking (host + party size),
// people in at the door, minimum spend and what was ordered, server,
// promoter and celebration. Servers log bottles here; the bar screen shows them.
// /dashboard/vip (login required)
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { ArrowLeft, Minus, Plus, Settings2, Wine, Download, Martini, PartyPopper, X } from "lucide-react";

type Info = {
  status?: "open" | "booked";
  host?: string;
  phone?: string;
  partySize?: number;
  arrived?: number;
  minimum?: number;
  server?: string;
  promoter?: string;
  celebration?: { type: string; at: string; note?: string; done?: boolean } | null;
};
type VTable = { id: string; name: string; seats: number; info: Info; spent: number };
type Item = { name: string; qty: number; price: number };
type Order = { key: string; tableId: string; items: Item[]; total: number; by: string; at: string; status: "new" | "served" | "void" };
type Data = { tables: VTable[]; orders: Order[]; calls: unknown[]; menu: { name: string; price: number }[]; staff: { servers: string[]; promoters: string[] } };

const $ = (n: number) => `$${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const MINE_KEY = "seating4u-vip-my-server";
const read = (k: string) => {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* fine */
  }
};
const send = async (url: string, method: string, body: object) => {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((x) => x.json())
    .catch(() => null);
  if (!r?.success) throw new Error(r?.message || "Could not save");
  return r;
};

export default function VipBoard() {
  const { data: session } = useSession();
  const staff = (session?.user as { role?: string } | undefined)?.role === "staff";
  const [d, setD] = useState<Data | null>(null);
  const [eventName, setEventName] = useState("");
  const [mine, setMine] = useState("");
  const [open, setOpen] = useState<string | null>(null); // table being edited
  const [tab, setTab] = useState<"bottles" | "booking">("bottles");
  const [settings, setSettings] = useState(false);

  const load = useCallback(async () => {
    const j = await fetch("/api/vip").then((r) => r.json()).catch(() => null);
    if (j?.success) setD(j);
  }, []);
  useEffect(() => {
    load();
    setMine(read(MINE_KEY));
    fetch("/api/events")
      .then((r) => r.json())
      .then((e) => e?.success && setEventName(e.events.find((x: { id: string }) => x.id === e.activeId)?.name ?? ""))
      .catch(() => undefined);
    const t = setInterval(() => document.visibilityState === "visible" && load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  const shown = useMemo(() => (d?.tables ?? []).filter((t) => !mine || t.info.server === mine), [d, mine]);
  if (!d) return <p className="p-8 text-zinc-500">Loading…</p>;

  const booked = d.tables.filter((t) => t.info.status === "booked");
  const sold = d.tables.reduce((n, t) => n + t.spent, 0);
  const people = booked.reduce((n, t) => n + (t.info.arrived ?? 0), 0);
  const expected = booked.reduce((n, t) => n + (t.info.partySize ?? 0), 0);
  const reached = d.tables.filter((t) => t.info.minimum && t.spent >= t.info.minimum).length;
  const table = d.tables.find((t) => t.id === open) ?? null;

  const arrive = async (t: VTable, delta: number) => {
    try {
      await send("/api/vip/arrive", "PUT", { tableId: t.id, delta });
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const report = () => {
    const wb = XLSX.utils.book_new();
    const rows = d.tables.map((t) => ({
      Table: t.name,
      Status: t.info.status === "booked" ? "Booked" : "Open",
      Host: t.info.host ?? "",
      Phone: t.info.phone ?? "",
      "Party size": t.info.partySize ?? "",
      "People in": t.info.arrived ?? 0,
      Minimum: t.info.minimum ?? 0,
      Spent: t.spent,
      "Minimum reached": t.info.minimum ? (t.spent >= t.info.minimum ? "Yes" : `No (${$(t.info.minimum - t.spent)} short)`) : "",
      Server: t.info.server ?? "",
      Promoter: t.info.promoter ?? "",
      Celebration: t.info.celebration ? `${t.info.celebration.type} ${t.info.celebration.at}` : "",
      "No-show": t.info.status === "booked" && !t.info.arrived ? "Yes" : "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Tables");
    const by = (k: "server" | "promoter") => {
      const m = new Map<string, { tables: number; people: number; spent: number }>();
      for (const t of d.tables) {
        const name = t.info[k] || "(none)";
        if (!t.spent && t.info.status !== "booked") continue;
        const v = m.get(name) ?? { tables: 0, people: 0, spent: 0 };
        v.tables++;
        v.people += t.info.arrived ?? 0;
        v.spent += t.spent;
        m.set(name, v);
      }
      return [...m.entries()].map(([n, v]) => ({ [k === "server" ? "Server" : "Promoter"]: n, Tables: v.tables, "People in": v.people, Sold: v.spent }));
    };
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(by("server")), "Servers");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(by("promoter")), "Promoters");
    const name = new Map(d.tables.map((t) => [t.id, t.name]));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        d.orders.map((o) => ({
          Time: new Date(o.at).toLocaleTimeString(),
          Table: name.get(o.tableId) ?? "?",
          Bottles: o.items.map((i) => `${i.qty}× ${i.name}`).join(", "),
          Total: o.total,
          Status: o.status === "void" ? "Cancelled" : o.status === "served" ? "Served" : "Waiting",
          "Logged by": o.by,
        }))
      ),
      "Orders"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Event", eventName],
        ["Report made", new Date().toLocaleString()],
        ["Tables booked", `${booked.length} of ${d.tables.length}`],
        ["People in", `${people} of ${expected} expected`],
        ["Total sold", sold],
        ["Tables that reached their minimum", reached],
        ["No-show tables", booked.filter((t) => !t.info.arrived).length],
      ]),
      "Summary"
    );
    wb.SheetNames.unshift(wb.SheetNames.pop()!);
    XLSX.writeFile(wb, `${(eventName || "VIP night").replace(/[^\w\- ]+/g, "").trim()} - end of night.xlsx`);
  };

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b bg-white px-4 py-2">
        <Link href="/dashboard" className="inline-flex items-center gap-1 rounded border bg-white px-3 py-1.5 text-sm hover:bg-zinc-50">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="mr-auto text-lg font-bold">VIP tables{eventName ? ` · ${eventName}` : ""}</h1>
        <label className="flex items-center gap-1 text-sm">
          Show
          <select
            value={mine}
            onChange={(e) => {
              setMine(e.target.value);
              write(MINE_KEY, e.target.value);
            }}
            className="rounded border px-2 py-1.5 text-sm"
          >
            <option value="">All tables</option>
            {d.staff.servers.map((s) => (
              <option key={s} value={s}>
                {s}&apos;s tables
              </option>
            ))}
          </select>
        </label>
        <Link href="/dashboard/bar" className="inline-flex items-center gap-1 rounded border bg-white px-3 py-1.5 text-sm hover:bg-zinc-50">
          <Martini className="h-4 w-4" /> Bar screen
        </Link>
        {!staff && (
          <>
            <button onClick={report} className="inline-flex items-center gap-1 rounded bg-lime-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-lime-700">
              <Download className="h-4 w-4" /> End-of-night report
            </button>
            <button onClick={() => setSettings(true)} className="inline-flex items-center gap-1 rounded border bg-white px-3 py-1.5 text-sm hover:bg-zinc-50">
              <Settings2 className="h-4 w-4" /> Bottles &amp; staff
            </button>
          </>
        )}
      </div>

      {/* tonight at a glance */}
      <div className="grid grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-4">
        {[
          ["Tables booked", `${booked.length} / ${d.tables.length}`],
          ["People in", `${people} / ${expected}`],
          ["Sold tonight", $(sold)],
          ["Minimum reached", `${reached} table${reached === 1 ? "" : "s"}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border bg-white p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{k}</div>
            <div className="text-2xl font-bold tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      {!d.menu.length && !staff && (
        <p className="mx-4 mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Add your bottle menu and prices first: <b>Bottles &amp; staff</b> (top right).
        </p>
      )}

      <div className="grid gap-3 px-4 pb-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="vip-grid">
        {shown.map((t) => {
          const i = t.info;
          const min = i.minimum ?? 0;
          const pct = min ? Math.min(100, Math.round((t.spent / min) * 100)) : 0;
          const done = min > 0 && t.spent >= min;
          // minimum spend colour: red under half, yellow past half, green when reached
          const level = !min || done ? "green" : t.spent >= min / 2 ? "yellow" : "red";
          const border = { green: "border-green-500", yellow: "border-yellow-400", red: "border-red-400" }[level];
          return (
            <div key={t.id} className={`rounded-xl border-2 bg-white p-3 ${i.status === "booked" ? border : "border-zinc-200"}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="whitespace-nowrap text-lg font-extrabold">{t.name}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    i.status === "booked" ? (done ? "bg-green-100 text-green-800" : "bg-lime-100 text-lime-800") : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {i.status === "booked" ? (done ? "Minimum reached" : "Booked") : "Open"}
                </span>
                {i.celebration && !i.celebration.done && (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900" title={i.celebration.note}>
                    <PartyPopper className="h-3.5 w-3.5" /> {i.celebration.type} {i.celebration.at}
                  </span>
                )}
              </div>
              {i.status === "booked" ? (
                <>
                  <p className="mt-1 truncate text-sm">
                    <b>{i.host}</b>
                    {i.phone ? <span className="text-zinc-500"> · {i.phone}</span> : null}
                  </p>
                  {/* count people in */}
                  <div className="mt-2 flex items-center gap-2">
                    <button onClick={() => arrive(t, -1)} className="rounded-md border p-1.5 hover:bg-zinc-50" aria-label="One less">
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="min-w-[5.5rem] text-center text-lg font-bold tabular-nums">
                      {i.arrived ?? 0} / {i.partySize ?? 0} in
                    </span>
                    <button onClick={() => arrive(t, 1)} className="rounded-md bg-lime-600 p-1.5 text-white hover:bg-lime-700" aria-label="One more in">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm text-zinc-500">{min ? `Minimum ${$(min)}` : "No booking"}</p>
              )}
              {/* spending */}
              <div className="mt-2">
                <div className="flex justify-between text-sm tabular-nums">
                  <span className="font-semibold">{$(t.spent)}</span>
                  {min > 0 && <span className="text-zinc-500">min {$(min)}</span>}
                </div>
                {min > 0 && (
                  <div className="mt-1 h-2 rounded-full bg-zinc-100">
                    <div
                      className={`h-2 rounded-full ${level === "green" ? "bg-green-600" : level === "yellow" ? "bg-yellow-400" : "bg-red-500"}`}
                      style={{ width: `${Math.max(pct, 3)}%` }}
                    />
                  </div>
                )}
              </div>
              <p className="mt-1 truncate text-xs text-zinc-500">
                {i.server ? `Server: ${i.server}` : "No server"}
                {i.promoter ? ` · Promoter: ${i.promoter}` : ""}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => {
                    setOpen(t.id);
                    setTab("bottles");
                  }}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-zinc-900 px-2 py-1.5 text-sm font-semibold text-white"
                >
                  <Wine className="h-4 w-4" /> Bottles
                </button>
                {!staff && (
                  <button
                    onClick={() => {
                      setOpen(t.id);
                      setTab("booking");
                    }}
                    className="flex-1 rounded-md border px-2 py-1.5 text-sm font-semibold hover:bg-zinc-50"
                  >
                    {i.status === "booked" ? "Booking" : "Book"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {!shown.length && <p className="text-zinc-500">{mine ? `No tables for ${mine} yet.` : "No tables yet: set them up on the dashboard."}</p>}
      </div>

      {table && (
        <TablePanel
          t={table}
          data={d}
          tab={staff ? "bottles" : tab}
          setTab={setTab}
          staff={staff}
          onClose={() => setOpen(null)}
          reload={load}
        />
      )}
      {settings && <SettingsPanel data={d} onClose={() => setSettings(false)} reload={load} />}
    </div>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="mb-3 flex items-center">
          <h2 className="mr-auto text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-zinc-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TablePanel({
  t,
  data,
  tab,
  setTab,
  staff,
  onClose,
  reload,
}: {
  t: VTable;
  data: Data;
  tab: "bottles" | "booking";
  setTab: (x: "bottles" | "booking") => void;
  staff: boolean;
  onClose: () => void;
  reload: () => Promise<void>;
}) {
  const i = t.info;
  const [qty, setQty] = useState<Record<string, number>>({});
  const [other, setOther] = useState({ name: "", price: "" });
  const [f, setF] = useState({
    host: i.host ?? "",
    phone: i.phone ?? "",
    partySize: String(i.partySize ?? ""),
    minimum: String(i.minimum ?? ""),
    server: i.server ?? "",
    promoter: i.promoter ?? "",
    cType: i.celebration?.type ?? "",
    cAt: i.celebration?.at ?? "",
    cNote: i.celebration?.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const orders = data.orders.filter((o) => o.tableId === t.id);
  const cart = [
    ...data.menu.filter((m) => (qty[m.name] ?? 0) > 0).map((m) => ({ name: m.name, price: m.price, qty: qty[m.name] })),
    ...(other.name.trim() ? [{ name: other.name.trim(), price: Number(other.price) || 0, qty: 1 }] : []),
  ];
  const cartTotal = cart.reduce((n, c) => n + c.qty * c.price, 0);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await reload();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title={`${t.name}${i.host ? ` · ${i.host}` : ""}`} onClose={onClose}>
      {!staff && (
        <div className="mb-3 flex rounded-lg bg-zinc-100 p-0.5 text-sm font-semibold">
          {(["bottles", "booking"] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-md py-1.5 ${tab === k ? "bg-white shadow" : "text-zinc-600"}`}>
              {k === "bottles" ? "Bottles" : "Booking"}
            </button>
          ))}
        </div>
      )}

      {tab === "bottles" ? (
        <>
          <p className="mb-2 text-sm text-zinc-600">
            Spent {$(t.spent)}
            {i.minimum ? ` of ${$(i.minimum)} minimum` : ""}
          </p>
          {data.menu.length ? (
            <div className="divide-y rounded-lg border">
              {data.menu.map((m) => (
                <div key={m.name} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1 text-sm font-medium">{m.name}</span>
                  <span className="w-16 text-right text-sm tabular-nums text-zinc-500">{$(m.price)}</span>
                  <button onClick={() => setQty((q) => ({ ...q, [m.name]: Math.max(0, (q[m.name] ?? 0) - 1) }))} className="rounded border p-1" aria-label={`Less ${m.name}`}>
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-5 text-center font-bold tabular-nums">{qty[m.name] ?? 0}</span>
                  <button onClick={() => setQty((q) => ({ ...q, [m.name]: (q[m.name] ?? 0) + 1 }))} className="rounded bg-lime-600 p-1 text-white" aria-label={`More ${m.name}`}>
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No bottle menu yet{staff ? "." : ": add it under Bottles & staff."}</p>
          )}
          <div className="mt-2 flex gap-2">
            <input value={other.name} onChange={(e) => setOther({ ...other, name: e.target.value })} placeholder="Something else…" className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm" />
            <input value={other.price} onChange={(e) => setOther({ ...other, price: e.target.value })} placeholder="$" inputMode="decimal" className="w-20 rounded border px-2 py-1.5 text-sm" />
          </div>
          <button
            disabled={busy || !cart.length}
            onClick={async () => {
              if (await run(() => send("/api/vip/order", "POST", { tableId: t.id, items: cart }), `Order sent to the bar: ${$(cartTotal)}`)) {
                setQty({});
                setOther({ name: "", price: "" });
              }
            }}
            className="mt-3 w-full rounded-lg bg-lime-600 py-2.5 font-bold text-white hover:bg-lime-700 disabled:opacity-40"
          >
            Send to the bar{cart.length ? ` · ${$(cartTotal)}` : ""}
          </button>

          <h3 className="mb-1 mt-5 font-bold">Orders at this table</h3>
          {!orders.length && <p className="text-sm text-zinc-500">None yet.</p>}
          <ul className="space-y-2">
            {orders.map((o) => (
              <li key={o.key} className={`rounded-lg border p-2 text-sm ${o.status === "void" ? "opacity-50 line-through" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{o.items.map((x) => `${x.qty}× ${x.name}`).join(", ")}</span>
                  <span className="ml-auto tabular-nums">{$(o.total)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                  {new Date(o.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {o.by} ·{" "}
                  {o.status === "served" ? "served" : o.status === "void" ? "cancelled" : "waiting at the bar"}
                  {o.status !== "void" && (
                    <button
                      onClick={() => confirm("Cancel this order? It no longer counts toward the minimum.") && run(() => send("/api/vip/order", "PUT", { key: o.key, status: "void" }), "Order cancelled")}
                      className="ml-auto underline"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="space-y-2 text-sm">
          <label className="block">
            Host (the booking is under this name)
            <input value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} className="mt-1 w-full rounded border px-2 py-1.5" placeholder="e.g. Mike Johnson" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              Party size
              <input value={f.partySize} onChange={(e) => setF({ ...f, partySize: e.target.value })} inputMode="numeric" className="mt-1 w-full rounded border px-2 py-1.5" placeholder="8" />
            </label>
            <label>
              Phone
              <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="mt-1 w-full rounded border px-2 py-1.5" />
            </label>
            <label>
              Minimum spend ($)
              <input value={f.minimum} onChange={(e) => setF({ ...f, minimum: e.target.value })} inputMode="decimal" className="mt-1 w-full rounded border px-2 py-1.5" placeholder="1000" />
            </label>
            <label>
              Server
              <select value={f.server} onChange={(e) => setF({ ...f, server: e.target.value })} className="mt-1 w-full rounded border px-2 py-1.5">
                <option value="">None</option>
                {data.staff.servers.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="col-span-2">
              Promoter
              <select value={f.promoter} onChange={(e) => setF({ ...f, promoter: e.target.value })} className="mt-1 w-full rounded border px-2 py-1.5">
                <option value="">None</option>
                {data.staff.promoters.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="rounded-lg border p-2">
            <legend className="px-1 font-semibold">Celebration (optional)</legend>
            <div className="grid grid-cols-2 gap-2">
              <select value={f.cType} onChange={(e) => setF({ ...f, cType: e.target.value })} className="rounded border px-2 py-1.5">
                <option value="">None</option>
                {["Birthday", "Sparklers", "Bachelorette", "Anniversary", "Proposal"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <input type="time" value={f.cAt} onChange={(e) => setF({ ...f, cAt: e.target.value })} className="rounded border px-2 py-1.5" aria-label="Celebration time" />
              <input value={f.cNote} onChange={(e) => setF({ ...f, cNote: e.target.value })} placeholder="Note (e.g. Ashley turns 30, sign + sparklers)" className="col-span-2 rounded border px-2 py-1.5" />
            </div>
          </fieldset>
          <button
            disabled={busy}
            onClick={async () => {
              const ok = await run(async () => {
                const extra = { minimum: f.minimum, server: f.server, promoter: f.promoter };
                if (f.host.trim()) await send("/api/vip/book", "POST", { tableId: t.id, host: f.host, phone: f.phone, partySize: f.partySize, ...extra });
                await send("/api/vip/table", "PUT", {
                  tableId: t.id,
                  ...extra,
                  celebration: f.cType ? { type: f.cType, at: f.cAt, note: f.cNote } : null,
                });
              }, f.host.trim() ? `${t.name} booked for ${f.host.trim()}` : "Saved");
              if (ok) onClose();
            }}
            className="w-full rounded-lg bg-lime-600 py-2.5 font-bold text-white hover:bg-lime-700 disabled:opacity-40"
          >
            Save
          </button>
          {i.status === "booked" && (
            <button
              disabled={busy}
              onClick={async () => {
                if (!confirm(`Free ${t.name}? The booking for ${i.host} is removed (orders stay in the report).`)) return;
                if (await run(() => send("/api/vip/book", "DELETE", { tableId: t.id }), `${t.name} is open again`)) onClose();
              }}
              className="w-full rounded-lg border border-red-300 py-2 font-semibold text-red-700 hover:bg-red-50"
            >
              Free this table
            </button>
          )}
          <p className="text-xs text-zinc-500">The host is added to the guest list at this table, so the door finds them by name and the host can find the table on their phone.</p>
        </div>
      )}
    </Shell>
  );
}

function SettingsPanel({ data, onClose, reload }: { data: Data; onClose: () => void; reload: () => Promise<void> }) {
  const [menu, setMenu] = useState(data.menu.map((m) => ({ name: m.name, price: String(m.price) })));
  const [servers, setServers] = useState(data.staff.servers.join("\n"));
  const [promoters, setPromoters] = useState(data.staff.promoters.join("\n"));
  const lines = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
  const save = async () => {
    try {
      await send("/api/vip/settings", "PUT", {
        menu: menu.filter((m) => m.name.trim()).map((m) => ({ name: m.name, price: Number(m.price) || 0 })),
        servers: lines(servers),
        promoters: lines(promoters),
      });
      toast.success("Saved");
      await reload();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Shell title="Bottles & staff" onClose={onClose}>
      <h3 className="mb-1 font-bold">Bottle menu</h3>
      <div className="space-y-1.5">
        {menu.map((m, k) => (
          <div key={k} className="flex gap-2">
            <input value={m.name} onChange={(e) => setMenu(menu.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)))} placeholder="Bottle" className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm" />
            <input value={m.price} onChange={(e) => setMenu(menu.map((x, j) => (j === k ? { ...x, price: e.target.value } : x)))} placeholder="$" inputMode="decimal" className="w-24 rounded border px-2 py-1.5 text-sm" />
            <button onClick={() => setMenu(menu.filter((_, j) => j !== k))} className="rounded p-1 text-zinc-500 hover:bg-zinc-100" aria-label="Remove">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <button onClick={() => setMenu([...menu, { name: "", price: "" }])} className="mt-2 rounded border px-3 py-1.5 text-sm font-semibold hover:bg-zinc-50">
        + Add a bottle
      </button>
      <h3 className="mb-1 mt-5 font-bold">Servers (one per line)</h3>
      <textarea value={servers} onChange={(e) => setServers(e.target.value)} rows={4} className="w-full rounded border px-2 py-1.5 text-sm" placeholder={"Ashley\nMarco"} />
      <h3 className="mb-1 mt-3 font-bold">Promoters (one per line)</h3>
      <textarea value={promoters} onChange={(e) => setPromoters(e.target.value)} rows={4} className="w-full rounded border px-2 py-1.5 text-sm" placeholder={"DJ Kay\nTeam Luxe"} />
      <button onClick={save} className="mt-4 w-full rounded-lg bg-lime-600 py-2.5 font-bold text-white hover:bg-lime-700">
        Save
      </button>
    </Shell>
  );
}
