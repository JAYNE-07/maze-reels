// Single 9:16 reel frame renderer. Timeline gives viewers think-time
// before the mascot starts walking, then a pop-style CTA at the end.

import { hasWall, solvePath, type Maze } from './maze';
import type { Markers, MarkerImg } from './markers';
import type { Palette } from './palettes';

export interface Scene {
  width: number;
  height: number;
  maze: Maze;
  markers: Markers;
  palette: Palette;
  banner: string;   // small label at the very top, e.g. "CAN YOU SOLVE THIS?"
  title: string;    // main theme-specific headline
  cta: string;      // pop text near the bottom
  handle: string;   // optional @handle under the CTA
  duration: number;
  solutionPath: number[];
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

  // background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, palette.bg);
  bg.addColorStop(1, palette.bgEnd);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // ---- layout ----
  const sidePad = 60;
  const mazeTop = 540;
  const mazeBottom = height - 480;
  const mazeAreaH = mazeBottom - mazeTop;

  const spanC = maze.bbox.maxC - maze.bbox.minC + 1 + 2 * MARGIN_CELLS;
  const spanR = maze.bbox.maxR - maze.bbox.minR + 1 + 2 * MARGIN_CELLS;
  const cell = Math.min((width - sidePad * 2) / spanC, mazeAreaH / spanR);
  const mw = spanC * cell;
  const mh = spanR * cell;
  const mx = (width - mw) / 2;
  const my = mazeTop + (mazeAreaH - mh) / 2;

  // ---- timeline (8.5 s) ----
  const bannerEnd = 0.5;
  const titleStart = 0.5;
  const titleEnd = 1.2;
  const mazeStart = 1.0;
  const mazeEnd = 1.6;
  const thinkEnd = 4.0;     // 2.4 s of static "try to solve it" time
  const walkStart = thinkEnd;
  const walkEnd = 7.2;       // ~3.2 s walk
  const ctaStart = 7.4;
  const ctaEnd = 8.0;

  // BANNER (small label, fades in first)
  const bannerP = clamp01(t / bannerEnd);
  if (bannerP > 0) {
    drawBanner(ctx, banner, width / 2, 130, bannerP, palette.text);
  }

  // MAIN TITLE (fades in after banner)
  const titleP = clamp01((t - titleStart) / (titleEnd - titleStart));
  if (titleP > 0) {
    drawTitle(ctx, title, width / 2, 245, titleP, palette.text);
  }

  // MAZE (fade in)
  const mazeP = clamp01((t - mazeStart) / (mazeEnd - mazeStart));
  if (mazeP > 0) {
    ctx.save();
    ctx.globalAlpha = mazeP;
    drawMazeWalls(ctx, maze, mx, my, cell, palette.wall);
    // start mascot at entrance, visible during think-time too
    const startC = cellCenter(maze, maze.start, cell);
    drawMascot(ctx, markers.start, mx + startC.x, my + startC.y, cell);
    drawGoal(ctx, maze, markers.end, mx, my, cell);
    ctx.restore();
  }

  // PULSING HINT during think time
  if (t > mazeEnd && t < walkStart) {
    const pulse = 0.5 + 0.5 * Math.sin((t - mazeEnd) * 4);
    ctx.save();
    ctx.globalAlpha = 0.45 + pulse * 0.35;
    ctx.fillStyle = palette.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font =
      'italic 600 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 12;
    ctx.fillText('think…', width / 2, mazeBottom + 30);
    ctx.restore();
  }

  // WALK + TRAIL
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
    const bob = Math.sin(t * 14) * cell * 0.08;

    ctx.save();
    ctx.strokeStyle = palette.trail;
    ctx.lineWidth = Math.max(4, cell * 0.45);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const first = cellCenter(maze, solutionPath[0], cell);
    ctx.moveTo(mx + first.x, my + first.y);
    for (let i = 1; i <= segIdx; i++) {
      const c = cellCenter(maze, solutionPath[i], cell);
      ctx.lineTo(mx + c.x, my + c.y);
    }
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.restore();

    drawMascot(ctx, markers.start, px, py + bob, cell);
  } else if (t > walkEnd + 0.4) {
    // post-walk: full trail + mascot at goal
    ctx.save();
    ctx.strokeStyle = palette.trail;
    ctx.lineWidth = Math.max(4, cell * 0.45);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    solutionPath.forEach((idx, i) => {
      const c = cellCenter(maze, idx, cell);
      if (i === 0) ctx.moveTo(mx + c.x, my + c.y);
      else ctx.lineTo(mx + c.x, my + c.y);
    });
    ctx.stroke();
    ctx.restore();
    const endC = cellCenter(maze, maze.end, cell);
    const bob = Math.sin(t * 14) * cell * 0.06;
    drawMascot(ctx, markers.start, mx + endC.x, my + endC.y + bob, cell);
  }

  // CTA POP
  const ctaP = clamp01((t - ctaStart) / (ctaEnd - ctaStart));
  if (ctaP > 0) {
    drawCtaPop(ctx, cta, handle, width / 2, height - 320, ctaP, palette);
  }
}

function drawBanner(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  p: number,
  color: string,
) {
  ctx.save();
  ctx.globalAlpha = p;
  // letter-spaced uppercase rendered manually so it really shows
  const spaced = text.toUpperCase().split('').join(' ');
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font =
    'bold 38px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 10;
  ctx.fillText(spaced, cx, cy);
  // thin underline
  const w = Math.min(560, ctx.measureText(spaced).width);
  ctx.shadowColor = 'transparent';
  ctx.fillRect(cx - w / 2, cy + 32, w, 3);
  ctx.restore();
}

function drawTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  p: number,
  color: string,
) {
  ctx.save();
  ctx.globalAlpha = p;
  const slide = (1 - p) * -20;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font =
    'bold 72px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  wrapText(ctx, text, cx, cy + slide, 960, 88);
  ctx.restore();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  maxWidth: number,
  lineHeight: number,
) {
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
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], cx, cy + i * lineHeight);
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
  ctx.lineWidth = Math.max(2.5, cell * 0.22);
  ctx.lineCap = 'round';
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

function drawMascot(
  ctx: CanvasRenderingContext2D,
  m: MarkerImg | null,
  cx: number,
  cy: number,
  cell: number,
) {
  const r = cell * 1.4;
  if (m && m.img.complete && m.img.naturalWidth) {
    const iw = m.img.naturalWidth;
    const ih = m.img.naturalHeight;
    const s = Math.min((2 * r) / iw, (2 * r) / ih);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = cell * 0.4;
    ctx.shadowOffsetY = cell * 0.1;
    ctx.drawImage(m.img, cx - (iw * s) / 2, cy - (ih * s) / 2, iw * s, ih * s);
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawGoal(
  ctx: CanvasRenderingContext2D,
  maze: Maze,
  m: MarkerImg | null,
  mx: number,
  my: number,
  cell: number,
) {
  const c = cellCenter(maze, maze.end, cell);
  const cx = mx + c.x;
  const cy = my + c.y;
  const r = cell * 1.6;
  ctx.save();
  const halo = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r * 1.55);
  halo.addColorStop(0, 'rgba(255,200,80,0.55)');
  halo.addColorStop(1, 'rgba(255,200,80,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (m && m.img.complete && m.img.naturalWidth) {
    const iw = m.img.naturalWidth;
    const ih = m.img.naturalHeight;
    const s = Math.min((2 * r) / iw, (2 * r) / ih);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = cell * 0.5;
    ctx.drawImage(m.img, cx - (iw * s) / 2, cy - (ih * s) / 2, iw * s, ih * s);
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawCtaPop(
  ctx: CanvasRenderingContext2D,
  cta: string,
  handle: string,
  cx: number,
  cy: number,
  p: number,
  palette: Palette,
) {
  // pop in with overshoot, then settle
  const scale = easeOutBack(p);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  // bright headline
  ctx.fillStyle = palette.ctaBg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font =
    'bold 92px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 8;
  // thick stroke ring for "sticker" look
  ctx.strokeStyle = palette.ctaText;
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  const lines = wrapTextToLines(ctx, cta, 920);
  const offset = -((lines.length - 1) * 100) / 2;
  for (let i = 0; i < lines.length; i++) {
    const y = cy + offset + i * 100;
    ctx.strokeText(lines[i], cx, y);
    ctx.fillText(lines[i], cx, y);
  }

  if (handle) {
    ctx.shadowBlur = 14;
    ctx.font =
      '700 50px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif';
    ctx.lineWidth = 5;
    ctx.fillStyle = palette.text;
    ctx.strokeStyle = palette.ctaText;
    const hy = cy + offset + lines.length * 100 + 30;
    ctx.strokeText(handle, cx, hy);
    ctx.fillText(handle, cx, hy);
  }
  ctx.restore();
}

function wrapTextToLines(
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
