// Record an animated canvas into a downloadable video. Prefers MP4
// (Instagram-friendly) where the browser supports it, falls back to WebM.

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
): Promise<RecordResult> {
  // Draw the initial frame BEFORE the stream begins so the first sample
  // is meaningful rather than blank.
  onFrame(0);

  const stream = (canvas as unknown as {
    captureStream: (fps: number) => MediaStream;
  }).captureStream(fps);
  const { mime, ext } = pickMime();
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 8_000_000,
  });
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
  // Let the recorder collect any trailing chunk before stopping.
  await new Promise((r) => setTimeout(r, 150));
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((tr) => tr.stop());
  return { blob: new Blob(chunks, { type: mime }), mimeType: mime, extension: ext };
}
