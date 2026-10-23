"use client";

// Printable seating chart + after-event report for the open event.
// /dashboard/seating-chart (login required)
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { Printer, Download, ArrowLeft } from "lucide-react";

type SeatRow = {
  id: string;
  seat: number;
  isBooked: boolean;
  isReceived: boolean;
  table: { id: string; name: string };
  user: { id: string; firstname: string; lastname: string; vip?: boolean; meal?: string | null } | null;
};
type Guest = { id: string; firstname: string; lastname: string; seat: unknown[]; vip?: boolean; meal?: string | null };

// "4 Chicken · 5 Fish" for a list of guests
const mealSummary = (list: { meal?: string | null }[]) => {
  const m = new Map<string, number>();
  for (const g of list) {
    const k = g.meal?.trim();
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([k, n]) => `${n} ${k}`).join(" · ");
};

const byTable = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
const byLast = (a: { firstname: string; lastname: string }, b: { firstname: string; lastname: string }) =>
  `${a.lastname} ${a.firstname}`.localeCompare(`${b.lastname} ${b.firstname}`, undefined, { sensitivity: "base" });

export default function SeatingChart() {
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [allergies, setAllergies] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, { text: string; by: string; at: string }>>({});
  const [rsvps, setRsvps] = useState<Record<string, { coming: "yes" | "no" }>>({});

  useEffect(() => {
    (async () => {
      try {
        const [s, g, e, al] = await Promise.all([
          fetch("/api/get-seat").then((r) => r.json()),
          fetch("/api/get-guests").then((r) => r.json()),
          fetch("/api/events").then((r) => r.json()),
          fetch("/api/allergies").then((r) => r.json()).catch(() => ({})),
        ]);
        if (al?.success) setAllergies(al.data);
        const rl = await fetch("/api/rsvp-links").then((r) => r.json()).catch(() => null);
        if (rl?.success) setRsvps(rl.rsvps ?? {});
        const nt = await fetch("/api/guest-notes").then((r) => r.json()).catch(() => null);
        if (nt?.success) {
          setNotes(nt.data ?? {});
          setAnswers(nt.answers ?? {});
        }
        if (s.success) setSeats(s.data);
        if (g.success) setGuests(g.data);
        if (e.success) {
          const ev = e.events.find((x: { id: string }) => x.id === e.activeId);
          setEventName(ev?.name ?? "");
          setEventDate(ev?.date ?? null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // tables with their seated guests
  const tables = useMemo(() => {
    const m = new Map<string, { name: string; seats: number; guests: SeatRow[] }>();
    for (const s of seats) {
      const t = m.get(s.table.id) ?? { name: s.table.name, seats: 0, guests: [] };
      t.seats++;
      if (s.isBooked && s.user) t.guests.push(s);
      m.set(s.table.id, t);
    }
    return [...m.values()]
      .sort((a, b) => byTable(a.name, b.name))
      .map((t) => ({ ...t, guests: t.guests.sort((a, b) => byLast(a.user!, b.user!)) }));
  }, [seats]);

  // A–Z list: name → table
  const alpha = useMemo(
    () => seats.filter((s) => s.isBooked && s.user).sort((a, b) => byLast(a.user!, b.user!)),
    [seats]
  );
  const unseated = useMemo(() => guests.filter((g) => !g.seat?.length).sort(byLast), [guests]);

  const downloadReport = () => {
    const wb = XLSX.utils.book_new();
    const seated = alpha;
    const came = seated.filter((s) => s.isReceived).length;
    // Summary
    const summary = [
      ["Event", eventName],
      ["Date", eventDate ?? ""],
      ["Report made", new Date().toLocaleString()],
      [],
      ["Guests invited", guests.length],
      ["Guests with a seat", seated.length],
      ["Arrived", came],
      ["Did not arrive", seated.length - came],
      ["Without a seat", unseated.length],
      [],
      ["Meals (all guests)", mealSummary(guests) || "-"],
      [
        "RSVP",
        `${Object.values(rsvps).filter((r) => r.coming === "yes").length} yes · ${
          Object.values(rsvps).filter((r) => r.coming === "no").length
        } no · ${guests.length - Object.keys(rsvps).length} no answer`,
      ],
      ["Allergies", Object.keys(allergies).length ? `${Object.keys(allergies).length} guests (see All guests)` : "-"],
      [],
      ["Table", "Seats", "Guests seated", "Arrived", "Did not arrive", "Meals", "Allergies"],
      ...tables.map((t) => {
        const a = t.guests.filter((g) => g.isReceived).length;
        const al = t.guests
          .filter((g) => allergies[g.user!.id])
          .map((g) => `${g.user!.firstname} ${g.user!.lastname}: ${allergies[g.user!.id]}`)
          .join("; ");
        return [t.name, t.seats, t.guests.length, a, t.guests.length - a, mealSummary(t.guests.map((g) => g.user!)), al];
      }),
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summary);
    ws1["!cols"] = [{ wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 30 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Summary");
    // Every guest
    const rows = [
      ...seated.map((s) => ({
        "Last Name": s.user!.lastname,
        "First Name": s.user!.firstname,
        Table: s.table.name,
        Seat: s.seat,
        Meal: s.user!.meal ?? "",
        Allergy: allergies[s.user!.id] ?? "",
        VIP: s.user!.vip ? "Yes" : "",
        Arrived: s.isReceived ? "Yes" : "No",
        RSVP: rsvps[s.user!.id]?.coming ?? "",
        Note: notes[s.user!.id] ?? "",
        "Desk note": answers[s.user!.id]?.text ?? "",
        "Desk note by": answers[s.user!.id]
          ? `${answers[s.user!.id].by}, ${new Date(answers[s.user!.id].at).toLocaleString()}`
          : "",
      })),
      ...unseated.map((g) => ({
        "Last Name": g.lastname,
        "First Name": g.firstname,
        Table: "",
        Seat: "",
        Meal: g.meal ?? "",
        Allergy: allergies[g.id] ?? "",
        VIP: g.vip ? "Yes" : "",
        Arrived: "No seat",
        RSVP: rsvps[g.id]?.coming ?? "",
        Note: notes[g.id] ?? "",
        "Desk note": answers[g.id]?.text ?? "",
        "Desk note by": answers[g.id] ? `${answers[g.id].by}, ${new Date(answers[g.id].at).toLocaleString()}` : "",
      })),
    ];
    const ws2 = XLSX.utils.json_to_sheet(rows);
    ws2["!cols"] = [{ wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 6 }, { wch: 10 }, { wch: 22 }, { wch: 5 }, { wch: 9 }, { wch: 36 }, { wch: 28 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, ws2, "All guests");
    // No-shows
    const ws3 = XLSX.utils.json_to_sheet(
      seated
        .filter((s) => !s.isReceived)
        .map((s) => ({ "Last Name": s.user!.lastname, "First Name": s.user!.firstname, Table: s.table.name, Seat: s.seat }))
    );
    ws3["!cols"] = [{ wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 6 }];
    XLSX.utils.book_append_sheet(wb, ws3, "Did not arrive");
    const safe = (eventName || "event").replace(/[^\w\- ]+/g, "").trim() || "event";
    XLSX.writeFile(wb, `${safe} - report ${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Everyone's personal RSVP link, to text or email
  const downloadRsvpLinks = async () => {
    const j = await fetch("/api/rsvp-links").then((r) => r.json()).catch(() => null);
    if (!j?.success) return;
    const ws = XLSX.utils.json_to_sheet(
      (j.data as { firstname: string; lastname: string; rsvp: string; link: string }[]).map((g) => ({
        "Last Name": g.lastname,
        "First Name": g.firstname,
        RSVP: g.rsvp,
        "Personal RSVP link": g.link,
      }))
    );
    ws["!cols"] = [{ wch: 18 }, { wch: 16 }, { wch: 8 }, { wch: 80 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "RSVP links");
    const safe = (eventName || "event").replace(/[^\w\- ]+/g, "").trim() || "event";
    XLSX.writeFile(wb, `${safe} - RSVP links.xlsx`);
  };

  if (loading) return <p className="p-8 text-zinc-500">Loading…</p>;

  return (
    <div className="min-h-screen bg-white text-black">
      <style>{`@media print { .no-print { display: none !important } @page { margin: 12mm } .break-inside-avoid { break-inside: avoid } }`}</style>

      {/* Buttons (not printed) */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-zinc-50 px-6 py-3">
        <Link href="/dashboard" className="inline-flex items-center gap-1 rounded border bg-white px-3 py-1.5 text-sm hover:bg-zinc-100">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1 rounded bg-lime-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-lime-700"
        >
          <Printer className="h-4 w-4" /> Print / save as PDF
        </button>
        <button
          onClick={downloadReport}
          className="inline-flex items-center gap-1 rounded border bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100"
        >
          <Download className="h-4 w-4" /> After-event report (Excel)
        </button>
        <button
          onClick={downloadRsvpLinks}
          className="inline-flex items-center gap-1 rounded border bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100"
          title="Each guest's personal link to answer yes / no, meal and allergy"
        >
          <Download className="h-4 w-4" /> RSVP links (Excel)
        </button>
        <Link
          href="/dashboard/door-list"
          className="inline-flex items-center gap-1 rounded border bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100"
        >
          Door list (A–Z, tick boxes)
        </Link>
        <span className="text-xs text-zinc-500">
          Tip: in the print window choose &quot;Save as PDF&quot; to email it to the venue.
        </span>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-6">
        <h1 className="text-3xl font-bold">{eventName || "Seating chart"}</h1>
        <p className="mb-6 text-zinc-600">
          {eventDate ? `${eventDate} · ` : ""}
          {tables.length} tables · {alpha.length} guests seated
        </p>

        {/* Part 1: Find your table (A–Z) */}
        <h2 className="mb-3 border-b-2 border-black pb-1 text-xl font-bold">Find your table (A–Z by last name)</h2>
        <div className="mb-10 columns-1 gap-8 sm:columns-2 lg:columns-3">
          {alpha.map((s) => (
            <div key={s.id} className="break-inside-avoid flex justify-between gap-3 border-b border-dotted border-zinc-300 py-1 text-sm">
              <span>
                <b>{s.user!.lastname}</b>, {s.user!.firstname}
              </span>
              <span className="whitespace-nowrap font-semibold">{s.table.name}</span>
            </div>
          ))}
        </div>

        {/* Part 2: Each table */}
        <h2 className="mb-3 border-b-2 border-black pb-1 text-xl font-bold" style={{ breakBefore: "page" }}>
          Tables
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tables.map((t) => (
            <div key={t.name} className="break-inside-avoid rounded-lg border border-zinc-300 p-3">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-lg font-bold">{t.name}</span>
                <span className="text-xs text-zinc-500">
                  {t.guests.length}/{t.seats} seated
                </span>
              </div>
              {t.guests.length ? (
                <>
                  <ol className="text-sm">
                    {t.guests.map((g) => (
                      <li key={g.id} className="flex flex-wrap justify-between gap-x-2">
                        <span>
                          {g.user!.vip && "★ "}
                          {g.user!.firstname} {g.user!.lastname}
                        </span>
                        <span className="whitespace-nowrap text-xs">
                          {g.user!.meal && <span className="text-zinc-500">{g.user!.meal}</span>}
                          {allergies[g.user!.id] && (
                            <b className="ml-1 text-red-700">⚠ {allergies[g.user!.id]}</b>
                          )}
                        </span>
                        {(notes[g.user!.id] || answers[g.user!.id]) && (
                          <span className="block w-full text-[11px] leading-tight">
                            {notes[g.user!.id] && <b className="text-amber-800">📝 {notes[g.user!.id]}</b>}
                            {answers[g.user!.id] && (
                              <b className="ml-1 text-green-800">✓ Desk: {answers[g.user!.id].text}</b>
                            )}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                  {mealSummary(t.guests.map((g) => g.user!)) && (
                    <p className="mt-1 border-t border-zinc-200 pt-1 text-xs font-semibold text-zinc-700">
                      Meals: {mealSummary(t.guests.map((g) => g.user!))}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-zinc-400">No guests yet</p>
              )}
            </div>
          ))}
        </div>

        {unseated.length > 0 && (
          <div className="no-print mt-8 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            <b>{unseated.length} guest{unseated.length === 1 ? "" : "s"} without a seat:</b>{" "}
            {unseated.map((g) => `${g.firstname} ${g.lastname}`).join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}
