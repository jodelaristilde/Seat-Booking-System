// Cleans up an uploaded floor plan picture before it is saved:
// - makes small pictures bigger (and very large ones smaller)
// - stretches the contrast so lines are dark and paper is white
// - turns grey/speckled background into clean white
// - sharpens the lines

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file could not be opened as a picture"));
    img.src = src;
  });
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

function flattenLighting(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const k = Math.min(1, 160 / Math.max(W, H));
  const sw = Math.max(8, Math.round(W * k));
  const sh = Math.max(8, Math.round(H * k));
  const small = document.createElement("canvas");
  small.width = sw;
  small.height = sh;
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(ctx.canvas, 0, 0, sw, sh);
  // Paper brightness: the brightest value nearby (so dark lines don't count),
  // then smoothed so it changes gently across the page
  const shot = sctx.getImageData(0, 0, sw, sh);
  const sp = shot.data;
  const R = Math.max(2, Math.round(Math.max(sw, sh) / 25));
  const tmp = new Uint8ClampedArray(sp.length);
  const pass = (src: Uint8ClampedArray, dst: Uint8ClampedArray, dx: number, dy: number) => {
    for (let y = 0; y < sh; y++)
      for (let x = 0; x < sw; x++)
        for (let c = 0; c < 3; c++) {
          let m = 0;
          for (let k = -R; k <= R; k++) {
            const xx = Math.min(sw - 1, Math.max(0, x + k * dx));
            const yy = Math.min(sh - 1, Math.max(0, y + k * dy));
            const v = src[(yy * sw + xx) * 4 + c];
            if (v > m) m = v;
          }
          dst[(y * sw + x) * 4 + c] = m;
        }
  };
  pass(sp, tmp, 1, 0);
  pass(tmp, sp, 0, 1);
  for (let i = 3; i < sp.length; i += 4) sp[i] = 255;
  sctx.putImageData(shot, 0, 0);
  const soft = document.createElement("canvas");
  soft.width = sw;
  soft.height = sh;
  const softCtx = soft.getContext("2d")!;
  softCtx.filter = `blur(${R}px)`;
  softCtx.drawImage(small, 0, 0);
  sctx.clearRect(0, 0, sw, sh);
  sctx.drawImage(soft, 0, 0);
  const smooth = sctx.getImageData(0, 0, sw, sh).data;
  for (let i = 0; i < sp.length; i++) sp[i] = smooth[i];
  const lums: number[] = [];
  for (let i = 0; i < sw * sh; i++) {
    lums.push((sp[i * 4] * 299 + sp[i * 4 + 1] * 587 + sp[i * 4 + 2] * 114) / 1000);
  }
  lums.sort((a, b) => a - b);
  const p5 = lums[Math.floor(lums.length * 0.05)];
  const p95 = lums[Math.floor(lums.length * 0.95)];
  const median = lums[Math.floor(lums.length / 2)];
  // Even light already (a clean drawing or screenshot), or a dark/colour-filled
  // plan where this would wash out real colours: leave it alone.
  if (p95 - p5 < 25 || median < 120) return;

  const bg = document.createElement("canvas");
  bg.width = W;
  bg.height = H;
  const bctx = bg.getContext("2d", { willReadFrequently: true })!;
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(small, 0, 0, W, H);
  const b = bctx.getImageData(0, 0, W, H).data;
  const image = ctx.getImageData(0, 0, W, H);
  const px = image.data;
  for (let i = 0; i < W * H * 4; i += 4) {
    for (let c = 0; c < 3; c++) {
      const base = Math.max(40, b[i + c]);
      px[i + c] = clamp((px[i + c] * 255) / base);
    }
  }
  ctx.putImageData(image, 0, 0);
}

export async function enhancePicture(
  src: string
): Promise<{ data: string; mimeType: string; size: number; width: number; height: number }> {
  const img = await loadImage(src);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  // Aim for about 1800px on the long side: sharp on screens, light enough to store
  const scale = longest < 1800 ? Math.min(2.5, 1800 / longest) : Math.min(1, 2400 / longest);
  const W = Math.max(1, Math.round(img.naturalWidth * scale));
  const H = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, W, H);

  // Phone photos of paper have shadows and uneven light. Estimate the paper's
  // brightness everywhere (a very blurred, tiny copy) and divide it out.
  flattenLighting(ctx, W, H);

  // Blurred copy for sharpening (unsharp mask)
  const blur = document.createElement("canvas");
  blur.width = W;
  blur.height = H;
  const bctx = blur.getContext("2d", { willReadFrequently: true })!;
  bctx.filter = `blur(${Math.max(1, scale * 0.8).toFixed(1)}px)`;
  bctx.drawImage(canvas, 0, 0);

  const image = ctx.getImageData(0, 0, W, H);
  const px = image.data;
  const bl = bctx.getImageData(0, 0, W, H).data;
  const N = W * H;

  // Contrast: find the darkest 1% and lightest 1% and stretch between them
  const hist = new Uint32Array(256);
  for (let i = 0; i < N; i++) {
    const l = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000;
    hist[l | 0]++;
  }
  let lo = 0;
  let hi = 255;
  for (let acc = 0, i = 0; i < 256; i++) { acc += hist[i]; if (acc > N * 0.01) { lo = i; break; } }
  for (let acc = 0, i = 255; i >= 0; i--) { acc += hist[i]; if (acc > N * 0.01) { hi = i; break; } }
  if (hi - lo < 40) { lo = 0; hi = 255; }
  const k = 255 / (hi - lo);

  let plain = 0; // near-white or near-black pixels (a line drawing, not a photo)
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    for (let c = 0; c < 3; c++) {
      // sharpen, then stretch contrast
      const sharp = px[o + c] + 0.9 * (px[o + c] - bl[o + c]);
      px[o + c] = clamp((sharp - lo) * k);
    }
    const r = px[o], g = px[o + 1], b = px[o + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (r * 299 + g * 587 + b * 114) / 1000;
    // Grey, speckled paper -> clean white
    if (max - min < 40 && l > 175) {
      px[o] = px[o + 1] = px[o + 2] = 255;
    }
    if (l > 205 || l < 60) plain++;
    px[o + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  // Line drawings stay crisp as PNG; photos stay small as JPEG
  const isDrawing = plain / N > 0.85;
  const mimeType = isDrawing ? "image/png" : "image/jpeg";
  let data = canvas.toDataURL(mimeType, 0.9);
  let size = Math.round(((data.length - data.indexOf(",") - 1) * 3) / 4);
  if (size > 8 * 1024 * 1024) {
    data = canvas.toDataURL("image/jpeg", 0.85);
    size = Math.round(((data.length - data.indexOf(",") - 1) * 3) / 4);
    return { data, mimeType: "image/jpeg", size, width: W, height: H };
  }
  return { data, mimeType, size, width: W, height: H };
}
