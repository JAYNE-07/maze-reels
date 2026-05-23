// Single 9:16 reel frame renderer. Animates a mascot walking through
// a themed maze: title → maze appears → mascot walks the solution
// path → CTA card slides in.

import { hasWall, solvePath, type Maze } from './maze';
import type { Markers, MarkerImg } from './markers';
import type { Palette } from './palettes';

export interface Scene {
  width: number;
  height: number;
  maze: Maze;
  markers: Markers;
  palette: Palette;
  title: string;
  cta: string;
  handle: string;
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
  title: string,
  cta: string,
  handle: string,
  duration = 8,
): Scene {
  return {
    width,
    height,
    maze,
    markers,
    palette,
    title,
    cta,
    handle,
    duration,
    solutionPath: solvePath(maze),
  };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

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
  const { width, height, maze, markers, palette, title, cta, handle, solutionPath } = scene;

  // background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, palette.bg);
  bg.addColorStop(1, palette.bgEnd);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // layout
  const sidePad = 60;
  const mazeTop = 480;
  const mazeBottom = height - 460;
  const mazeAreaH = mazeBottom - mazeTop;

  const spanC = maze.bbox.maxC - maze.bbox.minC + 1 + 2 * MARGIN_CELLS;
  const spanR = maze.bbox.maxR - maze.bbox.minR + 1 + 2 * MARGIN_CELLS;
  const cell = Math.min((width - sidePad * 2) / spanC, mazeAreaH / spanR);
  const mw = spanC * cell;
  const mh = spanR * cell;
  const mx = (width - mw) / 2;
  const my = mazeTop + (mazeAreaH - mh) / 2;

  // timeline (8s default)
  const titleEnd = 0.6;
  const mazeStart = 0.5;
  const mazeEnd = 1.2;
  const walkStart = 1.2;
  const walkEnd = 7.0;
  const ctaStart = 7.0;
  const ctaEnd = 7.5;

  // TITLE
  const titleP = clamp01(t / titleEnd);
  if (titleP > 0) {
    ctx.save();
    ctx.globalAlpha = titleP;
    drawTitle(ctx, title, width / 2, 160 + (1 - titleP) * -30, palette.text);
    ctx.restore();
  }

  // MAZE
  const mazeP = clamp01((t - mazeStart) / (mazeEnd - mazeStart));
  if (mazeP > 0) {
    ctx.save();
    ctx.globalAlpha = mazeP;
    drawMazeWalls(ctx, maze, mx, my, cell, palette.wall);
    drawGoal(ctx, maze, markers.end, mx, my, cell);
    ctx.restore();
  }

  // WALK
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

    // trail
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
    // post-walk: full trail + mascot resting at goal
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

  // CTA
  const ctaP = clamp01((t - ctaStart) / (ctaEnd - ctaStart));
  if (ctaP > 0) {
    ctx.save();
    const cardY = height - 380 + (1 - ctaP) * 200;
    ctx.globalAlpha = ctaP;
    drawCta(ctx, cta, handle, width / 2, cardY, width - 120, palette);
    ctx.restore();
  }
}

function drawTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  color: string,
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font =
    'bold 76px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  wrapText(ctx, text, cx, cy, 960, 92);
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
    if (hasWall(maze, i, 0)) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + cell, y);
    }
    if (hasWall(maze, i, 3)) {
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + cell);
    }
    if (hasWall(maze, i, 1)) {
      ctx.moveTo(x + cell, y);
      ctx.lineTo(x + cell, y + cell);
    }
    if (hasWall(maze, i, 2)) {
      ctx.moveTo(x, y + cell);
      ctx.lineTo(x + cell, y + cell);
    }
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
    ctx.strokeStyle = '#0b1220';
    ctx.lineWidth = Math.max(2, r * 0.1);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
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
  // warm halo
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

function drawCta(
  ctx: CanvasRenderingContext2D,
  cta: string,
  handle: string,
  cx: number,
  cy: number,
  w: number,
  palette: Palette,
) {
  const h = handle ? 240 : 180;
  const x = cx - w / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  roundRect(ctx, x, cy, w, h, 40);
  ctx.fillStyle = palette.ctaBg;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  ctx.fillStyle = palette.ctaText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font =
    'bold 60px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif';
  const titleY = handle ? cy + 80 : cy + h / 2;
  wrapText(ctx, cta, cx, titleY - 30, w - 80, 66);

  if (handle) {
    ctx.font =
      '600 46px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif';
    ctx.fillText(handle, cx, cy + h - 60);
  }
  ctx.restore();
}

function roundRect(
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
}
