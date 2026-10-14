"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import { Move, Save, X, ImageIcon, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TableData } from "@/types/booking";

type Pos = { x: number; y: number };

interface FloorPlanCanvasProps {
  tables: TableData[];
  renderTable: (table: TableData, index: number) => ReactNode;
}

const SIZE_KEY = "floorPlanTableSize";
const PICTURE_KEY = "floorPlanShowPicture";

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

export function FloorPlanCanvas({ tables, renderTable }: FloorPlanCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState<Record<string, Pos>>({});
  const [draft, setDraft] = useState<Record<string, Pos> | null>(null);
  const [picture, setPicture] = useState<string | null>(null);
  const [aspect, setAspect] = useState(16 / 10);
  const [showPicture, setShowPicture] = useState(true);
  const [tableSize, setTableSize] = useState(12);
  const [saving, setSaving] = useState(false);
  const dragging = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const editing = draft !== null;

  // Remembered per browser: table size and picture on/off
  useEffect(() => {
    const s = Number(readStored(SIZE_KEY));
    if (s >= 6 && s <= 30) setTableSize(s);
    if (readStored(PICTURE_KEY) === "off") setShowPicture(false);
  }, []);

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
  }, [loadPositions]);

  // The uploaded floor plan picture, used as a guide behind the tables
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/floor-map");
        const json = await res.json();
        const src: string | undefined = json?.image?.data;
        if (!src) return;
        const img = new window.Image();
        img.onload = () => {
          if (img.naturalWidth && img.naturalHeight) {
            setAspect(img.naturalWidth / img.naturalHeight);
          }
          setPicture(src);
        };
        img.src = src;
      } catch (e) {
        console.error("Failed to load floor map picture", e);
      }
    })();
  }, []);

  // Final spot for every table: draft (while moving) > saved > automatic
  const positions = useMemo(() => {
    const source = draft ?? saved;
    const unplaced = tables.filter((t) => !source[tableIdOf(t)]);
    const auto = autoPositions(unplaced.length);
    const result: Record<string, Pos> = {};
    tables.forEach((t) => {
      const id = tableIdOf(t);
      result[id] = source[id] ?? auto[unplaced.indexOf(t)];
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
          return { id, x: draft[id].x, y: draft[id].y };
        }),
      };
      const res = await fetch("/api/table-positions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setSaved({ ...draft });
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

  // ---- dragging ----
  const pointToPercent = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  const onPointerDown = (id: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!editing) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointToPercent(e.clientX, e.clientY);
    const cur = positions[id];
    dragging.current = { id, dx: cur.x - p.x, dy: cur.y - p.y };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragging.current;
    if (!d || !editing) return;
    const p = pointToPercent(e.clientX, e.clientY);
    const x = Math.min(100, Math.max(0, p.x + d.dx));
    const y = Math.min(100, Math.max(0, p.y + d.dy));
    setDraft((prev) => ({ ...(prev ?? {}), [d.id]: { x, y } }));
  };

  const onPointerUp = () => {
    dragging.current = null;
  };

  return (
    <div className="px-4 sm:px-8 py-4 sm:pb-[3rem] pb-[9rem]">
      {/* Floor plan controls */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {!editing ? (
          <Button onClick={startEditing} size="sm">
            <Move className="w-4 h-4 mr-2" /> Move tables
          </Button>
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
            <span className="text-sm text-blue-700 bg-blue-50 rounded px-2 py-1">
              Drag each table to its spot, then click Save layout.
            </span>
          </>
        )}

        <label className="flex items-center gap-2 text-sm text-zinc-600 ml-auto">
          Table size
          <input
            type="range"
            min={6}
            max={30}
            value={tableSize}
            onChange={(e) => {
              const v = Number(e.target.value);
              setTableSize(v);
              writeStored(SIZE_KEY, String(v));
            }}
          />
        </label>

        {picture && (
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

      {/* The room */}
      <div
        ref={canvasRef}
        className={`relative w-full bg-white border rounded-lg overflow-hidden ${
          editing ? "border-blue-400 border-2" : "border-zinc-200"
        }`}
        style={{ aspectRatio: String(aspect) }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {picture && showPicture && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={picture}
            alt="Floor plan"
            className="absolute inset-0 w-full h-full object-fill opacity-40 pointer-events-none select-none"
            draggable={false}
          />
        )}

        {tables.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm">
            No tables yet. Add tables, then place them here.
          </div>
        )}

        {tables.map((table, index) => {
          const id = tableIdOf(table);
          const pos = positions[id];
          if (!pos) return null;
          return (
            <div
              key={id}
              className="absolute"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                width: `${tableSize}%`,
                transform: "translate(-50%, -50%)",
                zIndex: dragging.current?.id === id ? 30 : 10,
              }}
            >
              {renderTable(table, index)}
              {editing && (
                <div
                  className="absolute inset-0 rounded-full cursor-grab active:cursor-grabbing bg-blue-500/10 ring-2 ring-blue-400/60 touch-none"
                  onPointerDown={onPointerDown(id)}
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
