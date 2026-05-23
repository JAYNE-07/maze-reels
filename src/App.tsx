import { useCallback, useEffect, useRef, useState } from 'react';
import { generateMaze } from './lib/maze';
import { fetchSilhouette, maskGrid } from './lib/shape';
import { fetchMarkers } from './lib/markers';
import { baseSubjectFor, subjectFor } from './lib/themes';
import { PALETTES, pick } from './lib/palettes';
import { buildScene, drawFrame, type Scene } from './lib/animate';
import { recordCanvas } from './lib/record';

const REEL_W = 1080;
const REEL_H = 1920;
const REEL_SECONDS = 8;
const REEL_FPS = 30;

const COLS_FOR_REEL = 30; // moderate density so the maze reads clearly at speed
const TITLE_TEMPLATES: ((s: string) => string)[] = [
  (s) => `Can you solve this ${s} maze?`,
  (s) => `Help the ${s} find the way!`,
  (s) => `Can the ${s} make it home?`,
  (s) => `Find the path for this ${s}`,
  (s) => `Trace the ${s}'s path`,
  (_s) => `Solve in 8 seconds!`,
];

type Status = 'idle' | 'working' | 'done' | 'error';

export default function App() {
  const [keyword, setKeyword] = useState('animals');
  const [count, setCount] = useState(5);
  const [cta, setCta] = useState('Get the maze book');
  const [handle, setHandle] = useState('@the.mastery.method');
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [previewActive, setPreviewActive] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cancelRef = useRef(false);

  // Idle: draw a still preview so the canvas isn't a black box.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || previewActive) return;
    cv.width = REEL_W;
    cv.height = REEL_H;
    const ctx = cv.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, REEL_H);
    g.addColorStop(0, '#0a1a3a');
    g.addColorStop(1, '#15356b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, REEL_W, REEL_H);
    ctx.fillStyle = '#e6f4ff';
    ctx.textAlign = 'center';
    ctx.font =
      'bold 78px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('Maze Reels', REEL_W / 2, REEL_H * 0.46);
    ctx.font = '40px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(230,244,255,0.7)';
    ctx.fillText('preview appears here', REEL_W / 2, REEL_H * 0.52);
  }, [previewActive]);

  const appendLog = (line: string) =>
    setLog((arr) => [...arr.slice(-40), line]);

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const generate = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw || status === 'working') return;
    cancelRef.current = false;
    setStatus('working');
    setPreviewActive(true);
    setLog([]);
    const cv = canvasRef.current!;
    cv.width = REEL_W;
    cv.height = REEL_H;
    const ctx = cv.getContext('2d')!;
    const baseSeed = Math.floor(Math.random() * 1e9);
    let made = 0;

    for (let i = 0; i < count; i++) {
      if (cancelRef.current) break;
      setProgress(`Reel ${i + 1} of ${count} — fetching shape & mascot`);
      const palette = pick(PALETTES, i);
      let scene: Scene | null = null;
      // up to 3 attempts to fetch a usable shape for this slot
      for (let a = 0; a < 3 && !scene; a++) {
        const subjIdx = i + a * 1000;
        const aiPrompt = subjectFor(kw, subjIdx, baseSeed);
        const base = baseSubjectFor(kw, subjIdx, baseSeed);
        const seed = ((baseSeed + subjIdx * 131 + a * 977) >>> 0) || 1;
        try {
          const [sil, markers] = await Promise.all([
            fetchSilhouette(aiPrompt, seed, { iconSearch: base }),
            fetchMarkers(aiPrompt, (seed * 2654435761) >>> 0),
          ]);
          const maze = generateMaze(
            maskGrid(sil, COLS_FOR_REEL, COLS_FOR_REEL),
            COLS_FOR_REEL,
            COLS_FOR_REEL,
            seed,
          );
          const title = pick(TITLE_TEMPLATES, i)(base);
          scene = buildScene(
            REEL_W,
            REEL_H,
            maze,
            markers,
            palette,
            title,
            cta,
            handle,
            REEL_SECONDS,
          );
        } catch {
          /* try next subject */
        }
      }
      if (!scene) {
        appendLog(`✗ reel ${i + 1} couldn't get a shape — skipped`);
        continue;
      }
      const sceneFinal = scene; // satisfy TS narrowing inside callback
      setProgress(
        `Reel ${i + 1} of ${count} — recording 8s (${palette.name})`,
      );
      try {
        const result = await recordCanvas(cv, REEL_FPS, REEL_SECONDS, (t) =>
          drawFrame(ctx, sceneFinal, t),
        );
        const slug =
          (sceneFinal.title || `reel-${i + 1}`)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || `reel-${i + 1}`;
        const filename = `${String(i + 1).padStart(2, '0')}-${slug}.${result.extension}`;
        downloadBlob(result.blob, filename);
        appendLog(
          `✓ reel ${i + 1}: ${filename} (${(result.blob.size / 1e6).toFixed(1)} MB, ${result.mimeType})`,
        );
        made++;
      } catch (e) {
        appendLog(`✗ reel ${i + 1}: ${e instanceof Error ? e.message : 'recording failed'}`);
      }
    }
    setProgress('');
    setStatus(cancelRef.current ? 'idle' : 'done');
    appendLog(`Done — ${made}/${count} reels saved`);
  }, [keyword, count, cta, handle, status]);

  const cancel = () => {
    cancelRef.current = true;
  };

  return (
    <div className="app">
      <header>
        <h1>Maze Reels Generator</h1>
        <p className="sub">
          9:16 reels for Instagram — themed maze, mascot walks the solution,
          CTA at the end.
        </p>
      </header>

      <div className="panel">
        <label className="row">
          <span>Theme keyword</span>
          <input
            value={keyword}
            placeholder="animals, food, vehicles, jobs…"
            onChange={(e) => setKeyword(e.target.value)}
          />
        </label>
        <label className="row">
          <span>How many reels</span>
          <input
            type="number"
            min={1}
            max={30}
            value={count}
            onChange={(e) =>
              setCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))
            }
          />
        </label>
        <label className="row">
          <span>CTA text</span>
          <input value={cta} onChange={(e) => setCta(e.target.value)} />
        </label>
        <label className="row">
          <span>Your @handle</span>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} />
        </label>

        <p className="note">
          Each reel is 8 s at 1080×1920. Recording is real-time so {count} reel
          {count === 1 ? '' : 's'} will take roughly {count * 9}s plus the AI
          fetches (~10–20 s per shape on first call). Browser will download an
          MP4 (or WebM if MP4 isn't supported) per reel.
        </p>

        <div className="row actions">
          {status !== 'working' ? (
            <button className="primary" onClick={generate} disabled={!keyword.trim()}>
              Generate reels
            </button>
          ) : (
            <button onClick={cancel}>Stop</button>
          )}
        </div>
      </div>

      {progress && <div className="progress">{progress}</div>}

      <div className="stage">
        <div className="phone">
          <canvas ref={canvasRef} className="reel" />
        </div>
        {log.length > 0 && (
          <ul className="log">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
