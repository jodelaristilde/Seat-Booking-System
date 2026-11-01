"use client";

// Draw the room: for planners without the venue's floor plan. Put the stage,
// dance floor, bar, doors and tables where they are, then Save. The drawing
// becomes the event's floor plan (guests' phones, venue chart…), the tables are
// created at their spots, and the doors become the entrances.
// /dashboard/room-builder (login required)
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Copy, Save, Trash2 } from "lucide-react";
import { HelpTip } from "@/components/HelpTip";

type Kind =
  | "table"
  | "long"
  | "stage"
  | "dance"
  | "bar"
  | "head"
  | "buffet"
  | "dj"
  | "cake"
  | "gifts"
  | "photo"
  | "restroom"
  | "kitchen"
  | "door"
  | "label";
type Item = { id: string; kind: Kind; label: string; x: number; y: number; w: number; h: number; seats?: number };
type Shape = "wide" | "square" | "tall";

const ASPECT: Record<Shape, number> = { wide: 16 / 10, square: 1, tall: 10 / 16 };
// what can be added: [kind, button text, default label, w%, h%, colour]
const PARTS: [Kind, string, string, number, number, string][] = [
  ["stage", "Stage", "Stage", 26, 14, "#ddd6fe"],
  ["dance", "Dance floor", "Dance floor", 22, 26, "#ecd3b4"],
  ["head", "Head table", "Head Table", 30, 7, "#e2ecaa"],
  ["bar", "Bar", "Bar", 18, 8, "#e5ea86"],
  ["buffet", "Buffet", "Buffet", 20, 8, "#fed7aa"],
  ["dj", "DJ", "DJ", 10, 8, "#bfdbfe"],
  ["cake", "Cake", "Cake", 7, 7, "#fbcfe8"],
  ["gifts", "Gifts", "Gifts", 9, 7, "#fde68a"],
  ["photo", "Photo booth", "Photo booth", 12, 9, "#a5f3fc"],
  ["restroom", "Restrooms", "Restrooms", 12, 9, "#e5e7eb"],
  ["kitchen", "Kitchen", "Kitchen", 14, 10, "#d6d3d1"],
  ["door", "Entrance (door)", "Entrance", 10, 5, "#86efac"],
  ["label", "Text", "Text", 12, 5, "transparent"],
];
// where each part goes first (centre, in % of the room)
const START: Partial<Record<Kind, [number, number]>> = {
  stage: [50, 11],
  head: [50, 22],
  dance: [50, 50],
  bar: [88, 50],
  buffet: [12, 50],
  dj: [72, 12],
  cake: [28, 14],
  gifts: [12, 14],
  photo: [88, 14],
  restroom: [10, 88],
  kitchen: [90, 88],
  door: [50, 96],
  label: [50, 30],
};
const COLOR = Object.fromEntries(PARTS.map((p) => [p[0], p[5]])) as Record<Kind, string>;
const TABLE_D = 7; // round table width, % of the room width
const isTable = (k: Kind) => k === "table" || k === "long";
const uid = () => Math.random().toString(36).slice(2, 9);

export default function RoomBuilder() {
  const router = useRouter();
  const [shape, setShape] = useState<Shape>("wide");
  const [items, setItems] = useState<Item[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [seats, setSeats] = useState(10);
  const [many, setMany] = useState(10);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<null | { id: string; mode: "move" | "size"; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number }>(null);

  // open what was drawn before, and the tables already in the event
  useEffect(() => {
    (async () => {
      const [lay, pos] = await Promise.all([
        fetch("/api/room-layout").then((r) => r.json()).catch(() => null),
        fetch("/api/table-positions").then((r) => r.json()).catch(() => null),
      ]);
      const list: Item[] = [];
      if (lay?.layout?.items) {
        if (lay.layout.shape in ASPECT) setShape(lay.layout.shape);
        for (const it of lay.layout.items as Item[]) if (!isTable(it.kind)) list.push(it);
      }
      const tables = (pos?.data ?? []) as { id: string; name: string; posX: number | null; posY: number | null }[];
      const laidOut = (lay?.layout?.items ?? []) as Item[];
      tables.forEach((t, i) => {
        const before = laidOut.find((x) => isTable(x.kind) && x.label === t.name);
        list.push({
          id: uid(),
          kind: before?.kind === "long" ? "long" : "table",
          label: t.name,
          x: t.posX ?? 10 + (i % 8) * 11,
          y: t.posY ?? 15 + Math.floor(i / 8) * 16,
          w: before?.kind === "long" ? 14 : TABLE_D,
          h: before?.kind === "long" ? 6 : TABLE_D,
        });
      });
      setItems(list);
      setLoaded(true);
    })();
  }, []);

  const nextNumber = useCallback(
    (list: Item[]) => {
      let n = 1;
      const names = new Set(list.filter((x) => isTable(x.kind)).map((x) => x.label.toLowerCase()));
      while (names.has(`table ${n}`)) n++;
      return n;
    },
    []
  );

  const add = (kind: Kind) => {
    // one entrance only: move the one you have instead of adding a second
    if (kind === "door" && items.some((x) => x.kind === "door"))
      return toast.message("You already have the entrance. Drag it to move it, or delete it first.");
    const part = PARTS.find((p) => p[0] === kind);
    setItems((list) => {
      const n = list.length;
      const it: Item = isTable(kind)
        ? {
            id: uid(),
            kind,
            label: `Table ${nextNumber(list)}`,
            x: 50 + ((n % 5) - 2) * 4,
            y: 50 + ((n % 3) - 1) * 6,
            w: kind === "long" ? 14 : TABLE_D,
            h: kind === "long" ? 6 : TABLE_D,
            seats,
          }
        : (() => {
            // the usual spot; a second one of the same kind goes a little to the side
            const [sx, sy] = START[kind] ?? [50, 50];
            const same = list.filter((x) => x.kind === kind).length;
            return { id: uid(), kind, label: part![2], x: Math.min(95, sx + same * 6), y: Math.min(95, sy + same * 4), w: part![3], h: part![4] };
          })();
      setSel(it.id);
      return [...list, it];
    });
  };

  // many round tables at once, in rows, in the free part of the room
  const addMany = () => {
    const count = Math.max(1, Math.min(80, Math.round(many) || 1));
    {
      const list = items;
      const out = [...list];
      const asp = ASPECT[shape];
      const d = TABLE_D; // width in % of the room width; height in % of the room height is d * asp
      const blocks = list.map((x) => {
        const w = isTable(x.kind) && x.kind === "table" ? d : x.w;
        const h = x.kind === "table" ? d * asp : x.h;
        return { l: x.x - w / 2 - 1.5, r: x.x + w / 2 + 1.5, t: x.y - h / 2 - 1.5 * asp, b: x.y + h / 2 + 1.5 * asp };
      });
      const free = (cx: number, cy: number) =>
        !blocks.some((k) => cx + d / 2 > k.l && cx - d / 2 < k.r && cy + (d * asp) / 2 > k.t && cy - (d * asp) / 2 < k.b);
      // try tighter and tighter rows until all the tables fit around what is already there
      let spots: [number, number][] = [];
      for (let gap = 1.7; gap >= 1.15 && spots.length < count; gap -= 0.1) {
        spots = [];
        const sx = d * gap;
        const sy = d * asp * gap;
        for (let y = 6 + (d * asp) / 2; y <= 94 - (d * asp) / 2; y += sy)
          for (let x = 4 + d / 2; x <= 96 - d / 2; x += sx) if (free(x, y)) spots.push([x, y]);
      }
      const n = Math.min(count, spots.length);
      for (let i = 0; i < n; i++) {
        out.push({ id: uid(), kind: "table", label: `Table ${nextNumber(out)}`, x: spots[i][0], y: spots[i][1], w: d, h: d, seats });
      }
      setItems(out);
      if (n < count) toast.error(`Only ${n} more tables fit. Make the room parts smaller, or add the rest one by one.`);
      else toast.success(`${n} tables added. Drag them where they go.`);
    }
  };

  const patch = (id: string, p: Partial<Item>) => setItems((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const remove = (id: string) => {
    setItems((list) => list.filter((x) => x.id !== id));
    setSel(null);
  };
  const copy = (id: string) => {
    setItems((list) => {
      const it = list.find((x) => x.id === id);
      if (!it) return list;
      const c: Item = { ...it, id: uid(), x: Math.min(97, it.x + 4), y: Math.min(97, it.y + 4) };
      if (isTable(it.kind)) c.label = `Table ${nextNumber(list)}`;
      setSel(c.id);
      return [...list, c];
    });
  };

  // dragging and resizing (mouse, pen or finger)
  const onDown = (e: React.PointerEvent, it: Item, mode: "move" | "size") => {
    e.stopPropagation();
    e.preventDefault();
    setSel(it.id);
    drag.current = { id: it.id, mode, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y, ow: it.w, oh: it.h };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const r = box.current?.getBoundingClientRect();
    if (!d || !r) return;
    const dx = ((e.clientX - d.sx) / r.width) * 100;
    const dy = ((e.clientY - d.sy) / r.height) * 100;
    if (d.mode === "move") patch(d.id, { x: Math.min(99, Math.max(1, d.ox + dx)), y: Math.min(99, Math.max(1, d.oy + dy)) });
    else patch(d.id, { w: Math.min(90, Math.max(3, d.ow + dx * 2)), h: Math.min(90, Math.max(3, d.oh + dy * 2)) });
  };
  const onUp = () => {
    drag.current = null;
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!sel) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.key === "Delete" || e.key === "Backspace") remove(sel);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [sel]);

  // the room as a picture (no tables: the app draws those itself)
  const picture = (): string => {
    const W = 1600;
    const H = Math.round(W / ASPECT[shape]);
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fbf8f2";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "#4b4b4b";
    g.lineWidth = 10;
    g.strokeRect(5, 5, W - 10, H - 10);
    for (const it of items) {
      if (isTable(it.kind)) continue;
      const w = (it.w / 100) * W;
      const hh = (it.h / 100) * H;
      const x = (it.x / 100) * W - w / 2;
      const y = (it.y / 100) * H - hh / 2;
      if (it.kind !== "label") {
        if (it.kind === "door") {
          // a gap in the wall, in green
          g.fillStyle = "#fbf8f2";
          g.fillRect(x, y, w, hh);
        }
        g.fillStyle = COLOR[it.kind];
        g.strokeStyle = it.kind === "door" ? "#16a34a" : "#6b6b6b";
        g.lineWidth = 3;
        const rad = Math.min(14, w / 4, hh / 4);
        g.beginPath();
        g.roundRect(x, y, w, hh, rad);
        g.fill();
        g.stroke();
      }
      const fs = Math.max(16, Math.min(34, hh * 0.42, (w / Math.max(4, it.label.length)) * 1.6));
      g.fillStyle = it.kind === "door" ? "#14532d" : "#3a3a3a";
      g.font = `bold ${fs}px Arial, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(it.label, x + w / 2, y + hh / 2);
    }
    return c.toDataURL("image/png");
  };

  const save = async () => {
    const tables = items.filter((x) => isTable(x.kind));
    const names = new Set<string>();
    for (const t of tables) {
      const k = t.label.trim().toLowerCase();
      if (!k) return toast.error("Every table needs a name");
      if (names.has(k)) return toast.error(`Two tables are called "${t.label}". Rename one.`);
      names.add(k);
    }
    setSaving(true);
    try {
      const data = picture();
      const up = await fetch("/api/floor-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: "room-drawing.png", data, original: data, mimeType: "image/png", size: Math.round((data.length * 3) / 4) }),
      });
      if (!up.ok) throw new Error("picture");
      await fetch("/api/room-layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout: { shape, items } }),
      });
      if (tables.length) {
        const r = await fetch("/api/floor-plan-apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            removeOthers: true,
            tables: tables.map((t) => ({ name: t.label.trim(), x: t.x, y: t.y, shape: t.kind === "long" ? "rectangle" : "round", seats: t.seats ?? seats })),
          }),
        }).then((x) => x.json());
        if (!r?.success) throw new Error("tables");
        if (r.removed) toast.message(`${r.removed} table${r.removed === 1 ? "" : "s"} removed. Their guests are in "No seat yet".`);
      }
      const doors = items.filter((x) => x.kind === "door").slice(0, 1).map((d) => ({ x: d.x, y: d.y }));
      await fetch("/api/event-entrance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entrances: doors }),
      });
      window.dispatchEvent(new Event("floor-map-uploaded"));
      toast.success("Your room is saved. It is now your floor plan.");
      router.push("/dashboard");
    } catch {
      toast.error("Could not save the room. Check the internet and try again.");
    } finally {
      setSaving(false);
    }
  };

  const cur = items.find((x) => x.id === sel) ?? null;
  const btn = "rounded-lg border bg-white px-2.5 py-1.5 text-sm font-semibold hover:bg-zinc-50";
  return (
    <div className="flex min-h-screen flex-col text-zinc-900">
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b bg-white px-4 py-3">
        <Link href="/dashboard" className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm hover:bg-zinc-50">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="flex items-center gap-2 text-lg font-bold">
          Draw your room
          <HelpTip side="right">
            No floor plan from the venue? Draw it here. Click a button on the left to add it, then <b>drag</b> it where it is in the
            room. Drag the small corner to make it bigger. Click <b>Save my room</b>: it becomes your floor plan, the tables are
            created, and the doors become the entrances on guests&apos; phones.
          </HelpTip>
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-zinc-600">Room shape:</span>
          {(["wide", "square", "tall"] as Shape[]).map((s) => (
            <button key={s} onClick={() => setShape(s)} className={`${btn} ${shape === s ? "border-lime-600 bg-lime-50" : ""}`}>
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
          <button
            onClick={save}
            disabled={saving || !loaded}
            className="inline-flex items-center gap-1.5 rounded-lg bg-lime-600 px-4 py-2 text-sm font-bold text-white hover:bg-lime-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save my room"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3 lg:flex-row">
        {/* what can be added */}
        <aside className="w-full shrink-0 space-y-3 lg:w-56">
          <div className="rounded-xl border bg-white p-3">
            <p className="mb-2 text-sm font-bold">Tables</p>
            <label className="mb-2 flex items-center gap-2 text-sm">
              Seats each
              <input
                type="number"
                min={1}
                max={40}
                value={seats}
                onChange={(e) => setSeats(Math.min(40, Math.max(1, Number(e.target.value) || 1)))}
                className="h-8 w-16 rounded border px-2"
              />
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => add("table")} className={btn}>
                + Round
              </button>
              <button onClick={() => add("long")} className={btn}>
                + Long
              </button>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={80}
                value={many}
                onChange={(e) => setMany(Number(e.target.value))}
                className="h-8 w-14 rounded border px-2 text-sm"
                aria-label="How many tables"
              />
              <button onClick={addMany} className={`${btn} flex-1`}>
                Add many
              </button>
            </div>
          </div>
          <div className="rounded-xl border bg-white p-3">
            <p className="mb-2 text-sm font-bold">The room</p>
            <div className="grid grid-cols-2 gap-1.5">
              {PARTS.map(([k, text]) => (
                <button key={k} onClick={() => add(k)} className={`${btn} text-left text-xs`}>
                  + {text}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* the room */}
        <div className="min-w-0 flex-1">
          <div
            ref={box}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
            onPointerDown={() => setSel(null)}
            className="relative mx-auto w-full touch-none select-none rounded-md border-[5px] border-zinc-600 bg-[#fbf8f2]"
            style={{ aspectRatio: String(ASPECT[shape]), maxHeight: "calc(100vh - 150px)", maxWidth: `calc((100vh - 150px) * ${ASPECT[shape]})` }}
            data-testid="room"
          >
            {!items.length && loaded && (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-zinc-500">
                Click the buttons on the left to add tables, a stage, the dance floor, the bar and the doors.
              </p>
            )}
            {items.map((it) => {
              const on = it.id === sel;
              const round = it.kind === "table" || it.kind === "cake";
              return (
                <div
                  key={it.id}
                  onPointerDown={(e) => onDown(e, it, "move")}
                  className={`absolute flex cursor-grab items-center justify-center text-center font-bold leading-tight active:cursor-grabbing ${
                    round ? "rounded-full" : "rounded-md"
                  } ${it.kind === "label" ? "" : "border-2"} ${on ? "ring-4 ring-lime-500/60" : ""}`}
                  style={{
                    left: `${it.x}%`,
                    top: `${it.y}%`,
                    width: `${it.w}%`,
                    height: isTable(it.kind) && it.kind === "table" ? undefined : `${it.h}%`,
                    aspectRatio: it.kind === "table" ? "1" : undefined,
                    transform: "translate(-50%, -50%)",
                    background: isTable(it.kind) ? "#ffffff" : COLOR[it.kind],
                    borderColor: it.kind === "door" ? "#16a34a" : isTable(it.kind) ? "#a1a1aa" : "#71717a",
                    fontSize: isTable(it.kind) ? "clamp(9px, 1.1vw, 15px)" : "clamp(9px, 1vw, 14px)",
                  }}
                >
                  <span className="pointer-events-none px-0.5">{isTable(it.kind) ? it.label.replace(/^table\s*/i, "") : it.label}</span>
                  {on && !round && (
                    <span
                      onPointerDown={(e) => onDown(e, it, "size")}
                      className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-white bg-lime-600"
                      title="Drag to make it bigger or smaller"
                    />
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-center text-xs text-zinc-500">Drag to move · drag the green corner to resize · Delete key removes the selected one</p>
        </div>

        {/* the selected thing */}
        <aside className="w-full shrink-0 lg:w-56">
          <div className="rounded-xl border bg-white p-3">
            {!cur ? (
              <p className="text-sm text-zinc-500">Click something in the room to change its name, seats, or remove it.</p>
            ) : (
              <div className="space-y-2">
                <label className="block text-sm font-semibold">
                  {isTable(cur.kind) ? "Table name" : "Name"}
                  <input
                    value={cur.label}
                    onChange={(e) => patch(cur.id, { label: e.target.value.slice(0, 40) })}
                    className="mt-1 h-9 w-full rounded border px-2 font-normal"
                  />
                </label>
                {isTable(cur.kind) && (
                  <label className="block text-sm font-semibold">
                    Seats
                    <input
                      type="number"
                      min={1}
                      max={40}
                      value={cur.seats ?? seats}
                      onChange={(e) => patch(cur.id, { seats: Math.min(40, Math.max(1, Number(e.target.value) || 1)) })}
                      className="mt-1 h-9 w-full rounded border px-2 font-normal"
                    />
                    <span className="block text-xs font-normal text-zinc-500">For a new table. A table you already had keeps its seats.</span>
                  </label>
                )}
                <div className="flex gap-1.5 pt-1">
                  <button onClick={() => copy(cur.id)} className={`${btn} inline-flex flex-1 items-center justify-center gap-1`}>
                    <Copy className="h-4 w-4" /> Copy
                  </button>
                  <button onClick={() => remove(cur.id)} className={`${btn} inline-flex flex-1 items-center justify-center gap-1 text-red-600`}>
                    <Trash2 className="h-4 w-4" /> Remove
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
