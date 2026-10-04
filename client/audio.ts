// Sonido 8-bit de terror 100 % sintetizado con WebAudio (sin ficheros de audio).
import type { SfxId } from '../shared/protocol';

let ctx: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let musicBus: GainNode;
let noiseBuf: AudioBuffer;
let muted = false;
let musicTimer: number | null = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new AudioContext();
  master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = 0.22; musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  try { muted = localStorage.getItem('nl_muted') === '1'; } catch { /* sin almacenamiento */ }
  master.gain.value = muted ? 0 : 0.6;
}

export function toggleMute(): boolean {
  muted = !muted;
  if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.6, ctx.currentTime, 0.05);
  try { localStorage.setItem('nl_muted', muted ? '1' : '0'); } catch { /* */ }
  return muted;
}
export const isMuted = () => muted;

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, bus = sfxBus) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur: number, freq: number, vol: number, delay = 0, type: BiquadFilterType = 'lowpass', f1?: number) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxBus);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

const SFX: Record<SfxId, (v: number) => void> = {
  bite: (v) => { noise(0.08, 1800, 0.5 * v); tone('square', 300, 90, 0.1, 0.25 * v); },
  claw: (v) => { noise(0.15, 4000, 0.45 * v, 0, 'highpass', 800); },
  punch: (v) => { tone('square', 180, 50, 0.1, 0.35 * v); noise(0.06, 900, 0.3 * v); },
  bat: (v) => { for (let i = 0; i < 3; i++) tone('square', 1400 + i * 200, 900, 0.05, 0.12 * v, i * 0.04); },
  howl: (v) => { tone('sawtooth', 300, 620, 0.5, 0.2 * v); tone('sawtooth', 620, 380, 0.7, 0.18 * v, 0.45); tone('triangle', 305, 640, 0.5, 0.15 * v); },
  bolt: (v) => { noise(0.1, 2500, 0.25 * v, 0, 'bandpass'); tone('triangle', 900, 200, 0.12, 0.15 * v); },
  stake: (v) => { tone('square', 120, 40, 0.15, 0.4 * v); noise(0.1, 600, 0.3 * v); },
  scream: (v) => { const f = 700 + Math.random() * 300; tone('square', f, f * 1.4, 0.12, 0.1 * v); tone('square', f * 1.4, f * 0.8, 0.25, 0.1 * v, 0.12); },
  pickup: (v) => { tone('square', 520, 520, 0.06, 0.18 * v); tone('square', 780, 780, 0.08, 0.18 * v, 0.06); tone('square', 1040, 1040, 0.1, 0.15 * v, 0.12); },
  coin: (v) => { tone('square', 990, 990, 0.06, 0.18 * v); tone('square', 1320, 1320, 0.15, 0.18 * v, 0.06); },
  curse: (v) => { tone('sawtooth', 90, 60, 0.6, 0.3 * v); tone('square', 180, 120, 0.6, 0.12 * v); },
  push: (v) => { noise(0.3, 300, 0.5 * v, 0, 'lowpass', 2000); tone('sine', 160, 40, 0.3, 0.4 * v); },
  mist: (v) => { noise(0.4, 600, 0.3 * v, 0, 'bandpass', 3000); },
  vanish: (v) => { tone('sine', 1200, 200, 0.4, 0.2 * v); tone('triangle', 600, 100, 0.4, 0.15 * v, 0.05); },
  level: (v) => { [523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, 0.1, 0.18 * v, i * 0.08)); },
  death: (v) => { tone('square', 400, 50, 0.8, 0.3 * v); noise(0.5, 400, 0.2 * v); },
  dash: (v) => { noise(0.25, 1200, 0.3 * v, 0, 'bandpass', 300); },
  wave: (v) => { tone('square', 660, 880, 0.08, 0.12 * v); tone('square', 880, 660, 0.08, 0.12 * v, 0.1); },
  taunt: (v) => { [392, 330, 392, 330, 523].forEach((f, i) => tone('square', f, f, 0.08, 0.13 * v, i * 0.09)); },
  ult: (v) => { [220, 277, 330, 440, 554].forEach((f, i) => tone('sawtooth', f, f * 1.01, 0.18, 0.12 * v, i * 0.06)); noise(0.6, 500, 0.25 * v, 0, 'lowpass', 3000); },
  scarab: (v) => { noise(0.05, 3500, 0.18 * v, 0, 'highpass'); tone('square', 900, 1300, 0.04, 0.06 * v, 0.02); },
  sand: (v) => { noise(1.2, 900, 0.45 * v, 0, 'bandpass', 300); tone('sawtooth', 70, 50, 1, 0.2 * v); },
  tomb: (v) => { tone('square', 140, 60, 0.25, 0.3 * v); noise(0.15, 300, 0.4 * v, 0.1); },
  evolve: (v) => { [262, 330, 392, 523, 659, 784].forEach((f, i) => tone('square', f, f, 0.12, 0.15 * v, i * 0.07)); },
  surprise: (v) => { tone('square', 300, 900, 0.12, 0.2 * v); tone('square', 900, 200, 0.25, 0.18 * v, 0.14); },
  groan: (v) => { const f = 90 + Math.random() * 30; tone('sawtooth', f, f * 0.7, 0.5, 0.22 * v); tone('square', f * 1.5, f, 0.45, 0.08 * v, 0.05); noise(0.35, 500, 0.12 * v, 0, 'bandpass', 250); },
  explode: (v) => { noise(0.6, 1500, 0.6 * v, 0, 'lowpass', 120); tone('square', 160, 30, 0.5, 0.35 * v); noise(0.25, 3000, 0.2 * v, 0.05, 'highpass'); },
  tentacle: (v) => { noise(0.3, 400, 0.4 * v, 0, 'bandpass', 1500); tone('sine', 70, 140, 0.3, 0.3 * v); tone('sawtooth', 110, 55, 0.35, 0.1 * v, 0.1); },
  splash: (v) => { noise(0.35, 2500, 0.45 * v, 0, 'bandpass', 500); for (let i = 0; i < 3; i++) tone('sine', 900 + Math.random() * 600, 300, 0.08, 0.08 * v, 0.05 + i * 0.05); },
  bubble: (v) => { for (let i = 0; i < 4; i++) { const f = 300 + Math.random() * 400; tone('sine', f, f * 2.2, 0.06, 0.1 * v, i * 0.07); } },
};

let lastPlayed: Record<string, number> = {};
export function playSfx(id: SfxId, volume = 1) {
  if (!ctx || muted || volume <= 0.02) return;
  const now = performance.now();
  if (now - (lastPlayed[id] ?? 0) < 40) return; // evita saturar
  lastPlayed[id] = now;
  SFX[id]?.(Math.min(1, volume));
}

/** Volumen según distancia al oyente. */
export function spatialVol(dx: number, dy: number) {
  const d = Math.hypot(dx, dy);
  return Math.max(0, 1 - d / 1000);
}

// ---------------------------------------------------------------------------
// Música: arpegio en menor + bajo + campanadas ocasionales
// ---------------------------------------------------------------------------
const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const PROG = [
  [57, 60, 64, 69], [53, 57, 60, 65], [55, 58, 62, 67], [52, 56, 59, 64], // Am, F, Gm, E
];
export function startMusic() {
  if (!ctx || musicTimer !== null) return;
  let step = 0;
  let next = ctx.currentTime + 0.1;
  const spb = 0.22; // segundos por paso
  const schedule = () => {
    if (!ctx) return;
    while (next < ctx.currentTime + 0.5) {
      const chord = PROG[Math.floor(step / 16) % PROG.length];
      const i = step % 16;
      const delay = next - ctx.currentTime;
      const arp = [0, 1, 2, 3, 2, 1, 0, 2][i % 8];
      tone('square', NOTE(chord[arp] + 12), NOTE(chord[arp] + 12), spb * 0.9, 0.06, delay, musicBus);
      if (i % 8 === 0) tone('triangle', NOTE(chord[0] - 12), NOTE(chord[0] - 12), spb * 7, 0.35, delay, musicBus);
      if (i === 0 && Math.floor(step / 16) % 4 === 3) tone('sine', NOTE(chord[0] + 24), NOTE(chord[0] + 24), 2.5, 0.05, delay, musicBus);
      step++;
      next += spb;
    }
  };
  musicTimer = window.setInterval(schedule, 120);
}

export function stopMusic() {
  if (musicTimer !== null) { clearInterval(musicTimer); musicTimer = null; }
}
