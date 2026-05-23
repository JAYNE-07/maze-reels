// Record an animated canvas (and optionally a procedural music track)
// into a downloadable video. Prefers MP4 (Instagram-friendly) where the
// browser supports it, falls back to WebM.

import { setupReelMusic, type MusicTiming } from './music';

export interface RecordResult {
  blob: Blob;
  mimeType: string;
  extension: string;
}

function pickMime(): { mime: string; ext: string } {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  if (typeof MediaRecorder === 'undefined') {
    return { mime: 'video/webm', ext: 'webm' };
  }
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) {
      return { mime: m, ext: m.startsWith('video/mp4') ? 'mp4' : 'webm' };
    }
  }
  return { mime: 'video/webm', ext: 'webm' };
}

export async function recordCanvas(
  canvas: HTMLCanvasElement,
  fps: number,
  durationSec: number,
  onFrame: (t: number) => void,
  audioCtx?: AudioContext | null,
  musicTiming?: MusicTiming | null,
): Promise<RecordResult> {
  // Draw the initial frame BEFORE the stream begins.
  onFrame(0);

  const videoStream = (canvas as unknown as {
    captureStream: (fps: number) => MediaStream;
  }).captureStream(fps);

  // Combine with audio if a (caller-provided, gesture-warm) AudioContext
  // was passed in.
  let combinedStream: MediaStream = videoStream;
  let musicHandle: { dispose: () => void } | null = null;
  if (audioCtx && audioCtx.state !== 'closed') {
    try {
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      const dest = audioCtx.createMediaStreamDestination();
      const timing: MusicTiming = musicTiming ?? {
        titlePopAt: 0.5,
        countdownStart: 6.5,
        walkStart: 9.5,
        ctaAt: 12.0,
      };
      musicHandle = setupReelMusic(audioCtx, dest, durationSec, timing);
      combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);
    } catch (err) {
      // Audio setup failed — fall back to silent video, log diagnostics.
      console.warn('reels: audio setup failed, falling back to silent', err);
      combinedStream = videoStream;
      musicHandle = null;
    }
  }

  const { mime, ext } = pickMime();
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(combinedStream, {
      mimeType: mime,
      videoBitsPerSecond: 8_000_000,
      audioBitsPerSecond: 128_000,
    });
  } catch {
    // If the chosen mime can't accept audio, retry with the silent stream
    // so the reel still saves rather than throwing the whole batch away.
    combinedStream = videoStream;
    recorder = new MediaRecorder(videoStream, {
      mimeType: mime,
      videoBitsPerSecond: 8_000_000,
    });
  }
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  // Safety net: if onstop somehow doesn't fire (browser quirk on multi-reel
  // batches) we resolve anyway after a generous timeout so the batch keeps
  // moving instead of hanging.
  const stopped = new Promise<void>((res) => {
    let done = false;
    recorder.onstop = () => {
      if (!done) {
        done = true;
        res();
      }
    };
    setTimeout(
      () => {
        if (!done) {
          done = true;
          res();
        }
      },
      (durationSec + 4) * 1000,
    );
  });
  recorder.start(100);

  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      if (t >= durationSec) {
        onFrame(durationSec);
        resolve();
        return;
      }
      onFrame(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await new Promise((r) => setTimeout(r, 150));
  recorder.stop();
  await stopped;
  combinedStream.getTracks().forEach((tr) => tr.stop());
  // Dispose the per-reel audio subgraph so consecutive reels don't pile up
  // orphan nodes inside the shared AudioContext.
  musicHandle?.dispose();
  const blob = new Blob(chunks, { type: mime });
  if (!blob.size) {
    throw new Error('recorder produced no data');
  }
  return { blob, mimeType: mime, extension: ext };
}
