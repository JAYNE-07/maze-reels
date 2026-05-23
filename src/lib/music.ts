// Procedural reel soundtrack. Four distinct sound layers, all synthesised:
//
//   1. Title bounce — quick upward "boing" + percussive thunk at title pop-in.
//   2. Anxious background — low rising drone + heartbeat thump on every beat.
//   3. Countdown beeps — three ascending tones at the 3 / 2 / 1 digits.
//   4. CTA pop — bright sawtooth sweep + triangle ding at the final pop.

export interface MusicTiming {
  /** Seconds from t=0 when the title bounces in. */
  titlePopAt: number;
  /** Seconds from t=0 when the 3-2-1 countdown begins (one beep per second). */
  countdownStart: number;
  /** Seconds from t=0 when the mascot starts walking. The anxious clock
   *  bed cuts out here so the solution reveal plays in silence. */
  walkStart: number;
  /** Seconds from t=0 when the CTA pops in. */
  ctaAt: number;
}

export interface ReelMusic {
  /** Tear down the audio subgraph created for this reel so consecutive
   *  reels don't accumulate orphan nodes inside the shared AudioContext. */
  dispose(): void;
}

export function setupReelMusic(
  ctx: AudioContext,
  out: AudioNode,
  durationSec: number,
  timing: MusicTiming,
): ReelMusic {
  const start = ctx.currentTime + 0.05;
  const master = ctx.createGain();
  master.gain.value = 0.55;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.ratio.value = 4;
  master.connect(compressor).connect(out);

  // The anxious bed only runs up to the moment the solution starts
  // walking — silence frames the reveal, then the CTA pop punctuates it.
  scheduleAnxiousBed(ctx, master, start, Math.min(durationSec, timing.walkStart));
  scheduleTitlePop(ctx, master, start + timing.titlePopAt);
  for (let i = 0; i < 3; i++) {
    const beepAt = start + timing.countdownStart + i;
    const freq = [550, 700, 880][i];
    scheduleCountdownBeep(ctx, master, beepAt, freq);
  }
  scheduleCtaPop(ctx, master, start + timing.ctaAt);

  return {
    dispose() {
      try {
        master.disconnect();
        compressor.disconnect();
      } catch {
        /* already disconnected */
      }
    },
  };
}

// ---- 2. anxious background bed -- clock ticking, dominant -------------
function scheduleAnxiousBed(
  ctx: AudioContext,
  out: AudioNode,
  start: number,
  durationSec: number,
) {
  // Steady clock at 120 BPM (a tick every half-second). Tick-tock pitch
  // alternation gives the unmistakable wall-clock feel.
  const tickInterval = 0.5;
  const ticksCount = Math.floor(durationSec / tickInterval);
  for (let i = 0; i < ticksCount; i++) {
    const when = start + i * tickInterval;
    // tick (higher) on even beats, tock (lower) on odd
    const isHigh = i % 2 === 0;
    scheduleClockTick(ctx, out, when, isHigh ? 2400 : 1700, 0.16);
  }

  // Faint sub-heartbeat every 2 beats to keep tension under the ticks.
  const thumpInterval = 1.0;
  const thumpsCount = Math.floor(durationSec / thumpInterval);
  for (let i = 0; i < thumpsCount; i++) {
    const when = start + i * thumpInterval;
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(72, when);
    thump.frequency.exponentialRampToValueAtTime(36, when + 0.12);
    const g = ctx.createGain();
    const intensity = 0.06 + (i / Math.max(1, thumpsCount)) * 0.12;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(intensity, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
    thump.connect(g).connect(out);
    thump.start(when);
    thump.stop(when + 0.22);
  }
}

function scheduleClockTick(
  ctx: AudioContext,
  out: AudioNode,
  when: number,
  freq: number,
  gain: number,
) {
  // Sharp filtered square — reads as a mechanical clock tick.
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = freq;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.003);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.06);
  osc.connect(filter).connect(g).connect(out);
  osc.start(when);
  osc.stop(when + 0.08);
}

// ---- 1. title pop -------------------------------------------------------
function scheduleTitlePop(ctx: AudioContext, out: AudioNode, when: number) {
  // upward sine swoop
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, when);
  osc.frequency.exponentialRampToValueAtTime(960, when + 0.18);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.28, when + 0.025);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.28);
  osc.connect(g).connect(out);
  osc.start(when);
  osc.stop(when + 0.32);

  // percussive thunk underneath
  const noise = createNoiseBuffer(ctx, 0.07);
  const nfilter = ctx.createBiquadFilter();
  nfilter.type = 'bandpass';
  nfilter.frequency.value = 600;
  nfilter.Q.value = 1.2;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0, when);
  ng.gain.linearRampToValueAtTime(0.18, when + 0.005);
  ng.gain.exponentialRampToValueAtTime(0.001, when + 0.09);
  noise.connect(nfilter).connect(ng).connect(out);
  noise.start(when);
  noise.stop(when + 0.1);
}

// ---- 3. countdown beep --------------------------------------------------
function scheduleCountdownBeep(
  ctx: AudioContext,
  out: AudioNode,
  when: number,
  freq: number,
) {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, when);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.34, when + 0.006);
  g.gain.linearRampToValueAtTime(0.28, when + 0.12);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.22);
  osc.connect(g).connect(out);
  osc.start(when);
  osc.stop(when + 0.25);

  // little click on attack for crispness
  const click = createNoiseBuffer(ctx, 0.02);
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.12, when);
  cg.gain.exponentialRampToValueAtTime(0.001, when + 0.025);
  click.connect(cg).connect(out);
  click.start(when);
  click.stop(when + 0.03);
}

// ---- 4. CTA pop ---------------------------------------------------------
function scheduleCtaPop(ctx: AudioContext, out: AudioNode, when: number) {
  // sawtooth rising sweep
  const sweep = ctx.createOscillator();
  sweep.type = 'sawtooth';
  sweep.frequency.setValueAtTime(180, when);
  sweep.frequency.exponentialRampToValueAtTime(1300, when + 0.3);
  const sweepFilter = ctx.createBiquadFilter();
  sweepFilter.type = 'bandpass';
  sweepFilter.Q.value = 3;
  sweepFilter.frequency.setValueAtTime(500, when);
  sweepFilter.frequency.exponentialRampToValueAtTime(2400, when + 0.35);
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0, when);
  sg.gain.linearRampToValueAtTime(0.22, when + 0.04);
  sg.gain.exponentialRampToValueAtTime(0.001, when + 0.45);
  sweep.connect(sweepFilter).connect(sg).connect(out);
  sweep.start(when);
  sweep.stop(when + 0.5);

  // triangle ding overlay
  const ding = ctx.createOscillator();
  ding.type = 'triangle';
  ding.frequency.setValueAtTime(1400, when + 0.06);
  ding.frequency.exponentialRampToValueAtTime(2000, when + 0.45);
  const dg = ctx.createGain();
  dg.gain.setValueAtTime(0, when + 0.06);
  dg.gain.linearRampToValueAtTime(0.22, when + 0.075);
  dg.gain.exponentialRampToValueAtTime(0.001, when + 0.65);
  ding.connect(dg).connect(out);
  ding.start(when + 0.06);
  ding.stop(when + 0.7);

  // burst of bright noise (like a crowd cheer flash)
  const noise = createNoiseBuffer(ctx, 0.35);
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.value = 1800;
  const nng = ctx.createGain();
  nng.gain.setValueAtTime(0, when);
  nng.gain.linearRampToValueAtTime(0.08, when + 0.04);
  nng.gain.exponentialRampToValueAtTime(0.001, when + 0.35);
  noise.connect(noiseFilter).connect(nng).connect(out);
  noise.start(when);
  noise.stop(when + 0.4);
}

// ---- helpers ------------------------------------------------------------
function createNoiseBuffer(ctx: AudioContext, durationSec: number) {
  const samples = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
  const node = ctx.createBufferSource();
  node.buffer = buffer;
  return node;
}
