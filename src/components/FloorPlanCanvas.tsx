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
      const src: string | undefined = json?.image?.data;
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

        const found = ordered.filter((s) => s.likelyTable);
        if (found.length) {
          // Make tables about as big as in the picture (chairs included)
          const ws = found.map((s) => s.w).sort((a, b) => a - b);
          changeTableSize(ws[Math.floor(ws.length / 2)] * 1.35);
        }

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
    setSaving(true);
    try {
      const res = await fetch("/api/floor-plan-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tables: picked.map((p) => ({
            name: p.name.trim(),
            x: p.x,
            y: p.y,
            shape: p.shape,
            seats: seatsPerTable,
          })),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setReview(null);
      await onTablesChanged();
      await loadPositions();
      const parts = [];
      if (json.created) parts.push(`${json.created} new table${json.created === 1 ? "" : "s"} added`);
      if (json.moved) parts.push(`${json.moved} existing table${json.moved === 1 ? "" : "s"} moved into place`);
      toast.success(parts.join(", ") || "Floor plan saved");
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

  const startEditing = () => setDraft({ ...positions });
  const cancelEditing = () => setDraft(null);

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
          return { id, x: p.x, y: p.y };
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
      setDraft(null);
      toast.success("Floor plan saved");
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
        {reviewing ? (
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
          </>
        ) : !editing ? (
          <>
            <Button onClick={startEditing} size="sm">
              <Move className="w-4 h-4 mr-2" /> Move tables
            </Button>
            {picture && (
              <Button onClick={() => startReview()} size="sm" variant="outline">
                <ScanSearch className="w-4 h-4 mr-2" /> Read tables from picture
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

      {(editing || reviewing) && (
        <p className="text-sm text-blue-800 bg-blue-50 rounded px-3 py-2 mb-3">
          {reviewing
            ? reviewBusy ??
              "Blue = will be a table. Click a grey shape to make it a table, click × to remove one. Type in the box to rename a table. Click the shape icon to switch round / square / rectangle. Drag a table to move it."
            : "Drag each table to its spot, then click Save layout. To rename a table, save first, then hover it and click the gear."}
          {reviewBusy && <Loader2 className="inline w-4 h-4 ml-2 animate-spin" />}
        </p>
      )}

      {/* The room */}
      <div
        ref={canvasRef}
        className={`relative w-full bg-white border rounded-lg overflow-hidden ${
          editing || reviewing ? "border-blue-400 border-2" : "border-zinc-200"
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

        {/* Normal view */}
        {!reviewing && tables.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-sm text-center px-4">
            {picture
              ? 'No tables yet. Click "Read tables from picture" to make them from your floor plan.'
              : "No tables yet. Upload your floor plan with the FLOOR MAP button, or add tables."}
          </div>
        )}

        {!reviewing &&
          tables.map((table, index) => {
            const id = tableIdOf(table);
            const pos = positions[id];
            if (!pos) return null;
            const shape = table.seats[0]?.table?.shape ?? "round";
            return (
              <div
                key={id}
                className="absolute"
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  width: `${shape === "rectangle" ? tableSize * 1.6 : tableSize}%`,
                  transform: "translate(-50%, -50%)",
                  zIndex: dragging.current?.id === id ? 30 : 10,
                }}
              >
                {renderTable(table, index)}
                {editing && (
                  <div
                    className={`absolute inset-0 ${
                      shape === "round" ? "rounded-full" : "rounded-md"
                    } cursor-grab active:cursor-grabbing bg-blue-500/10 ring-2 ring-blue-400/60 touch-none`}
                    onPointerDown={onPointerDown(id, pos)}
                    title="Drag to move"
                  />
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
