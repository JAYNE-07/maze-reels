import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generateMaze } from './lib/maze';
import { fetchSilhouette, maskGrid } from './lib/shape';
import { fetchMarkers } from './lib/markers';
import { baseSubjectFor, subjectFor } from './lib/themes';
import { PALETTES, pick } from './lib/palettes';
import { buildScene, drawFrame, type Scene } from './lib/animate';
import { recordCanvas } from './lib/record';

const REEL_W = 1080;
const REEL_H = 1920;
const REEL_SECONDS = 8.5;
const REEL_FPS = 30;
const COLS_FOR_REEL = 30;

const TITLE_TEMPLATES: ((s: string) => string)[] = [
  (s) => `Help the ${s} find the way!`,
  (s) => `Can the ${s} make it home?`,
  (s) => `Trace the ${s}'s path`,
  (s) => `Find the path for this ${s}`,
  (s) => `Guide the ${s} to the goal!`,
  (s) => `Will the ${s} make it?`,
];

const BANNER = 'Can you solve this?';

const RANDOM_CTAS = [
  'Get the book!',
  'Link in bio →',
  'Save for later',
  'Tap the link!',
  '100+ more inside',
  'Grab the book',
  "Don't miss out",
  'Full book →',
  'Free preview',
  'More mazes →',
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Status = 'idle' | 'working' | 'done' | 'error';

interface PendingReel {
  url: string;
  filename: string;
  blob: Blob;
  mime: string;
  index: number;
  total: number;
}

export default function App() {
  const [keyword, setKeyword] = useState('animals');
  const [count, setCount] = useState(5);
  const [cta, setCta] = useState('');
  const [handle, setHandle] = useState('@the.mastery.method');
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState('');
  const [log, setLog] = useState<string[]>([]);

  const [pending, setPending] = useState<PendingReel | null>(null);
  const decisionRef = useRef<((save: boolean) => void) | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cancelRef = useRef(false);

  // idle preview frame
  useEffect(() => {
    if (status !== 'idle' || !canvasRef.current) return;
    const cv = canvasRef.current;
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
  }, [status]);

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

  const slugify = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'reel';

  const generate = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw || status === 'working') return;
    cancelRef.current = false;
    setStatus('working');
    setLog([]);
    const cv = canvasRef.current!;
    cv.width = REEL_W;
    cv.height = REEL_H;
    const ctx = cv.getContext('2d')!;
    const baseSeed = Math.floor(Math.random() * 1e9);
    let made = 0;
    let skipped = 0;

    // pool cursor — advance through subject indices across the whole run so
    // a single failing subject doesn't trap multiple slots.
    const usedSubj = new Set<number>();
    let nextSubj = 0;

    for (let i = 0; i < count; i++) {
      if (cancelRef.current) break;

      const palette = pick(PALETTES, i);
      const reelCta = cta.trim() || RANDOM_CTAS[Math.floor(Math.random() * RANDOM_CTAS.length)];

      setProgress(`Reel ${i + 1} of ${count} — finding a shape…`);
      let scene: Scene | null = null;
      let usedSubjects: string[] = [];

      // up to 8 attempts, each pulling a fresh subject index from the pool.
      // Cooldowns grow if the AI keeps rejecting (rate-limit recovery).
      for (let attempt = 0; attempt < 8 && !scene; attempt++) {
        if (cancelRef.current) break;
        while (usedSubj.has(nextSubj)) nextSubj++;
        const subjIdx = nextSubj++;
        usedSubj.add(subjIdx);

        const aiPrompt = subjectFor(kw, subjIdx, baseSeed);
        const base = baseSubjectFor(kw, subjIdx, baseSeed);
        const seed = ((baseSeed + subjIdx * 131 + attempt * 977) >>> 0) || 1;
        usedSubjects.push(base);
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
            BANNER,
            title,
            reelCta,
            handle,
            REEL_SECONDS,
          );
        } catch {
          // Back off harder as failures pile up — gives Pollinations a chance
          // to clear its rate-limit window before the next try.
          await sleep(attempt < 2 ? 800 : 3500);
        }
      }
      if (!scene) {
        appendLog(
          `✗ reel ${i + 1}: skipped after trying ${usedSubjects.slice(0, 4).join(', ')}${usedSubjects.length > 4 ? '…' : ''}`,
        );
        skipped++;
        continue;
      }

      setProgress(
        `Reel ${i + 1} of ${count} — recording ${REEL_SECONDS}s (${palette.name})`,
      );
      let result;
      const sceneFinal = scene;
      try {
        result = await recordCanvas(cv, REEL_FPS, REEL_SECONDS, (t) =>
          drawFrame(ctx, sceneFinal, t),
        );
      } catch (e) {
        appendLog(`✗ reel ${i + 1}: ${e instanceof Error ? e.message : 'recording failed'}`);
        continue;
      }

      const slug = slugify(scene.title);
      const filename = `${String(i + 1).padStart(2, '0')}-${slug}.${result.extension}`;

      // Hand off to the user for a preview decision before downloading.
      setProgress(`Reel ${i + 1} ready — preview to save or skip`);
      const url = URL.createObjectURL(result.blob);
      const save = await new Promise<boolean>((resolve) => {
        decisionRef.current = resolve;
        setPending({
          url,
          filename,
          blob: result.blob,
          mime: result.mimeType,
          index: i + 1,
          total: count,
        });
      });
      decisionRef.current = null;
      setPending(null);
      URL.revokeObjectURL(url);

      if (save) {
        downloadBlob(result.blob, filename);
        appendLog(
          `✓ reel ${i + 1}: saved as ${filename} (${(result.blob.size / 1e6).toFixed(1)} MB)`,
        );
        made++;
      } else {
        appendLog(`— reel ${i + 1}: discarded`);
        skipped++;
      }

      // small breather between reels for the AI service
      if (i < count - 1) await sleep(1200);
    }
    setProgress('');
    setStatus(cancelRef.current ? 'idle' : 'done');
    appendLog(`Done — ${made} saved, ${skipped} skipped`);
  }, [keyword, count, cta, handle, status]);

  const cancel = () => {
    cancelRef.current = true;
    if (decisionRef.current) decisionRef.current(false);
  };

  const ctaPlaceholder = useMemo(
    () => `random per reel (${RANDOM_CTAS.slice(0, 3).join(' / ')}…)`,
    [],
  );

  return (
    <div className="app">
      <header>
        <h1>Maze Reels Generator</h1>
        <p className="sub">
          9:16 reels for Instagram — themed maze, viewer gets think-time, then the mascot
          walks the solution. Confirm each one before saving.
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
          <input
            value={cta}
            placeholder={ctaPlaceholder}
            onChange={(e) => setCta(e.target.value)}
          />
        </label>
        <label className="row">
          <span>Your @handle</span>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} />
        </label>

        <p className="note">
          Leave CTA blank for a random call-to-action per reel. Recording is
          real-time (~{Math.ceil(REEL_SECONDS)} s per reel) plus the AI fetch.
          After each reel you'll see a preview and choose <strong>Save</strong>{' '}
          or <strong>Skip</strong>.
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

      {pending && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>
              Reel {pending.index} / {pending.total}
            </h3>
            <video
              key={pending.url}
              src={pending.url}
              controls
              autoPlay
              loop
              playsInline
            />
            <p className="modal-filename">{pending.filename}</p>
            <div className="modal-actions">
              <button
                className="primary"
                onClick={() => decisionRef.current?.(true)}
              >
                Save
              </button>
              <button onClick={() => decisionRef.current?.(false)}>Skip</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
