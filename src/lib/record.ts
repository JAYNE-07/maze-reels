// Record an animated canvas (and optionally a procedural music track)
// into a downloadable video. Prefers MP4 (Instagram-friendly) where the
// browser supports it, falls back to WebM.

import { setupAnxiousMusic } from './music';

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
): Promise<RecordResult> {
  // Draw the initial frame BEFORE the stream begins.
  onFrame(0);

  const videoStream = (canvas as unknown as {
    captureStream: (fps: number) => MediaStream;
  }).captureStream(fps);

  // Combine with audio if a (caller-provided, gesture-warm) AudioContext
  // was passed in. Caller creates it inside the click handler so the
  // browser's user-activation rule is satisfied.
  let combinedStream: MediaStream = videoStream;
  if (audioCtx) {
    try {
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      const dest = audioCtx.createMediaStreamDestination();
      setupAnxiousMusic(audioCtx, dest, durationSec);
      combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);
    } catch {
      // Audio failed — fall back to silent video so the reel still records.
      combinedStream = videoStream;
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
  const stopped = new Promise<void>((res) => {
    recorder.onstop = () => res();
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
  // Caller manages the AudioContext lifecycle so it can be reused across reels.
  return { blob: new Blob(chunks, { type: mime }), mimeType: mime, extension: ext };
}
