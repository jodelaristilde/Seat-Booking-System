"use client";

// Setup, one question at a time. While a planner sets up an event, this covers
// the busy dashboard with one big card: the question, one or two big answers,
// and Back / Next. When a step needs the floor plan itself (finding the tables,
// clicking the door), the card steps aside into a small bar so the plan can be
// used, with Next on it. "Show me the full screen" leaves the wizard.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  DoorOpen,
  FileSpreadsheet,
  ImageIcon,
  LayoutGrid,
  PartyPopper,
  Printer,
  QrCode,
  ScanSearch,
  Sparkles,
  Upload,
  UserPlus,
} from "lucide-react";
import { openSetup, type SetupTarget } from "@/lib/setupEvents";

type Progress = {
  event: { id: string; name: string; date: string | null };
  flags: { noFloorPlan?: boolean; noEntrance?: boolean; checked?: boolean };
  counts: {
    pictures: number;
    tables: number;
    entrances: number;
    guests: number;
    unseated: number;
    seats?: number;
    freeSeats?: number;
  };
};

const KEY = (id: string) => `seating4u-wizard:${id}`; // "on" | "off" | step number
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private window */
  }
};

const TITLES = [
  "Your event",
  "Floor plan",
  "Tables",
  "Entrance",
  "Guests",
  "Seats",
  "Ready",
];

export function SetupWizard({
  onActiveChange,
}: {
  onActiveChange?: (on: boolean) => void;
}) {
  const [p, setP] = useState<Progress | null>(null);
  const [on, setOn] = useState(false);
  const [step, setStep] = useState(0);
  const [aside, setAside] = useState<null | { text: string }>(null); // the card stepped aside for the plan
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [top, setTop] = useState(0);
  const anchor = useRef<HTMLDivElement>(null);
  const evId = useRef<string | null>(null);

  const load = useCallback(async () => {
    const j = await fetch("/api/setup-progress")
      .then((r) => r.json())
      .catch(() => null);
    if (!j?.success || !j.event || !j.counts) return;
    setP(j);
    if (evId.current !== j.event.id) {
      // another event was opened: start (or resume) its wizard
      evId.current = j.event.id;
      setName(j.event.name);
      setDate(
        /^\d{4}-\d{2}-\d{2}$/.test(j.event.date ?? "") ? j.event.date : "",
      );
      const saved = read(KEY(j.event.id));
      // open after every log-in (log-in clears "off"), unless closed since
      const k = j.counts,
        f = j.flags;
      if (saved === "off") setOn(false);
      else {
        setOn(true);
        // where they are: the first step not done yet
        const first = !j.event.date
          ? 0
          : !k.pictures && !f.noFloorPlan
            ? 1
            : !k.tables
              ? 2
              : !k.entrances && !f.noEntrance
                ? 3
                : !k.guests
                  ? 4
                  : k.unseated
                    ? 5
                    : 6;
        setStep(saved && /^\d$/.test(saved) ? Number(saved) : first);
      }
      setAside(null);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(
      () => document.visibilityState === "visible" && load(),
      4000,
    );
    // menu "Show me step by step" / welcome window: open the wizard
    const show = () => {
      setOn(true);
      setAside(null);
      if (evId.current) write(KEY(evId.current), String(0));
      setStep(0);
      load();
    };
    window.addEventListener("seating4u:show-setup", show);
    return () => {
      clearInterval(t);
      window.removeEventListener("seating4u:show-setup", show);
    };
  }, [load]);

  useEffect(() => {
    onActiveChange?.(on);
  }, [on, onActiveChange]);

  // the card covers everything under the top bar
  useEffect(() => {
    if (!on) return;
    const measure = () =>
      setTop(Math.max(0, anchor.current?.getBoundingClientRect().top ?? 0));
    measure();
    window.addEventListener("resize", measure);
    const id = setInterval(measure, 1000);
    return () => {
      window.removeEventListener("resize", measure);
      clearInterval(id);
    };
  }, [on]);

  const go = (n: number) => {
    const s = Math.max(0, Math.min(TITLES.length - 1, n));
    setStep(s);
    setAside(null);
    if (evId.current) write(KEY(evId.current), String(s));
  };
  const exit = (msg = true) => {
    setOn(false);
    setAside(null);
    if (evId.current) write(KEY(evId.current), "off");
    if (msg)
      toast.message(
        "You can come back to the step-by-step setup from the menu (☰).",
      );
  };
  const flag = async (flags: Progress["flags"]) => {
    await fetch("/api/setup-progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flags }),
    }).catch(() => undefined);
    load();
  };
  // a step that needs the floor plan: step aside, open that tool
  const onPlan = (target: SetupTarget | null, text: string) => {
    setAside({ text });
    if (target) openSetup(target);
    else window.dispatchEvent(new Event("seating4u:show-plan"));
  };

  if (!on || !p) return <div ref={anchor} />;
  const c = p.counts;

  const saveEvent = async () => {
    if (!name.trim()) return toast.error("Type the name of your event");
    const r = await fetch("/api/events", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.event.id, name: name.trim(), date }),
    })
      .then((x) => x.json())
      .catch(() => null);
    if (!r?.success) return toast.error(r?.message ?? "Could not save");
    load();
    go(1);
  };

  const big =
    "flex w-full items-center gap-4 rounded-2xl border-2 bg-white p-5 text-left transition hover:border-lime-500 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-lime-200";
  const done = (t: string) => (
    <p className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 font-semibold text-green-800">
      <Check className="h-5 w-5 shrink-0" /> {t}
    </p>
  );

  // ---------- the steps ----------
  let title = "";
  let body: React.ReactNode = null;
  let next: null | { label: string; fn: () => void; off?: boolean } = {
    label: "Next",
    fn: () => go(step + 1),
  };

  if (step === 0) {
    title = "What is your event?";
    body = (
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block font-semibold text-zinc-700">
            Name of the event
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Kyla & Jaeden's Wedding"
            className="h-12 w-full rounded-xl border-2 px-4 text-lg focus:border-lime-500 focus:outline-none"
            autoFocus
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-semibold text-zinc-700">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-12 w-full rounded-xl border-2 px-4 text-lg focus:border-lime-500 focus:outline-none"
          />
        </label>
      </div>
    );
    next = { label: "Next", fn: saveEvent };
  } else if (step === 1) {
    title = "Do you have the venue's floor plan?";
    body = (
      <div className="space-y-3">
        {c.pictures > 0 && done("Your floor plan is uploaded.")}
        <button className={big} onClick={() => openSetup("floor-map")}>
          <Upload className="h-9 w-9 shrink-0 text-lime-600" />
          <span>
            <b className="block text-lg">
              {c.pictures ? "Change the floor plan" : "Yes, upload it"}
            </b>
            <span className="text-zinc-600">
              A picture, a screenshot or a PDF from the venue.
            </span>
          </span>
        </button>
        {!c.pictures && (
          <button
            className={big}
            onClick={async () => {
              await flag({ noFloorPlan: true });
              go(2);
            }}
          >
            <LayoutGrid className="h-9 w-9 shrink-0 text-zinc-500" />
            <span>
              <b className="block text-lg">No, I&apos;ll create my tables</b>
              <span className="text-zinc-600">
                Tell us how many tables and seats. That&apos;s all.
              </span>
            </span>
          </button>
        )}
      </div>
    );
    next = c.pictures ? { label: "Next", fn: () => go(2) } : null;
  } else if (step === 2) {
    title = c.pictures
      ? "Let's find your tables on the plan"
      : "Create your tables";
    body = (
      <div className="space-y-3">
        {c.tables > 0 &&
          done(
            `${c.tables} table${c.tables === 1 ? "" : "s"} ready, ${c.seats ?? 0} seats.`,
          )}
        {c.pictures > 0 && (
          <button
            className={big}
            onClick={() =>
              onPlan(
                "find-tables",
                "Check the tables found on your plan, fix any number, then click “Use these tables”. When it looks right, click Next.",
              )
            }
          >
            <ScanSearch className="h-9 w-9 shrink-0 text-lime-600" />
            <span>
              <b className="block text-lg">Find my tables for me</b>
              <span className="text-zinc-600">
                We read every table and its number on your plan. You just check
                them.
              </span>
            </span>
          </button>
        )}
        <button className={big} onClick={() => openSetup("bulk-tables")}>
          <LayoutGrid
            className={`h-9 w-9 shrink-0 ${c.pictures ? "text-zinc-500" : "text-lime-600"}`}
          />
          <span>
            <b className="block text-lg">
              {c.pictures ? "Or create them myself" : "Create my tables"}
            </b>
            <span className="text-zinc-600">
              For example 20 round tables of 10 seats.
            </span>
          </span>
        </button>
      </div>
    );
    next = { label: "Next", fn: () => go(3), off: !c.tables };
  } else if (step === 3) {
    title = "Where do guests come in?";
    body = (
      <div className="space-y-3">
        <p className="text-zinc-600">
          Guests&apos; phones draw a green line from this door to their table.
        </p>
        {c.entrances > 0 && done("The entrance is marked.")}
        <button
          className={big}
          onClick={() =>
            onPlan(
              "set-entrance",
              "Click the door where guests come in. Then click Next.",
            )
          }
          disabled={!c.tables}
        >
          <DoorOpen className="h-9 w-9 shrink-0 text-lime-600" />
          <span>
            <b className="block text-lg">
              {c.entrances ? "Move the entrance" : "Show the door on my plan"}
            </b>
            <span className="text-zinc-600">One click on the plan.</span>
          </span>
        </button>
      </div>
    );
    next = {
      label: c.entrances ? "Next" : "Skip",
      fn: async () => {
        if (!c.entrances) await flag({ noEntrance: true });
        go(4);
      },
    };
  } else if (step === 4) {
    title = "Add your guest list";
    body = (
      <div className="space-y-3">
        {c.guests > 0 &&
          done(`${c.guests} guest${c.guests === 1 ? "" : "s"} on your list.`)}
        <button className={big} onClick={() => openSetup("import-guests")}>
          <FileSpreadsheet className="h-9 w-9 shrink-0 text-lime-600" />
          <span>
            <b className="block text-lg">
              {c.guests ? "Add more from Excel" : "Import my Excel list"}
            </b>
            <span className="text-zinc-600">
              First name and last name are enough. We check the list before
              adding it.
            </span>
          </span>
        </button>
        <a
          href="/api/guest-template"
          download
          className="inline-block text-sm text-zinc-600 underline hover:text-zinc-900"
        >
          No list yet? Download our Excel template
        </a>
      </div>
    );
    next = { label: "Next", fn: () => go(5), off: !c.guests };
  } else if (step === 5) {
    title =
      c.guests && !c.unseated
        ? "Everyone has a seat"
        : "Seat everyone for you?";
    body = (
      <div className="space-y-3">
        {c.guests > 0 &&
          !c.unseated &&
          done(`All ${c.guests} guests are seated.`)}
        {c.unseated > 0 && (
          <>
            <p className="text-zinc-600">
              {c.unseated} guest{c.unseated === 1 ? "" : "s"} still without a
              table.
            </p>
            <Link href="/dashboard/seating-helper" className={big}>
              <Sparkles className="h-9 w-9 shrink-0 text-lime-600" />
              <span>
                <b className="block text-lg">Yes, seat everyone for me</b>
                <span className="text-zinc-600">
                  One click. Families and parties stay together. You can still
                  move anyone after.
                </span>
              </span>
            </Link>
            <button
              className={big}
              onClick={() =>
                onPlan(
                  null,
                  "Click an empty seat on a table, then pick the guest for it. Do this for each guest. When you're done, click Next.",
                )
              }
            >
              <UserPlus className="h-9 w-9 shrink-0 text-zinc-500" />
              <span>
                <b className="block text-lg">
                  No, I&apos;ll assign the seats myself
                </b>
                <span className="text-zinc-600">
                  Click a seat, pick the guest. You choose every seat.
                </span>
              </span>
            </button>
          </>
        )}
      </div>
    );
    next = c.guests && !c.unseated ? { label: "Next", fn: () => go(6) } : null;
  } else {
    title = "You're ready!";
    body = (
      <div className="space-y-3">
        <p className="text-zinc-600">
          Three things to print or share before the big day:
        </p>
        <button
          className={big}
          onClick={() => window.dispatchEvent(new Event("seating4u:open-qr"))}
        >
          <QrCode className="h-8 w-8 shrink-0 text-lime-600" />
          <span>
            <b className="block text-lg">The guest QR code</b>
            <span className="text-zinc-600">
              Put it at the entrance: guests find their seat on their phone.
            </span>
          </span>
        </button>
        <Link href="/dashboard/print-cards" className={big}>
          <Printer className="h-8 w-8 shrink-0 text-lime-600" />
          <span>
            <b className="block text-lg">Table signs &amp; place cards</b>
            <span className="text-zinc-600">Ready to print.</span>
          </span>
        </Link>
        <Link href="/dashboard/check-in-staff" className={big}>
          <UserPlus className="h-8 w-8 shrink-0 text-lime-600" />
          <span>
            <b className="block text-lg">Logins for your door staff</b>
            <span className="text-zinc-600">
              They can only check guests in.
            </span>
          </span>
        </Link>
      </div>
    );
    next = {
      label: "Finish",
      fn: async () => {
        // straight to the check-in screen: menus hidden, whole screen
        document.documentElement.requestFullscreen?.().catch(() => undefined);
        window.dispatchEvent(new Event("seating4u:checkin-screen"));
        exit(false);
        toast.success(
          "Your event is set up! This is your check-in screen. Press Esc to see the menu again.",
        );
        await flag({ checked: true });
      },
    };
  }

  // ---------- stepped aside: a small bar over the plan ----------
  if (aside) {
    return (
      <>
        <div ref={anchor} />
        {createPortal(
          <div className="fixed bottom-4 left-1/2 z-[60] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border-2 border-lime-500 bg-white p-4 shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-wider text-lime-700">
              Step {step + 1} of {TITLES.length} · {TITLES[step]}
            </p>
            <p className="mt-1 text-base font-semibold text-zinc-800">
              {aside.text}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => {
                  window.dispatchEvent(new Event("seating4u:plan-done"));
                  setAside(null);
                }}
                className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
              >
                <ArrowLeft className="h-4 w-4" /> Back to the steps
              </button>
              <button
                onClick={() => {
                  window.dispatchEvent(new Event("seating4u:plan-done"));
                  go(step + 1);
                }}
                disabled={step === 2 && !c.tables}
                title={
                  step === 2 && !c.tables
                    ? "Click “Use these tables” on the plan first"
                    : undefined
                }
                className="ml-auto inline-flex items-center gap-1 rounded-lg bg-lime-600 px-5 py-2 text-sm font-bold text-white hover:bg-lime-700 disabled:bg-zinc-300"
              >
                Next <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>,
          document.body,
        )}
      </>
    );
  }

  // ---------- the big card ----------
  const Icon = [
    PartyPopper,
    ImageIcon,
    LayoutGrid,
    DoorOpen,
    FileSpreadsheet,
    Sparkles,
    Check,
  ][step];
  return (
    <>
      <div ref={anchor} />
      {createPortal(
        <div
          className="fixed inset-x-0 bottom-0 z-[45] overflow-y-auto bg-[#e9f2e1]"
          style={{ top }}
          data-testid="setup-wizard"
        >
          <div className="mx-auto flex min-h-full max-w-xl flex-col px-4 py-6 sm:py-10">
            {/* where you are */}
            <ol
              className="mb-6 flex items-center justify-center gap-1.5"
              aria-label="Setup steps"
            >
              {TITLES.map((t, i) => (
                <li key={t}>
                  <button
                    onClick={() => go(i)}
                    title={t}
                    aria-current={i === step ? "step" : undefined}
                    className={`block h-2.5 rounded-full transition-all ${i === step ? "w-8 bg-lime-600" : i < step ? "w-2.5 bg-lime-400" : "w-2.5 bg-zinc-300"}`}
                  />
                </li>
              ))}
            </ol>
            <div className="rounded-3xl bg-white p-6 shadow-xl sm:p-8">
              <p className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-lime-700">
                <Icon className="h-4 w-4" /> Step {step + 1} of {TITLES.length}
              </p>
              <h2 className="mb-5 text-2xl font-extrabold text-zinc-900 sm:text-3xl">
                {title}
              </h2>
              {body}
              <div className="mt-7 flex items-center gap-2">
                {step > 0 && (
                  <button
                    onClick={() => go(step - 1)}
                    className="inline-flex items-center gap-1 rounded-xl border-2 px-4 py-3 font-semibold hover:bg-zinc-50"
                  >
                    <ArrowLeft className="h-5 w-5" /> Back
                  </button>
                )}
                {next && (
                  <button
                    onClick={next.fn}
                    disabled={next.off}
                    className="ml-auto inline-flex items-center gap-1 rounded-xl bg-lime-600 px-7 py-3 text-lg font-bold text-white hover:bg-lime-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
                    title={next.off ? "Do this step first" : undefined}
                  >
                    {next.label}{" "}
                    {next.label !== "Finish" && (
                      <ArrowRight className="h-5 w-5" />
                    )}
                  </button>
                )}
              </div>
              {next?.off && (
                <p className="mt-2 text-right text-sm text-zinc-500">
                  Do this step first, then click Next.
                </p>
              )}
            </div>
            <button
              onClick={() => exit()}
              className="mx-auto mt-6 text-sm text-zinc-600 underline hover:text-zinc-900"
            >
              I know what I&apos;m doing: show me the full screen
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
