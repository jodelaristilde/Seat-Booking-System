"use client";

// Seating helper: seat everyone in one click, "keep together / keep apart"
// rules, and the warnings (rules broken, tables too full).
// /dashboard/seating-helper (login required)
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles, Trash2, Users, Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { matches } from "@/lib/fold";
import { ruleProblems, type Rule, type RuleKind } from "@/lib/seatPlan";
import { overTables, usualSeats } from "@/lib/capacity";

type Guest = { id: string; firstname: string; lastname: string; seat: { table: { id: string; name: string } }[] };
type SeatRow = { id: string; isBooked: boolean; userId: string | null; table: { id: string; name: string } };
type Preview = {
  seated: number;
  applied: boolean;
  tables: { table: string; names: string[] }[];
  groups: { names: string[]; tables: string[]; split: boolean }[];
  notSeated: string[];
};

const nm = (g: { firstname: string; lastname: string }) => `${g.firstname} ${g.lastname}`.trim();
const byTable = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

function GuestPicker({
  guests,
  value,
  onChange,
  placeholder,
}: {
  guests: Guest[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const chosen = guests.find((g) => g.id === value);
  // cleared from outside (rule added): empty the box too
  useEffect(() => {
    if (!value && !open) setQ("");
  }, [value, open]);
  const list = useMemo(
    () => (q ? guests.filter((g) => matches(nm(g), q)) : guests).slice(0, 8),
    [q, guests]
  );
  return (
    <div className="relative flex-1 min-w-[12rem]">
      <input
        value={chosen && !open ? nm(chosen) : q}
        onFocus={() => {
          setOpen(true);
          setQ("");
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQ(e.target.value);
          onChange("");
        }}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border px-3 text-sm"
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-white shadow-lg">
          {list.length ? (
            list.map((g) => (
              <button
                key={g.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(g.id);
                  setOpen(false);
                }}
                className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-zinc-100"
              >
                <span>{nm(g)}</span>
                <span className="text-xs text-zinc-500">{g.seat[0]?.table.name ?? "no table"}</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-zinc-500">No guest found</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function SeatingHelper() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [capInput, setCapInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [families, setFamilies] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "apply">("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [kind, setKind] = useState<RuleKind>("apart");

  const load = useCallback(async () => {
    const [g, s, r, c] = await Promise.all([
      fetch("/api/get-guests").then((x) => x.json()),
      fetch("/api/get-seat").then((x) => x.json()),
      fetch("/api/seating-rules").then((x) => x.json()).catch(() => ({})),
      fetch("/api/table-capacity").then((x) => x.json()).catch(() => ({})),
    ]);
    if (g.success) setGuests(g.data);
    if (s.success) setSeats(s.data);
    if (r?.success) setRules(r.rules);
    if (c?.success) {
      setCapacity(c.capacity);
      setCapInput(c.capacity ? String(c.capacity) : "");
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const guestById = useMemo(() => new Map(guests.map((g) => [g.id, g])), [guests]);
  const tableOf = useCallback((id: string) => guestById.get(id)?.seat[0]?.table.id ?? null, [guestById]);
  const tableName = useMemo(() => new Map(seats.map((s) => [s.table.id, s.table.name])), [seats]);
  const sorted = useMemo(
    () => [...guests].sort((x, y) => `${x.lastname} ${x.firstname}`.localeCompare(`${y.lastname} ${y.firstname}`)),
    [guests]
  );
  const unseated = guests.filter((g) => !g.seat.length).length;

  // tables: seats and guests
  const tableStats = useMemo(() => {
    const m = new Map<string, { name: string; seats: number; guests: number }>();
    for (const s of seats) {
      const t = m.get(s.table.id) ?? { name: s.table.name, seats: 0, guests: 0 };
      t.seats++;
      if (s.isBooked && s.userId) t.guests++;
      m.set(s.table.id, t);
    }
    return [...m.values()].sort((x, y) => byTable(x.name, y.name));
  }, [seats]);
  const usual = usualSeats(tableStats.map((t) => t.seats));
  const tooFull = overTables(tableStats, capacity);
  const broken = ruleProblems(
    rules,
    tableOf,
    (id) => (guestById.get(id) ? nm(guestById.get(id)!) : "A removed guest"),
    (id) => tableName.get(id) ?? "?"
  );

  const saveRules = async (next: Rule[]) => {
    const res = await fetch("/api/seating-rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: next }),
    }).then((x) => x.json());
    if (res?.success) setRules(res.rules);
    else toast.error("Could not save the rule");
  };
  const addRule = async () => {
    if (!a || !b) return toast.error("Pick two guests");
    if (a === b) return toast.error("Pick two different guests");
    const rest = rules.filter((r) => !((r.a === a && r.b === b) || (r.a === b && r.b === a)));
    await saveRules([...rest, { id: Math.random().toString(36).slice(2, 10), a, b, kind }]);
    setA("");
    setB("");
    setPreview(null);
    toast.success("Rule saved");
  };

  const run = async (apply: boolean) => {
    setBusy(apply ? "apply" : "preview");
    try {
      const res = await fetch("/api/auto-seat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ families, apply }),
      }).then((x) => x.json());
      if (!res?.success) throw new Error(res?.message);
      setPreview(res);
      if (apply) {
        toast.success(`${res.seated} guest${res.seated === 1 ? "" : "s"} seated`);
        await load();
      }
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Could not seat the guests");
    } finally {
      setBusy("");
    }
  };

  const saveCapacity = async () => {
    const res = await fetch("/api/table-capacity", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capacity: capInput ? Number(capInput) : null }),
    }).then((x) => x.json());
    if (res?.success) {
      setCapacity(res.capacity);
      toast.success(res.capacity ? `Tables hold ${res.capacity} guests` : "Using the usual number of seats");
    } else toast.error(res?.message ?? "Could not save");
  };

  if (loading) return <p className="p-8 text-zinc-500">Loading…</p>;

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-zinc-50 px-6 py-3">
        <Link href="/dashboard" className="inline-flex items-center gap-1 rounded border bg-white px-3 py-1.5 text-sm hover:bg-zinc-100">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      </div>
      <div className="mx-auto max-w-4xl space-y-8 px-6 py-6">
        <h1 className="text-3xl font-bold">Seating helper</h1>

        {/* Problems right now */}
        {(broken.length > 0 || tooFull.length > 0) && (
          <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
            <h2 className="mb-2 font-bold text-red-800">Fix before the event</h2>
            <ul className="list-inside list-disc space-y-1 text-sm text-red-900">
              {broken.map((p) => (
                <li key={p.rule.id}>{p.text}</li>
              ))}
              {tooFull.map((t) => (
                <li key={t.name}>
                  <b>{t.name}</b> has {t.guests} guests, but a table holds {t.limit}.
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Seat everyone */}
        <section className="rounded-xl border p-5">
          <h2 className="mb-1 flex items-center gap-2 text-xl font-bold">
            <Sparkles className="h-5 w-5 text-lime-600" /> Seat everyone automatically
          </h2>
          <p className="mb-3 text-sm text-zinc-600">
            {unseated} guest{unseated === 1 ? "" : "s"} without a table. Parties (+1s), the rules below{families ? ", and families" : ""} are
            kept together; &quot;keep apart&quot; guests go to different tables. Nobody who already has a seat is moved.
          </p>
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={families} onChange={(e) => { setFamilies(e.target.checked); setPreview(null); }} />
            Keep families together (same last name)
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => run(false)}
              disabled={!!busy || !unseated}
              className="inline-flex items-center gap-1 rounded-md border bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50"
            >
              {busy === "preview" && <Loader2 className="h-4 w-4 animate-spin" />} Show me first
            </button>
            <button
              onClick={() => run(true)}
              disabled={!!busy || !unseated}
              className="inline-flex items-center gap-1 rounded-md bg-lime-600 px-4 py-2 text-sm font-semibold text-white hover:bg-lime-700 disabled:opacity-50"
            >
              {busy === "apply" && <Loader2 className="h-4 w-4 animate-spin" />} Seat them now
            </button>
          </div>
          {preview && (
            <div className="mt-4 space-y-3 text-sm">
              <p className={`font-semibold ${preview.applied ? "text-green-700" : ""}`}>
                {preview.applied ? "✓ Done: " : "This would seat "}
                {preview.seated} guest{preview.seated === 1 ? "" : "s"}
                {preview.applied ? " seated." : ". Nothing is saved until you click Seat them now."}
              </p>
              {preview.notSeated.length > 0 && (
                <p className="rounded-md bg-amber-50 p-2 text-amber-900">
                  <b>No room for {preview.notSeated.length}:</b> {preview.notSeated.join(", ")}. Add seats or tables, then try again.
                </p>
              )}
              {preview.groups.some((g) => g.split) && (
                <p className="rounded-md bg-amber-50 p-2 text-amber-900">
                  <b>Too big for one table, so split:</b>{" "}
                  {preview.groups.filter((g) => g.split).map((g) => `${g.names.join(", ")} (${g.tables.join(" + ")})`).join("; ")}
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {preview.tables.map((t) => (
                  <div key={t.table} className="rounded-md border p-2">
                    <b>{t.table}</b>
                    <span className="text-zinc-500"> · +{t.names.length}</span>
                    <p className="text-zinc-700">{t.names.join(", ")}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Rules */}
        <section className="rounded-xl border p-5">
          <h2 className="mb-1 text-xl font-bold">Keep together / keep apart</h2>
          <p className="mb-3 text-sm text-zinc-600">
            Example: an ex-couple who must not sit at the same table, or two friends who must. The Ready check and the box at the
            top warn you if the seating breaks a rule.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <GuestPicker guests={sorted} value={a} onChange={setA} placeholder="First guest…" />
            <div className="flex rounded-lg bg-zinc-100 p-0.5 text-sm font-semibold">
              <button onClick={() => setKind("apart")} className={`flex items-center gap-1 rounded-md px-3 py-1.5 ${kind === "apart" ? "bg-white text-red-700 shadow" : "text-zinc-600"}`}>
                <Ban className="h-4 w-4" /> Keep apart
              </button>
              <button onClick={() => setKind("together")} className={`flex items-center gap-1 rounded-md px-3 py-1.5 ${kind === "together" ? "bg-white text-green-700 shadow" : "text-zinc-600"}`}>
                <Users className="h-4 w-4" /> Keep together
              </button>
            </div>
            <GuestPicker guests={sorted} value={b} onChange={setB} placeholder="Second guest…" />
            <button onClick={addRule} disabled={!a || !b} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              Add rule
            </button>
          </div>
          {rules.length > 0 && (
            <table className="mt-4 w-full text-sm">
              <tbody>
                {rules.map((r) => {
                  const bad = broken.some((p) => p.rule.id === r.id);
                  const n = (id: string) => (guestById.get(id) ? nm(guestById.get(id)!) : "A removed guest");
                  const t = (id: string) => tableName.get(tableOf(id) ?? "") ?? "no table";
                  return (
                    <tr key={r.id} className="border-b border-zinc-100">
                      <td className="py-2">
                        <b>{n(r.a)}</b> <span className="text-xs text-zinc-500">({t(r.a)})</span>
                      </td>
                      <td className={`py-2 text-center font-semibold ${r.kind === "apart" ? "text-red-700" : "text-green-700"}`}>
                        {r.kind === "apart" ? "keep apart from" : "keep with"}
                      </td>
                      <td className="py-2">
                        <b>{n(r.b)}</b> <span className="text-xs text-zinc-500">({t(r.b)})</span>
                      </td>
                      <td className="py-2 text-right">{bad ? <span className="font-bold text-red-700">⚠ broken</span> : <span className="text-green-700">✓</span>}</td>
                      <td className="py-2 text-right">
                        <button onClick={() => saveRules(rules.filter((x) => x.id !== r.id))} title="Remove this rule" className="rounded p-1 text-zinc-500 hover:bg-zinc-100">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* Table size */}
        <section className="rounded-xl border p-5">
          <h2 className="mb-1 text-xl font-bold">How many guests a table holds</h2>
          <p className="mb-3 text-sm text-zinc-600">
            Used for the &quot;table too full&quot; warning. {capacity ? "" : `Not set: the usual number of seats is used (${usual ?? "–"}).`}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={40}
              value={capInput}
              onChange={(e) => setCapInput(e.target.value)}
              placeholder={usual ? String(usual) : "e.g. 10"}
              className="h-10 w-24 rounded-md border px-3"
            />
            <span className="text-sm">guests per table</span>
            <button onClick={saveCapacity} className="rounded-md border bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50">
              Save
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
