/**
 * Synthesized sound effects (no audio files): sine/triangle/square/saw tones plus band-passed noise,
 * the same recipes as SoundEngine.swift. Browsers only allow audio after a user gesture, so the
 * context is created on the first tap or key press via `unlockAudio()`.
 */

type Wave = OscillatorType;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

/** Call from a user gesture. Safe to call repeatedly. */
export function unlockAudio(): void {
  try {
    // Safari 16.4+: behave like iOS "ambient" audio (mixes with music, honours the silent switch).
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== 'ambient') session.type = 'ambient';
  } catch { /* not supported */ }
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, dur: number, wave: Wave = 'sine', vol = 0.12, slideTo: number | null = null, delay = 0): void {
  if (!ctx || !master || !enabled) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.03);
}

function noise(freq: number, dur: number, vol = 0.2): void {
  if (!ctx || !master || !noiseBuffer || !enabled) return;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuffer;
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.4;
  g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master);
  s.start(); s.stop(ctx.currentTime + dur);
}

const PENTATONIC = [0, 2, 4, 7, 9];

export const sfx = {
  /** Clearing a group. Pitch climbs a pentatonic scale with group size; big groups add a sparkle. */
  pop(n: number): void {
    const i = Math.max(0, n - 2);
    const semis = Math.min(PENTATONIC[i % 5] + 12 * Math.floor(i / 5), 36);
    const f = 330 * Math.pow(2, semis / 12);
    noise(1800 + semis * 60, 0.09, 0.25);
    tone(f, 0.22, 'triangle', 0.16);
    tone(f * 1.5, 0.16, 'sine', 0.07, null, 0.03);
    if (n >= 8) [0, 4, 7, 12].forEach((s, k) => tone(f * Math.pow(2, s / 12) * 2, 0.12, 'sine', 0.05, null, 0.06 + k * 0.045));
  },
  tick(): void { tone(1400, 0.025, 'square', 0.015); },
  arm(): void { tone(880, 0.06, 'sine', 0.06, 1100); },
  invalid(): void { tone(150, 0.14, 'sawtooth', 0.045, 90); },
  spawn(): void { tone(420, 0.06, 'sine', 0.05, 640); },
  unlock(): void {
    [784, 988, 1319, 1568].forEach((f, k) => tone(f, 0.18, 'sine', 0.09, null, k * 0.06));
    tone(2637, 0.3, 'sine', 0.03, null, 0.24);
  },
  win(): void { [523, 659, 784, 1047, 1319, 1568].forEach((f, k) => tone(f, 0.22, 'triangle', 0.12, null, k * 0.085)); },
  gameOver(): void { [392, 330, 262, 196].forEach((f, k) => tone(f, 0.28, 'sawtooth', 0.05, f * 0.97, k * 0.14)); }
};
