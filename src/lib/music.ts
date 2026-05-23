// Procedurally generated "anxious / rushing" backing track. No asset files —
// everything is synthesized in the browser via the Web Audio API and captured
// straight into the MediaRecorder's audio track.
//
// Layers (rising tension across the reel duration):
//   1. Fast 16th-note clock ticks (alternating high/low — tick-tock urgency)
//   2. Low sine drone that slowly rises in pitch and volume
//   3. Heartbeat thump on every beat
//   4. Sawtooth sweep into the CTA — climax / release

export function setupAnxiousMusic(
  ctx: AudioContext,
  out: AudioNode,
  durationSec: number,
): void {
  const start = ctx.currentTime + 0.05;
  const master = ctx.createGain();
  master.gain.value = 0.55;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.ratio.value = 4;
  master.connect(compressor).connect(out);

  // ---- 1. ticking clock (16th notes, tick-tock) ----
  const bpm = 138;
  const tick = 60 / bpm / 4; // 16th
  const ticksCount = Math.floor(durationSec / tick);
  for (let i = 0; i < ticksCount; i++) {
    const when = start + i * tick;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = i % 2 === 0 ? 2400 : 1900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.05, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
    osc.connect(g).connect(master);
    osc.start(when);
    osc.stop(when + 0.07);
  }

  // ---- 2. low drone, slowly rising ----
  const drone = ctx.createOscillator();
  drone.type = 'sawtooth';
  drone.frequency.setValueAtTime(55, start);
  drone.frequency.exponentialRampToValueAtTime(110, start + durationSec * 0.7);
  drone.frequency.exponentialRampToValueAtTime(165, start + durationSec - 0.1);
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.frequency.setValueAtTime(180, start);
  droneFilter.frequency.exponentialRampToValueAtTime(700, start + durationSec - 0.2);
  const droneG = ctx.createGain();
  droneG.gain.setValueAtTime(0, start);
  droneG.gain.linearRampToValueAtTime(0.08, start + 0.4);
  droneG.gain.linearRampToValueAtTime(0.16, start + durationSec * 0.55);
  droneG.gain.linearRampToValueAtTime(0.22, start + durationSec - 0.3);
  droneG.gain.linearRampToValueAtTime(0, start + durationSec);
  drone.connect(droneFilter).connect(droneG).connect(master);
  drone.start(start);
  drone.stop(start + durationSec + 0.1);

  // ---- 3. heartbeat thump on quarter beats ----
  const beat = 60 / bpm;
  const beatsCount = Math.floor(durationSec / beat);
  for (let i = 0; i < beatsCount; i++) {
    const when = start + i * beat;
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(85, when);
    thump.frequency.exponentialRampToValueAtTime(38, when + 0.12);
    const g = ctx.createGain();
    // tension rises — later thumps are louder
    const intensity = 0.18 + (i / beatsCount) * 0.18;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(intensity, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.16);
    thump.connect(g).connect(master);
    thump.start(when);
    thump.stop(when + 0.2);
  }

  // ---- 4. climax sweep into the CTA pop ----
  const sweepStart = start + durationSec - 1.4;
  const sweep = ctx.createOscillator();
  sweep.type = 'sawtooth';
  sweep.frequency.setValueAtTime(220, sweepStart);
  sweep.frequency.exponentialRampToValueAtTime(900, sweepStart + 0.9);
  const sweepFilter = ctx.createBiquadFilter();
  sweepFilter.type = 'bandpass';
  sweepFilter.Q.value = 4;
  sweepFilter.frequency.setValueAtTime(600, sweepStart);
  sweepFilter.frequency.exponentialRampToValueAtTime(2400, sweepStart + 0.95);
  const sweepG = ctx.createGain();
  sweepG.gain.setValueAtTime(0, sweepStart);
  sweepG.gain.linearRampToValueAtTime(0.18, sweepStart + 0.85);
  sweepG.gain.linearRampToValueAtTime(0, sweepStart + 1.15);
  sweep.connect(sweepFilter).connect(sweepG).connect(master);
  sweep.start(sweepStart);
  sweep.stop(sweepStart + 1.2);

  // ---- 5. final "ding" punctuation on the CTA pop ----
  const dingTime = start + durationSec - 0.4;
  const ding = ctx.createOscillator();
  ding.type = 'triangle';
  ding.frequency.setValueAtTime(1200, dingTime);
  ding.frequency.exponentialRampToValueAtTime(1800, dingTime + 0.3);
  const dingG = ctx.createGain();
  dingG.gain.setValueAtTime(0, dingTime);
  dingG.gain.linearRampToValueAtTime(0.2, dingTime + 0.01);
  dingG.gain.exponentialRampToValueAtTime(0.001, dingTime + 0.4);
  ding.connect(dingG).connect(master);
  ding.start(dingTime);
  ding.stop(dingTime + 0.45);
}
