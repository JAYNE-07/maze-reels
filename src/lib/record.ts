// Record an animated canvas into a downloadable video.
//
// Critical: every reel gets its OWN offscreen canvas for recording. The
// caller's "preview canvas" is only used as a display mirror. This
// guarantees that frames drawn for reel N+1 can never end up captured
// inside reel N's MediaRecorder, even if browser timing for stream
// shutdown is fuzzy.

import { setupReelMusic, type MusicTiming } from './music';

export interface RecordResult {
  blob: Blob;
  mimeType: string;
  extension: string;
  /** Final-frame JPEG data URL used as the gallery <video> poster so cards
   *  show the solved maze even if the browser refuses to autoplay 8 videos. */
  poster: string;
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

/** The frame draw function is given the destination context so we can
 *  route it to the (isolated) recording canvas, not the preview. */
export type DrawFrame = (
  ctx: CanvasRenderingContext2D,
  t: number,
) => void;

export async function recordCanvas(
  previewCanvas: HTMLCanvasElement,
  fps: number,
  durationSec: number,
  drawFrame: DrawFrame,
  audioCtx?: AudioContext | null,
  musicTiming?: MusicTiming | null,
): Promise<RecordResult> {
  // Fresh, isolated canvas for THIS reel's recording. No state from the
  // previous reel can possibly leak in.
  const recordCv = document.createElement('canvas');
  recordCv.width = previewCanvas.width;
  recordCv.height = previewCanvas.height;
  const recordCtx = recordCv.getContext('2d')!;
  const previewCtx = previewCanvas.getContext('2d')!;

  // First frame, then mirror.
  drawFrame(recordCtx, 0);
  previewCtx.drawImage(recordCv, 0, 0);

  const videoStream = (recordCv as unknown as {
    captureStream: (fps: number) => MediaStream;
  }).captureStream(fps);

  // Optional audio routing (caller passes the gesture-warm AudioContext).
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
        walkEnd: 12.0,
        ctaAt: 12.0,
      };
      musicHandle = setupReelMusic(audioCtx, dest, durationSec, timing);
      combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);
    } catch (err) {
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
  // Wait until the recorder ACTUALLY transitions to inactive — no silent
  // early returns that would let the next reel start drawing while this
  // recorder is still capturing.
  const stopped = new Promise<void>((resolve, reject) => {
    let settled = false;
    recorder.onstop = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('MediaRecorder.onstop timed out'));
      }
    }, 30_000);
  });
  // Single-chunk mode (no timeslice) — one complete blob at stop. Avoids
  // potential fragment-stitching issues on some browsers.
  recorder.start();

  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      try {
        if (t >= durationSec) {
          drawFrame(recordCtx, durationSec);
          previewCtx.drawImage(recordCv, 0, 0);
          resolve();
          return;
        }
        drawFrame(recordCtx, t);
        previewCtx.drawImage(recordCv, 0, 0);
        requestAnimationFrame(tick);
      } catch (err) {
        // A bad frame would otherwise hang the rAF loop forever while the
        // MediaRecorder keeps capturing the last good frame. Log it and
        // resolve so the reel still finalises whatever it had.
        console.error('drawFrame failed at t=', t.toFixed(2), err);
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });

  // Let the recorder flush its final buffer cleanly.
  await new Promise((r) => setTimeout(r, 200));
  recorder.stop();
  await stopped;
  // Belt-and-braces: tear down tracks and clean up after onstop has fired.
  combinedStream.getTracks().forEach((tr) => tr.stop());
  await new Promise((r) => setTimeout(r, 100));
  musicHandle?.dispose();

  const blob = new Blob(chunks, { type: mime });
  if (!blob.size) {
    throw new Error('recorder produced no data');
  }
  const poster = recordCv.toDataURL('image/jpeg', 0.7);
  return { blob, mimeType: mime, extension: ext, poster };
}
