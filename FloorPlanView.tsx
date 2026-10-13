"use client";

import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TableData } from "../types/booking";

type Pos = { x: number; y: number };

const STORAGE_KEY = "seating4u-floorplan-positions-v1";

interface FloorPlanViewProps {
  tables: TableData[];
  onTableClick: (table: TableData) => void;
  onEditTable: (table: TableData) => void;
}

const tableKey = (t: TableData) =>
  String(t.seats[0]?.table?.id ?? t.tableNumber);

const tableLabel = (t: TableData) =>
  t.seats[0]?.table?.name || `Table ${t.tableNumber}`;

export function FloorPlanView({
  tables,
  onTableClick,
  onEditTable,
}: FloorPlanViewProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [arrange, setArrange] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragKey = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/floor-map")
      .then((r) => r.json())
      .then((d) => {
        if (d?.image?.data) setImageSrc(d.image.data);
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => setLoading(false));
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setPositions(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, []);

  const savePositions = (p: Record<string, Pos>) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  };

  // Tables with no saved spot are lined up in a grid until you drag them.
  const posOf = (t: TableData, i: number): Pos =>
    positions[tableKey(t)] ?? {
      x: 8 + (i % 6) * 16,
      y: 8 + Math.floor(i / 6) * 14,
    };

  const onMove = (e: React.PointerEvent) => {
    const key = dragKey.current;
    const box = boxRef.current;
    if (!key || !box) return;
    const r = box.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
    setPositions((p) => ({ ...p, [key]: { x, y } }));
  };

  const onUp = () => {
    if (dragKey.current) savePositions(positions);
    dragKey.current = null;
  };

  if (loading) {
    return <p className="p-6 text-sm text-zinc-500">Loading floor plan...</p>;
  }

  if (!imageSrc) {
    return (
      <div className="p-8 text-center border-2 border-dashed border-zinc-300 rounded-lg text-zinc-600">
        No floor map uploaded yet. Use the Floor Map button at the top to
        upload one.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setArrange(!arrange)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium border ${
            arrange
              ? "bg-zinc-900 text-white border-zinc-900"
              : "bg-white text-zinc-800 border-zinc-300"
          }`}
        >
          {arrange ? "Done arranging" : "Arrange tables"}
        </button>
        {arrange && (
          <button
            type="button"
            onClick={() => {
              setPositions({});
              savePositions({});
            }}
            className="px-3 py-1.5 rounded-md text-sm border border-zinc-300 bg-white text-red-600"
          >
            Reset positions
          </button>
        )}
        <span className="text-xs text-zinc-500">
          {arrange
            ? "Drag each table onto its spot. Use the pencil to rename it."
            : "Click a table to see its guests. Positions are saved in this browser."}
        </span>
      </div>

      <div
        ref={boxRef}
        className="relative w-full border border-zinc-200 rounded-lg overflow-hidden bg-white select-none"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <img src={imageSrc} alt="Floor plan" className="w-full h-auto block" />

        {tables.map((t, i) => {
          const p = posOf(t, i);
          const booked = t.seats.filter((s) => s.isBooked).length;
          const total = t.seats.length;
          const color =
            booked === 0
              ? "bg-slate-200 border-slate-400"
              : booked >= total
              ? "bg-green-200 border-green-500"
              : "bg-amber-200 border-amber-500";
          return (
            <div
              key={tableKey(t)}
              className={`absolute px-2 py-1 rounded-lg border-2 text-center shadow ${color} ${
                arrange ? "cursor-grab" : "cursor-pointer"
              }`}
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                transform: "translate(-50%, -50%)",
                touchAction: "none",
              }}
              onPointerDown={(e) => {
                if (!arrange) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                dragKey.current = tableKey(t);
              }}
              onClick={() => {
                if (!arrange) onTableClick(t);
              }}
            >
              <div className="text-xs sm:text-sm font-bold leading-tight text-zinc-900 whitespace-nowrap">
                {tableLabel(t)}
              </div>
              <div className="text-[10px] sm:text-xs text-zinc-700">
                {booked}/{total}
              </div>
              {arrange && (
                <button
                  type="button"
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditTable(t);
                  }}
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
