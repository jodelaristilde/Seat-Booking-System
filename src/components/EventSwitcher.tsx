"use client";

// Events: each one has its own floor plan, tables and guests.
// Shows the open event at the top of the dashboard; click to switch,
// start a new event, rename or delete one.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarDays, ChevronDown, Plus, Trash2, Pencil, Check, QrCode, Download } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";

type Ev = { id: string; name: string; date: string | null; tables?: number; guests?: number };

export function EventSwitcher() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<Ev[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [qrFor, setQrFor] = useState<Ev | null>(null);
  const qrLink = (e: Ev) => `${window.location.origin}/seat-scanning?event=${e.id}`;
  const downloadQr = (e: Ev) => {
    const c = document.getElementById("event-qr") as HTMLCanvasElement | null;
    if (!c) return;
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `${e.name.replace(/[^\w\- ]+/g, "").trim() || "event"} - check-in QR.png`;
    a.click();
  };

  // per event: can guests look up seats on their phone?
  const [access, setAccess] = useState<Record<string, { open: boolean; past: boolean; closed: boolean }>>({});
  const load = async () => {
    try {
      const res = await fetch("/api/events");
      const json = await res.json();
      if (json.success) {
        setEvents(json.events);
        setActiveId(json.activeId);
      }
      const ga = await fetch("/api/events/guest-access").then((r) => r.json()).catch(() => null);
      if (ga?.success) setAccess(ga.data);
    } catch {
      /* keep what we have */
    }
  };
  const toggleGuests = async (id: string, open: boolean) => {
    await fetch("/api/events/guest-access", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, closed: open }),
    }).catch(() => undefined);
    load();
  };
  useEffect(() => {
    load();
  }, []);

  const active = events.find((e) => e.id === activeId);

  const call = async (method: string, body: object, done: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/events", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      toast.success(done);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Switching or creating an event reloads the page so everything shows the new event
  const openEvent = async (id: string) => {
    if (await call("PUT", { id }, "Event opened")) window.location.reload();
  };
  const createEvent = async () => {
    if (!newName.trim()) return toast.error("Please give the event a name");
    if (await call("POST", { name: newName, date: newDate }, `"${newName.trim()}" created`)) window.location.reload();
  };
  const rename = async (id: string) => {
    if (!renameText.trim()) return;
    if (await call("PUT", { id, name: renameText }, "Renamed")) {
      setRenaming(null);
      load();
    }
  };
  const remove = async (e: Ev) => {
    if (
      !window.confirm(
        `Delete "${e.name}" with its ${e.tables ?? 0} tables, ${e.guests ?? 0} guests and floor plan? This can't be undone.`
      )
    )
      return;
    if (await call("DELETE", { id: e.id }, "Event deleted")) load();
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          load();
          setOpen(true);
        }}
        className="max-w-[16rem] gap-1.5"
        title="Switch event, or start a new one"
      >
        <CalendarDays className="h-4 w-4 shrink-0" />
        <span className="truncate font-semibold">{active?.name ?? "Event"}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Events</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-500">
            Each event has its own floor plan, tables and guests. Several events can run at the same time: each
            computer opens the event it is working on, and each event has its own guest QR code.
          </p>

          <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
            {events.map((e) => {
              const isOpen = e.id === activeId;
              return (
                <li
                  key={e.id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                    isOpen ? "border-lime-400 bg-lime-50" : "border-zinc-200"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    {renaming === e.id ? (
                      <div className="flex gap-1">
                        <input
                          autoFocus
                          value={renameText}
                          onChange={(x) => setRenameText(x.target.value)}
                          onKeyDown={(x) => x.key === "Enter" && rename(e.id)}
                          className="w-full rounded border px-2 py-1 text-sm"
                        />
                        <Button size="sm" onClick={() => rename(e.id)} disabled={busy}>
                          <Check className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="truncate font-semibold">
                          {e.name} {isOpen && <span className="ml-1 text-xs font-medium text-lime-700">● open on this computer</span>}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {e.date ? `${e.date} · ` : ""}
                          {e.tables ?? 0} tables · {e.guests ?? 0} guests
                        </div>
                        {/* can guests find their seat on their phone? */}
                        {access[e.id] && (
                          <button
                            type="button"
                            onClick={() => toggleGuests(e.id, access[e.id].open)}
                            disabled={access[e.id].past && !access[e.id].closed}
                            className={`mt-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                              access[e.id].open
                                ? "border-green-300 bg-green-50 text-green-800 hover:bg-green-100"
                                : "border-zinc-300 bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                            }`}
                            title={
                              access[e.id].past
                                ? "This event's date has passed: guests can no longer look up seats"
                                : access[e.id].open
                                ? "Guests can find their seat on their phone. Click to close."
                                : "Guests can't look up seats. Click to reopen."
                            }
                          >
                            {access[e.id].open
                              ? "Guest check-in: Open"
                              : access[e.id].past
                              ? "Guest check-in: Closed (date passed)"
                              : "Guest check-in: Closed"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {renaming !== e.id && (
                    <>
                      <button
                        type="button"
                        className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                        title="This event's guest QR code"
                        onClick={() => setQrFor(e)}
                      >
                        <QrCode className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                        title="Rename"
                        onClick={() => {
                          setRenaming(e.id);
                          setRenameText(e.name);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {!isOpen && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => openEvent(e.id)} disabled={busy}>
                            Open
                          </Button>
                          <button
                            type="button"
                            className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                            title="Delete this event"
                            onClick={() => remove(e)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-3 rounded-lg border border-dashed border-zinc-300 p-3">
            <p className="mb-2 text-sm font-semibold text-zinc-700">Start a new event</p>
            <div className="flex flex-wrap gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name, e.g. HANA Dinner"
                className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm"
              />
              <input
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                placeholder="Date (optional)"
                className="w-36 rounded border px-2 py-1.5 text-sm"
              />
              <Button size="sm" onClick={createEvent} disabled={busy}>
                <Plus className="mr-1 h-4 w-4" /> Create
              </Button>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              The new event starts empty and opens on this computer. Other computers keep their own event.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* One QR code per event: guests who scan it only find this event's names */}
      <Dialog open={!!qrFor} onOpenChange={(o) => !o && setQrFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Guest QR code · {qrFor?.name}</DialogTitle>
          </DialogHeader>
          {qrFor && (
            <div className="flex flex-col items-center gap-3">
              <QRCodeCanvas id="event-qr" value={qrLink(qrFor)} size={260} level="M" marginSize={2} />
              <p className="break-all text-center text-xs text-zinc-500">{qrLink(qrFor)}</p>
              <p className="text-center text-sm text-zinc-600">
                Optional: guests who scan this code only see <b>{qrFor.name}</b>&apos;s guest list. Your usual Seating4U QR code (the one on your banners) works for every event too: guests type their name and are found in their own event.
              </p>
              <Button onClick={() => downloadQr(qrFor)}>
                <Download className="mr-1 h-4 w-4" /> Download QR code
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
