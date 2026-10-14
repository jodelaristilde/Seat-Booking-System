"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import {
  Move,
  Save,
  X,
  ImageIcon,
  LayoutGrid,
  ScanSearch,
  PenLine,
  Undo2,
  Type,
  Circle,
  Square,
  RectangleHorizontal,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TableData } from "@/types/booking";
import {
  findShapes,
  readTextInShapes,
  nameFromText,
  readingOrder,
  type DetectedShape,
  type Shape,
} from "@/lib/detectTables";
import { stampNames } from "@/lib/stampNames";

type Pos = { x: number; y: number };

interface FloorPlanCanvasProps {
  tables: TableData[];
  renderTable: (table: TableData, index: number) => ReactNode;
  onTablesChanged: () => void | Promise<void>;
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
const PICTURE_KEY = "floorPlanShowPicture";
const SHAPES: Shape[] = ["round", "square", "rectangle"];

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

export function FloorPlanCanvas({ tables, renderTable, onTablesChanged }: FloorPlanCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState<Record<string, Pos>>({});
  const [draft, setDraft] = useState<Record<string, Pos> | null>(null);
  // Shape changes made in "Move tables" mode, saved with the layout
  const [draftShapes, setDraftShapes] = useState<Record<string, Shape>>({});
  const [picture, setPicture] = useState<string | null>(null);
  const [aspect, setAspect] = useState(16 / 10);
  const [showPicture, setShowPicture] = useState(true);
  const [tableSize, setTableSize] = useState(12);
  const [saving, setSaving] = useState(false);
  const dragging = useRef<{ id: string; dx: number; dy: number } | null>(null);

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
  const [drawSeats, setDrawSeats] = useState(10);
  const [drawBox, setDrawBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const [drawnIds, setDrawnIds] = useState<string[]>([]);
  const [drawBusy, setDrawBusy] = useState(false);

  const editing = draft !== null;
  const reviewing = review !== null;

  // Remembered per browser: table size and picture on/off
  useEffect(() => {
    const s = Number(readStored(SIZE_KEY));
    if (s >= 6 && s <= 30) setTableSize(s);
    if (readStored(PICTURE_KEY) === "off") setShowPicture(false);
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
      setShowPicture(true);
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

  // A new picture was uploaded: show it and offer its tables right away
  useEffect(() => {
    const pending = window as unknown as { __floorMapPending?: boolean };
    const onUploaded = async () => {
      pending.__floorMapPending = false;
      const src = await loadPicture();
      if (src) startReview(src);
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
  }, [loadPicture, startReview]);

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
    setDraft({ ...positions });
  };
  const cancelEditing = () => {
    setDraftShapes({});
    setDraft(null);
  };
  const shapeOf = (t: TableData): Shape =>
    draftShapes[tableIdOf(t)] ?? ((t.seats[0]?.table?.shape as Shape) || "round");
  // How big a table is drawn: its size traced from the picture when known,
  // otherwise the standard size. The Table size slider zooms all of them.
  const tableBox = (t: TableData): { width: number; ratio: number } => {
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
          return { id, x: p.x, y: p.y, ...(draftShapes[id] ? { shape: draftShapes[id] } : {}) };
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
      const shapesChanged = Object.keys(draftShapes).length > 0;
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
      toast.message("Drag to draw the table: press, hold and move, then let go.");
      return;
    }
    setDrawBusy(true);
    try {
      const name = `Table ${nextFreeNumber(tables.map(tableNameOf))}`;
      const res = await fetch("/api/floor-plan-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tables: [{ name, x: b.x, y: b.y, w: b.w, h: b.h, shape: drawShape, seats: drawSeats }],
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

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragging.current;
    if (!d) return;
    const p = pointToPercent(e.clientX, e.clientY);
    const x = Math.min(100, Math.max(0, p.x + d.dx));
    const y = Math.min(100, Math.max(0, p.y + d.dy));
    if (reviewing) updateItem(d.id, { x, y });
    else if (editing) setDraft((prev) => ({ ...(prev ?? {}), [d.id]: { x, y } }));
  };

  const onPointerUp = () => {
    dragging.current = null;
  };

  const pickedCount = review?.filter((r) => r.picked).length ?? 0;

  return (
    <div className="px-4 sm:px-8 py-4 sm:pb-[3rem] pb-[9rem]">
      {/* Floor plan controls */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
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
                max={20}
                value={drawSeats}
                onChange={(e) => setDrawSeats(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                className="w-16 border rounded px-2 py-1"
              />
            </label>
            <span className="text-sm text-zinc-600 ml-1">3. Drag on the picture to draw it.</span>
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
                setShowPicture(true);
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
              <Button onClick={() => startReview()} size="sm" variant="outline">
                <ScanSearch className="w-4 h-4 mr-2" /> Read tables from picture
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

        <label className="flex items-center gap-2 text-sm text-zinc-600 ml-auto">
          Table size
          <input
            type="range"
            min={6}
            max={30}
            value={tableSize}
            onChange={(e) => changeTableSize(Number(e.target.value))}
          />
        </label>

        {picture && !reviewing && (
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

      {(editing || reviewing || drawing) && (
        <p className="text-sm text-blue-800 bg-blue-50 rounded px-3 py-2 mb-3">
          {drawing
            ? drawBusy
              ? "Adding the table..."
              : `Drawing ${drawShape} tables with ${drawSeats} seats. Press on the picture where the table starts, drag to its size, and let go. Draw as many as you need, then click Done drawing. To rename a table or add a note, click Done drawing, then hover the table.`
            : reviewing
            ? reviewBusy ??
              "Blue = will be a table. Click a grey shape to make it a table, click × to remove one. Type in the box to rename a table. Click the shape icon to switch round / square / rectangle. Drag a table to move it."
            : "Drag each table to its spot. Click a table's Shape button to switch round / square / rectangle. Then click Save layout. To rename a table, save first, then hover it and click the gear."}
          {reviewBusy && <Loader2 className="inline w-4 h-4 ml-2 animate-spin" />}
        </p>
      )}

      {/* The room */}
      <div
        ref={canvasRef}
        className={`relative w-full bg-white border rounded-lg overflow-hidden ${
          editing || reviewing || drawing ? "border-blue-400 border-2" : "border-zinc-200"
        }`}
        style={{ aspectRatio: String(aspect) }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {picture && (showPicture || reviewing) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={picture}
            alt="Floor plan"
            className={`absolute inset-0 w-full h-full object-fill pointer-events-none select-none ${
              reviewing ? "opacity-70" : "opacity-40"
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
        {!reviewing && tables.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-sm text-center px-4">
            {picture
              ? 'No tables yet. Click "Draw tables" to draw them on your floor plan, or "Read tables from picture".'
              : "No tables yet. Upload your floor plan with the FLOOR MAP button, or add tables."}
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
              >
                {renderTable(withShape(table), index)}
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
    </div>
  );
}
