// Writes table names onto the floor plan picture, so the picture itself
// shows "Table 1", "Head Table", etc. at each table.

export interface Stamp {
  name: string;
  x: number; // centre, % of picture width
  y: number; // centre, % of picture height
  w?: number; // width of this table, % of picture width (optional)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not open the floor plan picture"));
    img.src = src;
  });
}

// tableWidthPct: about how wide one table is, in % of the picture width
export async function stampNames(
  cleanSrc: string,
  stamps: Stamp[],
  tableWidthPct: number
): Promise<{ data: string; mimeType: string; size: number }> {
  const img = await loadImage(cleanSrc);
  // Keep big photos to a sensible size (the database stores the picture)
  const scale = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * scale);
  const H = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);


  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const s of stamps) {
    const text = s.name.trim();
    if (!text) continue;
    // Size the name to this table (its traced width when known)
    const tableW = (Math.max(3, s.w ?? tableWidthPct * 0.66) / 100) * W;
    const maxTextW = tableW * 0.9;
    const baseFont = Math.max(11, Math.round(tableW * 0.2));
    // Shrink long names so they fit inside the table
    let size = baseFont;
    ctx.font = `700 ${size}px Arial, Helvetica, sans-serif`;
    while (size > 8 && ctx.measureText(text).width > maxTextW) {
      size -= 1;
      ctx.font = `700 ${size}px Arial, Helvetica, sans-serif`;
    }
    const cx = (s.x / 100) * W;
    const cy = (s.y / 100) * H;
    const tw = ctx.measureText(text).width;
    const padX = size * 0.45;
    const padY = size * 0.3;
    const bw = tw + padX * 2;
    const bh = size + padY * 2;
    const r = bh / 2;

    // white pill with a dark outline, then the name
    ctx.beginPath();
    ctx.moveTo(cx - bw / 2 + r, cy - bh / 2);
    ctx.arcTo(cx + bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2, r);
    ctx.arcTo(cx + bw / 2, cy + bh / 2, cx - bw / 2, cy + bh / 2, r);
    ctx.arcTo(cx - bw / 2, cy + bh / 2, cx - bw / 2, cy - bh / 2, r);
    ctx.arcTo(cx - bw / 2, cy - bh / 2, cx + bw / 2, cy - bh / 2, r);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.08);
    ctx.strokeStyle = "#1f2937";
    ctx.stroke();
    ctx.fillStyle = "#111827";
    ctx.fillText(text, cx, cy + size * 0.04);
  }

  const isJpeg = /^data:image\/jpe?g/i.test(cleanSrc);
  const mimeType = isJpeg ? "image/jpeg" : "image/png";
  const data = canvas.toDataURL(mimeType, 0.92);
  const size = Math.round(((data.length - data.indexOf(",") - 1) * 3) / 4);
  return { data, mimeType, size };
}
