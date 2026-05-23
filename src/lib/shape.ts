// Turns a theme keyword into a binary silhouette mask, using free services
// (no API key): Pollinations text-to-image first, Iconify icons as fallback.

export const SAMPLE = 600; // px of the offscreen silhouette buffer

export interface Silhouette {
  /** SAMPLE x SAMPLE grayscale-derived "is dark pixel" buffer */
  dark: Uint8Array;
  source: 'ai' | 'icon';
}

function loadImage(src: string, timeoutMs: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => {
      img.src = '';
      reject(new Error('timed out'));
    }, timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('failed to load image'));
    };
    img.src = src;
  });
}

function pollinationsUrl(keyword: string, seed: number): string {
  const prompt =
    `minimalist solid pure black silhouette of a single ${keyword}, ` +
    `centered, large, filling most of the frame, plain pure white background, ` +
    `extreme high contrast, flat 2D, no text, no shadow, no gradient, simple bold shape`;
  return (
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${SAMPLE}&height=${SAMPLE}&nologo=true&model=flux&seed=${seed}`
  );
}

/** Iconify lookup: only accept icons whose slug actually mentions the
 *  search term, so an off-theme icon never leaks into the book. */
async function iconifyUrl(keyword: string): Promise<string | null> {
  const q = keyword.trim();
  if (!q) return null;
  const wantWords = q
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  try {
    const res = await fetch(
      `https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=24`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { icons?: string[] };
    const icons = data.icons ?? [];
    const match = icons.find((n) => {
      const slug = (n.split(':')[1] ?? '').toLowerCase();
      return wantWords.some((w) => slug.includes(w));
    });
    if (!match || !match.includes(':')) return null;
    const [prefix, icon] = match.split(':');
    return `https://api.iconify.design/${prefix}/${icon}.svg?height=${SAMPLE}&color=%23000000`;
  } catch {
    return null;
  }
}

/** Draw an image "contained" and centered on a white SAMPLE square. */
function rasterize(img: HTMLImageElement): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SAMPLE, SAMPLE);

  const iw = img.naturalWidth || SAMPLE;
  const ih = img.naturalHeight || SAMPLE;
  const pad = SAMPLE * 0.06;
  const scale = Math.min((SAMPLE - pad * 2) / iw, (SAMPLE - pad * 2) / ih);
  const w = iw * scale;
  const h = ih * scale;
  ctx.drawImage(img, (SAMPLE - w) / 2, (SAMPLE - h) / 2, w, h);

  const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
  const dark = new Uint8Array(SAMPLE * SAMPLE);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    dark[p] = lum < 145 ? 1 : 0;
  }
  return dark;
}

export interface ShapeOpts {
  skipAI?: boolean;
  /** Override what iconify searches for (use the clean base subject). */
  iconSearch?: string;
}

export async function fetchSilhouette(
  keyword: string,
  seed: number,
  opts: ShapeOpts = {},
): Promise<Silhouette> {
  // Primary: free AI image generation. Skip entirely when the caller has
  // already given up on AI (final fallback round in book.ts).
  if (!opts.skipAI) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const img = await loadImage(
          pollinationsUrl(keyword, seed + attempt * 1009),
          20000,
        );
        const dark = rasterize(img);
        const filled = dark.reduce((a, b) => a + b, 0) / dark.length;
        // Narrower band -> all shapes carry similar maze complexity.
        if (filled > 0.18 && filled < 0.55) return { dark, source: 'ai' };
      } catch {
        await new Promise<void>((r) => setTimeout(r, 600));
      }
    }
  }

  // Fallback: free icon library, but only if its slug actually matches.
  try {
    const url = await iconifyUrl(opts.iconSearch ?? keyword);
    if (url) {
      const img = await loadImage(url, 12000);
      return { dark: rasterize(img), source: 'icon' };
    }
  } catch {
    /* fall through */
  }

  // Last-resort built-in geometric shape — guarantees a reel slot always
  // fills, AND varies by seed so a heavily-throttled batch still gets
  // five different silhouettes instead of five identical discs.
  return defaultSilhouette(seed);
}

function defaultSilhouette(seed: number): Silhouette {
  const cv = document.createElement('canvas');
  cv.width = SAMPLE;
  cv.height = SAMPLE;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SAMPLE, SAMPLE);
  ctx.fillStyle = '#000000';
  const idx = ((seed >>> 0) % FALLBACK_SHAPES.length + FALLBACK_SHAPES.length) % FALLBACK_SHAPES.length;
  FALLBACK_SHAPES[idx](ctx, SAMPLE);
  const data = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
  const dark = new Uint8Array(SAMPLE * SAMPLE);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i] < 128) dark[p] = 1;
  }
  return { dark, source: 'icon' };
}

type ShapeDrawer = (ctx: CanvasRenderingContext2D, S: number) => void;

const FALLBACK_SHAPES: ShapeDrawer[] = [
  // 0: disc
  (ctx, S) => {
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.42, 0, Math.PI * 2);
    ctx.fill();
  },
  // 1: rounded square
  (ctx, S) => roundedRect(ctx, S * 0.16, S * 0.16, S * 0.68, S * 0.68, S * 0.12),
  // 2: heart
  (ctx, S) => drawHeart(ctx, S / 2, S * 0.55, S * 0.42),
  // 3: 5-point star
  (ctx, S) => drawStar(ctx, S / 2, S / 2, S * 0.46, 5, 0.42),
  // 4: hexagon
  (ctx, S) => drawPolygon(ctx, S / 2, S / 2, S * 0.44, 6, 0),
  // 5: diamond (rotated square)
  (ctx, S) => drawPolygon(ctx, S / 2, S / 2, S * 0.44, 4, Math.PI / 4),
  // 6: plus / cross
  (ctx, S) => drawCross(ctx, S / 2, S / 2, S * 0.42, S * 0.18),
  // 7: cloud (overlapping bumps)
  (ctx, S) => drawCloud(ctx, S / 2, S / 2, S * 0.4),
  // 8: triangle
  (ctx, S) => drawPolygon(ctx, S / 2, S * 0.56, S * 0.46, 3, 0),
  // 9: oval / egg
  (ctx, S) => {
    ctx.beginPath();
    ctx.ellipse(S / 2, S / 2, S * 0.36, S * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  // 10: 6-point star
  (ctx, S) => drawStar(ctx, S / 2, S / 2, S * 0.46, 6, 0.45),
  // 11: arrow (right-pointing chevron)
  (ctx, S) => drawArrow(ctx, S / 2, S / 2, S * 0.46),
];

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  n: number,
  rotate: number,
) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + rotate + (i * Math.PI * 2) / n;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  points: number,
  innerRatio: number,
) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const rad = i % 2 === 0 ? r : r * innerRatio;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function drawHeart(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
) {
  ctx.beginPath();
  const top = cy - r * 0.6;
  ctx.moveTo(cx, top + r * 0.3);
  ctx.bezierCurveTo(cx - r * 1.05, top - r * 0.45, cx - r * 1.25, top + r * 0.65, cx, cy + r * 0.85);
  ctx.bezierCurveTo(cx + r * 1.25, top + r * 0.65, cx + r * 1.05, top - r * 0.45, cx, top + r * 0.3);
  ctx.closePath();
  ctx.fill();
}

function drawCross(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  arm: number,
  thick: number,
) {
  ctx.beginPath();
  ctx.rect(cx - thick, cy - arm, thick * 2, arm * 2);
  ctx.rect(cx - arm, cy - thick, arm * 2, thick * 2);
  ctx.fill();
}

function drawCloud(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
) {
  ctx.beginPath();
  ctx.arc(cx - r * 0.55, cy + r * 0.15, r * 0.5, 0, Math.PI * 2);
  ctx.arc(cx, cy - r * 0.2, r * 0.6, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.55, cy + r * 0.15, r * 0.5, 0, Math.PI * 2);
  ctx.arc(cx - r * 0.2, cy + r * 0.35, r * 0.5, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.2, cy + r * 0.35, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
) {
  ctx.beginPath();
  // body + arrowhead
  ctx.moveTo(cx - r, cy - r * 0.3);
  ctx.lineTo(cx + r * 0.2, cy - r * 0.3);
  ctx.lineTo(cx + r * 0.2, cy - r * 0.7);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx + r * 0.2, cy + r * 0.7);
  ctx.lineTo(cx + r * 0.2, cy + r * 0.3);
  ctx.lineTo(cx - r, cy + r * 0.3);
  ctx.closePath();
  ctx.fill();
}

/** Sample the silhouette into a cols x rows boolean grid (row-major). */
export function maskGrid(
  sil: Silhouette,
  cols: number,
  rows: number,
): boolean[] {
  const cw = SAMPLE / cols;
  const ch = SAMPLE / rows;
  const inside = new Array<boolean>(cols * rows).fill(false);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor(c * cw);
      const y0 = Math.floor(r * ch);
      const x1 = Math.floor((c + 1) * cw);
      const y1 = Math.floor((r + 1) * ch);
      let total = 0;
      let dark = 0;
      const stepX = Math.max(1, Math.floor((x1 - x0) / 5));
      const stepY = Math.max(1, Math.floor((y1 - y0) / 5));
      for (let y = y0; y < y1; y += stepY) {
        for (let x = x0; x < x1; x += stepX) {
          total++;
          if (sil.dark[y * SAMPLE + x]) dark++;
        }
      }
      inside[r * cols + c] = total > 0 && dark / total >= 0.45;
    }
  }
  return inside;
}
