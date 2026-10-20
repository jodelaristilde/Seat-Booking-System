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

const MAX_SIDE = 2000; // big venue plans have small tables: keep enough detail

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

  // Tables filled with a dark colour (navy, black) are "ink" themselves:
  // label solid ink blobs too, so they can be found as tables.
  const inkLabel = new Int32Array(W * H).fill(-1);
  let inkId = 0;
  for (let start = 0; start < W * H; start++) {
    if (!ink[start] || inkLabel[start] !== -1) continue;
    const r: Region = { area: 0, minX: W, minY: H, maxX: 0, maxY: 0, touchesEdge: false };
    let top = 0;
    stack[top++] = start;
    inkLabel[start] = inkId;
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
      if (x > 0 && ink[p - 1] && inkLabel[p - 1] === -1) { inkLabel[p - 1] = inkId; stack[top++] = p - 1; }
      if (x < W - 1 && ink[p + 1] && inkLabel[p + 1] === -1) { inkLabel[p + 1] = inkId; stack[top++] = p + 1; }
      if (y > 0 && ink[p - W] && inkLabel[p - W] === -1) { inkLabel[p - W] = inkId; stack[top++] = p - W; }
      if (y < H - 1 && ink[p + W] && inkLabel[p + W] === -1) { inkLabel[p + W] = inkId; stack[top++] = p + W; }
    }
    inkId++;
    // only solid blobs (a filled table), not lines, walls or letters
    const bw = r.maxX - r.minX + 1;
    const bh = r.maxY - r.minY + 1;
    if (r.area / (bw * bh) > 0.6 && r.area > W * H * 0.0015) regions.push(r);
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

type OcrWord = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };
type TesseractWorker = {
  recognize: (img: HTMLCanvasElement) => Promise<{ data: { text: string; confidence?: number; words?: OcrWord[] } }>;
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
      const plain = cleanForReading(crop, s.shape === "round");
      let text = "";
      // 1) the cleaned crop as a line of text, 2) as one word,
      // 3) numbers only (a lone "8" or "21" is often missed otherwise)
      const tries: [HTMLCanvasElement, Record<string, string>][] = [
        [plain, { tessedit_pageseg_mode: "7", tessedit_char_whitelist: "" }],
        [plain, { tessedit_pageseg_mode: "8", tessedit_char_whitelist: "" }],
        [plain, { tessedit_pageseg_mode: "8", tessedit_char_whitelist: "0123456789" }],
        [crop, { tessedit_pageseg_mode: "6", tessedit_char_whitelist: "" }],
      ];
      for (const [img, params] of tries) {
        try {
          await worker.setParameters(params);
          const r = await worker.recognize(img);
          const raw = r.data.text
            .replace(/[^A-Za-z0-9 #&'\-]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          text = acceptReading(raw, r.data.confidence ?? 0);
        } catch {
          text = "";
        }
        if (text) break;
      }
      out.push({ ...s, text });
      onProgress?.(i + 1, shapes.length);
    }
    return out;
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}

// Make the writing black on white: works for white, grey, coloured and dark
// tables (white numbers on a navy or black table are flipped).
function cleanForReading(src: HTMLCanvasElement, round: boolean): HTMLCanvasElement {
  const W = src.width;
  const H = src.height;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const o = out.getContext("2d", { willReadFrequently: true })!;
  o.drawImage(src, 0, 0);
  const img = o.getImageData(0, 0, W, H);
  const d = img.data;
  const lum = new Uint8Array(W * H);
  const hist = new Array(256).fill(0);
  // the 10px white margin around the crop is not part of the table: leave it out
  const inside = (x: number, y: number) => x >= 12 && y >= 12 && x < W - 12 && y < H - 12;
  let count = 0;
  for (let i = 0; i < W * H; i++) {
    const l = Math.round((d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000);
    lum[i] = l;
    if (inside(i % W, Math.floor(i / W))) { hist[l]++; count++; }
  }
  // Otsu: the split that best separates writing from the table colour
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, cut = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = count - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; cut = t; }
  }
  // The table colour is what fills the middle area; writing is the other side
  let dark = 0, n = 0;
  const x0 = Math.round(W * (round ? 0.25 : 0.15)), x1 = Math.round(W * (round ? 0.75 : 0.85));
  const y0 = Math.round(H * 0.15), y1 = Math.round(H * 0.85);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      n++;
      if (lum[y * W + x] <= cut) dark++;
    }
  const invert = n > 0 && dark / n > 0.5;
  const ink = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    let on = inside(i % W, Math.floor(i / W)) && lum[i] <= cut;
    if (invert) on = inside(i % W, Math.floor(i / W)) && lum[i] > cut;
    ink[i] = on ? 1 : 0;
  }
  // Anything touching the edge of the crop is the table's border or the
  // paper around it, not the writing: clear it
  const stack: number[] = [];
  for (let x = 0; x < W; x++) for (const y of [12, H - 13]) if (y >= 0 && y < H && ink[y * W + x]) stack.push(y * W + x);
  for (let y = 0; y < H; y++) for (const x of [12, W - 13]) if (x >= 0 && x < W && ink[y * W + x]) stack.push(y * W + x);
  while (stack.length) {
    const p = stack.pop()!;
    if (!ink[p]) continue;
    ink[p] = 0;
    const x = p % W;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (p >= W) stack.push(p - W);
    if (p < W * (H - 1)) stack.push(p + W);
  }
  for (let i = 0; i < W * H; i++) {
    const v = ink[i] ? 0 : 255;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  o.putImageData(img, 0, 0);
  return out;
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
  // wide enough that a click right on the table number still sees the table colour
  const R = Math.max(6, Math.round(Math.min(W, H) * 0.03));
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  // mostly dark around the click = a dark-coloured table: use its colour
  let darkN = 0, allN = 0;
  for (let y = Math.max(0, cy - R); y <= Math.min(H - 1, cy + R); y++)
    for (let x = Math.max(0, cx - R); x <= Math.min(W - 1, cx + R); x++) {
      const o = (y * W + x) * 4;
      allN++;
      if ((px[o] * 299 + px[o + 1] * 587 + px[o + 2] * 114) / 1000 < 70) darkN++;
    }
  const darkArea = allN > 0 && darkN / allN > 0.5;
  for (let y = Math.max(0, cy - R); y <= Math.min(H - 1, cy + R); y++)
    for (let x = Math.max(0, cx - R); x <= Math.min(W - 1, cx + R); x++) {
      const o = (y * W + x) * 4;
      const r = px[o], g = px[o + 1], b = px[o + 2];
      if ((r * 299 + g * 587 + b * 114) / 1000 < 70 && !darkArea) continue; // text / lines
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

// ---- Reading the labels written on the floor plan ("Head Table", "Bar"…) ----
// Used when the picture is stretched: the words are drawn again on top, so
// they are never stretched. Positions are in % of the picture.
export type PictureLabel = { text: string; x: number; y: number; w: number; h: number; bg: string; fg: string };

type TessLine = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };

export async function readPictureLabels(src: string): Promise<PictureLabel[]> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Could not open the picture"));
    i.src = src;
  });
  const W = img.naturalWidth, H = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, W, H).data;
  const at = (x: number, y: number) => {
    const i = (Math.min(H - 1, Math.max(0, Math.round(y))) * W + Math.min(W - 1, Math.max(0, Math.round(x)))) * 4;
    return [px[i], px[i + 1], px[i + 2]];
  };
  const hex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  const T = await loadTesseract();
  const worker = await T.createWorker("eng");
  try {
    // sparse text: find words anywhere on the plan
    await worker.setParameters({ tessedit_pageseg_mode: "11" });
    const r = (await worker.recognize(canvas)) as unknown as { data: { lines?: TessLine[] } };
    const out: PictureLabel[] = [];
    for (const l of r.data.lines ?? []) {
      const text = l.text.replace(/[^A-Za-z0-9 #&'.\-]/g, " ").replace(/\s+/g, " ").trim();
      const letters = text.replace(/[^A-Za-z]/g, "").length;
      if (letters < 2 || l.confidence < 70) continue;
      const { x0, y0, x1, y1 } = l.bbox;
      const bw = x1 - x0, bh = y1 - y0;
      if (bw < 6 || bh < 5 || bh > H * 0.12) continue;
      // background: the most common light colour just around the words
      const ring: number[][] = [];
      for (let k = 0; k <= 10; k++) {
        const x = x0 + (bw * k) / 10;
        ring.push(at(x, y0 - 3), at(x, y1 + 3));
      }
      for (let k = 0; k <= 4; k++) {
        const y = y0 + (bh * k) / 4;
        ring.push(at(x0 - 3, y), at(x1 + 3, y));
      }
      ring.sort((a, b) => b[0] + b[1] + b[2] - (a[0] + a[1] + a[2]));
      const top = ring.slice(0, Math.max(1, Math.ceil(ring.length / 2)));
      const bg = [0, 1, 2].map((c) => top.reduce((s, p) => s + p[c], 0) / top.length);
      // text colour: the darkest pixels inside the box
      const inside: number[][] = [];
      for (let yy = y0; yy < y1; yy += Math.max(1, bh / 12))
        for (let xx = x0; xx < x1; xx += Math.max(1, bw / 40)) inside.push(at(xx, yy));
      inside.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
      const dark = inside.slice(0, Math.max(1, Math.ceil(inside.length / 10)));
      const fg = [0, 1, 2].map((c) => dark.reduce((s, p) => s + p[c], 0) / dark.length);
      out.push({
        text,
        x: ((x0 + x1) / 2 / W) * 100,
        y: ((y0 + y1) / 2 / H) * 100,
        w: (bw / W) * 100,
        h: (bh / H) * 100,
        bg: hex(bg),
        fg: hex(fg),
      });
    }
    return out;
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}

// A short fingerprint of a picture, so saved labels belong to the right one
export function pictureSignature(src: string): string {
  let h = 0;
  const step = Math.max(1, Math.floor(src.length / 4000));
  for (let i = 0; i < src.length; i += step) h = (h * 31 + src.charCodeAt(i)) | 0;
  return `${src.length}-${h >>> 0}`;
}


// ---- Find tables by their printed numbers ----
// Venue plans often draw small round tables with chairs all around, so the
// table outline is broken up and hard to see. The number in the middle is easy
// to read: read every number on the plan, and put a table on each one.
// Numbers that are part of a sentence ("350 seats", "72 inches") are skipped.
export async function findNumberedTables(
  canvas: HTMLCanvasElement,
  shapes: DetectedShape[],
  onProgress?: (msg: string) => void
): Promise<DetectedShape[] | null> {
  const W = canvas.width;
  const H = canvas.height;
  onProgress?.("Looking for table numbers on the plan...");
  const tokens = numberLikeMarks(canvas);
  if (tokens.length < 2) return null;
  const T = await loadTesseract();
  const worker = await T.createWorker("eng");
  const nums: {
    t: string; confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number; region: { rx0: number; ry0: number; rx1: number; ry1: number } };
  }[] = [];
  try {
    for (let i = 0; i < tokens.length; i++) {
      if (i % 10 === 0) onProgress?.(`Reading table numbers... ${i} of ${tokens.length}`);
      const tk = tokens[i];
      const h = tk.y1 - tk.y0;
      const m = Math.round(h * 0.35);
      const sx = Math.max(0, tk.x0 - m), sy = Math.max(0, tk.y0 - m);
      const sw = Math.min(W - sx, tk.x1 - tk.x0 + 2 * m), sh = Math.min(H - sy, h + 2 * m);
      const k = Math.min(6, Math.max(1, 48 / h));
      const crop = document.createElement("canvas");
      crop.width = Math.round(sw * k) + 24;
      crop.height = Math.round(sh * k) + 24;
      const cx = crop.getContext("2d")!;
      cx.fillStyle = "#fff";
      cx.fillRect(0, 0, crop.width, crop.height);
      cx.drawImage(canvas, sx, sy, sw, sh, 12, 12, sw * k, sh * k);
      // only the marks of this number (chairs or lines nearby are rubbed out)
      const keep = tk.pixels;
      const img = cx.getImageData(0, 0, crop.width, crop.height);
      for (let y = 0; y < crop.height; y++)
        for (let x = 0; x < crop.width; x++) {
          const ox = Math.floor(sx + (x - 12) / k), oy = Math.floor(sy + (y - 12) / k);
          const o = (y * crop.width + x) * 4;
          const on = ox >= 0 && oy >= 0 && ox < W && oy < H && keep.has(oy * W + ox);
          const v = on ? 0 : 255;
          img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
        }
      cx.putImageData(img, 0, 0);
      let best = { t: "", c: 0 };
      for (const params of [
        { tessedit_pageseg_mode: "7", tessedit_char_whitelist: "" },
        { tessedit_pageseg_mode: "8", tessedit_char_whitelist: "0123456789" },
      ]) {
        try {
          await worker.setParameters(params);
          const r = await worker.recognize(crop);
          const t = r.data.text.replace(/\s+/g, "");
          const c = r.data.confidence ?? 0;
          // letters (a word) without the digits-only filter = not a table number
          if (params.tessedit_char_whitelist === "" && /[A-Za-z]{2,}/.test(t) && c > 60) { best = { t: "", c: -1 }; break; }
          if (/^\d{1,3}$/.test(t) && c > best.c) best = { t, c };
          if (best.c >= 75) break;
        } catch {
          /* skip */
        }
      }
      if (best.t && Number(best.t) > 0 && best.c >= 55) nums.push({ t: best.t, confidence: best.c, bbox: tk });
    }
  } finally {
    await worker.terminate().catch(() => undefined);
  }
  if (nums.length < 2) return null;

  // same number twice: keep the surer reading
  const byNum = new Map<number, (typeof nums)[number]>();
  for (const n of nums) {
    const v = Number(n.t.replace("#", ""));
    const prev = byNum.get(v);
    if (!prev || n.confidence > prev.confidence) byNum.set(v, n);
  }
  // numbers should be about the same size: drop odd ones (a title, a footnote)
  const heights = [...byNum.values()].map((n) => n.bbox.y1 - n.bbox.y0).sort((a, b) => a - b);
  const medH = heights[Math.floor(heights.length / 2)];
  const list = [...byNum.entries()].filter(([, n]) => {
    const h = n.bbox.y1 - n.bbox.y0;
    return h > medH * 0.5 && h < medH * 2;
  });
  if (list.length < 2) return null;

  // each number's closed-in area is its table (position and size)
  const tables: DetectedShape[] = list.map(([v, n]) => {
    const r = n.bbox.region;
    const bw = r.rx1 - r.rx0 + 1, bh = r.ry1 - r.ry0 + 1;
    const aspect = bw / bh;
    return {
      key: `n${v}`,
      x: ((r.rx0 + bw / 2) / W) * 100,
      y: ((r.ry0 + bh / 2) / H) * 100,
      w: (bw / W) * 100,
      h: (bh / H) * 100,
      shape: aspect > 1.5 || aspect < 0.67 ? "rectangle" : "round",
      likelyTable: true,
      text: String(v),
    } as DetectedShape;
  });
  const used = new Set<string>();
  // other shapes stay available (grey) in case a table has no number
  // (likelyTable kept: the caller reads those one by one, e.g. white numbers on dark tables)
  const rest = shapes
    .filter((sh) => !used.has(sh.key))
    .filter((sh) => !tables.some((t) => Math.abs(t.x - sh.x) < t.w / 2 && Math.abs(t.y - sh.y) < t.h / 2))
    .map((sh) => ({ ...sh, text: "" }));
  return [...tables, ...rest];
}


// Small marks shaped like digits, grouped side by side into 1-3 digit numbers.
// Marks in a row of 4 or more are words or sentences ("350 seats"), so skipped.
function numberLikeMarks(canvas: HTMLCanvasElement) {
  const W = canvas.width;
  const H = canvas.height;
  const d = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, W, H).data;
  const ink = new Uint8Array(W * H);
  // ink = dark writing; line = any drawn line, even thin grey ones (they close a table)
  const line = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const l = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
    ink[i] = l < 150 ? 1 : 0;
    line[i] = l < 200 ? 1 : 0;
  }
  // thicken lines by 1 pixel so small gaps in a table outline (where chairs are
  // drawn) close up
  {
    const thin = line.slice();
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (thin[i]) continue;
        if (thin[i - 1] || thin[i + 1] || thin[i - W] || thin[i + W] || thin[i - W - 1] || thin[i - W + 1] || thin[i + W - 1] || thin[i + W + 1]) line[i] = 1;
      }
  }
  const lab = new Int32Array(W * H).fill(-1);
  type Comp = { x0: number; y0: number; x1: number; y1: number; n: number; px: number[] };
  const comps: Comp[] = [];
  const st = new Int32Array(W * H);
  for (let s0 = 0; s0 < W * H; s0++) {
    if (!ink[s0] || lab[s0] !== -1) continue;
    const c: Comp = { x0: W, y0: H, x1: 0, y1: 0, n: 0, px: [] };
    let top = 0;
    st[top++] = s0;
    lab[s0] = comps.length;
    let big = false;
    while (top) {
      const p = st[--top];
      const x = p % W, y = (p - x) / W;
      c.n++;
      if (c.n < 6000) c.px.push(p); else big = true;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (const q of [p - 1, p + 1, p - W, p + W]) {
        if (q < 0 || q >= W * H) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === W - 1)) continue;
        if (ink[q] && lab[q] === -1) { lab[q] = comps.length; st[top++] = q; }
      }
    }
    comps.push(big ? { ...c, px: [] } : c);
  }
  // digit-sized marks: not tiny dots, not lines, not big shapes
  const minH = Math.max(6, H * 0.006), maxH = H * 0.06;
  const glyphs = comps.filter((c) => {
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
    const fill = c.n / (w * h);
    return h >= minH && h <= maxH && w <= h * 1.1 && w >= h * 0.12 && fill > 0.12 && fill < 0.85 && c.px.length;
  });
  glyphs.sort((a, b) => a.x0 - b.x0);
  const used = new Set<Comp>();
  const tokens: {
    x0: number; y0: number; x1: number; y1: number; pixels: Set<number>;
    region: { rx0: number; ry0: number; rx1: number; ry1: number };
  }[] = [];
  for (const g of glyphs) {
    if (used.has(g)) continue;
    const row = [g];
    used.add(g);
    let last = g;
    for (;;) {
      const h = last.y1 - last.y0 + 1;
      const next = glyphs.find(
        (o) =>
          !used.has(o) &&
          o.x0 > last.x0 &&
          o.x0 - last.x1 < h * 0.7 &&
          Math.abs(o.y1 - o.y0 + 1 - h) < h * 0.3 &&
          Math.abs((o.y0 + o.y1) / 2 - (last.y0 + last.y1) / 2) < h * 0.3
      );
      if (!next) break;
      row.push(next);
      used.add(next);
      last = next;
    }
    if (row.length > 3) continue;
    // A table number sits in the middle of the table: fill outward from it
    // until lines stop the fill. It must be closed in, small, and centred on the
    // number (a footnote or a bit of a chair drawing is not).
    const h0 = g.y1 - g.y0 + 1;
    const tx0 = row[0].x0, tx1 = row[row.length - 1].x1;
    const ty0 = Math.min(...row.map((r) => r.y0)), ty1 = Math.max(...row.map((r) => r.y1));
    const inRow = new Set(row.flatMap((r) => r.px));
    const limit = Math.round(h0 * 20);
    const lim2 = limit * limit;
    const seen = new Set<number>();
    const q: number[] = [];
    const cx0 = Math.round((tx0 + tx1) / 2), cy0 = Math.round((ty0 + ty1) / 2);
    for (let y = ty0 - 4; y <= ty1 + 4; y++)
      for (let x = tx0 - 4; x <= tx1 + 4; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const p0 = y * W + x;
        if (!line[p0] || inRow.has(p0)) { seen.add(p0); q.push(p0); }
      }
    let leak = false;
    let rx0 = W, ry0 = H, rx1 = 0, ry1 = 0;
    while (q.length) {
      const p0 = q.pop()!;
      const x = p0 % W, y = (p0 - x) / W;
      if (x < rx0) rx0 = x; if (x > rx1) rx1 = x;
      if (y < ry0) ry0 = y; if (y > ry1) ry1 = y;
      if (seen.size > lim2 || rx1 - rx0 > limit || ry1 - ry0 > limit) { leak = true; break; }
      for (const n of [p0 - 1, p0 + 1, p0 - W, p0 + W]) {
        if (n < 0 || n >= W * H || seen.has(n)) continue;
        if ((n === p0 - 1 && x === 0) || (n === p0 + 1 && x === W - 1)) continue;
        if (!line[n] || inRow.has(n)) { seen.add(n); q.push(n); }
      }
    }
    if (leak) continue;
    const rw = rx1 - rx0 + 1, rh = ry1 - ry0 + 1;
    // roomy enough for the number, roughly as wide as tall, number in the middle
    if (rw < (tx1 - tx0) * 1.3 || rh < h0 * 1.6) continue;
    if (rw / rh > 2.2 || rh / rw > 2.2) continue;
    if (Math.abs((rx0 + rx1) / 2 - cx0) > rw * 0.22 || Math.abs((ry0 + ry1) / 2 - cy0) > rh * 0.22) continue;
    const region = { rx0, ry0, rx1, ry1 };
    const t = {
      x0: Math.min(...row.map((r) => r.x0)),
      y0: Math.min(...row.map((r) => r.y0)),
      x1: Math.max(...row.map((r) => r.x1)),
      y1: Math.max(...row.map((r) => r.y1)),
      pixels: new Set(row.flatMap((r) => r.px)),
      region,
    };
    tokens.push(t);
  }
  return tokens.slice(0, 400);
}
