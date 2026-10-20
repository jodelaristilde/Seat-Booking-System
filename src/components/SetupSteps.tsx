"use client";

// Setup, step by step: a bar at the top of the dashboard that walks the
// organizer through setting up an event, in order. Each step ticks itself off
// when it is done, and its button opens the right screen.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { toast } from "sonner";
import { openSetup } from "@/lib/setupEvents";

type Progress = {
  event: { id: string; name: string; date: string | null };
  flags: { noFloorPlan?: boolean; noEntrance?: boolean; checked?: boolean };
  counts: { pictures: number; tables: number; entrances: number; guests: number; unseated: number; seats?: number; freeSeats?: number };
};

const HIDE_KEY = (id: string) => `seating4u-setup-hidden:${id}`;
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* private window: just don't remember */
    }
  },
};

export function SetupSteps() {
  const [p, setP] = useState<Progress | null>(null);
  const [hidden, setHidden] = useState(true);
  const [open, setOpen] = useState(true);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [picked, setPicked] = useState<number | null>(null); // a step the person clicked on

  const load = useCallback(async () => {
    try {
      const j = await fetch("/api/setup-progress").then((r) => r.json());
      if (!j?.success) return;
      setP((prev) => {
        if (!prev || prev.event.id !== j.event.id) {
          setName(j.event.name);
          setDate(/^\d{4}-\d{2}-\d{2}$/.test(j.event.date ?? "") ? j.event.date : "");
          setHidden(store.get(HIDE_KEY(j.event.id)) === "1");
        }
        return j;
      });
    } catch {
      /* offline */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 5000);
    // "Setup steps" in the menu shows the bar again
    const show = () => {
      setHidden(false);
      setOpen(true);
      setP((prev) => {
        if (prev) store.set(HIDE_KEY(prev.event.id), null);
        return prev;
      });
      load();
    };
    window.addEventListener("seating4u:show-setup", show);
    return () => {
      clearInterval(t);
      window.removeEventListener("seating4u:show-setup", show);
    };
  }, [load]);

  if (!p || hidden) return null;
  const c = p.counts;
  const flag = async (flags: Progress["flags"]) => {
    await fetch("/api/setup-progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flags }),
    }).catch(() => undefined);
    load();
  };

  const steps = [
    {
      title: "Event",
      done: !!p.event.date,
      text: "Give the event its name and date. After the date, guests can no longer look up seats on their phone.",
    },
    {
      title: "Floor plan",
      done: c.pictures > 0 || !!p.flags.noFloorPlan,
      text: "Upload the venue's floor plan (a picture or a screenshot of the PDF). The tables and their numbers are read from it.",
    },
    {
      title: "Tables",
      done: c.tables > 0,
      text: c.pictures
        ? "Let the app find every table and its number on the floor plan, then check them and click Use these tables."
        : "Create all your tables at once (for example 30 tables of 10 seats).",
    },
    {
      title: "Entrance",
      // only once there are tables (a door marked earlier doesn't count on its own)
      done: c.tables > 0 && (c.entrances > 0 || !!p.flags.noEntrance),
      text: "Click the door where guests come in. Guests' phones draw a green line from it to their table.",
    },
    {
      title: "Guests",
      done: c.guests > 0,
      text: "Import your guest list from Excel. Use our template: first name, last name, and optionally table, meal, allergy, VIP, note, party size.",
    },
    {
      title: "Seat guests",
      done: c.tables > 0 && c.guests > 0 && c.unseated === 0,
      text: !c.guests
        ? "Seat your guests once the list is in."
        : c.freeSeats !== undefined && c.unseated > c.freeSeats
        ? `${c.unseated} guest${c.unseated === 1 ? "" : "s"} still without a table, but only ${c.freeSeats} empty seat${c.freeSeats === 1 ? "" : "s"} left (${c.seats} seats at ${c.tables} tables for ${c.guests} guests). Add tables or seats first.`
        : `${c.unseated} guest${c.unseated === 1 ? "" : "s"} still without a table. Seat everyone in one click (families and parties stay together), or by hand.`,
    },
    {
      title: "Check & share",
      done: false, // set below: only when every step before it is done too
      text: "Run the Ready check, print the table signs and place cards, and share the event's QR code (click the event name at the top).",
    },
  ];
  steps[6].done = !!p.flags.checked && steps.slice(0, 6).every((s) => s.done);
  const firstOpen = steps.findIndex((s) => !s.done);
  const allDone = firstOpen === -1;
  const cur = picked ?? (allDone ? steps.length - 1 : firstOpen);
  const step = steps[cur];

  const hide = () => {
    store.set(HIDE_KEY(p.event.id), "1");
    setHidden(true);
    toast.message("Setup steps hidden. Bring them back from the menu (☰) → Setup steps.");
  };
  const saveEvent = async () => {
    if (!name.trim()) return toast.error("Type the event name");
    const r = await fetch("/api/events", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.event.id, name: name.trim(), date }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.success) {
      toast.success("Event saved");
      setPicked(null);
      load();
    } else toast.error(r?.message ?? "Could not save");
  };

  const btn = "rounded-md px-3 py-1.5 text-sm font-semibold";
  const main = `${btn} bg-lime-600 text-white hover:bg-lime-700`;
  const plain = `${btn} border bg-white hover:bg-zinc-50`;
  const link = `${btn} text-zinc-600 underline-offset-2 hover:underline`;

  return (
    <div className="border-b bg-white px-3 py-2 sm:px-4" data-testid="setup-steps">
      <div className="flex items-center gap-2">
        <span className="hidden text-sm font-bold sm:inline">{allDone ? "✓ Setup done" : "Set up your event"}</span>
        <ol className="flex flex-1 items-center gap-1 overflow-x-auto">
          {steps.map((s, i) => (
            <li key={s.title} className="flex shrink-0 items-center">
              <button
                onClick={() => {
                  setPicked(i);
                  setOpen(true);
                }}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  i === cur ? "bg-zinc-900 text-white" : s.done ? "bg-green-100 text-green-800" : "bg-zinc-100 text-zinc-600"
                }`}
                aria-current={i === cur ? "step" : undefined}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                    s.done ? "bg-green-600 text-white" : i === cur ? "bg-white text-zinc-900" : "bg-zinc-300 text-white"
                  }`}
                >
                  {s.done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                {s.title}
              </button>
              {i < steps.length - 1 && <span className="mx-0.5 h-px w-3 bg-zinc-300" />}
            </li>
          ))}
        </ol>
        <button onClick={() => setOpen((o) => !o)} className="rounded p-1 text-zinc-500 hover:bg-zinc-100" title={open ? "Fold" : "Unfold"}>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <button onClick={hide} className="rounded p-1 text-zinc-500 hover:bg-zinc-100" title="Hide the setup steps">
          <X className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2">
          <div className="min-w-[14rem] flex-1">
            <p className="text-sm font-bold">
              Step {cur + 1} of {steps.length}: {step.title} {step.done && <span className="text-green-700">✓ done</span>}
            </p>
            <p className="text-sm text-zinc-600">{allDone && picked === null ? "Everything is set. Have a great event!" : step.text}</p>
          </div>

          {cur === 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Event name" className="h-9 rounded-md border px-2 text-sm" />
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-md border px-2 text-sm" aria-label="Event date" />
              <button onClick={saveEvent} className={main}>
                Save
              </button>
            </div>
          )}
          {cur === 1 && (
            <>
              <button onClick={() => openSetup("floor-map")} className={main}>
                Upload floor plan
              </button>
              {!step.done && (
                <button onClick={() => flag({ noFloorPlan: true })} className={link}>
                  I don&apos;t have one
                </button>
              )}
            </>
          )}
          {cur === 2 && (
            <>
              {c.pictures > 0 && (
                <button onClick={() => openSetup("draw-tables")} className={main}>
                  Find tables on the plan
                </button>
              )}
              <button onClick={() => openSetup("bulk-tables")} className={c.pictures ? plain : main}>
                Create tables in bulk
              </button>
            </>
          )}
          {cur === 3 && (
            <>
              <button onClick={() => openSetup("set-entrance")} className={main} disabled={!c.tables}>
                Set the entrance
              </button>
              {!step.done && (
                <button onClick={() => flag({ noEntrance: true })} className={link}>
                  Skip
                </button>
              )}
            </>
          )}
          {cur === 4 && (
            <>
              <button onClick={() => openSetup("import-guests")} className={main}>
                Import guests (Excel)
              </button>
              <a href="/templates/Seating4U-guest-template.xlsx" download className={plain}>
                Download the template
              </a>
            </>
          )}
          {cur === 5 && (
            <>
              {c.freeSeats !== undefined && c.unseated > c.freeSeats && (
                <button onClick={() => openSetup("bulk-tables")} className={main}>
                  Add tables
                </button>
              )}
              <Link href="/dashboard/seating-helper" className={c.freeSeats !== undefined && c.unseated > c.freeSeats ? plain : main}>
                Seat everyone
              </Link>
            </>
          )}
          {cur === 6 && (
            <>
              <Link href="/dashboard/ready-check" className={plain}>
                Ready check
              </Link>
              <Link href="/dashboard/print-cards" className={plain}>
                Table signs &amp; place cards
              </Link>
              {!step.done ? (
                steps.slice(0, 6).every((s) => s.done) ? (
                  <button onClick={() => flag({ checked: true })} className={main}>
                    All set: mark done
                  </button>
                ) : (
                  <span className="text-sm text-zinc-500">Finish the steps before this one first.</span>
                )
              ) : (
                <button onClick={hide} className={main}>
                  Hide the setup steps
                </button>
              )}
            </>
          )}
          {picked !== null && picked !== firstOpen && !allDone && (
            <button onClick={() => setPicked(null)} className={link}>
              Back to the next step
            </button>
          )}
        </div>
      )}
    </div>
  );
}
