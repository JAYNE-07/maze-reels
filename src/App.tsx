import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generateMaze } from './lib/maze';
import { fetchSilhouette, maskGrid } from './lib/shape';
import { fetchMarkers } from './lib/markers';
import { baseSubjectFor, subjectFor } from './lib/themes';
import { PALETTES, pick } from './lib/palettes';
import { buildScene, drawFrame, REEL_TIMING, type Scene } from './lib/animate';
import { recordCanvas } from './lib/record';
import type { MusicTiming } from './lib/music';

const REEL_W = 1080;
const REEL_H = 1920;
const REEL_SECONDS = REEL_TIMING.duration;
const MUSIC_TIMING: MusicTiming = {
  titlePopAt: REEL_TIMING.titleStart,
  countdownStart: REEL_TIMING.countdownStart,
  ctaAt: REEL_TIMING.ctaStart,
};
const REEL_FPS = 30;
const COLS_FOR_REEL = 14; // smaller grid -> bigger cells, much easier to solve in the think-time

// Subject-agnostic so a missed AI fetch never makes the title lie.
const TITLES = [
  'Find the way!',
  'Trace the path',
  'Can you make it?',
  'Solve this maze',
  'Tap to try',
  'Reach the goal!',
];

const BANNER = 'Can you solve this?';

// Provocative "you're too good for this" tone — wraps cleanly to 2 lines.
const RANDOM_CTAS = [
  'Too easy for you? Real challenges are in my bio',
  'Think this is simple? The hard ones are in my bio',
  'Want a real challenge? Tap the link in my bio',
  'Solved it instantly? Try the book — link in bio',
  "That was the warm-up. Brain-burners in my bio",
  'Bored already? The real maze book is in my bio',
  'Too smart for this? Try the puzzle book in bio',
  'If you got it fast, you need the book in my bio',
  "Think you're a pro? The book will prove it — link in bio",
  'Want something harder? My puzzle book is in my bio',
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Status = 'idle' | 'working' | 'done';

interface CompletedReel {
  id: string;
  index: number;
  blob: Blob;
  url: string;
  filename: string;
  paletteName: string;
  selected: boolean;
}

export default function App() {
  const [keyword, setKeyword] = useState('animals');
  const [count, setCount] = useState(5);
  const [cta, setCta] = useState('');
  const [handle, setHandle] = useState('@iqexploratorium');
  const [withAudio, setWithAudio] = useState(true);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [reels, setReels] = useState<CompletedReel[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cancelRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

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

  // revoke any object URLs when reels are cleared / on unmount
  useEffect(() => {
    return () => {
      reels.forEach((r) => URL.revokeObjectURL(r.url));
    };
  }, [reels]);

  const appendLog = (line: string) =>
    setLog((arr) => [...arr.slice(-60), line]);

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

  const clearAll = () => {
    reels.forEach((r) => URL.revokeObjectURL(r.url));
    setReels([]);
    setStatus('idle');
    setLog([]);
  };

  const toggleSelect = (id: string) =>
    setReels((arr) => arr.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)));

  const downloadSelected = async () => {
    const chosen = reels.filter((r) => r.selected);
    for (const r of chosen) {
      downloadBlob(r.blob, r.filename);
      await sleep(350); // browser politeness gap between downloads
    }
  };

  const generate = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw || status === 'working') return;
    cancelRef.current = false;
    // Create the AudioContext synchronously here, INSIDE the click handler,
    // so the browser's user-activation requirement is satisfied. Reusing it
    // for every reel in the batch — long awaits later won't break it.
    if (withAudio && !audioCtxRef.current) {
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        audioCtxRef.current = new AC();
      } catch {
        audioCtxRef.current = null;
      }
    }
    setStatus('working');
    // start fresh
    reels.forEach((r) => URL.revokeObjectURL(r.url));
    setReels([]);
    setLog([]);
    const cv = canvasRef.current!;
    cv.width = REEL_W;
    cv.height = REEL_H;
    const ctx = cv.getContext('2d')!;
    const baseSeed = Math.floor(Math.random() * 1e9);

    const usedSubj = new Set<number>();
    let nextSubj = 0;
    let made = 0;
    let skipped = 0;

    for (let i = 0; i < count; i++) {
      if (cancelRef.current) break;

      const palette = pick(PALETTES, i);
      const reelCta = cta.trim() || RANDOM_CTAS[Math.floor(Math.random() * RANDOM_CTAS.length)];
      const title = TITLES[i % TITLES.length];

      setProgress(`Reel ${i + 1} of ${count} — finding a shape…`);
      let scene: Scene | null = null;

      for (let attempt = 0; attempt < 8 && !scene; attempt++) {
        if (cancelRef.current) break;
        while (usedSubj.has(nextSubj)) nextSubj++;
        const subjIdx = nextSubj++;
        usedSubj.add(subjIdx);

        const aiPrompt = subjectFor(kw, subjIdx, baseSeed);
        const base = baseSubjectFor(kw, subjIdx, baseSeed);
        const seed = ((baseSeed + subjIdx * 131 + attempt * 977) >>> 0) || 1;
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
            seed,
          );
        } catch {
          await sleep(attempt < 2 ? 800 : 3500);
        }
      }
      if (!scene) {
        appendLog(`✗ reel ${i + 1}: couldn't find a shape — skipped`);
        skipped++;
        continue;
      }

      setProgress(`Reel ${i + 1} of ${count} — recording ${REEL_SECONDS} s (${palette.name})`);
      const sceneFinal = scene;
      const drawFn = (t: number) => drawFrame(ctx, sceneFinal, t);
      let result;
      try {
        result = await recordCanvas(
          cv,
          REEL_FPS,
          REEL_SECONDS,
          drawFn,
          withAudio ? audioCtxRef.current : null,
          MUSIC_TIMING,
        );
      } catch (e) {
        // Audio path failed — recoverable. Retry the same reel as a silent
        // recording so the slot doesn't get dropped from the batch.
        appendLog(
          `… reel ${i + 1}: audio recording failed (${e instanceof Error ? e.message : 'error'}), retrying silent`,
        );
        try {
          result = await recordCanvas(cv, REEL_FPS, REEL_SECONDS, drawFn, null, null);
        } catch (e2) {
          appendLog(
            `✗ reel ${i + 1}: recording failed (${e2 instanceof Error ? e2.message : 'error'})`,
          );
          skipped++;
          continue;
        }
      }

      const url = URL.createObjectURL(result.blob);
      const filename = `${String(i + 1).padStart(2, '0')}-${slugify(title)}.${result.extension}`;
      const completed: CompletedReel = {
        id: `${baseSeed}-${i}`,
        index: i + 1,
        blob: result.blob,
        url,
        filename,
        paletteName: palette.name,
        selected: true,
      };
      setReels((arr) => [...arr, completed]);
      appendLog(`✓ reel ${i + 1}: ready (${(result.blob.size / 1e6).toFixed(1)} MB, ${palette.name})`);
      made++;

      if (i < count - 1) await sleep(900);
    }
    setProgress('');
    setStatus('done');
    appendLog(`Done — ${made} ready, ${skipped} skipped`);
  }, [keyword, count, cta, handle, status, reels, withAudio]);

  const cancel = () => {
    cancelRef.current = true;
  };

  const ctaPlaceholder = useMemo(
    () => `random per reel (e.g. "Wanna try? Link in bio")`,
    [],
  );

  const selectedCount = reels.filter((r) => r.selected).length;

  return (
    <div className="app">
      <header>
        <h1>Maze Reels Generator</h1>
        <p className="sub">
          9:16 reels for Instagram — themed maze, ~6 s for viewers to try
          solving, then the mascot walks the path. All reels generate first,
          then you pick which to save.
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
        <label className="row check">
          <span>Anxious music</span>
          <input
            type="checkbox"
            checked={withAudio}
            onChange={(e) => setWithAudio(e.target.checked)}
          />
          <em>
            Adds a procedural ticking/heartbeat backing track to each reel.
            Uncheck for silent reels.
          </em>
        </label>

        <p className="note">
          Each reel is 15 s — ~4.5 s think time, 3-2-1 countdown, solution
          walk, then ~3 s of CTA. 1080×1920 with ticking-clock background
          and event sounds at title, countdown and CTA. Leave the CTA blank
          to randomize per reel. Recording is real-time so {count} reel
          {count === 1 ? '' : 's'} take ~{count * 16} s plus AI fetch.
        </p>

        <div className="row actions">
          {status !== 'working' ? (
            <button className="primary" onClick={generate} disabled={!keyword.trim()}>
              {status === 'done' ? 'Generate another batch' : 'Generate reels'}
            </button>
          ) : (
            <button onClick={cancel}>Stop</button>
          )}
          {reels.length > 0 && status !== 'working' && (
            <button onClick={clearAll}>Clear all</button>
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

      {reels.length > 0 && (
        <section className="gallery">
          <div className="gallery-head">
            <h2>
              Generated reels — {selectedCount} of {reels.length} selected
            </h2>
            <div>
              <button
                onClick={() =>
                  setReels((arr) => arr.map((r) => ({ ...r, selected: true })))
                }
              >
                Select all
              </button>
              <button
                onClick={() =>
                  setReels((arr) => arr.map((r) => ({ ...r, selected: false })))
                }
              >
                Select none
              </button>
              <button
                className="primary"
                disabled={selectedCount === 0}
                onClick={downloadSelected}
              >
                Download {selectedCount}
              </button>
            </div>
          </div>
          <div className="grid">
            {reels.map((r) => (
              <label
                key={r.id}
                className={'card' + (r.selected ? ' on' : '')}
              >
                <video
                  src={r.url}
                  muted
                  loop
                  autoPlay
                  playsInline
                  preload="auto"
                />
                <div className="card-row">
                  <input
                    type="checkbox"
                    checked={r.selected}
                    onChange={() => toggleSelect(r.id)}
                  />
                  <span className="card-meta">
                    <strong>#{r.index}</strong> · {r.paletteName}
                  </span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      downloadBlob(r.blob, r.filename);
                    }}
                  >
                    Save
                  </button>
                </div>
                <code className="card-name">{r.filename}</code>
              </label>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
