// 9:16 reel renderer. Longer 12-second timeline with generous think-time,
// animated trail, bobbing title, confetti at the goal, and friendly
// fallback markers so a missed AI fetch still looks intentional.

import { hasWall, solvePath, type Maze } from './maze';
import type { Markers, MarkerImg } from './markers';
import type { Palette } from './palettes';

export interface Scene {
  width: number;
  height: number;
  maze: Maze;
  markers: Markers;
  palette: Palette;
  banner: string;
  title: string;
  cta: string;
  handle: string;
  duration: number;
  solutionPath: number[];
  // bookkeeping for confetti seeding
  seedSalt: number;
}

const MARGIN_CELLS = 2;

export function buildScene(
  width: number,
  height: number,
  maze: Maze,
  markers: Markers,
  palette: Palette,
  banner: string,
  title: string,
  cta: string,
  handle: string,
  duration: number,
  seedSalt = 1,
): Scene {
  return {
    width,
    height,
    maze,
    markers,
    palette,
    banner,
    title,
    cta,
    handle,
    duration,
    solutionPath: solvePath(maze),
    seedSalt,
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function cellCenter(maze: Maze, idx: number, cell: number) {
  const r = Math.floor(idx / maze.cols);
  const c = idx % maze.cols;
  return {
    x: (c - maze.bbox.minC + MARGIN_CELLS + 0.5) * cell,
    y: (r - maze.bbox.minR + MARGIN_CELLS + 0.5) * cell,
  };
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  t: number,
): void {
  const { width, height, maze, markers, palette, banner, title, cta, handle, solutionPath } = scene;

  // animated background — subtle hue drift to feel alive
  const drift = Math.sin(t * 0.6) * 30;
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, palette.bg);
  bg.addColorStop(0.5, mix(palette.bg, palette.bgEnd, 0.5 + drift * 0.002));
  bg.addColorStop(1, palette.bgEnd);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // subtle vignette
  const vg = ctx.createRadialGradient(width / 2, height / 2, height * 0.35, width / 2, height / 2, height * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, width, height);

  // layout — bigger maze area, tighter top/bottom regions
  const sidePad = 40;
  const mazeTop = 470;
  const mazeBottom = height - 260;
  const mazeAreaH = mazeBottom - mazeTop;

  const spanC = maze.bbox.maxC - maze.bbox.minC + 1 + 2 * MARGIN_CELLS;
  const spanR = maze.bbox.maxR - maze.bbox.minR + 1 + 2 * MARGIN_CELLS;
  const cell = Math.min((width - sidePad * 2) / spanC, mazeAreaH / spanR);
  const mw = spanC * cell;
  const mh = spanR * cell;
  const mx = (width - mw) / 2;
  const my = mazeTop + (mazeAreaH - mh) / 2;

  // ---- 15 s timeline with explicit 3-2-1 countdown ----
  const bannerEnd = 0.5;
  const titleStart = 0.5;
  const titleEnd = 1.2;
  const mazeStart = 1.0;
  const mazeEnd = 1.8;
  const countdownStart = 8.5;  // 3-2-1 over the next 3 s (end of think time)
  const countdownEnd = 11.5;
  const walkStart = 11.5;
  const walkEnd = 13.7;        // ~2.2 s walk reveal
  const ctaStart = 13.8;
  const ctaEnd = 14.4;

  // banner
  const bannerP = clamp01(t / bannerEnd);
  if (bannerP > 0) {
    drawBanner(ctx, banner, width / 2, 150, bannerP, palette);
  }

  // main title with gentle bob during think time
  const titleP = clamp01((t - titleStart) / (titleEnd - titleStart));
  if (titleP > 0) {
    const fadeOut = clamp01(1 - (t - countdownStart) / 0.5);
    const bob = t > mazeEnd && t < countdownStart ? Math.sin((t - mazeEnd) * 2.4) * 6 : 0;
    drawTitle(ctx, title, width / 2, 320 + bob, titleP * fadeOut, palette);
  }

  // maze with scale-in pop
  const mazeP = clamp01((t - mazeStart) / (mazeEnd - mazeStart));
  if (mazeP > 0) {
    const popScale = easeOutBack(mazeP);
    ctx.save();
    ctx.globalAlpha = mazeP;
    const cx = width / 2;
    const cy = mazeTop + mazeAreaH / 2;
    ctx.translate(cx, cy);
    ctx.scale(popScale, popScale);
    ctx.translate(-cx, -cy);
    drawMazeWalls(ctx, maze, mx, my, cell, palette.wall);
    const startC = cellCenter(maze, maze.start, cell);
    drawStartMascot(ctx, markers.start, mx + startC.x, my + startC.y, cell, palette);
    drawGoal(ctx, maze, markers.end, mx, my, cell, t, palette);
    ctx.restore();
  }

  // think-time hint (before countdown kicks in)
  if (t > mazeEnd && t < countdownStart) {
    const pulse = 0.55 + 0.45 * Math.sin((t - mazeEnd) * 3.6);
    ctx.save();
    ctx.globalAlpha = pulse * 0.9;
    ctx.fillStyle = palette.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font =
      '700 42px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 14;
    ctx.fillText('think  fast', width / 2, mazeBottom + 60);
    ctx.restore();
  }

  // 3-2-1 countdown overlay
  if (t >= countdownStart && t < countdownEnd) {
    drawCountdown(ctx, t, countdownStart, width, height, palette);
  }

  // walk + animated dashed trail
  if (t >= walkStart && t <= walkEnd + 0.4) {
    const wp = clamp01((t - walkStart) / (walkEnd - walkStart));
    const segs = Math.max(1, solutionPath.length - 1);
    const segIdxRaw = wp * segs;
    const segIdx = Math.min(segs - 1, Math.floor(segIdxRaw));
    const segT = clamp01(segIdxRaw - segIdx);
    const a = cellCenter(maze, solutionPath[segIdx], cell);
    const b = cellCenter(maze, solutionPath[segIdx + 1], cell);
    const px = mx + lerp(a.x, b.x, easeInOut(segT));
    const py = my + lerp(a.y, b.y, easeInOut(segT));
    const bob = Math.sin(t * 18) * cell * 0.1;

    drawTrail(ctx, maze, solutionPath, segIdx, mx, my, cell, px, py, palette.trail, t);
    drawWalkingMascot(ctx, markers.start, px, py + bob, cell, palette, t);
  } else if (t > walkEnd + 0.4) {
    drawTrail(ctx, maze, solutionPath, solutionPath.length - 1, mx, my, cell, null, null, palette.trail, t);
    const endC = cellCenter(maze, maze.end, cell);
    const bob = Math.sin(t * 18) * cell * 0.07;
    drawWalkingMascot(ctx, markers.start, mx + endC.x, my + endC.y + bob, cell, palette, t);
    // confetti burst from the goal
    const cp = clamp01((t - (walkEnd + 0.05)) / 1.4);
    if (cp > 0) drawConfetti(ctx, mx + endC.x, my + endC.y, cp, scene.seedSalt);
  }

  // CTA pop
  const ctaP = clamp01((t - ctaStart) / (ctaEnd - ctaStart));
  if (ctaP > 0) {
    drawCtaPop(ctx, cta, handle, width / 2, height - 300, ctaP, palette);
  }
}

// ---------- elements ----------

function drawBanner(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  p: number,
  palette: Palette,
) {
  ctx.save();
  ctx.globalAlpha = p;
  // big sticker-style hook — drop the pill, let the words breathe
  ctx.fillStyle = palette.ctaBg;
  ctx.strokeStyle = palette.ctaText;
  ctx.lineWidth = 12;
  ctx.lineJoin = 'round';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font =
    '900 96px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 8;
  const lines = wrapToLines(ctx, text.toUpperCase(), 960);
  const lh = 100;
  const offset = -((lines.length - 1) * lh) / 2;
  for (let i = 0; i < lines.length; i++) {
    const y = cy + offset + i * lh;
    ctx.strokeText(lines[i], cx, y);
    ctx.fillText(lines[i], cx, y);
  }
  ctx.restore();
}

function drawTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  p: number,
  palette: Palette,
) {
  ctx.save();
  ctx.globalAlpha = p;
  const slide = (1 - p) * -24;
  ctx.fillStyle = palette.text;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font =
    '800 56px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  const lines = wrapToLines(ctx, text, 960);
  for (let i = 0; i < lines.length; i++) {
    const y = cy + slide + i * 64;
    ctx.strokeText(lines[i], cx, y);
    ctx.fillText(lines[i], cx, y);
  }
  ctx.restore();
}

function drawMazeWalls(
  ctx: CanvasRenderingContext2D,
  maze: Maze,
  mx: number,
  my: number,
  cell: number,
  color: string,
) {
  ctx.save();
  ctx.translate(mx, my);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, cell * 0.26);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  for (let i = 0; i < maze.cells.length; i++) {
    if (!maze.cells[i]) continue;
    const r = Math.floor(i / maze.cols);
    const c = i % maze.cols;
    const x = (c - maze.bbox.minC + MARGIN_CELLS) * cell;
    const y = (r - maze.bbox.minR + MARGIN_CELLS) * cell;
    if (hasWall(maze, i, 0)) { ctx.moveTo(x, y); ctx.lineTo(x + cell, y); }
    if (hasWall(maze, i, 3)) { ctx.moveTo(x, y); ctx.lineTo(x, y + cell); }
    if (hasWall(maze, i, 1)) { ctx.moveTo(x + cell, y); ctx.lineTo(x + cell, y + cell); }
    if (hasWall(maze, i, 2)) { ctx.moveTo(x, y + cell); ctx.lineTo(x + cell, y + cell); }
  }
  ctx.stroke();
  ctx.restore();
}

function drawStartMascot(
  ctx: CanvasRenderingContext2D,
  m: MarkerImg | null,
  cx: number,
  cy: number,
  cell: number,
  palette: Palette,
) {
  drawMascotCommon(ctx, m, cx, cy, cell, palette, false, 0);
}

function drawWalkingMascot(
  ctx: CanvasRenderingContext2D,
  m: MarkerImg | null,
  cx: number,
  cy: number,
  cell: number,
  palette: Palette,
  t: number,
) {
  drawMascotCommon(ctx, m, cx, cy, cell, palette, true, t);
}

function drawMascotCommon(
  ctx: CanvasRenderingContext2D,
  m: MarkerImg | null,
  cx: number,
  cy: number,
  cell: number,
  palette: Palette,
  walking: boolean,
  t: number,
) {
  // ~⅔ of a cell — clearly inside the corridor, never covers walls.
  const r = cell * 0.6;
  // soft trailing glow under the mascot
  ctx.save();
  const glow = ctx.createRadialGradient(cx, cy + r * 0.4, r * 0.2, cx, cy + r * 0.4, r * 1.4);
  glow.addColorStop(0, palette.trail);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = glow;
  ctx.fillRect(cx - r * 1.4, cy - r * 0.5, r * 2.8, r * 2.5);
  ctx.restore();

  if (m && m.img.complete && m.img.naturalWidth) {
    const iw = m.img.naturalWidth;
    const ih = m.img.naturalHeight;
    const s = Math.min((2 * r) / iw, (2 * r) / ih);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = cell * 0.5;
    ctx.shadowOffsetY = cell * 0.15;
    if (walking) {
      const tilt = Math.sin(t * 14) * 0.06;
      ctx.translate(cx, cy);
      ctx.rotate(tilt);
      ctx.drawImage(m.img, -(iw * s) / 2, -(ih * s) / 2, iw * s, ih * s);
    } else {
      ctx.drawImage(m.img, cx - (iw * s) / 2, cy - (ih * s) / 2, iw * s, ih * s);
    }
    ctx.restore();
  } else {
    // friendly smiley fallback so a missed AI fetch still looks intentional
    drawSmiley(ctx, cx, cy, r * 0.85, palette.ctaBg, palette.ctaText, walking ? t : 0);
  }
}

function drawSmiley(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  fill: string,
  ink: string,
  t: number,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(t * 12) * 0.05);
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = r * 0.5;
  ctx.shadowOffsetY = r * 0.12;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = ink;
  // eyes
  ctx.beginPath();
  ctx.arc(-r * 0.32, -r * 0.18, r * 0.12, 0, Math.PI * 2);
  ctx.arc(r * 0.32, -r * 0.18, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  // smile
  ctx.strokeStyle = ink;
  ctx.lineWidth = r * 0.13;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, r * 0.05, r * 0.45, Math.PI * 0.15, Math.PI - Math.PI * 0.15);
  ctx.stroke();
  ctx.restore();
}

function drawGoal(
  ctx: CanvasRenderingContext2D,
  maze: Maze,
  m: MarkerImg | null,
  mx: number,
  my: number,
  cell: number,
  t: number,
  palette: Palette,
) {
  const c = cellCenter(maze, maze.end, cell);
  const cx = mx + c.x;
  const cy = my + c.y;
  // throbbing halo
  const throb = 1 + Math.sin(t * 4) * 0.18;
  const r = cell * 0.75 * throb;
  ctx.save();
  const halo = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.4);
  halo.addColorStop(0, 'rgba(255,210,80,0.7)');
  halo.addColorStop(1, 'rgba(255,210,80,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (m && m.img.complete && m.img.naturalWidth) {
    const iw = m.img.naturalWidth;
    const ih = m.img.naturalHeight;
    const baseR = cell * 0.65;
    const s = Math.min((2 * baseR) / iw, (2 * baseR) / ih);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = cell * 0.4;
    ctx.drawImage(m.img, cx - (iw * s) / 2, cy - (ih * s) / 2, iw * s, ih * s);
    ctx.restore();
  } else {
    drawStar(ctx, cx, cy, cell * 0.65, palette.ctaBg, palette.ctaText);
  }
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  fill: string,
  stroke: string,
) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = r * 0.4;
  ctx.shadowOffsetY = r * 0.12;
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = r * 0.12;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = cx + Math.cos(ang) * rad;
    const py = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  maze: Maze,
  path: number[],
  upTo: number,
  mx: number,
  my: number,
  cell: number,
  px: number | null,
  py: number | null,
  color: string,
  t: number,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(5, cell * 0.5);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([cell * 0.9, cell * 0.55]);
  ctx.lineDashOffset = -t * cell * 1.8;
  ctx.shadowColor = color;
  ctx.shadowBlur = cell * 0.4;
  ctx.beginPath();
  const first = cellCenter(maze, path[0], cell);
  ctx.moveTo(mx + first.x, my + first.y);
  for (let i = 1; i <= upTo; i++) {
    const c = cellCenter(maze, path[i], cell);
    ctx.lineTo(mx + c.x, my + c.y);
  }
  if (px !== null && py !== null) ctx.lineTo(px, py);
  ctx.stroke();
  ctx.restore();
}

function drawCountdown(
  ctx: CanvasRenderingContext2D,
  t: number,
  countdownStart: number,
  width: number,
  _height: number,
  palette: Palette,
) {
  const elapsed = t - countdownStart;
  const digit = 3 - Math.floor(elapsed); // 3 → 2 → 1
  if (digit < 1 || digit > 3) return;
  const sub = elapsed - Math.floor(elapsed); // 0..1 within this digit

  let alpha = 1;
  let scale = 1;
  if (sub < 0.25) {
    const k = sub / 0.25;
    scale = easeOutBack(k);
    alpha = k;
  } else if (sub > 0.75) {
    const k = (sub - 0.75) / 0.25;
    alpha = 1 - k;
    scale = 1 + k * 0.4;
  }

  // Anchor ABOVE the maze, not over it. Lands in the cleared title slot
  // since the title fades out the moment the countdown begins.
  const cx = width / 2;
  const cy = 330;

  // pulsing ring behind the digit
  ctx.save();
  ctx.globalAlpha = alpha * 0.85;
  const ringR = 150 * scale;
  const ring = ctx.createRadialGradient(cx, cy, ringR * 0.15, cx, cy, ringR);
  ring.addColorStop(0, palette.ctaBg);
  ring.addColorStop(0.6, palette.ctaBg + '00');
  ring.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // big bold digit
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = palette.ctaBg;
  ctx.strokeStyle = palette.ctaText;
  ctx.lineWidth = 16;
  ctx.lineJoin = 'round';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font =
    '900 200px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 10;
  ctx.strokeText(String(digit), cx, cy);
  ctx.fillText(String(digit), cx, cy);
  ctx.restore();
}

function drawConfetti(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  p: number,
  salt: number,
) {
  const colors = ['#f72585', '#7209b7', '#3a86ff', '#ffbe0b', '#fb5607', '#06d6a0', '#f5d3ff'];
  const N = 22;
  ctx.save();
  for (let i = 0; i < N; i++) {
    const seed = (salt * 9301 + i * 49297) % 233280;
    const angle = (i / N) * Math.PI * 2 + ((seed % 100) / 100) * 0.6;
    const speed = 260 + (seed % 110);
    const distP = easeOutCubic(p);
    const px = cx + Math.cos(angle) * speed * distP;
    const py = cy + Math.sin(angle) * speed * distP * 0.6 + 360 * p * p;
    const size = (10 + (seed % 14)) * (1 - p * 0.4);
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = Math.max(0, 1 - p * 1.1);
    if (i % 3 === 0) {
      ctx.beginPath();
      ctx.arc(px, py, size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(((seed % 360) / 360) * Math.PI * 2 + t01(p) * Math.PI * 2);
      ctx.fillRect(-size * 0.5, -size * 0.25, size, size * 0.5);
      ctx.restore();
    }
  }
  ctx.restore();
}
const t01 = (x: number) => x;

function drawCtaPop(
  ctx: CanvasRenderingContext2D,
  cta: string,
  handle: string,
  cx: number,
  cy: number,
  p: number,
  palette: Palette,
) {
  const scale = easeOutBack(p);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  ctx.fillStyle = palette.ctaBg;
  ctx.strokeStyle = palette.ctaText;
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font =
    '800 58px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 6;
  // Force into ~2 lines by clamping the wrap width and splitting on natural
  // breaks ("?", " - ", " — ") when the CTA includes them.
  const lines = splitCtaLines(ctx, cta, 540);
  const lh = 70;
  const offset = -((lines.length - 1) * lh) / 2;
  for (let i = 0; i < lines.length; i++) {
    const y = cy + offset + i * lh;
    ctx.strokeText(lines[i], cx, y);
    ctx.fillText(lines[i], cx, y);
  }

  if (handle) {
    ctx.shadowBlur = 12;
    ctx.font =
      '700 40px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif';
    ctx.lineWidth = 4;
    ctx.fillStyle = palette.text;
    ctx.strokeStyle = palette.ctaText;
    const hy = cy + offset + lines.length * lh + 28;
    ctx.strokeText(handle, cx, hy);
    ctx.fillText(handle, cx, hy);
  }
  ctx.restore();
}

/** Prefer a natural break point (?, !, dash) for the second line; otherwise
 *  word-wrap into <= 2 lines at the given width. */
function splitCtaLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  // try a hard break on a sentence end mid-string
  const m = text.match(/^(.+?[?!])\s+(.+)$/);
  if (m) return [m[1], m[2]];
  const dash = text.match(/^(.+?)\s+[-—]\s+(.+)$/);
  if (dash) return [dash[1], dash[2]];
  return wrapToLines(ctx, text, maxWidth);
}

// ---------- helpers ----------

function wrapToLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function mix(a: string, b: string, t: number): string {
  const pa = hex(a);
  const pb = hex(b);
  const r = Math.round(lerp(pa[0], pb[0], t));
  const g = Math.round(lerp(pa[1], pb[1], t));
  const bl = Math.round(lerp(pa[2], pb[2], t));
  return `rgb(${r},${g},${bl})`;
}

function hex(s: string): [number, number, number] {
  const h = s.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
