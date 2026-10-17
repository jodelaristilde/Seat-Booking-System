// Finds tables in a floor plan picture, right in the browser.
//
// How: the picture is turned black & white, then every white area that is
// fully closed in by lines (the inside of a circle, square or rectangle) is
// measured. Tiny ones are chairs, huge ones are rooms / dance floors. The most
// common size among the rest is taken to be "a table". Other closed shapes
// (bar, DJ, head table...) are returned too, but not selected, so the person
// can tick them if they are tables.
//
// Then, optionally, the text inside each shape is read (OCR) so table numbers
// or names written in the picture are copied.

export type Shape = "round" | "square" | "rectangle";

export interface DetectedShape {
  key: string;
  x: number; // centre, % of picture width
  y: number; // centre, % of picture height
  w: number; // width, % of picture width
  h: number; // height, % of picture height
  shape: Shape;
  likelyTable: boolean;
  text: string; // text read inside (may be empty)
}

const MAX_SIDE = 1200;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not open the picture"));
    img.src = src;
  });
}

interface Region {
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  touchesEdge: boolean;
}

export async function findShapes(src: string): Promise<{
  shapes: DetectedShape[];
  canvas: HTMLCanvasElement;
}> {
  const img = await loadImage(src);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.max(1, Math.round(img.naturalWidth * scale));
  const H = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;

  // 1 = line/ink, 0 = open space. Threshold halfway between darkest and lightest.
  let lo = 255;
  let hi = 0;
  const lum = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const l = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000;
    lum[i] = l;
    if (l < lo) lo = l;
    if (l > hi) hi = l;
  }
  const cut = (lo + hi) / 2;
  const ink = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) ink[i] = lum[i] < cut ? 1 : 0;

  // Label each closed open-space area (4-neighbour flood fill)
  const label = new Int32Array(W * H).fill(-1);
  const regions: Region[] = [];
  const stack = new Int32Array(W * H);
  for (let start = 0; start < W * H; start++) {
    if (ink[start] || label[start] !== -1) continue;
    const id = regions.length;
    const r: Region = {
      area: 0,
      minX: W,
      minY: H,
      maxX: 0,
      maxY: 0,
      touchesEdge: false,
    };
    let top = 0;
    stack[top++] = start;
    label[start] = id;
    while (top > 0) {
      const p = stack[--top];
      const x = p % W;
      const y = (p - x) / W;
      r.area++;
      if (x < r.minX) r.minX = x;
      if (x > r.maxX) r.maxX = x;
      if (y < r.minY) r.minY = y;
      if (y > r.maxY) r.maxY = y;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) r.touchesEdge = true;
      if (x > 0 && !ink[p - 1] && label[p - 1] === -1) { label[p - 1] = id; stack[top++] = p - 1; }
      if (x < W - 1 && !ink[p + 1] && label[p + 1] === -1) { label[p + 1] = id; stack[top++] = p + 1; }
      if (y > 0 && !ink[p - W] && label[p - W] === -1) { label[p - W] = id; stack[top++] = p - W; }
      if (y < H - 1 && !ink[p + W] && label[p + W] === -1) { label[p + W] = id; stack[top++] = p + W; }
    }
    regions.push(r);
  }

  const total = W * H;
  type Cand = Region & { bw: number; bh: number; fill: number; aspect: number };
  const cands: Cand[] = regions
    .filter((r) => !r.touchesEdge)
    .map((r) => {
      const bw = r.maxX - r.minX + 1;
      const bh = r.maxY - r.minY + 1;
      return { ...r, bw, bh, fill: r.area / (bw * bh), aspect: bw / bh };
    })
    // not chairs/specks, not the whole room, and a sensible solid shape
    .filter(
      (c) =>
        c.area > total * 0.0015 &&
        c.area < total * 0.12 &&
        c.fill > 0.55 &&
        c.bw > 12 &&
        c.bh > 12
    );

  // Most common size = the tables
  let bestGroup: Cand[] = [];
  for (const c of cands) {
    const group = cands.filter(
      (o) => o.area > c.area * 0.7 && o.area < c.area * 1.43 && Math.abs(Math.log(o.aspect / c.aspect)) < 0.35
    );
    if (group.length > bestGroup.length) bestGroup = group;
  }
  const tableSet = new Set(bestGroup.length >= 2 ? bestGroup : []);

  const shapes: DetectedShape[] = cands.map((c, i) => {
    const square = c.aspect > 0.8 && c.aspect < 1.25;
    const shape: Shape =
      square && c.fill < 0.86 ? "round" : square ? "square" : c.fill < 0.86 ? "round" : "rectangle";
    return {
      key: `d${i}`,
      x: ((c.minX + c.bw / 2) / W) * 100,
      y: ((c.minY + c.bh / 2) / H) * 100,
      w: (c.bw / W) * 100,
      h: (c.bh / H) * 100,
      shape,
      likelyTable: tableSet.has(c),
      text: "",
    };
  });

  return { shapes, canvas };
}

// ---- Reading text inside the shapes (optional, loaded only when needed) ----

type TesseractWorker = {
  recognize: (img: HTMLCanvasElement) => Promise<{ data: { text: string; confidence?: number } }>;
  setParameters: (p: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};
type TesseractGlobal = {
  createWorker: (lang: string) => Promise<TesseractWorker>;
};

function loadTesseract(): Promise<TesseractGlobal> {
  const w = window as unknown as { Tesseract?: TesseractGlobal };
  if (w.Tesseract) return Promise.resolve(w.Tesseract);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.async = true;
    s.onload = () => (w.Tesseract ? resolve(w.Tesseract) : reject(new Error("Reader not available")));
    s.onerror = () => reject(new Error("Could not load the text reader"));
    document.head.appendChild(s);
  });
}

export async function readTextInShapes(
  canvas: HTMLCanvasElement,
  shapes: DetectedShape[],
  onProgress?: (done: number, total: number) => void
): Promise<DetectedShape[]> {
  const T = await loadTesseract();
  const worker = await T.createWorker("eng");
  try {
    await worker.setParameters({ tessedit_pageseg_mode: "6" });
    const W = canvas.width;
    const H = canvas.height;
    const out: DetectedShape[] = [];
    for (let i = 0; i < shapes.length; i++) {
      const s = shapes[i];
      // Inner part of the shape only (skip its outline)
      const inset = s.shape === "round" ? 0.18 : 0.06;
      const cw = (s.w / 100) * W;
      const ch = (s.h / 100) * H;
      const sx = Math.max(0, (s.x / 100) * W - cw / 2 + cw * inset);
      const sy = Math.max(0, (s.y / 100) * H - ch / 2 + ch * inset);
      const sw = Math.max(4, cw * (1 - 2 * inset));
      const sh = Math.max(4, ch * (1 - 2 * inset));
      const k = Math.max(1, Math.min(4, 120 / sh));
      const crop = document.createElement("canvas");
      crop.width = Math.round(sw * k) + 20;
      crop.height = Math.round(sh * k) + 20;
      const cx = crop.getContext("2d")!;
      cx.fillStyle = "#fff";
      cx.fillRect(0, 0, crop.width, crop.height);
      cx.drawImage(canvas, sx, sy, sw, sh, 10, 10, sw * k, sh * k);
      let text = "";
      try {
        const r = await worker.recognize(crop);
        const raw = r.data.text
          .replace(/[^A-Za-z0-9 #&'\-]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        text = acceptReading(raw, r.data.confidence ?? 0);
      } catch {
        text = "";
      }
      out.push({ ...s, text });
      onProgress?.(i + 1, shapes.length);
    }
    return out;
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}

// The reader sometimes "sees" letters in chair drawings or lines.
// Keep only things that are clearly a table number or real words.
export function acceptReading(raw: string, confidence: number): string {
  const t = raw.trim();
  if (!t) return "";
  // A table number, maybe written "Table 5", "T5", "#5" or just "5"
  const num = t.match(/^(?:table|tbl|t)?\s*#?\s*(\d{1,3})$/i);
  if (num && confidence >= 45) return t;
  // Words: every word at least 2 letters, at least 3 letters in total,
  // no stray symbols, and the reader must be quite sure
  const words = t.split(" ");
  const letters = t.replace(/[^A-Za-z]/g, "").length;
  const clean =
    words.every((w) => /^[A-Za-z][A-Za-z'&\-]*[A-Za-z]$/.test(w) || /^\d{1,3}$/.test(w)) &&
    words.some((w) => /^[A-Za-z]{3,}/.test(w));
  if (clean && letters >= 3 && confidence >= 80) return t;
  return "";
}

// Turn what was read into a table name. Numbers become "Table N".
export function nameFromText(text: string): string {
  const t = text.trim();
  if (!t) return "";
  const num = t.match(/^(?:table|tbl|t)?\s*#?\s*(\d{1,4})$/i);
  if (num) return `Table ${Number(num[1])}`;
  return t
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 40);
}

// Order shapes like reading a page: row by row, left to right.
export function readingOrder<T extends { x: number; y: number; h: number }>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const rows: T[][] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - it.y) < Math.max(row[0].h, it.h) * 0.5) row.push(it);
    else rows.push([it]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.x - b.x));
}

// ---- Click a table on the picture to add it ----
// The picture is split into closed areas once (and remembered). A click
// finds the closed area under the mouse: that is the tabletop. Chairs are the
// small closed areas just around it, so they are counted for the seats.

interface AreaMap {
  W: number;
  H: number;
  px: Uint8ClampedArray;
  label: Int32Array;
  areas: { area: number; minX: number; minY: number; maxX: number; maxY: number; sx: number; sy: number; edge: boolean }[];
  canvas: HTMLCanvasElement;
}
let areaCache: { src: string; map: AreaMap } | null = null;

async function areaMap(src: string): Promise<AreaMap> {
  if (areaCache && areaCache.src === src) return areaCache.map;
  const img = await loadImage(src);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.max(1, Math.round(img.naturalWidth * scale));
  const H = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;
  let lo = 255;
  let hi = 0;
  const lum = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const l = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000;
    lum[i] = l;
    if (l < lo) lo = l;
    if (l > hi) hi = l;
  }
  // Anything clearly darker than the paper is a line (thin grey lines too),
  // and lines are thickened by 1 pixel so small gaps in an outline close.
  const cut = lo + (hi - lo) * 0.78;
  const line = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (lum[y * W + x] >= cut) continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) line[yy * W + xx] = 1;
        }
    }
  const label = new Int32Array(W * H).fill(-1);
  const areas: AreaMap["areas"] = [];
  const stack = new Int32Array(W * H);
  for (let start = 0; start < W * H; start++) {
    if (line[start] || label[start] !== -1) continue;
    const id = areas.length;
    const r = { area: 0, minX: W, minY: H, maxX: 0, maxY: 0, sx: 0, sy: 0, edge: false };
    let top = 0;
    stack[top++] = start;
    label[start] = id;
    while (top > 0) {
      const p = stack[--top];
      const x = p % W;
      const y = (p - x) / W;
      r.area++;
      r.sx += x;
      r.sy += y;
      if (x < r.minX) r.minX = x;
      if (x > r.maxX) r.maxX = x;
      if (y < r.minY) r.minY = y;
      if (y > r.maxY) r.maxY = y;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) r.edge = true;
      if (x > 0 && !line[p - 1] && label[p - 1] === -1) { label[p - 1] = id; stack[top++] = p - 1; }
      if (x < W - 1 && !line[p + 1] && label[p + 1] === -1) { label[p + 1] = id; stack[top++] = p + 1; }
      if (y > 0 && !line[p - W] && label[p - W] === -1) { label[p - W] = id; stack[top++] = p - W; }
      if (y < H - 1 && !line[p + W] && label[p + W] === -1) { label[p + W] = id; stack[top++] = p + W; }
    }
    areas.push(r);
  }
  const map = { W, H, px, label, areas, canvas };
  areaCache = { src, map };
  return map;
}

type ClickResult = { shape: DetectedShape; chairs: number; canvas: HTMLCanvasElement } | null;

// Works on any picture:
// - tables drawn as outlines (white inside): the closed area under the click
// - tables filled with a colour (orange, grey...): the patch of that colour
//   under the click, wherever its colour changes is its edge
export async function shapeAtPoint(src: string, xPct: number, yPct: number): Promise<ClickResult> {
  const m = await areaMap(src);
  const { W, H, px } = m;
  const cx = Math.round((xPct / 100) * (W - 1));
  const cy = Math.round((yPct / 100) * (H - 1));
  const seed = dominantColour(px, W, H, cx, cy);
  const whiteInside = seed && seed[0] > 225 && seed[1] > 225 && seed[2] > 225;
  if (!seed || whiteInside) {
    const r = outlineShapeAtPoint(m, cx, cy);
    if (r) return r;
  }
  return colourShapeAtPoint(m, cx, cy, seed) ?? (whiteInside ? null : outlineShapeAtPoint(m, cx, cy));
}

// The most common colour near the click, ignoring dark text and lines
function dominantColour(px: Uint8ClampedArray, W: number, H: number, cx: number, cy: number) {
  const R = Math.max(4, Math.round(Math.min(W, H) * 0.012));
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let y = Math.max(0, cy - R); y <= Math.min(H - 1, cy + R); y++)
    for (let x = Math.max(0, cx - R); x <= Math.min(W - 1, cx + R); x++) {
      const o = (y * W + x) * 4;
      const r = px[o], g = px[o + 1], b = px[o + 2];
      if ((r * 299 + g * 587 + b * 114) / 1000 < 70) continue; // text / lines
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const c = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      c.n++; c.r += r; c.g += g; c.b += b;
      counts.set(key, c);
    }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const c of counts.values()) if (!best || c.n > best.n) best = c;
  return best ? [best.r / best.n, best.g / best.n, best.b / best.n] : null;
}

function colourShapeAtPoint(m: AreaMap, cx: number, cy: number, seed: number[] | null): ClickResult {
  if (!seed) return null;
  const { W, H, px } = m;
  const total = W * H;
  for (const tol of [60, 40, 26]) {
    const near = (i: number) => {
      const o = i * 4;
      return (
        Math.abs(px[o] - seed[0]) <= tol &&
        Math.abs(px[o + 1] - seed[1]) <= tol &&
        Math.abs(px[o + 2] - seed[2]) <= tol
      );
    };
    // start from every matching pixel close to the click (so clicking on the
    // table's text still works)
    const seen = new Uint8Array(total);
    const stack: number[] = [];
    const R = Math.max(3, Math.round(Math.min(W, H) * 0.01));
    for (let y = Math.max(0, cy - R); y <= Math.min(H - 1, cy + R); y++)
      for (let x = Math.max(0, cx - R); x <= Math.min(W - 1, cx + R); x++) {
        const i = y * W + x;
        if (near(i)) { seen[i] = 1; stack.push(i); }
      }
    if (!stack.length) continue;
    let area = 0, minX = W, minY = H, maxX = 0, maxY = 0, edge = false, tooBig = false;
    const rowMin = new Int32Array(H).fill(W);
    const rowMax = new Int32Array(H).fill(-1);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % W;
      const y = (p - x) / W;
      area++;
      if (area > total * 0.06) { tooBig = true; break; }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x < rowMin[y]) rowMin[y] = x;
      if (x > rowMax[y]) rowMax[y] = x;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      if (x > 0 && !seen[p - 1] && near(p - 1)) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < W - 1 && !seen[p + 1] && near(p + 1)) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && !seen[p - W] && near(p - W)) { seen[p - W] = 1; stack.push(p - W); }
      if (y < H - 1 && !seen[p + W] && near(p + W)) { seen[p + W] = 1; stack.push(p + W); }
    }
    if (tooBig || edge) continue; // leaked into the background: be stricter
    if (area < total * 0.0004) return null;
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    // fill measured with the text holes closed (row by row)
    let solid = 0;
    for (let y = minY; y <= maxY; y++) if (rowMax[y] >= rowMin[y]) solid += rowMax[y] - rowMin[y] + 1;
    const fill = solid / (bw * bh);
    const aspect = bw / bh;
    const long = aspect > 1.6 || aspect < 0.625;
    const squareish = aspect > 0.8 && aspect < 1.25;
    const shape: Shape = long ? "rectangle" : fill < 0.88 ? "round" : squareish ? "square" : "rectangle";
    return {
      shape: {
        key: `k${minX}_${minY}`,
        x: ((minX + bw / 2) / W) * 100,
        y: ((minY + bh / 2) / H) * 100,
        w: (bw / W) * 100,
        h: (bh / H) * 100,
        shape,
        likelyTable: true,
        text: "",
      },
      chairs: 0,
      canvas: m.canvas,
    };
  }
  return null;
}

function outlineShapeAtPoint(m: AreaMap, cx0: number, cy0: number): ClickResult {
  const { W, H, label, areas } = m;
  const total = W * H;
  const cx = cx0;
  const cy = cy0;
  const ok = (id: number) => {
    if (id < 0) return false;
    const a = areas[id];
    // not a letter hole, not a dance floor / stage / room
    return !a.edge && a.area > total * 0.0004 && a.area < total * 0.05;
  };
  // The area right under the click; if that is a line, a letter or the hole
  // of a "0"/"8", look around the click and take the smallest proper area.
  let best = label[cy * W + cx];
  if (!ok(best)) {
    best = -1;
    for (let r = 2; r <= 40 && best === -1; r += 2) {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const x = Math.round(cx + Math.cos(a) * r);
        const y = Math.round(cy + Math.sin(a) * r);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const id = label[y * W + x];
        if (ok(id) && (best === -1 || areas[id].area < areas[best].area)) best = id;
      }
    }
  }
  if (best === -1) return null;
  const t = areas[best];
  const bw = t.maxX - t.minX + 1;
  const bh = t.maxY - t.minY + 1;
  const fill = t.area / (bw * bh);
  const aspect = bw / bh;
  const squareish = aspect > 0.8 && aspect < 1.25;
  const long = aspect > 1.6 || aspect < 0.625;
  const shape: Shape = long ? "rectangle" : fill < 0.86 ? "round" : squareish ? "square" : "rectangle";

  // Chairs: small closed areas whose middle is in a narrow band around the
  // table. Odd-sized bits (gaps between lines) are left out.
  const tcx = t.minX + bw / 2;
  const tcy = t.minY + bh / 2;
  const near: number[] = [];
  for (let i = 0; i < areas.length; i++) {
    if (i === best) continue;
    const a = areas[i];
    if (a.edge || a.area < 6 || a.area > t.area * 0.35) continue;
    const ax = a.sx / a.area;
    const ay = a.sy / a.area;
    const inside = Math.abs(ax - tcx) < bw / 2 && Math.abs(ay - tcy) < bh / 2;
    if (inside) continue;
    let d: number;
    if (shape === "round") {
      // distance from the circle's edge
      d = Math.hypot((ax - tcx) / (bw / 2), (ay - tcy) / (bh / 2)) - 1;
      d = d * (Math.min(bw, bh) / 2) / Math.min(bw, bh);
    } else {
      const dx = Math.max(0, Math.abs(ax - tcx) - bw / 2);
      const dy = Math.max(0, Math.abs(ay - tcy) - bh / 2);
      d = Math.hypot(dx, dy) / Math.min(bw, bh);
    }
    if (d > 0 && d < 0.6) near.push(a.area);
  }
  near.sort((a, b) => a - b);
  const typical = near.length ? near[Math.floor(near.length / 2)] : 0;
  const chairs = near.filter((a) => a >= typical * 0.45 && a <= typical * 2.2).length;

  return {
    shape: {
      key: `c${best}`,
      x: (tcx / W) * 100,
      y: (tcy / H) * 100,
      w: (bw / W) * 100,
      h: (bh / H) * 100,
      shape,
      likelyTable: true,
      text: "",
    },
    chairs,
    canvas: m.canvas,
  };
}
