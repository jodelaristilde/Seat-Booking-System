"use client";

// Red bar on the dashboard when guests can't look up their seat on their
// phone for the open event (closed by hand, or its date has passed), with a
// button to reopen it.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type Access = { open: boolean; past: boolean; closed: boolean; date: string | null };

export function GuestAccessBanner() {
  const [eventId, setEventId] = useState("");
  const [access, setAccess] = useState<Access | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [e, ga] = await Promise.all([
        fetch("/api/events").then((r) => r.json()),
        fetch("/api/events/guest-access").then((r) => r.json()),
      ]);
      if (e?.success && ga?.success) {
        setEventId(e.activeId);
        setAccess(ga.data?.[e.activeId] ?? null);
      }
    } catch {
      /* offline: say nothing */
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!access || access.open) return null;
  const why = access.closed
    ? "guest check-in was closed (Close out, or Guest check-in: Closed)"
    : `the event date (${access.date}) has passed`;

  const reopen = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/events/guest-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: eventId, closed: false }),
      }).then((x) => x.json());
      if (!r?.success) throw new Error();
      toast.success("Reopened: guests can find their seat on their phone again.");
      await load();
    } catch {
      toast.error("Could not reopen. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b-2 border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">
      <span className="flex-1">
        <b>Guests can&apos;t find their seat on their phone right now</b> (QR code and link): {why}.
      </span>
      <button
        onClick={reopen}
        disabled={busy}
        className="rounded-md bg-red-600 px-3 py-1.5 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
      >
        {busy ? "Reopening…" : "Reopen for guests"}
      </button>
    </div>
  );
}
