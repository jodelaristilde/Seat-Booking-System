import { entryAngle } from "@/lib/entryArrow";

// The walking way from a door to a table on the floor plan, going AROUND the
// other tables (and the stage, bar...) instead of through them.
// Everything is in % of the plan (x of its width, y of its height).

export type Box = { x: number; y: number; w: number; h: number; round: boolean }; // centre + size, in %
export type Pt = { x: number; y: number };

type Opts = { aspect: number; cols?: number };

// Shortest way from one door to the target table. null when there is no way.
export function findWay(door: Pt, target: Box, obstacles: Box[], { aspect, cols = 120 }: Opts): Pt[] | null {
  // try with a little room around the tables, then squeezing between them,
  // then (tables drawn too big on the plan) with smaller tables
  for (const [scale, pad] of [[1, 1.2], [1, 0.5], [1, 0], [0.7, 0], [0.45, 0]]) {
    const obs = scale === 1 ? obstacles : obstacles.map((b) => ({ ...b, w: b.w * scale, h: b.h * scale }));
    const p = search(door, target, obs, aspect, cols, pad);
    if (p) return p;
  }
  return null;
}

// The door whose way is the shortest, and that way. The way first goes a few
// steps the way the door's arrow points (into the room), then on to the table.
export function bestWay(doors: (Pt & { dir?: number })[], target: Box, obstacles: Box[], opts: Opts): { door: Pt; path: Pt[] } | null {
  let best: { door: Pt; path: Pt[]; len: number } | null = null;
  for (const d of doors) {
    const ang = (entryAngle(d) * Math.PI) / 180;
    const L = 6; // % of the plan's width
    const step = {
      x: Math.min(99, Math.max(1, d.x + Math.cos(ang) * L)),
      y: Math.min(99, Math.max(1, d.y + Math.sin(ang) * L * opts.aspect)),
    };
    const fromStep = findWay(step, target, obstacles, opts);
    const path = fromStep ? [{ x: d.x, y: d.y }, ...fromStep] : findWay(d, target, obstacles, opts);
    if (!path) continue;
    const len = length(path, opts.aspect);
    if (!best || len < best.len) best = { door: d, path, len };
  }
  return best && { door: best.door, path: best.path };
}

export function length(p: Pt[], aspect = 1): number {
  let n = 0;
  for (let i = 1; i < p.length; i++) n += Math.hypot((p[i].x - p[i - 1].x) * aspect, p[i].y - p[i - 1].y);
  return n;
}

function search(door: Pt, target: Box, obstacles: Box[], aspect: number, cols: number, pad: number): Pt[] | null {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  // square cells on screen: rows follow the plan's shape
  const rows = Math.max(20, Math.min(400, Math.round(cols / a)));
  const cx = (i: number) => ((i + 0.5) * 100) / cols;
  const cy = (j: number) => ((j + 0.5) * 100) / rows;
  // pad is in % of the width; the same distance in % of the height is pad * aspect
  const inside = (b: Box, x: number, y: number, extra: number) => {
    const hw = b.w / 2 + extra;
    const hh = b.h / 2 + extra * a;
    if (b.round) {
      const dx = (x - b.x) / hw;
      const dy = (y - b.y) / hh;
      return dx * dx + dy * dy <= 1;
    }
    return Math.abs(x - b.x) <= hw && Math.abs(y - b.y) <= hh;
  };
  const N = cols * rows;
  const blocked = new Uint8Array(N);
  const goal = new Uint8Array(N);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = cx(i);
      const y = cy(j);
      const k = j * cols + i;
      if (inside(target, x, y, 0.6)) goal[k] = 1;
      else if (obstacles.some((b) => inside(b, x, y, pad))) blocked[k] = 1;
    }
  const clampI = (v: number) => Math.max(0, Math.min(cols - 1, v));
  const clampJ = (v: number) => Math.max(0, Math.min(rows - 1, v));
  const si = clampI(Math.floor((door.x / 100) * cols));
  const sj = clampJ(Math.floor((door.y / 100) * rows));
  // the door itself is always walkable (a table drawn right at the door)
  const r = 2;
  for (let j = sj - r; j <= sj + r; j++) for (let i = si - r; i <= si + r; i++) if (i >= 0 && j >= 0 && i < cols && j < rows) blocked[j * cols + i] = 0;

  // A* on the grid, 8 directions, no cutting corners
  const start = sj * cols + si;
  const g = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  // goal centre, for the estimate
  const gi = (target.x / 100) * cols;
  const gj = (target.y / 100) * rows;
  const h = (k: number) => {
    const dx = Math.abs((k % cols) - gi);
    const dy = Math.abs(Math.floor(k / cols) - gj);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const heap = new Heap();
  g[start] = 0;
  heap.push(start, h(start));
  let end = -1;
  while (heap.size) {
    const k = heap.pop();
    if (closed[k]) continue;
    closed[k] = 1;
    if (goal[k]) {
      end = k;
      break;
    }
    const i = k % cols;
    const j = (k - i) / cols;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
        const nk = nj * cols + ni;
        if (blocked[nk] || closed[nk]) continue;
        if (di && dj && (blocked[j * cols + ni] || blocked[nj * cols + i])) continue;
        const ng = g[k] + (di && dj ? Math.SQRT2 : 1);
        if (ng < g[nk]) {
          g[nk] = ng;
          from[nk] = k;
          heap.push(nk, ng + h(nk));
        }
      }
  }
  if (end < 0) return null;
  const cells: number[] = [];
  for (let k = end; k !== -1; k = from[k]) cells.push(k);
  cells.reverse();

  // straighten: keep a corner only where a straight line would hit something
  const clear = (k1: number, k2: number) => {
    let x0 = k1 % cols, y0 = Math.floor(k1 / cols);
    const x1 = k2 % cols, y1 = Math.floor(k2 / cols);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (blocked[y0 * cols + x0]) return false;
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err;
      const px = x0, py = y0;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
      // a diagonal step must not squeeze past a corner
      if (px !== x0 && py !== y0 && (blocked[py * cols + x0] || blocked[y0 * cols + px])) return false;
    }
  };
  const keep = [cells[0]];
  let at = 0;
  while (at < cells.length - 1) {
    let next = cells.length - 1;
    while (next > at + 1 && !clear(cells[at], cells[next])) next--;
    keep.push(cells[next]);
    at = next;
  }
  const pts = keep.map((k) => ({ x: cx(k % cols), y: cy(Math.floor(k / cols)) }));
  pts[0] = { x: door.x, y: door.y };
  return pts;
}

// a small binary heap (lowest score first)
class Heap {
  private k: number[] = [];
  private s: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, score: number) {
    const k = this.k, s = this.s;
    k.push(key);
    s.push(score);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (s[p] <= s[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [s[p], s[i]] = [s[i], s[p]];
      i = p;
    }
  }
  pop(): number {
    const k = this.k, s = this.s;
    const top = k[0];
    const lk = k.pop()!, ls = s.pop()!;
    if (k.length) {
      k[0] = lk;
      s[0] = ls;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && s[l] < s[m]) m = l;
        if (r < k.length && s[r] < s[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [s[m], s[i]] = [s[i], s[m]];
        i = m;
      }
    }
    return top;
  }
}
