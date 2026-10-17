"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import {
  Move,
  Save,
  X,
  ImageIcon,
  LayoutGrid,
  PenLine,
  PanelLeftClose,
  PanelRightOpen,
  Users,
  Armchair,
  Undo2,
  Type,
  Circle,
  Square,
  RectangleHorizontal,
  Loader2,
  ZoomIn,
  Volume2,
  VolumeX,
  Check,
  Search,
  DoorOpen,
} from "lucide-react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import type { TableData } from "@/types/booking";
import {
  findShapes,
  readTextInShapes,
  nameFromText,
  readingOrder,
  type DetectedShape,
  type Shape,
  shapeAtPoint,
} from "@/lib/detectTables";
import { stampNames } from "@/lib/stampNames";

type Pos = { x: number; y: number };

interface FloorPlanCanvasProps {
  tables: TableData[];
  renderTable: (table: TableData, index: number, hideSeats: boolean) => ReactNode;
  onTablesChanged: () => void | Promise<void>;
  // "Room only": hide the rest of the dashboard while working on the room
  roomOnly?: boolean;
  onRoomOnlyChange?: (on: boolean) => void;
  // Show the names of seated guests next to their seats
  guestNames?: boolean;
  onGuestNamesChange?: (on: boolean) => void;
  // Number of guests in the guest list (for the totals shown in full screen)
  invited?: number;
  /** tick / untick a guest as arrived */
  onToggleArrived?: (seatId: string, arrived: boolean) => void;
}

// One table while checking the picture
interface ReviewItem {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: Shape;
  name: string;
  picked: boolean;
}

const SIZE_KEY = "floorPlanTableSize";
const PICTURE_KEY = "floorPlanShowPicture2"; // new name: picture now on by default
const SEATS_KEY = "floorPlanShowSeats";
const ZOOM_KEY = "floorPlanHoverZoom";
const SHAPES: Shape[] = ["round", "square", "rectangle"];
// Tabletop size as a share of a drawn outline (chairs included). The seat
// ring spans 90% of a table's box and the top 66%, so 0.66 / 0.9.
const DRAWN_TOP = 0.66 / 0.9;

const readStored = (key: string) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStored = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage not available - ignore */
  }
};

// The real database id of a table (seats carry it)
const tableIdOf = (t: TableData) =>
  String(t.seats[0]?.tableId ?? t.seats[0]?.table?.id ?? t.tableNumber);
const tableNameOf = (t: TableData) =>
  t.seats[0]?.table?.name ?? `Table ${t.tableNumber}`;

// Spread tables that have no saved spot evenly over the plan
function autoPositions(count: number): Pos[] {
  if (count === 0) return [];
  const cols = Math.max(1, Math.ceil(Math.sqrt(count * 1.6)));
  const rows = Math.ceil(count / cols);
  return Array.from({ length: count }, (_, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    return {
      x: cols === 1 ? 50 : 10 + (80 * c) / (cols - 1),
      y: rows === 1 ? 50 : 12 + (76 * r) / (rows - 1),
    };
  });
}

// Lowest "Table N" number not used yet
function nextFreeNumber(usedNames: string[]): number {
  const used = new Set(
    usedNames
      .map((n) => n.match(/^table\s+(\d+)$/i)?.[1])
      .filter(Boolean)
      .map(Number)
  );
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

const ShapeIcon = ({ shape, className }: { shape: Shape; className?: string }) =>
  shape === "round" ? (
    <Circle className={className} />
  ) : shape === "square" ? (
    <Square className={className} />
  ) : (
    <RectangleHorizontal className={className} />
  );

export function FloorPlanCanvas({
  tables,
  renderTable,
  onTablesChanged,
  roomOnly = false,
  onRoomOnlyChange,
  guestNames = false,
  onGuestNamesChange,
  invited,
  onToggleArrived,
}: FloorPlanCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState<Record<string, Pos>>({});
  const [draft, setDraft] = useState<Record<string, Pos> | null>(null);
  // Shape changes made in "Move tables" mode, saved with the layout
  const [draftShapes, setDraftShapes] = useState<Record<string, Shape>>({});
  const [picture, setPicture] = useState<string | null>(null);
  const [aspect, setAspect] = useState(16 / 10);
  // The venue picture is only a guide: hidden unless you ask for it,
  // and shown faintly while drawing, moving or checking tables.
  const [showPicture, setShowPicture] = useState(true);
  // Just the table shapes by default; seat bubbles on request
  const [showSeats, setShowSeats] = useState(false);
  // Hover a table to see it big (seats, guests, who arrived). Can be turned off.
  const [hoverZoom, setHoverZoom] = useState(true);
  const [railOpen, setRailOpen] = useState(false);
  const [zoomId, setZoomId] = useState<string | null>(null);
  const zoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // While adding guests in the zoom card, it stays open until closed with X
  const zoomPinned = useRef(false);
  const zoomOpenSoon = (id: string) => {
    if (zoomPinned.current) return; // busy adding guests: keep this table
    if (zoomTimer.current) clearTimeout(zoomTimer.current);
    zoomTimer.current = setTimeout(() => setZoomId(id), 350);
  };
  const zoomCloseSoon = () => {
    if (zoomTimer.current) clearTimeout(zoomTimer.current);
    if (zoomPinned.current) return;
    zoomTimer.current = setTimeout(() => setZoomId(null), 300);
  };
  const closeZoom = () => {
    zoomPinned.current = false;
    setZoomId(null);
    setAddQuery("");
    setAddPicked([]);
    setTableQuery("");
  };

  // ---- Zoom card: add several guests to the table at once ----
  type GuestRow = { id: string; firstname: string; lastname: string; seat: { table?: { name?: string } }[] };
  const [allGuests, setAllGuests] = useState<GuestRow[] | null>(null);
  const [addQuery, setAddQuery] = useState("");
  const [tableQuery, setTableQuery] = useState("");
  // Zoom card job, decided by the screen:
  // - menu showing (setting up)  -> seat guests: add / remove guests
  // - full screen (event day)    -> check in: tick who arrived
  const cardMode: "seat" | "checkin" = roomOnly ? "checkin" : "seat";
  // Seat guests mode: have the guest list ready as soon as a table opens
  useEffect(() => {
    if (zoomId && cardMode === "seat" && !allGuests) loadGuests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomId, cardMode]);
  // VIP star / meal choice for one guest
  const updateGuest = async (id: string, data: { vip?: boolean; meal?: string | null }) => {
    try {
      const res = await fetch("/api/guest-update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.message);
      await onTablesChanged();
    } catch (e) {
      toast.error("Could not save", { description: e instanceof Error ? e.message : undefined });
    }
  };
  const removeFromSeat = async (seatId: string) => {
    try {
      const res = await fetch("/api/delete-booking", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      await onTablesChanged();
      if (allGuests) await loadGuests();
    } catch (e) {
      toast.error("Could not remove the guest", { description: e instanceof Error ? e.message : undefined });
    }
  };
  const [addPicked, setAddPicked] = useState<string[]>([]);
  const [addBusy, setAddBusy] = useState(false);
  const loadGuests = async () => {
    try {
      const res = await fetch("/api/get-guests");
      const json = await res.json();
      if (json.success) setAllGuests(json.data);
    } catch {
      /* the list just stays empty */
    }
  };
  const seatPicked = async (tableId: string) => {
    if (!addPicked.length) return;
    setAddBusy(true);
    try {
      const res = await fetch("/api/assign-guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestIds: addPicked, tableId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      toast.success(`${addPicked.length} guest${addPicked.length === 1 ? "" : "s"} seated`);
      setAddPicked([]);
      setAddQuery("");
      await onTablesChanged();
      await loadGuests();
    } catch (e) {
      toast.error("Could not seat the guests", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setAddBusy(false);
    }
  };
  const zoomKeepOpen = () => {
    if (zoomTimer.current) clearTimeout(zoomTimer.current);
  };
  const toggleHoverZoom = () =>
    setHoverZoom((v) => {
      writeStored(ZOOM_KEY, v ? "off" : "on");
      if (v) setZoomId(null);
      return !v;
    });
  const [tableSize, setTableSize] = useState(12);
  const [saving, setSaving] = useState(false);
  const dragging = useRef<{ id: string; dx: number; dy: number } | null>(null);
  // Resizing one table (Move tables mode): drag its corner handle
  const resizing = useRef<{ id: string; cx: number; startW: number; startX: number } | null>(null);
  const [draftWidths, setDraftWidths] = useState<Record<string, number>>({});

  // "Read tables from picture" state
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  const [reviewBusy, setReviewBusy] = useState<string | null>(null);
  const [seatsPerTable, setSeatsPerTable] = useState(10);
  // New venue = new tables: remove old tables that are not in the picture
  const [replaceOld, setReplaceOld] = useState(true);
  // Write the table names onto the floor plan picture itself
  const [writeNames, setWriteNames] = useState(true);

  // "Draw tables": pick a shape and seats, then drag on the picture
  const [drawing, setDrawing] = useState(false);
  const [drawShape, setDrawShape] = useState<Shape>("round");
  const [drawSeats, setDrawSeatsRaw] = useState(10);
  // "Seats per table": one preset for every new table, remembered
  const setDrawSeats = (n: number) => {
    setDrawSeatsRaw(n);
    setSeatsPerTable(n);
    writeStored("floorPlanSeats", String(n));
  };
  const [settingSeats, setSettingSeats] = useState(false);
  const setAllSeats = async () => {
    if (!window.confirm(`Give every table ${drawSeats} seats? Seats with a guest on them are never removed.`)) return;
    setSettingSeats(true);
    try {
      const res = await fetch("/api/set-seats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seats: drawSeats }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      await onTablesChanged();
      toast.success(
        json.changed ? `${json.changed} table${json.changed === 1 ? "" : "s"} now have ${drawSeats} seats` : `Every table already has ${drawSeats} seats`,
        json.keptExtra?.length
          ? { description: `Kept extra seats with guests on them at: ${json.keptExtra.join(", ")}` }
          : undefined
      );
    } catch (e) {
      toast.error("Could not change the seats", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSettingSeats(false);
    }
  };
  const [drawBox, setDrawBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const [drawnIds, setDrawnIds] = useState<string[]>([]);
  const [drawBusy, setDrawBusy] = useState(false);

  const editing = draft !== null;
  const reviewing = review !== null;

  // Drawing, moving or checking tables: show only the room, then bring the
  // rest of the dashboard back when finished
  // ---- Entrance(s): where guests come in (the phone draws the way from here) ----
  const [settingEntrance, setSettingEntrance] = useState(false);
  const [entrances, setEntrances] = useState<{ x: number; y: number }[]>([]);
  useEffect(() => {
    fetch("/api/event-entrance")
      .then((r) => r.json())
      .then((j) => j.success && setEntrances(j.entrances))
      .catch(() => undefined);
  }, []);
  const saveEntrances = async (next: { x: number; y: number }[]) => {
    setEntrances(next);
    try {
      const res = await fetch("/api/event-entrance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entrances: next }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.message);
    } catch (e) {
      toast.error("Could not save the entrance", { description: e instanceof Error ? e.message : undefined });
    }
  };

  const working = drawing || editing || reviewing || settingEntrance;
  const wasWorking = useRef(false);
  useEffect(() => {
    if (working && !wasWorking.current) onRoomOnlyChange?.(true);
    if (!working && wasWorking.current) onRoomOnlyChange?.(false);
    wasWorking.current = working;
  }, [working, onRoomOnlyChange]);

  // Remembered per browser: table size and picture on/off
  useEffect(() => {
    const s = Number(readStored(SIZE_KEY));
    if (s >= 6 && s <= 30) setTableSize(s);
    if (readStored(PICTURE_KEY) === "off") setShowPicture(false);
    if (readStored(SEATS_KEY) === "on") setShowSeats(true);
    if (readStored(ZOOM_KEY) === "off") setHoverZoom(false);
    const presetSeats = Number(readStored("floorPlanSeats"));
    if (presetSeats >= 1 && presetSeats <= 40) {
      setDrawSeatsRaw(presetSeats);
      setSeatsPerTable(presetSeats);
    }
  }, []);

  const changeTableSize = (v: number) => {
    const s = Math.min(30, Math.max(6, Math.round(v)));
    setTableSize(s);
    writeStored(SIZE_KEY, String(s));
  };

  // Saved table spots
  const loadPositions = useCallback(async () => {
    try {
      const res = await fetch("/api/table-positions");
      const json = await res.json();
      if (json.success) {
        const map: Record<string, Pos> = {};
        for (const t of json.data as {
          id: string;
          posX: number | null;
          posY: number | null;
        }[]) {
          if (t.posX != null && t.posY != null) map[t.id] = { x: t.posX, y: t.posY };
        }
        setSaved(map);
      }
    } catch (e) {
      console.error("Failed to load table positions", e);
    }
  }, []);

  useEffect(() => {
    loadPositions();
  }, [loadPositions, tables.length]);

  // The uploaded floor plan picture, used as a guide behind the tables
  const loadPicture = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/floor-map");
      const json = await res.json();
      // Use the clean picture (without names written on it) when we have it
      const src: string | undefined = json?.image?.original || json?.image?.data;
      if (!src) {
        setPicture(null);
        return null;
      }
      await new Promise<void>((resolve) => {
        const img = new window.Image();
        img.onload = () => {
          if (img.naturalWidth && img.naturalHeight) {
            setAspect(img.naturalWidth / img.naturalHeight);
          }
          resolve();
        };
        img.onerror = () => resolve();
        img.src = src;
      });
      setPicture(src);
      return src;
    } catch (e) {
      console.error("Failed to load floor map picture", e);
      return null;
    }
  }, []);

  useEffect(() => {
    loadPicture();
  }, [loadPicture]);

  // ---------- Read tables from the picture ----------
  // Reading tables from the picture is switched off (not needed); kept for later
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const startReview = useCallback(
    async (src?: string | null) => {
      const pic = src ?? picture;
      if (!pic) {
        toast.error("Upload a floor plan picture first (FLOOR MAP button).");
        return;
      }
      setDraft(null);
      setReviewBusy("Looking for tables in the picture...");
      setReview([]);
      try {
        const { shapes, canvas } = await findShapes(pic);
        const ordered = readingOrder(shapes);
        const toItems = (list: DetectedShape[]) => {
          const used: string[] = [];
          const items = list.map((s) => {
            const fromText = nameFromText(s.text);
            if (fromText) used.push(fromText);
            return { s, fromText };
          });
          return items.map(({ s, fromText }) => {
            let name = fromText;
            if (!name && s.likelyTable) {
              name = `Table ${nextFreeNumber(used)}`;
              used.push(name);
            }
            return {
              key: s.key,
              x: s.x,
              y: s.y,
              w: s.w,
              h: s.h,
              shape: s.shape,
              name,
              picked: s.likelyTable,
            } as ReviewItem;
          });
        };
        setReview(toItems(ordered));

        // Tables now take their own size from the picture; reset the zoom
        changeTableSize(12);

        // Copy numbers / names written in the picture
        setReviewBusy("Reading table numbers and names...");
        try {
          const withText = await readTextInShapes(canvas, ordered, (d, t) =>
            setReviewBusy(`Reading table numbers and names... ${d} of ${t}`)
          );
          const textByKey = new Map(withText.map((s) => [s.key, s.text]));
          setReview((prev) => {
            if (!prev) return prev;
            // Only replace names the person has not typed over yet
            const fresh = toItems(ordered.map((s) => ({ ...s, text: textByKey.get(s.key) ?? "" })));
            const freshByKey = new Map(fresh.map((f) => [f.key, f]));
            return prev.map((p) => {
              const f = freshByKey.get(p.key);
              const autoName = /^table \d+$/i.test(p.name) || p.name === "";
              return f && autoName && f.name ? { ...p, name: f.name } : p;
            });
          });
        } catch (e) {
          console.warn("Text reading skipped:", e);
          toast.message("Couldn't read text in the picture, so tables were numbered in order. You can type names yourself.");
        }
      } catch (e) {
        toast.error("Could not read the picture", {
          description: e instanceof Error ? e.message : undefined,
        });
        setReview(null);
      } finally {
        setReviewBusy(null);
      }
    },
    [picture]
  );

  // A new picture was uploaded: just show it (tables are added with
  // "Draw tables": click a table in the picture, or drag to draw one)
  useEffect(() => {
    const pending = window as unknown as { __floorMapPending?: boolean };
    const onUploaded = async () => {
      pending.__floorMapPending = false;
      await loadPicture();
    };
    // Uploaded while the grid view was showing: do it now that we are open
    if (pending.__floorMapPending) onUploaded();
    const onDeleted = () => {
      setPicture(null);
      setReview(null);
    };
    window.addEventListener("floor-map-uploaded", onUploaded);
    window.addEventListener("floor-map-deleted", onDeleted);
    return () => {
      window.removeEventListener("floor-map-uploaded", onUploaded);
      window.removeEventListener("floor-map-deleted", onDeleted);
    };
  }, [loadPicture]);

  const updateItem = (key: string, change: Partial<ReviewItem>) =>
    setReview((prev) => prev?.map((it) => (it.key === key ? { ...it, ...change } : it)) ?? prev);

  const pickItem = (key: string, picked: boolean) =>
    setReview((prev) => {
      if (!prev) return prev;
      return prev.map((it) => {
        if (it.key !== key) return it;
        if (picked && !it.name) {
          const used = [
            ...prev.filter((p) => p.picked).map((p) => p.name),
            ...tables.map(tableNameOf),
          ];
          return { ...it, picked, name: `Table ${nextFreeNumber(used)}` };
        }
        return { ...it, picked };
      });
    });

  const addReviewTable = (shape: Shape) =>
    setReview((prev) => {
      const list = prev ?? [];
      const used = [...list.filter((p) => p.picked).map((p) => p.name), ...tables.map(tableNameOf)];
      const base = tableSize / 1.35;
      return [
        ...list,
        {
          key: `added-${Date.now()}`,
          x: 50,
          y: 50,
          w: shape === "rectangle" ? base * 1.8 : base,
          h: ((shape === "rectangle" ? base * 0.9 : base) * aspect) || base,
          shape,
          name: `Table ${nextFreeNumber(used)}`,
          picked: true,
        },
      ];
    });

  // Save a copy of the picture with every table's name written on it.
  // Guests who open the floor map then see the numbers too.
  const writeNamesOnPicture = async (
    list: { name: string; x: number; y: number }[],
    quiet = false
  ) => {
    if (!picture || !list.length) return false;
    try {
      const { data, mimeType, size } = await stampNames(picture, list, tableSize);
      if (size > 10 * 1024 * 1024) throw new Error("The picture is too big to save with names (over 10 MB).");
      const res = await fetch("/api/floor-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: "floor-plan-with-table-names." + (mimeType === "image/png" ? "png" : "jpg"),
          data,
          mimeType,
          size,
          original: picture,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Upload failed");
      }
      if (!quiet) toast.success("Table names written on the floor plan picture");
      return true;
    } catch (e) {
      toast.error("Could not write the names on the picture", {
        description: e instanceof Error ? e.message : undefined,
      });
      return false;
    }
  };

  const currentStamps = (pos: Record<string, Pos>) =>
    tables
      .map((t) => ({
        name: tableNameOf(t),
        // width of the table top itself (the box is 66% of the drawn table)
        w: tableBox(t).width * 0.66,
        ...pos[tableIdOf(t)],
      }))
      .filter((s) => typeof s.x === "number" && typeof s.y === "number");

  // When a table is renamed (gear icon), write the new name on the picture
  // right away, in the centre of that table.
  const namesKey = tables
    .map((t) => `${tableIdOf(t)}:${tableNameOf(t)}`)
    .sort()
    .join("|");
  const lastNamesKey = useRef<string | null>(null);
  const skipNextStamp = useRef(false);
  useEffect(() => {
    if (lastNamesKey.current === null || !tables.length) {
      lastNamesKey.current = namesKey;
      return;
    }
    if (namesKey === lastNamesKey.current) return;
    const before = new Map(
      lastNamesKey.current.split("|").map((p) => [p.slice(0, p.indexOf(":")), p.slice(p.indexOf(":") + 1)])
    );
    lastNamesKey.current = namesKey;
    if (skipNextStamp.current) {
      // the picture was just written by "Use these tables"
      skipNextStamp.current = false;
      return;
    }
    if (!picture || reviewing || editing) return;
    // Only when an existing table got a new name (not when tables were added/removed)
    const renamed = tables.some((t) => {
      const old = before.get(tableIdOf(t));
      return old !== undefined && old !== tableNameOf(t);
    });
    if (!renamed) return;
    writeNamesOnPicture(currentStamps(saved), true).then((ok) => {
      if (ok) toast.success("New table name written on the floor plan picture");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey]);

  const applyReview = async () => {
    if (!review) return;
    const picked = review.filter((r) => r.picked);
    if (!picked.length) {
      toast.error("No tables ticked. Click the shapes that are tables.");
      return;
    }
    const names = picked.map((p) => p.name.trim().toLowerCase());
    if (names.some((n) => !n)) {
      toast.error("Every table needs a name or number.");
      return;
    }
    if (new Set(names).size !== names.length) {
      toast.error("Two tables have the same name. Please make each name different.");
      return;
    }
    if (replaceOld) {
      const keep = new Set(names);
      const going = tables.filter((t) => !keep.has(tableNameOf(t).trim().toLowerCase()));
      const bookedGoing = going.reduce((n, t) => n + t.seats.filter((s) => s.isBooked).length, 0);
      if (
        going.length &&
        !window.confirm(
          `${going.length} old table${going.length === 1 ? "" : "s"} not in this picture will be removed` +
            (bookedGoing
              ? `, and ${bookedGoing} guest${bookedGoing === 1 ? " loses their" : "s lose their"} seat (they stay in your guest list).`
              : ".") +
            " Continue?"
        )
      )
        return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/floor-plan-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          removeOthers: replaceOld,
          tables: picked.map((p) => ({
            name: p.name.trim(),
            x: p.x,
            y: p.y,
            shape: p.shape,
            seats: seatsPerTable,
            w: p.w,
            h: p.h,
          })),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setReview(null);
      skipNextStamp.current = writeNames;
      await onTablesChanged();
      await loadPositions();
      const parts = [];
      if (json.created) parts.push(`${json.created} new table${json.created === 1 ? "" : "s"} added`);
      if (json.moved) parts.push(`${json.moved} existing table${json.moved === 1 ? "" : "s"} moved into place`);
      if (json.removed) parts.push(`${json.removed} old table${json.removed === 1 ? "" : "s"} removed`);
      toast.success(parts.join(", ") || "Floor plan saved");
      if (writeNames) {
        await writeNamesOnPicture(
          picked.map((p) => ({ name: p.name.trim(), x: p.x, y: p.y, w: p.w }))
        );
      }
    } catch (e) {
      toast.error("Could not save the tables", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  // ---------- Normal floor plan ----------
  const positions = useMemo(() => {
    const unplaced = tables.filter((t) => {
      const id = tableIdOf(t);
      return !(draft?.[id] ?? saved[id]);
    });
    const auto = autoPositions(unplaced.length);
    const result: Record<string, Pos> = {};
    tables.forEach((t) => {
      const id = tableIdOf(t);
      result[id] = draft?.[id] ?? saved[id] ?? auto[unplaced.indexOf(t)];
    });
    return result;
  }, [tables, saved, draft]);

  const startEditing = () => {
    setDraftShapes({});
    setDraftWidths({});
    setDraft({ ...positions });
  };
  const cancelEditing = () => {
    setDraftShapes({});
    setDraftWidths({});
    setDraft(null);
  };
  const shapeOf = (t: TableData): Shape =>
    draftShapes[tableIdOf(t)] ?? ((t.seats[0]?.table?.shape as Shape) || "round");
  // How big a table is drawn: its size traced from the picture when known,
  // otherwise the standard size. The Table size slider zooms all of them.
  const tableBox = (t: TableData): { width: number; ratio: number } => {
    const box = baseTableBox(t);
    const w = draftWidths[tableIdOf(t)];
    return w ? { ...box, width: w } : box;
  };
  const baseTableBox = (t: TableData): { width: number; ratio: number } => {
    const shape = shapeOf(t);
    const zoom = tableSize / 12;
    const sw = Number(t.seats[0]?.table?.sizeW) || 0;
    const sh = Number(t.seats[0]?.table?.sizeH) || 0;
    if (sw > 0 && sh > 0) {
      const shW = sh / aspect; // the traced height, in % of picture width
      if (shape !== "rectangle") {
        return { width: (Math.min(sw, shW) / 0.66) * zoom, ratio: 1 };
      }
      const long = Math.max(sw, shW);
      const short = Math.min(sw, shW);
      if (long / short < 1.2) {
        // traced as round/square but switched to rectangle: make it long
        return { width: ((short * 1.8) / 0.66) * zoom, ratio: 2 };
      }
      // a tall table (standing up) stays tall
      if (shW > sw) return { width: (sw / 0.66) * zoom, ratio: sw / shW };
      return { width: (long / 0.66) * zoom, ratio: long / short };
    }
    return shape === "rectangle"
      ? { width: tableSize * 1.6, ratio: 2 }
      : { width: tableSize, ratio: 1 };
  };
  const withShape = (t: TableData): TableData => {
    const shape = shapeOf(t);
    const { ratio } = tableBox(t);
    return {
      ...t,
      seats: t.seats.map((s, i) =>
        i === 0 ? { ...s, table: { ...s.table, shape, ratio } } : s
      ),
    };
  };

  const lineUpAll = () => {
    const auto = autoPositions(tables.length);
    const next: Record<string, Pos> = {};
    tables.forEach((t, i) => (next[tableIdOf(t)] = auto[i]));
    setDraft(next);
  };

  const saveLayout = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const body = {
        positions: tables.map((t) => {
          const id = tableIdOf(t);
          const p = draft[id] ?? positions[id];
          // A resized table: save its new size the same way a traced one is stored
          let sizes = {};
          if (draftWidths[id]) {
            const { ratio } = tableBox(t);
            const top = (draftWidths[id] * 0.66) / (tableSize / 12);
            const isRect = shapeOf(t) === "rectangle";
            sizes = { sizeW: top, sizeH: (isRect ? top / ratio : top) * aspect };
          }
          return { id, x: p.x, y: p.y, ...(draftShapes[id] ? { shape: draftShapes[id] } : {}), ...sizes };
        }),
      };
      const res = await fetch("/api/table-positions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setSaved((prev) => ({ ...prev, ...draft }));
      const moved = { ...positions, ...draft };
      const shapesChanged =
        Object.keys(draftShapes).length > 0 || Object.keys(draftWidths).length > 0;
      setDraftWidths({});
      setDraft(null);
      setDraftShapes({});
      if (shapesChanged) await onTablesChanged();
      toast.success("Floor plan saved");
      // Keep the names on the picture in step with where the tables are now
      if (picture) await writeNamesOnPicture(currentStamps(moved), true);
    } catch (e) {
      toast.error("Could not save the floor plan", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  // Add one table straight onto the plan (Move tables mode)
  const addTable = async (shape: Shape) => {
    setSaving(true);
    try {
      const name = `Table ${nextFreeNumber(tables.map(tableNameOf))}`;
      const res = await fetch("/api/floor-plan-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tables: [{ name, x: 50, y: 50, shape, seats: seatsPerTable }] }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      await onTablesChanged();
      await loadPositions();
      toast.success(`${name} added in the middle. Drag it where it goes.`);
    } catch (e) {
      toast.error("Could not add the table", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  // ---------- drawing tables on the picture ----------
  // The box being drawn, in % of the plan. Round and square tables are kept
  // truly round/square on screen, whichever way the mouse goes.
  const shapedBox = (b: { x0: number; y0: number; x1: number; y1: number }) => {
    let w = Math.abs(b.x1 - b.x0);
    let h = Math.abs(b.y1 - b.y0);
    if (drawShape !== "rectangle") {
      // same real size both ways: h% of height = w% of width * aspect
      const side = Math.max(w, h / aspect);
      w = side;
      h = side * aspect;
    }
    const left = b.x1 >= b.x0 ? b.x0 : b.x0 - w;
    const top = b.y1 >= b.y0 ? b.y0 : b.y0 - h;
    return { x: left + w / 2, y: top + h / 2, w, h };
  };

  const onDrawDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drawBusy) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointToPercent(e.clientX, e.clientY);
    drawStart.current = p;
    setDrawBox({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const onDrawMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = drawStart.current;
    if (!s) return;
    const p = pointToPercent(e.clientX, e.clientY);
    setDrawBox({
      x0: s.x,
      y0: s.y,
      x1: Math.min(100, Math.max(0, p.x)),
      y1: Math.min(100, Math.max(0, p.y)),
    });
  };
  const onDrawUp = async () => {
    const box = drawBox;
    drawStart.current = null;
    setDrawBox(null);
    if (!box) return;
    const b = shapedBox(box);
    if (b.w < 1.5 || b.h < 1.5) {
      // A click (no drag): find the table under the mouse on the picture
      await addClickedTable(box.x0, box.y0);
      return;
    }
    setDrawBusy(true);
    try {
      const name = `Table ${nextFreeNumber(tables.map(tableNameOf))}`;
      const res = await fetch("/api/floor-plan-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // What you draw is the whole table, chairs included: the seats sit
          // just inside your outline and the tabletop inside them.
          tables: [
            {
              name,
              x: b.x,
              y: b.y,
              w: b.w * DRAWN_TOP,
              h: b.h * DRAWN_TOP,
              shape: drawShape,
              seats: drawSeats,
            },
          ],
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setDrawnIds((prev) => [...prev, ...(json.createdIds ?? [])]);
      await onTablesChanged();
      await loadPositions();
      toast.success(`${name} added with ${drawSeats} seats`);
    } catch (e) {
      toast.error("Could not add the table", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setDrawBusy(false);
    }
  };

  // Click on a table in the picture: its outline, shape, chairs and number are
  // read from the picture and the table is added there.
  const addClickedTable = async (x: number, y: number) => {
    if (!picture) {
      toast.message("Upload a floor plan picture first, or drag to draw the table.");
      return;
    }
    const hit = tables.find((t) => {
      const p = positions[tableIdOf(t)];
      if (!p) return false;
      const half = tableBox(t).width * 0.35;
      return Math.abs(p.x - x) < half && Math.abs(p.y - y) < half * aspect;
    });
    if (hit) {
      toast.message(`${tableNameOf(hit)} is already there.`);
      return;
    }
    setDrawBusy(true);
    try {
      const found = await shapeAtPoint(picture, x, y);
      if (!found) {
        toast.error("No table found there. Click inside a table, or drag to draw it.");
        return;
      }
      const taken = new Set(tables.map((t) => tableNameOf(t).trim().toLowerCase()));
      let name = "";
      try {
        const [read] = await readTextInShapes(found.canvas, [found.shape]);
        name = nameFromText(read?.text ?? "");
      } catch {
        name = "";
      }
      if (!name || taken.has(name.toLowerCase())) {
        name = `Table ${nextFreeNumber(tables.map(tableNameOf))}`;
      }
      // every new table gets the preset number of seats (Seats per table)
      const seats = drawSeats;
      const res = await fetch("/api/floor-plan-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tables: [
            {
              name,
              x: found.shape.x,
              y: found.shape.y,
              w: found.shape.w,
              h: found.shape.h,
              shape: found.shape.shape,
              seats,
            },
          ],
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setDrawnIds((prev) => [...prev, ...(json.createdIds ?? [])]);
      await onTablesChanged();
      await loadPositions();
      toast.success(`${name} added: ${found.shape.shape}, ${seats} seats`);
    } catch (e) {
      toast.error("Could not add the table", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setDrawBusy(false);
    }
  };

  const undoLastDrawn = async () => {
    const id = drawnIds[drawnIds.length - 1];
    if (!id) return;
    setDrawBusy(true);
    try {
      const res = await fetch("/api/delete-table", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setDrawnIds((prev) => prev.slice(0, -1));
      await onTablesChanged();
      await loadPositions();
      toast.success("Last table removed");
    } catch (e) {
      toast.error("Could not remove the table", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setDrawBusy(false);
    }
  };

  const finishDrawing = async () => {
    setDrawing(false);
    setDrawBox(null);
    if (drawnIds.length && picture) {
      setSaving(true);
      await writeNamesOnPicture(currentStamps(saved));
      setSaving(false);
    }
    setDrawnIds([]);
  };

  // ---------- dragging (tables and review shapes) ----------
  const pointToPercent = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  const onPointerDown =
    (id: string, cur: Pos) => (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const p = pointToPercent(e.clientX, e.clientY);
      dragging.current = { id, dx: cur.x - p.x, dy: cur.y - p.y };
    };

  const onResizeDown =
    (id: string, cx: number, startW: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const p = pointToPercent(e.clientX, e.clientY);
      resizing.current = { id, cx, startW, startX: p.x };
    };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = resizing.current;
    if (r && editing) {
      const p = pointToPercent(e.clientX, e.clientY);
      // the table grows on both sides, so twice the mouse movement
      const w = Math.min(60, Math.max(2, r.startW + (p.x - r.startX) * 2));
      setDraftWidths((prev) => ({ ...prev, [r.id]: w }));
      return;
    }
    const d = dragging.current;
    if (!d) return;
    const p = pointToPercent(e.clientX, e.clientY);
    const x = Math.min(100, Math.max(0, p.x + d.dx));
    const y = Math.min(100, Math.max(0, p.y + d.dy));
    if (reviewing) updateItem(d.id, { x, y });
    else if (editing) setDraft((prev) => ({ ...(prev ?? {}), [d.id]: { x, y } }));
  };

  const onPointerUp = () => {
    resizing.current = null;
    dragging.current = null;
  };

  const pickedCount = review?.filter((r) => r.picked).length ?? 0;

  // How much room the floor plan has on this screen (any monitor size)
  const roomColRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = roomColRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      // instructions above the room take some height while editing
      const note = working ? 44 : roomOnly ? 78 : 22; // instructions, or the totals heading + arrival bar
      // leave room for the footer (logo) at the bottom, except in full screen
      const footer = !roomOnly && window.innerWidth >= 1024 ? document.querySelector("footer") : null;
      const footerH = footer ? footer.getBoundingClientRect().height : 0;
      const h = Math.max(240, window.innerHeight - Math.max(0, r.top) - note - footerH - 12);
      setAvail({ w: r.width, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [working, roomOnly]);

  // ---------- Arrivals ----------
  // Everyone who has arrived (QR scan or ticked by hand), from the seats
  const arrivedNow = useMemo(
    () =>
      tables.flatMap((t) =>
        t.seats
          .filter((s) => s.isBooked && s.isReceived)
          .map((s) => ({
            seatId: s.id,
            name: `${s.user?.firstname ?? ""} ${s.user?.lastname ?? ""}`.trim() || "Guest",
            table: tableNameOf(t),
            tableId: tableIdOf(t),
            vip: !!s.user?.vip,
          }))
      ),
    [tables]
  );
  type Arrival = (typeof arrivedNow)[number] & { at?: number };
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  // tables whose number is flashing right now (a guest just arrived there)
  const [flashing, setFlashing] = useState<Record<string, number>>({});
  // The open event's name ("Welcome to ..." in full screen)
  const [eventName, setEventName] = useState("");
  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((j) => j.success && setEventName(j.events.find((e: { id: string }) => e.id === j.activeId)?.name ?? ""))
      .catch(() => undefined);
  }, []);
  // VIPs who just arrived (banner at the top of the room)
  const [vipBanners, setVipBanners] = useState<{ seatId: string; name: string; table: string }[]>([]);
  // A soft chime when someone arrives (can be turned off; remembered)
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => {
    if (readStored("floorPlanSound") === "off") setSoundOn(false);
  }, []);
  const soundOnRef = useRef(true);
  soundOnRef.current = soundOn;
  const audioRef = useRef<AudioContext | null>(null);
  const chime = (vip: boolean) => {
    if (!soundOnRef.current) return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = audioRef.current ?? (audioRef.current = new Ctx());
      if (ctx.state === "suspended") ctx.resume();
      const notes = vip ? [659, 784, 988, 1319] : [784, 1047];
      notes.forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = f;
        const t0 = ctx.currentTime + i * 0.16;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
        o.connect(g).connect(ctx.destination);
        o.start(t0);
        o.stop(t0 + 0.65);
      });
    } catch {
      /* no sound on this device */
    }
  };
  const toggleSound = () =>
    setSoundOn((v) => {
      writeStored("floorPlanSound", v ? "off" : "on");
      return !v;
    });
  const [popups, setPopups] = useState<(Arrival & { phase: "pop" | "fly" })[]>([]);
  const knownArrivals = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(arrivedNow.map((a) => a.seatId));
    if (knownArrivals.current === null) {
      // First load: list who is already here, no pop-ups
      if (!tables.length) return;
      knownArrivals.current = ids;
      setArrivals([...arrivedNow].sort((a, b) => a.name.localeCompare(b.name)));
      return;
    }
    const known = knownArrivals.current;
    const fresh = arrivedNow.filter((a) => !known.has(a.seatId));
    // Unticked by mistake: take them off the list
    setArrivals((prev) => prev.filter((a) => ids.has(a.seatId)));
    knownArrivals.current = ids;
    fresh.forEach((a, i) => {
      const item = { ...a, at: Date.now() };
      setTimeout(() => chime(a.vip), i * 700);
      if (a.vip) {
        setVipBanners((v) => [...v, { seatId: a.seatId, name: a.name, table: a.table }]);
        setTimeout(() => setVipBanners((v) => v.filter((x) => x.seatId !== a.seatId)), 12000);
      }
      // the table number starts flashing 1 second before the name card
      // leaves, and keeps flashing for 5 seconds
      setTimeout(() => {
        setFlashing((f) => ({ ...f, [a.tableId]: (f[a.tableId] ?? 0) + 1 }));
        setTimeout(
          () =>
            setFlashing((f) => {
              const n = (f[a.tableId] ?? 1) - 1;
              const next = { ...f };
              if (n <= 0) delete next[a.tableId];
              else next[a.tableId] = n;
              return next;
            }),
          5000
        );
      }, i * 700 + 1600);
      // pop out at the table, then fly to the Arrived list
      setTimeout(() => setPopups((p) => [...p, { ...item, phase: "pop" }]), i * 700);
      setTimeout(
        () => setPopups((p) => p.map((x) => (x.seatId === a.seatId ? { ...x, phase: "fly" } : x))),
        i * 700 + 2600
      );
      setTimeout(() => {
        setPopups((p) => p.filter((x) => x.seatId !== a.seatId));
        setArrivals((prev) => [item, ...prev.filter((x) => x.seatId !== a.seatId)]);
      }, i * 700 + 3300);
    });
  }, [arrivedNow, tables.length]);

  // The part of the room to show: everything while editing, otherwise just
  // around the tables (with a little margin), in % of the room
  const view = (() => {
    const whole = { x: 0, y: 0, w: 100, h: 100, aspect };
    // With the picture on, always show the whole picture (stage, dance floor...)
    // With the picture on, the whole picture is always shown (never cut off),
    // as big as the screen allows
    if (working || !tables.length || (picture && showPicture)) return whole;
    let x0 = 100, y0 = 100, x1 = 0, y1 = 0;
    for (const t of tables) {
      const p = positions[tableIdOf(t)];
      if (!p) continue;
      const box = tableBox(t);
      const halfW = box.width / 2;
      const halfH = (box.width / box.ratio / 2) * aspect;
      x0 = Math.min(x0, p.x - halfW);
      x1 = Math.max(x1, p.x + halfW);
      y0 = Math.min(y0, p.y - halfH);
      y1 = Math.max(y1, p.y + halfH);
    }
    if (x1 <= x0 || y1 <= y0) return whole;
    const m = roomOnly ? 3 : 2;
    x0 = Math.max(0, x0 - m);
    y0 = Math.max(0, y0 - m * aspect);
    x1 = Math.min(100, x1 + m);
    y1 = Math.min(100, y1 + m * aspect);
    const w = x1 - x0;
    const h = y1 - y0;
    return { x: x0, y: y0, w, h, aspect: (w / h) * aspect };
  })();

  // Stretch that view to the exact shape of the space on screen, so the room
  // fills it with no empty bands, on any monitor
  const fitted = (() => {
    if (!avail || avail.w < 50) return null;
    const target = avail.w / avail.h;
    let { x, y, w, h } = view;
    const current = (w / h) * aspect;
    if (current < target) {
      const nw = (h * target) / aspect;
      x -= (nw - w) / 2;
      w = nw;
    } else {
      const nh = (w * aspect) / target;
      y -= (nh - h) / 2;
      h = nh;
    }
    return { x, y, w, h, width: avail.w, height: avail.h };
  })();
  const show = fitted ?? { ...view, width: undefined, height: undefined };

  // One number size for every table (based on the typical table size), so a
  // smaller table does not get a smaller number
  const tableNumPx = (() => {
    if (!avail || !tables.length) return undefined;
    const roomPx = (avail.w * 100) / show.w;
    const widths = tables.map((t) => tableBox(t).width).sort((a, b) => a - b);
    const typical = widths[Math.floor(widths.length / 2)];
    return Math.round(Math.min(72, Math.max(11, ((typical * roomPx) / 100) * 0.42)));
  })();

  // The Arrived list. On smaller screens (phones) it goes under the Guest
  // Names list instead of next to the room.
  const arrivedList = (cls: string, mobile = false) => (
        <div className={`${cls} rounded-lg border border-green-200 bg-green-50/60 overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 px-2 py-0.5 border-b border-green-200 bg-green-100/70">
            <span className="font-semibold text-green-900">Arrived</span>
            <span className="text-sm font-bold text-green-800 tabular-nums">{arrivals.length}</span>
          </div>
          <div className={`${mobile ? "max-h-72" : "max-h-40 lg:max-h-[calc(100vh-6rem)]"} overflow-y-auto`}>
            {/* A table so the table names line up a few spaces after the longest name */}
            <table className="text-sm border-collapse">
              <tbody>
                <AnimatePresence initial={false}>
                  {[...arrivals]
                    .sort((a, b) => {
                      // by table (Table 2 before Table 10), then by name
                      const t = a.table.localeCompare(b.table, undefined, { numeric: true, sensitivity: "base" });
                      return t !== 0 ? t : a.name.localeCompare(b.name);
                    })
                    .map((a) => (
                      <motion.tr
                        key={a.seatId}
                        initial={{ opacity: 0, backgroundColor: "rgba(134,239,172,0.9)" }}
                        animate={{ opacity: 1, backgroundColor: "rgba(255,255,255,0)" }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.6, backgroundColor: { duration: 2.5 } }}
                        className="border-b border-green-100 last:border-b-0"
                      >
                        <td className="pl-2 pr-6 py-0.5 font-medium text-zinc-900 whitespace-nowrap">{a.name}</td>
                        <td className="pr-2 py-0.5 text-xs font-semibold text-green-800 whitespace-nowrap">{a.table}</td>
                      </motion.tr>
                    ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
  );
  const [arrivedSlot, setArrivedSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setArrivedSlot(roomOnly ? null : document.getElementById("arrived-under-guests"));
  }, [roomOnly]);
  const showArrived = arrivals.length > 0 && !working;

  return (
    <>
    <style>{`
      @keyframes tableArriveRing { 0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,.0); border-color: rgba(34,197,94,.4) }
        50% { box-shadow: 0 0 0 10px rgba(34,197,94,.45), 0 0 28px 8px rgba(34,197,94,.6); border-color: rgb(22,163,74) } }
      .table-arrive-ring { border: 4px solid rgb(22,163,74); animation: tableArriveRing .7s ease-in-out 7; }
      @keyframes tableArriveNum { 0%,100% { opacity: 1; transform: translate(-50%,-50%) scale(1) }
        50% { opacity: .35; transform: translate(-50%,-50%) scale(1.35) } }
      .table-arrive-num { animation: tableArriveNum .7s ease-in-out 7; }
      @keyframes welcomeShine { 0% { background-position: 0% 50% } 100% { background-position: 200% 50% } }
      .welcome-title { background-size: 200% auto; animation: welcomeShine 4s linear infinite; }
      .table-complete-ring { border: 4px solid #f59e0b; background: rgba(251,191,36,.18);
        box-shadow: 0 0 14px 4px rgba(245,158,11,.55); }
    `}</style>
    <div
      className={`px-2 sm:px-3 flex flex-col lg:flex-row gap-3 ${
        roomOnly ? "py-2" : "py-3 pb-[9rem] sm:pb-3"
      }`}
    >
      {/* Floor plan controls: a column down the left side on bigger screens */}
      {/* Full screen ("Hide menu"): a slim column of icons on the right */}
      {roomOnly && !working ? (
        <div
          // Full screen: nothing shows on the left, so the room gets the whole
          // width. Move the mouse to the left edge (or tap it) for the buttons.
          className={`fixed left-0 top-0 h-full z-[60] flex flex-col gap-2 items-center ${
            railOpen ? "w-24 bg-white/95 shadow-xl border-r pt-2" : "w-3"
          }`}
          onMouseEnter={() => setRailOpen(true)}
          onMouseLeave={() => setRailOpen(false)}
          onClick={() => !railOpen && setRailOpen(true)}
        >
          {railOpen && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/logo.svg" alt="Seating4U" className="w-20 h-auto mb-1 select-none" draggable={false} />
          )}
          {railOpen && (<>
          <Button size="icon" variant="outline" onClick={() => onRoomOnlyChange?.(false)} title="Show the full menu" aria-label="Show the full menu">
            <PanelRightOpen className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={() => {
              setDrawnIds([]);
              setDrawing(true);
            }}
            title="Draw tables"
            aria-label="Draw tables"
          >
            <PenLine className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={startEditing} title="Move tables" aria-label="Move tables">
            <Move className="w-4 h-4" />
          </Button>
          {onGuestNamesChange && (
            <Button
              size="icon"
              variant={guestNames ? "default" : "outline"}
              onClick={() => onGuestNamesChange(!guestNames)}
              title={guestNames ? "Hide guest names" : "Show guest names"}
              aria-label="Guest names"
              aria-pressed={guestNames}
            >
              <Users className="w-4 h-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant={showSeats ? "default" : "outline"}
            onClick={() =>
              setShowSeats((v) => {
                writeStored(SEATS_KEY, v ? "off" : "on");
                return !v;
              })
            }
            title={showSeats ? "Hide seats" : "Show seats"}
            aria-label="Seats"
            aria-pressed={showSeats}
          >
            <Armchair className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant={hoverZoom ? "default" : "outline"}
            onClick={toggleHoverZoom}
            title={hoverZoom ? "Turn off zoom on hover" : "Turn on zoom on hover"}
            aria-label="Zoom on hover"
            aria-pressed={hoverZoom}
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant={soundOn ? "default" : "outline"}
            onClick={toggleSound}
            title={soundOn ? "Turn off the arrival sound" : "Turn on the arrival sound"}
            aria-label="Arrival sound"
            aria-pressed={soundOn}
          >
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </Button>
          {picture && (
            <Button
              size="icon"
              variant={showPicture ? "default" : "outline"}
              onClick={() =>
                setShowPicture((v) => {
                  writeStored(PICTURE_KEY, v ? "off" : "on");
                  return !v;
                })
              }
              title={showPicture ? "Hide picture" : "Show picture"}
              aria-label="Picture"
              aria-pressed={showPicture}
            >
              <ImageIcon className="w-4 h-4" />
            </Button>
          )}
          </>)}
        </div>
      ) : (
      <div
        className="flex flex-wrap items-center gap-2 lg:flex-col lg:flex-nowrap lg:items-stretch lg:w-52 lg:shrink-0 lg:sticky lg:top-2 lg:self-start lg:max-h-[calc(100vh-1rem)] lg:overflow-y-auto [&>button]:lg:justify-start [&>label]:lg:justify-between [&>span]:lg:mt-2"
      >
        {!working && (
          <Button
            size="sm"
            variant="ghost"
            // hiding the menu also hides the rest of the dashboard
            onClick={() => onRoomOnlyChange?.(true)}
            title="Hide this menu and everything else, so the room is as big as possible"
          >
            <PanelLeftClose className="w-4 h-4 mr-2" /> Hide menu
          </Button>
        )}
        {drawing ? (
          <>
            <Button onClick={finishDrawing} size="sm" disabled={drawBusy || saving}>
              <Save className="w-4 h-4 mr-2" /> Done drawing
            </Button>
            <Button
              onClick={undoLastDrawn}
              size="sm"
              variant="outline"
              disabled={drawBusy || drawnIds.length === 0}
              title="Remove the last table you drew"
            >
              <Undo2 className="w-4 h-4 mr-2" /> Undo last
            </Button>
            <span className="text-sm text-zinc-600 ml-1">1. Shape:</span>
            {SHAPES.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={drawShape === s ? "default" : "outline"}
                onClick={() => setDrawShape(s)}
                aria-pressed={drawShape === s}
              >
                <ShapeIcon shape={s} className="w-4 h-4 mr-1" /> {s[0].toUpperCase() + s.slice(1)}
              </Button>
            ))}
            <label className="flex items-center gap-2 text-sm text-zinc-600 ml-1" htmlFor="draw-seats">
              2. Seats:
              <input
                id="draw-seats"
                type="number"
                min={1}
                max={40}
                value={drawSeats}
                onChange={(e) => setDrawSeats(Math.min(40, Math.max(1, Number(e.target.value) || 1)))}
                className="w-16 border rounded px-2 py-1"
              />
            </label>
            <span className="text-sm text-zinc-600 ml-1">3. Click a table on the picture to add it (or drag to draw one).</span>
          </>
        ) : reviewing ? (
          <>
            <Button onClick={applyReview} size="sm" disabled={saving || !!reviewBusy}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Saving..." : `Use these ${pickedCount} tables`}
            </Button>
            <Button onClick={() => setReview(null)} size="sm" variant="outline" disabled={saving}>
              <X className="w-4 h-4 mr-2" /> Cancel
            </Button>
            <span className="text-sm text-zinc-600 ml-1">Add a missing table:</span>
            {SHAPES.map((s) => (
              <Button key={s} size="sm" variant="outline" onClick={() => addReviewTable(s)} title={`Add a ${s} table`}>
                <ShapeIcon shape={s} className="w-4 h-4 mr-1" /> {s[0].toUpperCase() + s.slice(1)}
              </Button>
            ))}
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              Seats for new tables
              <input
                type="number"
                min={1}
                max={20}
                value={seatsPerTable}
                onChange={(e) => setSeatsPerTable(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                className="w-16 border rounded px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <input
                type="checkbox"
                checked={replaceOld}
                onChange={(e) => setReplaceOld(e.target.checked)}
              />
              Remove old tables not in this picture
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <input
                type="checkbox"
                checked={writeNames}
                onChange={(e) => setWriteNames(e.target.checked)}
              />
              Write table names on the picture
            </label>
          </>
        ) : !editing ? (
          <>
            <Button
              onClick={() => {
                setDrawnIds([]);
                setDrawing(true);
              }}
              size="sm"
            >
              <PenLine className="w-4 h-4 mr-2" /> Draw tables
            </Button>
            <Button onClick={startEditing} size="sm" variant="outline">
              <Move className="w-4 h-4 mr-2" /> Move tables
            </Button>
            {picture && (
              <Button
                onClick={() => setSettingEntrance((v) => !v)}
                size="sm"
                variant={settingEntrance ? "default" : "outline"}
                title="Click the door(s) on the floor plan. Guests' phones show a line from there to their table."
              >
                <DoorOpen className="w-4 h-4 mr-2" />
                {settingEntrance ? "Done with entrance" : entrances.length ? "Entrance ✓" : "Set entrance"}
              </Button>
            )}
            {picture && tables.length > 0 && (
              <Button
                onClick={async () => {
                  setSaving(true);
                  await writeNamesOnPicture(currentStamps(positions));
                  setSaving(false);
                }}
                size="sm"
                variant="outline"
                disabled={saving}
                title="Write each table's current name onto the floor plan picture"
              >
                <Type className="w-4 h-4 mr-2" /> Write names on picture
              </Button>
            )}
            <div className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-sm text-zinc-700">
              <label htmlFor="seats-per-table">Seats per table</label>
              <input
                id="seats-per-table"
                type="number"
                min={1}
                max={40}
                value={drawSeats}
                onChange={(e) => setDrawSeats(Math.min(40, Math.max(1, Number(e.target.value) || 1)))}
                className="w-14 border rounded px-2 py-0.5"
              />
              {tables.length > 0 && (
                <Button size="sm" variant="outline" onClick={setAllSeats} disabled={settingSeats} title="Give every table this many seats">
                  {settingSeats ? "Setting..." : "Set all tables"}
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <Button onClick={saveLayout} size="sm" disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Saving..." : "Save layout"}
            </Button>
            <Button onClick={cancelEditing} size="sm" variant="outline" disabled={saving}>
              <X className="w-4 h-4 mr-2" /> Cancel
            </Button>
            <Button onClick={lineUpAll} size="sm" variant="outline" disabled={saving}>
              <LayoutGrid className="w-4 h-4 mr-2" /> Line up all
            </Button>
            <span className="text-sm text-zinc-600 ml-1">Add table:</span>
            {SHAPES.map((s) => (
              <Button key={s} size="sm" variant="outline" disabled={saving} onClick={() => addTable(s)} title={`Add a ${s} table`}>
                <ShapeIcon shape={s} className="w-4 h-4" />
              </Button>
            ))}
          </>
        )}

        <label className="flex items-center gap-2 text-sm text-zinc-600 ml-auto lg:ml-0 lg:mt-2 lg:flex-col lg:items-stretch">
          Table size
          <input
            type="range"
            min={6}
            max={30}
            value={tableSize}
            onChange={(e) => changeTableSize(Number(e.target.value))}
          />
        </label>

        {!working && onGuestNamesChange && (
          <Button
            size="sm"
            variant={guestNames ? "default" : "outline"}
            onClick={() => onGuestNamesChange(!guestNames)}
            title="Show the names of seated guests next to their seats"
          >
            {guestNames ? "Hide guest names" : "Guest names"}
          </Button>
        )}

        {!reviewing && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShowSeats((s) => {
                writeStored(SEATS_KEY, s ? "off" : "on");
                return !s;
              });
            }}
            title="Show or hide the numbered seats around each table"
          >
            {showSeats ? "Hide seats" : "Show seats"}
          </Button>
        )}

        {!reviewing && !drawing && !editing && (
          <Button
            size="sm"
            variant={hoverZoom ? "default" : "outline"}
            onClick={toggleHoverZoom}
            title="Point at a table to see it big, with its guests and who has arrived"
          >
            <ZoomIn className="w-4 h-4 mr-1" />
            {hoverZoom ? "Zoom on hover: On" : "Zoom on hover: Off"}
          </Button>
        )}
        {!reviewing && !drawing && !editing && (
          <Button size="sm" variant={soundOn ? "default" : "outline"} onClick={toggleSound} title="A soft chime when a guest arrives">
            {soundOn ? <Volume2 className="w-4 h-4 mr-1" /> : <VolumeX className="w-4 h-4 mr-1" />}
            {soundOn ? "Arrival sound: On" : "Arrival sound: Off"}
          </Button>
        )}

        {picture && !reviewing && !drawing && !editing && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShowPicture((s) => {
                writeStored(PICTURE_KEY, s ? "off" : "on");
                return !s;
              });
            }}
          >
            <ImageIcon className="w-4 h-4 mr-2" />
            {showPicture ? "Hide picture" : "Show picture"}
          </Button>
        )}
      </div>

      )}

      {/* Arrived guests (left of the room on big screens) */}
      {showArrived &&
        arrivedList(
          `w-fit lg:shrink-0 lg:self-start lg:sticky lg:top-2 ${arrivedSlot ? "hidden xl:block" : ""}`
        )}
      {showArrived && arrivedSlot && createPortal(arrivedList("w-full xl:hidden mt-3", true), arrivedSlot)}

      {/* The room, with any instructions above it */}
      <div className="flex-1 min-w-0" ref={roomColRef}>
      {settingEntrance && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded bg-green-50 px-3 py-2 text-sm text-green-900">
          <DoorOpen className="h-4 w-4" />
          <span className="flex-1">
            Click the <b>door</b> on the floor plan where guests come in (up to 6 doors). Click a green pin to remove
            it. Guests&apos; phones will show a line from the nearest door to their table.
          </span>
          {entrances.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => saveEntrances([])}>
              Clear all
            </Button>
          )}
          <Button size="sm" onClick={() => setSettingEntrance(false)}>
            Done
          </Button>
        </div>
      )}
      {(editing || reviewing || drawing) && (
        <p className="text-sm text-blue-800 bg-blue-50 rounded px-3 py-2 mb-3">
          {drawing
            ? drawBusy
              ? "Finding the table..."
              : `Easy way: click inside any table on the picture. Its shape, chairs and number are copied and it is added there. Or draw ${drawShape} tables with ${drawSeats} seats yourself: Draw around the whole table, chairs included: press on the picture, drag, and let go. The seats go just inside your outline. Draw as many as you need, then click Done drawing. To rename a table or add a note, click Done drawing, then hover the table.`
            : reviewing
            ? reviewBusy ??
              "Blue = will be a table. Click a grey shape to make it a table, click × to remove one. Type in the box to rename a table. Click the shape icon to switch round / square / rectangle. Drag a table to move it."
            : "Drag each table to its spot. Drag the blue dot at a table's corner to make it bigger or smaller. Click a table's Shape button to switch round / square / rectangle. Then click Save layout. To rename a table, save first, then hover it and click the gear."}
          {reviewBusy && <Loader2 className="inline w-4 h-4 ml-2 animate-spin" />}
        </p>
      )}

      {/* Totals, shown in full screen where the top bar is hidden */}
      {roomOnly && !working && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2 pointer-events-none">
          {eventName && (
            <div className="mr-3 leading-tight">
              <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-600">Welcome to</div>
              <div className="welcome-title bg-gradient-to-r from-emerald-600 via-lime-500 to-emerald-600 bg-clip-text text-2xl font-extrabold text-transparent">
                {eventName}
              </div>
            </div>
          )}
          {[
            { label: "Seats", value: tables.reduce((n, t) => n + t.seats.length, 0), c: "bg-zinc-50 border-zinc-200 text-zinc-500", v: "text-zinc-800" },
            ...(invited !== undefined
              ? [{ label: "Invited", value: invited, c: "bg-cyan-50 border-cyan-200 text-cyan-600", v: "text-cyan-800" }]
              : []),
            { label: "Assigned", value: tables.reduce((n, t) => n + t.seats.filter((s) => s.isBooked).length, 0), c: "bg-red-50 border-red-200 text-red-600", v: "text-red-800" },
            { label: "Available", value: tables.reduce((n, t) => n + t.seats.filter((s) => !s.isBooked).length, 0), c: "bg-green-50 border-green-200 text-green-600", v: "text-green-800" },
            { label: "Arrived", value: tables.reduce((n, t) => n + t.seats.filter((s) => s.isBooked && s.isReceived).length, 0), c: "bg-blue-50 border-blue-200 text-blue-600", v: "text-blue-800" },
          ].map((b) => (
            <div key={b.label} className={`rounded-md border px-2 py-0.5 text-center shadow-sm ${b.c}`}>
              <div className="text-[10px] leading-tight uppercase tracking-wider">{b.label}</div>
              <div className={`text-sm leading-tight font-bold tabular-nums ${b.v}`}>{b.value}</div>
            </div>
          ))}
        </div>
      )}
      {/* Live arrival bar: fills up as guests arrive */}
      {!working && (() => {
        const assigned = tables.reduce((n, t) => n + t.seats.filter((s) => s.isBooked).length, 0);
        const came = tables.reduce((n, t) => n + t.seats.filter((s) => s.isBooked && s.isReceived).length, 0);
        if (!assigned) return null;
        const pct = Math.round((came / assigned) * 100);
        return (
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-600">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-zinc-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="whitespace-nowrap tabular-nums">
              {came} of {assigned} arrived ({pct}%)
            </span>
          </div>
        );
      })()}
      {/* The room. Outside of editing, the view zooms in on the tables so
          they are as big as possible; editing always shows the whole room. */}
      <div
        className={`relative w-full bg-white border rounded-lg overflow-hidden ${
          editing || reviewing || drawing ? "border-blue-400 border-2" : "border-zinc-200"
        }`}
        style={
          show.width
            ? // width follows the column (a fixed pixel width made the
              // scroll area grow and pushed half the room off screen)
              { width: "100%", height: show.height }
            : {
                aspectRatio: String(view.aspect),
                // Never taller than the window
                maxWidth: `min(100%, calc((100vh - ${roomOnly ? 4.5 : 7}rem) * ${view.aspect}))`,
                marginInline: "auto",
              }
        }
      >
      {/* VIP just arrived */}
      {vipBanners.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[70] flex -translate-x-1/2 flex-col items-center gap-2">
          {vipBanners.map((v) => (
            <div
              key={v.seatId}
              className="animate-bounce rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-400 to-yellow-300 px-6 py-3 text-center text-amber-950 shadow-2xl"
            >
              <div className="text-xs font-bold uppercase tracking-widest">⭐ VIP arrived</div>
              <div className="text-xl font-extrabold sm:text-2xl">{v.name}</div>
              <div className="text-sm font-semibold">{v.table}</div>
            </div>
          ))}
        </div>
      )}
      <div
        ref={canvasRef}
        className="absolute"
        style={{
          width: `${10000 / show.w}%`,
          aspectRatio: String(aspect),
          ...(tableNumPx ? ({ "--table-num": `${tableNumPx}px` } as React.CSSProperties) : {}),
          left: `${(-show.x / show.w) * 100}%`,
          top: `${(-show.y / show.h) * 100}%`,
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {picture && (showPicture || reviewing || drawing || editing || settingEntrance) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={picture}
            alt="Floor plan"
            className={`absolute inset-0 w-full h-full object-fill pointer-events-none select-none ${
              reviewing || drawing || editing ? "opacity-90" : "opacity-80"
            }`}
            draggable={false}
          />
        )}

        {/* Checking the picture */}
        {reviewing &&
          review!.map((it) => (
            <div
              key={it.key}
              className="absolute"
              style={{
                left: `${it.x}%`,
                top: `${it.y}%`,
                width: `${it.w}%`,
                height: `${it.h}%`,
                transform: "translate(-50%, -50%)",
                zIndex: it.picked ? 20 : 10,
              }}
            >
              <div
                className={`w-full h-full border-2 ${
                  it.shape === "round" ? "rounded-full" : "rounded-sm"
                } ${
                  it.picked
                    ? "border-blue-600 bg-blue-500/25 cursor-grab active:cursor-grabbing touch-none"
                    : "border-dashed border-zinc-400 bg-zinc-200/30 hover:bg-zinc-300/50 cursor-pointer"
                }`}
                onPointerDown={it.picked ? onPointerDown(it.key, it) : undefined}
                onClick={it.picked ? undefined : () => pickItem(it.key, true)}
                title={it.picked ? "Drag to move" : "Click to make this a table"}
              />
              {it.picked && (
                <>
                  <button
                    type="button"
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white text-xs leading-5 shadow"
                    onClick={() => pickItem(it.key, false)}
                    title="Not a table"
                  >
                    ×
                  </button>
                  <div className="absolute left-1/2 top-full -translate-x-1/2 mt-1 flex items-center gap-1 bg-white rounded shadow px-1 py-0.5">
                    <button
                      type="button"
                      className="p-0.5 text-zinc-600 hover:text-blue-700"
                      title="Change shape"
                      onClick={() =>
                        updateItem(it.key, {
                          shape: SHAPES[(SHAPES.indexOf(it.shape) + 1) % SHAPES.length],
                        })
                      }
                    >
                      <ShapeIcon shape={it.shape} className="w-3.5 h-3.5" />
                    </button>
                    <input
                      value={it.name}
                      onChange={(e) => updateItem(it.key, { name: e.target.value })}
                      className="w-24 text-xs border rounded px-1 py-0.5"
                      aria-label="Table name"
                    />
                  </div>
                </>
              )}
            </div>
          ))}

        {/* A guest just arrived: their name pops out of their table, then
            flies off to the Arrived list on the left */}
        <AnimatePresence>
          {popups.map((p) => {
            const pos = positions[p.tableId];
            if (!pos) return null;
            // The name card sits just ABOVE the table (or below it near the
            // top edge) so the table's flashing number stays visible
            const t = tables.find((x) => tableIdOf(x) === p.tableId);
            const box = t ? tableBox(t) : { width: 8, ratio: 1 };
            const halfH = (box.width / box.ratio / 2) * aspect;
            const above = pos.y - halfH > 14;
            const anchorY = above ? pos.y - halfH * 1.05 : pos.y + halfH * 1.05;
            return (
              <motion.div
                key={p.seatId}
                className="absolute z-[60] pointer-events-none"
                initial={{ left: `${pos.x}%`, top: `${anchorY}%`, opacity: 0, scale: 0.3 }}
                animate={
                  p.phase === "pop"
                    ? { left: `${pos.x}%`, top: `${anchorY}%`, opacity: 1, scale: [0.3, 1.15, 1] }
                    : { left: "-12%", top: `${Math.max(5, pos.y - 20)}%`, opacity: 0, scale: 0.5 }
                }
                exit={{ opacity: 0 }}
                transition={p.phase === "pop" ? { duration: 0.6 } : { duration: 0.7, ease: "easeIn" }}
              >
                <div
                  className={`-translate-x-1/2 ${above ? "-translate-y-full" : ""} rounded-2xl px-5 py-2.5 text-center whitespace-nowrap shadow-2xl ring-4 ${
                    p.vip
                      ? "bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 text-amber-950 ring-amber-200"
                      : "bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-600 text-white ring-green-200"
                  }`}
                >
                  <div className="text-xs font-semibold uppercase tracking-widest opacity-90">
                    {p.vip ? "⭐ VIP · Welcome" : "🎉 Welcome"}
                  </div>
                  <div className="text-lg sm:text-2xl font-extrabold leading-tight">{p.name}!</div>
                  <div className="text-sm sm:text-base font-semibold opacity-90">{p.table}</div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Entrance pins (shown while setting them); click the room to add one */}
        {settingEntrance && (
          <div
            className="absolute inset-0 z-50 cursor-crosshair"
            onClick={(e) => {
              if (entrances.length >= 6) return toast.message("Up to 6 entrances.");
              const p = pointToPercent(e.clientX, e.clientY);
              saveEntrances([...entrances, { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }]);
            }}
          >
            {entrances.map((pt, i) => (
              <button
                key={i}
                type="button"
                className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-green-600 px-2 py-1 text-xs font-bold text-white shadow-lg ring-4 ring-green-200 hover:bg-red-600"
                style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                title="Remove this entrance"
                onClick={(e) => {
                  e.stopPropagation();
                  saveEntrances(entrances.filter((_, j) => j !== i));
                }}
              >
                <DoorOpen className="h-3.5 w-3.5" /> Entrance
              </button>
            ))}
          </div>
        )}

        {/* Drawing: a layer over everything that catches the mouse */}
        {drawing && (
          <div
            className={`absolute inset-0 z-50 touch-none ${drawBusy ? "cursor-wait" : "cursor-crosshair"}`}
            onPointerDown={onDrawDown}
            onPointerMove={onDrawMove}
            onPointerUp={onDrawUp}
            onPointerCancel={() => {
              drawStart.current = null;
              setDrawBox(null);
            }}
          >
            {drawBox &&
              (() => {
                const b = shapedBox(drawBox);
                return (
                  <div
                    className={`absolute border-2 border-blue-600 bg-blue-500/20 pointer-events-none ${
                      drawShape === "round" ? "rounded-full" : "rounded-sm"
                    }`}
                    style={{
                      left: `${b.x - b.w / 2}%`,
                      top: `${b.y - b.h / 2}%`,
                      width: `${b.w}%`,
                      height: `${b.h}%`,
                    }}
                  >
                    <span className="absolute left-1/2 top-full -translate-x-1/2 mt-1 whitespace-nowrap rounded bg-white px-1.5 py-0.5 text-[11px] text-zinc-700 shadow">
                      {drawSeats} seats
                    </span>
                  </div>
                );
              })()}
          </div>
        )}

        {/* Normal view */}
        {/* Only when there is no picture yet (never written over the picture) */}
        {!reviewing && tables.length === 0 && !picture && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-sm text-center px-4">
            No tables yet. Upload your floor plan with the FLOOR MAP button, then click Draw tables.
          </div>
        )}

        {!reviewing &&
          tables.map((table, index) => {
            const id = tableIdOf(table);
            const pos = positions[id];
            if (!pos) return null;
            const shape = shapeOf(table);
            return (
              <div
                key={id}
                className="absolute"
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  width: `${tableBox(table).width}%`,
                  // the table top is centred at 45% of this box
                  transform: "translate(-45%, -45%)",
                  zIndex: dragging.current?.id === id ? 30 : 10,
                }}
                onMouseEnter={hoverZoom && !working ? () => zoomOpenSoon(id) : undefined}
                onMouseLeave={hoverZoom && !working ? zoomCloseSoon : undefined}
              >
                {renderTable(withShape(table), index, !showSeats && !guestNames)}
                {(() => {
                  // everyone at this table has arrived: gold glow + check
                  const booked = table.seats.filter((x) => x.isBooked);
                  if (!booked.length || booked.some((x) => !x.isReceived) || working) return null;
                  return (
                    <div className="pointer-events-none absolute inset-0 z-20">
                      <div
                        className={`absolute table-complete-ring ${shape === "round" ? "rounded-full" : "rounded-lg"}`}
                        style={{ left: "8%", top: "8%", width: "74%", height: "74%" }}
                      />
                      <span
                        className="absolute flex h-[22%] min-h-[14px] aspect-square items-center justify-center rounded-full bg-amber-500 text-white shadow ring-2 ring-white"
                        style={{ left: "72%", top: "6%", fontSize: "clamp(8px, 10cqw, 18px)" }}
                      >
                        ✓
                      </span>
                    </div>
                  );
                })()}
                {flashing[id] && (
                  // A guest just arrived: glowing ring + big flashing number
                  <div className="pointer-events-none absolute inset-0 z-30">
                    <div
                      className={`absolute table-arrive-ring ${shape === "round" ? "rounded-full" : "rounded-lg"}`}
                      style={{ left: "6%", top: "6%", width: "78%", height: "78%" }}
                    />
                    <span
                      className="table-arrive-num absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-green-600 px-2 font-extrabold text-white shadow-lg"
                      style={{ left: "45%", top: "45%", fontSize: "var(--table-num, 20px)" }}
                    >
                      {tableNameOf(table).replace(/^\s*table\s*#?\s*(?=\S)/i, "")}
                    </span>
                  </div>
                )}
                {editing && (
                  <>
                    <div
                      className={`absolute inset-0 ${
                        shape === "round" ? "rounded-full" : "rounded-md"
                      } cursor-grab active:cursor-grabbing bg-blue-500/10 ring-2 ring-blue-400/60 touch-none`}
                      onPointerDown={onPointerDown(id, pos)}
                      title="Drag to move"
                    />
                    <button
                      type="button"
                      className="absolute -bottom-2 -right-2 z-40 w-5 h-5 rounded-full bg-blue-600 border-2 border-white shadow cursor-nwse-resize touch-none"
                      title="Drag to make this table bigger or smaller"
                      aria-label="Resize table"
                      onPointerDown={onResizeDown(id, pos.x, tableBox(table).width)}
                    />
                    <button
                      type="button"
                      className="absolute -top-2 -left-2 z-40 flex items-center gap-1 rounded-full bg-white shadow px-2 py-1 text-[11px] font-medium text-zinc-700 hover:text-blue-700 border border-zinc-200"
                      title="Change shape: round / square / rectangle"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() =>
                        setDraftShapes((prev) => ({
                          ...prev,
                          [id]: SHAPES[(SHAPES.indexOf(shape) + 1) % SHAPES.length],
                        }))
                      }
                    >
                      <ShapeIcon shape={shape} className="w-3.5 h-3.5" />
                      Shape
                    </button>
                  </>
                )}
              </div>
            );
          })}
      </div>

      {/* Zoom on hover: the table big, with its guests */}
      {hoverZoom && !working && zoomId && (() => {
        const index = tables.findIndex((t) => tableIdOf(t) === zoomId);
        const table = tables[index];
        const pos = table && positions[zoomId];
        if (!table || !pos) return null;
        // show the card on the side away from the table, so it stays visible
        const onLeft = (pos.x - show.x) / show.w > 0.5;
        const seats = [...table.seats].sort((a, b) => a.seat - b.seat);
        const booked = seats.filter((s) => s.isBooked);
        const arrived = booked.filter((s) => s.isReceived).length;
        // Shown over the whole screen (not boxed in the floor plan) so the
        // full table and every name fit
        return createPortal(
          <div
            className={`fixed top-1/2 -translate-y-1/2 z-[100] flex flex-col w-[min(52rem,94vw)] max-h-[92vh] rounded-xl border border-zinc-200 bg-white shadow-2xl ${
              onLeft ? "left-3" : "right-3"
            }`}
            onMouseEnter={zoomKeepOpen}
            onMouseLeave={zoomCloseSoon}
          >
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <span className="text-lg font-bold">{tableNameOf(table)}</span>
              <span className="text-xs text-zinc-500 tabular-nums">
                {booked.length}/{seats.length} seated · {arrived} arrived
              </span>
              <button
                type="button"
                className="ml-auto rounded p-1 text-zinc-500 hover:bg-zinc-100"
                onClick={closeZoom}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col-reverse md:flex-row gap-4">
              {/* The whole table, big */}
              {/* room around the table so guest names next to the seats are not cut off */}
              <div className="md:w-1/2 shrink-0 flex items-center justify-center px-24 py-10">
                <div className="relative w-full max-w-[15rem]">
                  {renderTable(withShape(table), index, false)}
                </div>
              </div>
              <div className="md:w-1/2 min-w-0">
              {/* SEAT GUESTS: who sits here (remove with ×), then add more below */}
              {cardMode === "seat" && (
                booked.length === 0 ? (
                  <p className="py-3 text-center text-sm text-zinc-500">No guests at this table yet. Add them below.</p>
                ) : (
                  <ul className="space-y-1">
                    {[...booked]
                      .sort((a, b) =>
                        `${a.user?.lastname ?? ""} ${a.user?.firstname ?? ""}`.localeCompare(
                          `${b.user?.lastname ?? ""} ${b.user?.firstname ?? ""}`
                        )
                      )
                      .map((s) => (
                        <li
                          key={s.id}
                          className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                        >
                          <span className="w-12 text-xs text-zinc-400 tabular-nums">Seat {s.seat}</span>
                          {/* VIP star: the dashboard announces VIPs when they arrive */}
                          <button
                            type="button"
                            onClick={() => s.user && updateGuest(s.user.id, { vip: !s.user.vip })}
                            className={`text-base leading-none ${s.user?.vip ? "text-amber-500" : "text-zinc-300 hover:text-amber-400"}`}
                            title={s.user?.vip ? "VIP (click to remove)" : "Mark as VIP"}
                            aria-label="VIP"
                          >
                            ★
                          </button>
                          <span className="flex-1 font-medium text-zinc-800">
                            {`${s.user?.firstname ?? ""} ${s.user?.lastname ?? ""}`.trim() || "Guest"}
                          </span>
                          {/* meal choice */}
                          <input
                            key={`${s.id}-${s.user?.meal ?? ""}`}
                            defaultValue={s.user?.meal ?? ""}
                            list="meal-options"
                            placeholder="Meal"
                            className="w-20 rounded border border-zinc-200 px-1.5 py-0.5 text-xs"
                            onFocus={() => (zoomPinned.current = true)}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (s.user && v !== (s.user.meal ?? "")) updateGuest(s.user.id, { meal: v || null });
                            }}
                            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                          />
                          <button
                            type="button"
                            onClick={() => removeFromSeat(s.id)}
                            className="rounded p-0.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                            title="Take this guest off the table (they stay in your guest list)"
                            aria-label="Remove from table"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                  </ul>
                )
              )}

              <datalist id="meal-options">
                {["Chicken", "Fish", "Beef", "Veg", "Kids"].map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              {/* meal counts for this table (for the caterer) */}
              {(() => {
                const counts = new Map<string, number>();
                for (const b of booked) {
                  const m = b.user?.meal?.trim();
                  if (m) counts.set(m, (counts.get(m) ?? 0) + 1);
                }
                return counts.size ? (
                  <p className="mt-2 text-xs text-zinc-600">
                    <b>Meals:</b> {[...counts.entries()].map(([m, n]) => `${n} ${m}`).join(" · ")}
                  </p>
                ) : null;
              })()}

              {/* CHECK IN: everyone registered here. Click a name to mark them arrived. */}
              {cardMode === "checkin" && (booked.length === 0 ? (
                <p className="py-3 text-center text-sm text-zinc-500">No guests at this table yet.</p>
              ) : (
                <>
                  <p className="mb-1 text-[11px] text-zinc-500">
                    Tick the box to mark a guest arrived; they then leave this list. Marked by mistake? Search the name and untick it.
                  </p>
                  <div className="relative mb-1.5">
                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                      value={tableQuery}
                      onChange={(e) => setTableQuery(e.target.value)}
                      onFocus={() => (zoomPinned.current = true)}
                      placeholder="Search a guest at this table (arrived too)..."
                      className="w-full rounded-md border px-7 py-1.5 text-sm"
                    />
                  </div>
                  {!tableQuery.trim() && booked.every((s) => s.isReceived) && (
                    <p className="py-2 text-center text-sm text-green-700">Everyone at this table has arrived ✓</p>
                  )}
                  <ul className="space-y-1">
                    {[...booked]
                      // arrived guests are hidden, unless searched for (to undo a mistake)
                      .filter((s) => {
                        const q = tableQuery.trim().toLowerCase();
                        if (!q) return !s.isReceived;
                        return `${s.user?.firstname ?? ""} ${s.user?.lastname ?? ""}`.toLowerCase().includes(q);
                      })
                      .sort((a, b) =>
                        // by last name, then first name
                        `${a.user?.lastname ?? ""} ${a.user?.firstname ?? ""}`.localeCompare(
                          `${b.user?.lastname ?? ""} ${b.user?.firstname ?? ""}`
                        )
                      )
                      .map((s) => {
                        const name = `${s.user?.firstname ?? ""} ${s.user?.lastname ?? ""}`.trim() || "Guest";
                        return (
                          <li key={s.id}>
                            {/* only the box marks arrival; the name itself is not clickable */}
                            <div
                              className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm ${
                                s.isReceived
                                  ? "border-green-300 bg-green-50 text-green-900"
                                  : "border-zinc-200 bg-white text-zinc-800"
                              }`}
                            >
                              <button
                                type="button"
                                disabled={!onToggleArrived}
                                onClick={() => onToggleArrived?.(s.id, !s.isReceived)}
                                aria-label={s.isReceived ? "Undo arrival" : "Mark arrived"}
                                title={s.isReceived ? "Undo arrival" : "Mark arrived"}
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                                  s.isReceived
                                    ? "border-green-600 bg-green-600 text-white"
                                    : "border-zinc-400 hover:border-green-600 hover:bg-green-50"
                                }`}
                              >
                                {s.isReceived && <Check className="h-3.5 w-3.5" />}
                              </button>
                              <span className="flex-1 font-medium">
                                {s.user?.vip && <span className="mr-1 text-amber-500" title="VIP">★</span>}
                                {name}
                              </span>
                              {s.isReceived && (
                                <span className="text-xs font-semibold text-green-700">Arrived · untick to undo</span>
                              )}
                              <span className="text-xs text-zinc-400 tabular-nums">Seat {s.seat}</span>
                            </div>
                          </li>
                        );
                      })}
                  </ul>
                </>
              ))}
              {seats.length > booked.length && (
                <p className="mt-2 text-xs text-zinc-500">
                  {seats.length - booked.length} empty seat{seats.length - booked.length === 1 ? "" : "s"}
                </p>
              )}

              {/* Add several guests to this table at once (Seat guests mode) */}
              {cardMode === "seat" && seats.length > booked.length && (() => {
                const free = seats.length - booked.length;
                const q = addQuery.trim().toLowerCase();
                const unseated = (allGuests ?? []).filter((g) => !g.seat?.length);
                const matches = unseated
                  .filter((g) => !q || `${g.firstname} ${g.lastname}`.toLowerCase().includes(q))
                  .sort((a, b) => `${a.lastname} ${a.firstname}`.localeCompare(`${b.lastname} ${b.firstname}`)) // by last name
                  .slice(0, 50);
                const full = addPicked.length >= free;
                return (
                  <div className="mt-3 rounded-lg border border-zinc-200 p-2">
                    <p className="mb-1 text-sm font-semibold text-zinc-700">Add guests to this table</p>
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                      <input
                        value={addQuery}
                        onChange={(e) => setAddQuery(e.target.value)}
                        onFocus={() => {
                          zoomPinned.current = true;
                          if (!allGuests) loadGuests();
                        }}
                        placeholder={allGuests ? "Type a name..." : "Click to load guests..."}
                        className="w-full rounded-md border px-7 py-1.5 text-sm"
                      />
                    </div>
                    {allGuests && (
                      <div className="mt-1 max-h-48 overflow-y-auto">
                        {matches.length === 0 ? (
                          <p className="py-2 text-center text-xs text-zinc-500">
                            {unseated.length === 0 ? "Every guest already has a seat." : "No unseated guest with that name."}
                          </p>
                        ) : (
                          matches.map((g) => {
                            const on = addPicked.includes(g.id);
                            return (
                              <label
                                key={g.id}
                                className={`flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-zinc-50 ${
                                  !on && full ? "opacity-40" : ""
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={on}
                                  disabled={!on && full}
                                  onChange={() => {
                                    zoomPinned.current = true;
                                    setAddPicked((p) => (on ? p.filter((x) => x !== g.id) : [...p, g.id]));
                                  }}
                                />
                                {g.firstname} {g.lastname}
                              </label>
                            );
                          })
                        )}
                      </div>
                    )}
                    {allGuests && (
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          size="sm"
                          disabled={!addPicked.length || addBusy}
                          onClick={() => seatPicked(tableIdOf(table))}
                        >
                          {addBusy ? "Seating..." : `Seat ${addPicked.length || ""} guest${addPicked.length === 1 ? "" : "s"}`.replace("  ", " ")}
                        </Button>
                        <span className="text-xs text-zinc-500">
                          {addPicked.length}/{free} empty seats picked
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}
              </div>
            </div>
          </div>,
          document.body
        );
      })()}
      </div>
      </div>
    </div>
    </>
  );
}
