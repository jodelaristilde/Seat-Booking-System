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
  recognize: (img: HTMLCanvasElement) => Promise<{ data: { text: string } }>;
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
        text = r.data.text
          .replace(/[^A-Za-z0-9 #&'\-]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        // Throw away single stray letters the reader sometimes "sees"
        if (/^[A-Za-z]$/.test(text)) text = "";
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
