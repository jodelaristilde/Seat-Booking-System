"use client";

// Events: each one has its own floor plan, tables and guests.
// Shows the open event at the top of the dashboard; click to switch,
// start a new event, rename or delete one.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarDays, ChevronDown, Plus, Trash2, Pencil, Check } from "lucide-react";
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

  const load = async () => {
    try {
      const res = await fetch("/api/events");
      const json = await res.json();
      if (json.success) {
        setEvents(json.events);
        setActiveId(json.activeId);
      }
    } catch {
      /* keep what we have */
    }
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
            Each event has its own floor plan, tables and guests. The open event is what the dashboard and the guests&apos;
            QR code check-in use.
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
                          {e.name} {isOpen && <span className="ml-1 text-xs font-medium text-lime-700">● open</span>}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {e.date ? `${e.date} · ` : ""}
                          {e.tables ?? 0} tables · {e.guests ?? 0} guests
                        </div>
                      </>
                    )}
                  </div>
                  {renaming !== e.id && (
                    <>
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
              The new event starts empty and opens right away. Your other events stay saved; open them again any time.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
