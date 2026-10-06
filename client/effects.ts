// Efectos visuales temáticos (solo visuales: el gameplay lo decide el servidor).
// Cada monstruo tiene su lenguaje visual:
//  Vampiro: sangre, niebla, murciélagos, sombras · Lobo: ondas, polvo, arañazos, hojas, energía lunar
//  Momia: arena, escarabajos, vendas, jeroglíficos · Dama: ropa, siluetas parciales, huellas, distorsión
import { PIXEL } from '../shared/constants';
import { waterAt, type GameMap } from '../shared/maps';
import { fbm } from '../shared/noise';
import { Anim, type GameEvent } from '../shared/protocol';
import { getClothesPile, getFrame, getItem, SH, SW } from './sprites';

type FxEv = Extract<GameEvent, { e: 'fx' }>;
type Pos = { x: number; y: number } | null;

export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; grav: number; glow?: boolean }

interface Effect {
  t: number; // tiempo transcurrido
  dur: number;
  layer: 'ground' | 'top' | 'glow';
  draw(ctx: CanvasRenderingContext2D, k: number, now: number): void;
  update?(dt: number): void;
}

const snap = (v: number) => Math.round(v / PIXEL) * PIXEL;

/** Elipse pixelada (contorno hecho de "píxeles" del mundo). */
export function pixelEllipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, thick = 1) {
  ctx.fillStyle = color;
  const n = Math.max(10, Math.round((rx + ry) / 2.2));
  let lx = NaN, ly = NaN;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const px = snap(x + Math.cos(a) * rx), py = snap(y + Math.sin(a) * ry);
    if (px === lx && py === ly) continue;
    lx = px; ly = py;
    ctx.fillRect(px, py, PIXEL * thick, PIXEL);
  }
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const hash2 = (x: number, y: number, s: number) => { const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
// paleta de agua poco profunda (en la línea del agua del terreno, algo más clara)
const PUDDLE_RAMP = ['#0e2236', '#143048', '#1a3e58', '#22506a', '#2c6078'];
const PUDDLE_FOAM = ['#3a5e7e', '#4e7494', '#6a8eaa'];
const puddleCache = new Map<string, HTMLCanvasElement>();
/** Charca horneada en pixel art: orilla mojada, espuma y agua con tramado Bayer (como el agua del terreno). */
function bakePuddle(r: number, seed: number): HTMLCanvasElement {
  const key = `${r}|${seed}`;
  let c = puddleCache.get(key);
  if (c) return c;
  const ry = r * 0.62;
  const W = Math.ceil((r * 2.3) / PIXEL), H = Math.ceil((ry * 2.3) / PIXEL);
  c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const ramp = PUDDLE_RAMP.map(hex), foam = PUDDLE_FOAM.map(hex);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const dx = (i + 0.5) * PIXEL - W * PIXEL / 2, dy = (j + 0.5) * PIXEL - H * PIXEL / 2;
    const ang = Math.atan2(dy / ry, dx / r);
    const wob = Math.sin(ang * 3 + seed) * 0.06 + Math.sin(ang * 7 + seed * 2.3) * 0.04 + (hash2(i, j, seed) - 0.5) * 0.04;
    const d = Math.hypot(dx / r, dy / ry) + wob;
    if (d > 1.1) continue;
    const b = BAYER4[(j & 3) * 4 + (i & 3)];
    let col: number[]; let a = 255;
    if (d > 1.0) { col = [10, 14, 18]; a = 110; } // tierra mojada
    else if (d > 0.88) col = foam[Math.min(2, Math.floor((1 - (d - 0.88) / 0.12) * 1.5 + b))];
    else {
      // más profunda en el centro, reflejo de luna arriba a la izquierda
      let t = (1 - d) * 3.2 * 0.5 + b * 0.9;
      if (dy < 0 && dx < 0 && d > 0.45 && d < 0.7) t += 1.2;
      col = ramp[Math.max(0, Math.min(4, Math.floor(4 - t)))];
    }
    const o = (j * W + i) * 4;
    img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = a;
  }
  g.putImageData(img, 0, 0);
  puddleCache.set(key, c);
  if (puddleCache.size > 300) puddleCache.delete(puddleCache.keys().next().value!);
  return c;
}

/** Pequeños glifos egipcios en pixel art (5x5). */
const GLYPHS = [
  ['..x..', '.xxx.', '..x..', '..x..', '..x..'], // ankh simplificado
  ['.xxx.', 'x.x.x', '.xxx.', '..x..', '.x.x.'], // ojo
  ['x...x', '.x.x.', '..x..', '.x.x.', 'x...x'],
  ['.x.x.', 'xxxxx', '.xxx.', 'xxxxx', '.x.x.'], // escarabajo
  ['xxxxx', 'x...x', 'x.x.x', 'x...x', 'xxxxx'],
];

function pixelGlyph(ctx: CanvasRenderingContext2D, g: string[], x: number, y: number, s: number) {
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (g[j][i] === 'x') ctx.fillRect(snap(x) + i * s, snap(y) + j * s, s, s);
}

/** Mano espectral pixelada que sale del suelo. */
function spectralHand(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, color: string) {
  const s = PIXEL;
  ctx.fillStyle = color;
  const top = y - h;
  ctx.fillRect(snap(x) - s, snap(top) + 4 * s, 3 * s, h - 4 * s); // muñeca
  ctx.fillRect(snap(x) - 2 * s, snap(top) + 2 * s, 5 * s, 3 * s); // palma
  for (let f = 0; f < 4; f++) ctx.fillRect(snap(x) - 2 * s + f * s * 1.3, snap(top) - (f === 1 || f === 2 ? 2 : 1) * s, s, 3 * s); // dedos
}

const cloudCache = new Map<string, HTMLCanvasElement>();
// de la panza en sombra a las crestas iluminadas por la luna
const CLOUD_RAMP = ['#14161f', '#1c202c', '#262b3a', '#323949', '#41495c', '#545e74', '#6c7790', '#8a95ad'].map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
/** Masa de nubes de tormenta horneada en pixel art: densidad suave (bocanadas + ruido fractal que rompe
 *  los contornos), luz que llega desde arriba, panza oscura abajo y bordes deshilachados con tramado. */
function bakeClouds(r: number, seed: number): HTMLCanvasElement {
  const key = `${r}|${seed}`;
  let c = cloudCache.get(key);
  if (c) return c;
  const W = Math.ceil((r * 2.3) / PIXEL), H = Math.ceil((r * 1.6) / PIXEL);
  c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const rnd = (i: number, k: number) => hash2(i, k, seed * 17.3);
  // bocanadas grandes y pequeñas repartidas por la elipse; se suman (no se recortan) para que se fundan
  const dens = new Float32Array(W * H);
  const n = Math.round(r / 6);
  for (let i = 0; i < n; i++) {
    const a = rnd(i, 1) * Math.PI * 2, d = Math.sqrt(rnd(i, 2)) * 0.92;
    const px = W / 2 + Math.cos(a) * d * (W / 2 - 16), py = H / 2 + Math.sin(a) * d * (H / 2 - 16);
    const pr = (r / PIXEL) * (0.12 + rnd(i, 3) * 0.16), w = 0.6 + rnd(i, 4) * 0.5;
    const x0 = Math.max(0, Math.floor(px - pr)), x1 = Math.min(W - 1, Math.ceil(px + pr));
    const y0 = Math.max(0, Math.floor(py - pr)), y1 = Math.min(H - 1, Math.ceil(py + pr));
    for (let j = y0; j <= y1; j++) for (let k = x0; k <= x1; k++) {
      const q = ((k - px) / pr) ** 2 + ((j - py) / (pr * 0.75)) ** 2;
      if (q < 1) dens[j * W + k] += (1 - q) * (1 - q) * w;
    }
  }
  const val = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let k = 0; k < W; k++) {
    const o = j * W + k;
    const nz = fbm(k * PIXEL, j * PIXEL, seed * 31 + 7, 70, 3); // ruido fractal: rompe los círculos
    val[o] = dens[o] * (0.6 + nz * 0.8) - 0.08;
  }
  for (let j = 0; j < H; j++) for (let k = 0; k < W; k++) {
    const o = j * W + k, v = val[o];
    const b = BAYER4[(j & 3) * 4 + (k & 3)];
    if (v + (b - 0.5) * 0.14 < 0.16) continue; // bordes deshilachados
    // luz: cuánto más denso es aquí que un poco más arriba (cresta iluminada) y gradiente vertical de la masa
    const up = j >= 4 ? val[o - 4 * W] : 0;
    const lit = Math.max(-0.5, Math.min(0.7, (v - up) * 1.15));
    const t = 0.36 + lit * 0.5 - (j / H) * 0.35 + Math.min(0.25, v * 0.15) + (b - 0.5) * 0.18;
    const col = CLOUD_RAMP[Math.max(0, Math.min(CLOUD_RAMP.length - 1, Math.round(t * (CLOUD_RAMP.length - 1))))];
    const q = o * 4;
    img.data[q] = col[0]; img.data[q + 1] = col[1]; img.data[q + 2] = col[2];
    img.data[q + 3] = v < 0.24 ? 150 : v < 0.34 ? 205 : 245;
  }
  g.putImageData(img, 0, 0);
  cloudCache.set(key, c);
  if (cloudCache.size > 8) cloudCache.delete(cloudCache.keys().next().value!);
  return c;
}

export class Effects {
  list: Effect[] = [];
  particles: Particle[] = [];
  lastFlash = -1e9; // último relámpago grande (ilumina las nubes de tormenta)
  constructor(private map: GameMap, private entPos: (id: number) => Pos) {}

  /** Color de partícula según el terreno bajo un punto (polvo, hojas, agujas, salpicaduras). */
  terrainColors(x: number, y: number): string[] {
    if (waterAt(this.map, x, y)) return ['#6a9ac0', '#a0c8e8', '#3a6a90'];
    const n = fbm(x, y, this.map.seed, 420, 3);
    switch (this.map.theme) {
      case 'elm': return n < 0.4 ? ['#5a4632', '#3a2c20', '#7a6046'] : ['#a0501a', '#c07020', '#3a6a2a', '#8a2a14'];
      case 'transylvania': return n < 0.42 ? ['#5a5660', '#3a3640', '#7a7680'] : ['#5a5236', '#3a3424', '#2e4a2e'];
      case 'swamp': return n < 0.4 ? ['#2b231c', '#3a2c20', '#1a1512'] : ['#2a361d', '#212b18', '#3a4a24'];
      default: return n < 0.3 ? ['#5a4632', '#463626'] : ['#5a4022', '#2c5236', '#463522'];
    }
  }

  burst(x: number, y: number, n: number, colors: string[], speed: number, size: number, grav = 400, life = 0.6, glow = false) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life, max: life, color: colors[i % colors.length], size: size + Math.floor(Math.random() * 2), grav, glow });
    }
  }

  spray(x: number, y: number, a: number, n: number, colors: string[], speed: number) {
    for (let i = 0; i < n; i++) {
      const aa = a + (Math.random() - 0.5) * 1.2, s = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({ x, y, vx: Math.cos(aa) * s, vy: Math.sin(aa) * s * 0.6 - 40, life: 0.5, max: 0.5, color: colors[i % colors.length], size: 3, grav: 300 });
    }
  }

  // ------------------------------------------------------------------ entrada de eventos
  spawn(ev: FxEv, myId: number) {
    const { x, y } = ev;
    switch (ev.f) {
      case 'swing': this.swing(ev); break;
      case 'drain': this.drain(ev); break;
      case 'ghosthit': this.ghostHit(ev); break;
      case 'undress': this.undress(ev); break;
      case 'mist': this.mist(ev); break;
      case 'mistTrail': this.mistTrail(ev); break;
      case 'crimson': this.crimson(ev); break;
      case 'orbitBlock': this.burst(x, y - 30, 10, ['#2a1a3a', '#ff2040', '#5a3a6a'], 160, 3); break;
      case 'howl': this.howl(ev); break;
      case 'moon': this.moonFlash(ev); break;
      case 'dash': this.spray(x, y, (ev.r ?? 0) + Math.PI, 16, this.terrainColors(x, y), 160); break;
      case 'prey': if (ev.n) this.clawMarks(x, y - 40, 0, '#ff3040', 0.35, 1); break;
      case 'curse': this.curse(ev); break;
      case 'curseMark': this.burst(x, y - 50, ev.n ? 16 : 8, ev.n ? ['#40ff80', '#a0ffd0', '#1a6a3a'] : ['#40ff80', '#e0c040'], 120, 3, 0, 0.7, true); break;
      case 'storm': break; // la tormenta es un proyectil; su aspecto se dibuja en drawStorm
      case 'entomb': this.entomb(ev); break;
      case 'disguise': this.disguise(ev); break;
      case 'surprise': this.surprise(ev); break;
      case 'step': this.footprint(ev); break;
      case 'vanish': this.ripple(x, y - 40, '#a0d0ff', 0.6); break;
      case 'reveal': this.ripple(x, y - 40, '#e0f0ff', 0.4); break;
      case 'frenzy': this.burst(x, y - 30, 10, ['#c0e0ff', '#ffffff'], 140, 2, 0, 0.4); break;
      case 'evolve': this.evolve(ev, myId); break;
      case 'push': this.ripple(x, y - 20, '#c0e0ff', 0.4); break;
      case 'infect': this.infect(ev); break;
      case 'emerge': this.emerge(ev); break;
      case 'fatboom': this.fatboom(ev); break;
      case 'meat': this.meatThrow(ev); break;
      case 'tentacleWarn': this.tentacleWarn(ev); break;
      case 'tentacle': this.tentacle(ev); break;
      case 'dive': this.splash(x, y, 0.8); break;
      case 'surface': this.splash(x, y, 1); break;
      case 'splash': this.splash(x, y, (ev.r ?? 60) / 60); break;
      case 'descend': this.lightPillar(x, y, 1.4, '#fff0a0'); break;
      case 'smite': this.smite(x, y); break;
      case 'holysplash': this.holySplash(x, y, ev.r ?? 70); break;
      case 'sleep': this.burst(x, y - 50, 14, ['#a070ff', '#e0d0ff', '#4030a0'], 80, 3, -30, 1, true); this.ripple(x, y - 40, '#c0a8ff', 0.6, 40); break;
      case 'lullaby': this.lullaby(ev); break;
      case 'prop': this.burst(x, y - 30, 22, ['#2a2040', '#4a3a6a', '#a070ff', '#1a1424'], 140, 4, -20, 0.7); break;
      case 'ambush': this.clawMarks(x + Math.cos(ev.r ?? 0) * 40, y - 42, ev.r ?? 0, '#ff60a0', 0.35, 1.6); this.ripple(x, y - 30, '#a070ff', 0.4, 60); break;
      case 'dreamwalk': this.dreamwalk(ev); break;
      case 'shards': this.burst(x, y - 30, ev.n ?? 5, ['#e8f4ff', '#a0c0e0', '#ff3040'], 170, 2, 500, 0.45); break;
      case 'mirror': this.burst(x, y - 30, 10, ['#e8f4ff', '#ff3040'], 100, 3, -20, 0.6, true); break;
      case 'mirrorBoom': this.mirrorBoom(ev); break;
      case 'maryOut': this.burst(x, y - 40, 20, ['#e8f4ff', '#a0c0e0', '#ff3040'], 220, 3, 300, 0.6, true); this.ripple(x, y - 30, '#ff4060', 0.5, 50); break;
      case 'slam': this.slam(ev); break;
      case 'spark': this.spark(ev); break;
      case 'lightning': this.lightning(x, y, !!ev.n); break;
      case 'faceSteal': this.faceSteal(ev); break;
      case 'charm': this.charmFx(ev); break;
      case 'mimic': this.burst(x, y - 40, 18, ev.c === 'npc' ? ['#c0c0c0', '#8a8a8a', '#e0e0e0'] : ['#ffe060', '#c8c0d0', '#ffffff'], 120, 3, -40, 0.6); break;
      case 'potion': this.potionSplash(ev); break;
      case 'broom': this.burst(x, y - 20, 14, ['#a0ff40', '#c060ff', '#ffe060', '#6a4a28'], 140, 3, 100, 0.6, true); break;
      case 'rage': this.rageFx(ev); break;
      case 'wings': this.burst(x, y - 30, 16, ['#ff4a8a', '#ffd0e0', '#4a0a20'], 150, 3, ev.n ? -60 : 120, 0.6, true); this.ripple(x, y - 10, '#ff80b0', 0.4, 40); break;
      case 'thrall': this.thrallFx(ev); break;
      case 'rooted': this.rootedFx(ev); break;
      case 'treeFire': this.burst(x, y - 20, 30, ['#ff6020', '#ffd040', '#c02010', '#3a3430'], 220, 4, -60, 0.9, true); this.ripple(x, y, '#ff8020', 0.5, (ev.r ?? 30) + 30); break;
      case 'shock': this.shockFx(ev); break;
      case 'fireBoom': this.burst(x, y - 20, 40, ['#ff6020', '#ffd040', '#c02010', '#ffffff'], (ev.r ?? 90) * 3, 4, 250, 0.7, true); this.ripple(x, y, '#ff8020', 0.5, ev.r ?? 90); break;
      case 'slimeSplit': this.burst(x, y - 20, ev.n === 2 ? 50 : 22, ['#60d040', '#a0ff70', '#e0ff90'], ev.n === 2 ? 320 : 160, 4, 400, 0.6); if (ev.n === 2) this.ripple(x, y, '#a0ff70', 0.6, 120); break;
      case 'slimeBoom': this.burst(x, y - 15, 30, ['#60d040', '#a0ff70', '#3a6a10', '#e0ff90'], (ev.r ?? 100) * 2.6, 4, 450, 0.6); this.ripple(x, y, '#a0ff70', 0.5, ev.r ?? 100); break;
      case 'ufoBeam': this.ufoBeam(ev); break;
      case 'rain': this.rainCloud(ev); break;
      case 'confetti': this.confetti(ev); break;
      case 'allyAsk': this.allyAsk(ev); break;
      case 'bowl': this.add(ev.d ?? 2.5, 'glow', (ctx, k) => { const pos = (ev.o !== undefined ? this.entPos(ev.o) : null) ?? ev; ctx.globalAlpha = 0.6; ctx.fillStyle = '#a0d8f0'; for (let i = 0; i < 3; i++) { const t = (k * 6 + i / 3) % 1; ctx.fillRect(snap(pos.x + Math.cos(i * 2.1) * 10), snap(pos.y - 70 + t * 14), PIXEL, PIXEL); } ctx.globalAlpha = 1; }); break;
      case 'hypno': this.burst(x, y - 50, 14, ['#40ff90', '#ffffff', '#ff40c0'], 100, 3, -20, 0.8, true); this.ripple(x, y - 40, '#40ff90', 0.6, 40); break;
      case 'tvWave': this.tvWave(ev); break;
      case 'ufoRay': this.ufoRay(ev); break;
      case 'scare': this.ripple(x, y - 20, '#ffb020', 0.6, ev.r ?? 200); this.burst(x, y - 50, 10, ['#141018', '#2a2030'], 200, 3, -40, 0.8); break;
      case 'leapLand': this.burst(x, y, 16, this.terrainColors(x, y), 180, 3, 400, 0.5); this.ripple(x, y, '#e8e8f0', 0.4, ev.r ?? 120); break;
      case 'sprout': this.burst(x, y - 10, 22, ['#5a4632', '#2e4a24', '#a0e040', '#4a7a34'], 200, 3, 400, 0.6); this.ripple(x, y, '#a0e040', 0.5, 40); break;
      case 'bramble': this.brambleFx(ev); break;
      case 'forest': if (ev.c === 'wheat') { this.burst(x, y - 30, 60, ['#e0c050', '#c8a040', '#8a6a20'], 420, 4, 200, 1); this.ripple(x, y, '#e0c050', 0.9, ev.r ?? 320); break; }
        this.burst(x, y - 30, 50, ['#2e4a24', '#4a7a34', '#a0e040', '#5a4632'], 420, 4, 200, 1, false); this.ripple(x, y, '#a0e040', 0.9, ev.r ?? 320); break;
      case 'phase': this.burst(x, y - 40, 16, ['#e8ecf4', '#a0e8ff', '#8a98b0'], 120, 3, -40, 0.6, true); this.ripple(x, y - 30, '#c0e8ff', 0.5, 40); break;
      case 'objSpawn': this.objSpawn(ev); break;
      case 'drainBeam': this.drainBeam(ev); break;
      case 'heartHit': this.burst(x, y - 40, 12, ['#ff4a8a', '#ffd0e0', '#ffffff'], 140, 3, 0, 0.6, true); break;
      case 'hexed': this.burst(x, y - 20, 18, ['#c060ff', '#80e020', '#ffffff'], 140, 3, 100, 0.6, true); this.ripple(x, y - 10, '#c060ff', 0.4, 30); break;
      case 'hexzone': this.burst(x, y, 40, ['#c060ff', '#5a2a8a', '#80e020'], 300, 4, 300, 0.8, true); this.ripple(x, y, '#c060ff', 0.7, ev.r ?? 250); break;
      case 'tvBolt': this.tvBolt(ev); break;
      case 'tvPop': this.tvPop(ev); break;
      case 'lick': this.lick(ev); break;
      case 'reap': this.reap(ev); break;
      case 'deathMark': this.deathMark(ev); break;
      case 'blink': this.blink(ev); break;
      case 'unitBoom': this.unitBoom(ev); break;
      case 'assimilate': this.assimilate(ev); break;
      case 'boneWarn': this.boneWarn(ev); break;
      case 'boneSlam': this.boneSlam(ev); break;
      case 'raise': this.raise(ev); break;
      case 'ghostRise': this.ghostRise(ev); break;
      case 'lockOn': this.lockOn(ev); break;
      case 'asteroid': this.asteroid(ev); break;
      case 'hatch': this.burst(x, y - 20, 24, ['#e8e0c8', '#f8f4e8', '#6a8a4a'], 200, 3, 400, 0.6); this.ripple(x, y, '#e8e0c8', 0.4, 50); break;
      case 'burrow': this.burrow(ev); break;
      case 'quake': this.burst(x, y, Math.min(40, 10 + (ev.r ?? 50) / 6), ['#c8a060', '#a8844a', '#7a5e34', ...this.terrainColors(x, y)], (ev.r ?? 50) * 2.2, 3, 450, 0.55); this.ripple(x, y, '#c8a060', 0.45, ev.r ?? 50); break;
      case 'spit': this.spray(x, y - 20, ev.r ?? 0, 24, ['#c8a060', '#a07a40', '#5a2a1a', '#ffd040'], 340); break;
      case 'arm': this.burst(x, y - 40, 16, ev.c === 'torch' ? ['#ff9020', '#ffe060', '#ffffff'] : ['#e0c060', '#c0c0c8', '#ffffff'], 130, 3, -40, 0.6, true); this.ripple(x, y - 20, '#e0c060', 0.4, 36); break;
      case 'buttStroke': this.buttStroke(ev); break;
      case 'shapeshift': this.burst(x, y - 30, 30, ['#c0ff60', '#6a8a4a', '#e8e0c8', '#c02020'], 200, 3, 100, 0.6, true); this.ripple(x, y - 20, '#c0ff60', 0.5, 60); break;
      case 'critterPop': this.burst(x, y - 16, 14, ['#ffe080', '#ffffff', '#c0a040'], 140, 3, 200, 0.6, true); this.ripple(x, y, '#ffe080', 0.4, 30); break;
      case 'summon': this.lightPillar(x, y, ev.n ? 1 : 0.8, ev.n ? '#ff4060' : '#c060ff'); this.burst(x, y - 30, 24, ['#c060ff', '#ff4060', '#2e1a3a'], 200, 3, 0, 0.8, true); break;
    }
  }

  // ------------------------------------------------------------------ efectos concretos
  private swing(ev: FxEv) {
    const a = ev.r ?? 0, x = ev.x, y = ev.y - 42;
    const reach = Math.max(40, (ev.d ?? 60) * 0.75);
    if (ev.c === 'werewolf') {
      const col = (ev.n ?? 0) >= 2 ? '#d8f0ff' : '#ffffff';
      this.clawMarks(x, y, a, col, 0.18, reach / 46);
      this.spray(ev.x + Math.cos(a) * reach * 0.6, ev.y + Math.sin(a) * reach * 0.4, a, 10, this.terrainColors(ev.x, ev.y), 180);
    } else if (ev.c === 'vampire') {
      // mordisco: dos mandíbulas que se cierran
      this.add(0.2, 'top', (ctx, k) => {
        const r = 30, close = Math.min(1, k * 2.2);
        ctx.strokeStyle = `rgba(200,20,40,${1 - k})`; ctx.lineWidth = 6;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * 10, y + Math.sin(a) * 10 + s * (12 - close * 10), r, a - 0.7, a + 0.7);
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(255,255,255,${1 - k})`;
        for (const s of [-1, 1]) ctx.fillRect(snap(x + Math.cos(a) * 34), snap(y + Math.sin(a) * 34 + s * (10 - close * 8)), 3, 6);
      });
    } else if (ev.c === 'nightmare') {
      // zarpa de sombra: tres trazos violetas que se deshacen
      this.clawMarks(x, y, a, (ev.n ?? 0) >= 2 ? '#c0a0ff' : '#7050c0', 0.22, reach / 50);
      this.burst(x + Math.cos(a) * reach * 0.6, y + Math.sin(a) * reach * 0.6, 6, ['#2a2040', '#a070ff'], 60, 3, -40, 0.5, true);
    } else if (ev.c === 'mary') {
      // cristal: arco de esquirlas brillantes
      this.add(0.2, 'top', (ctx, k) => {
        for (let i = 0; i < 7; i++) {
          const aa = a - 0.7 + (i / 6) * 1.4, rr = reach * (0.55 + k * 0.5);
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = i % 2 ? '#e8f4ff' : '#ff3040';
          ctx.fillRect(snap(x + Math.cos(aa) * rr), snap(y + Math.sin(aa) * rr), PIXEL, PIXEL * 2);
        }
        ctx.globalAlpha = 1;
      });
    } else if (ev.c === 'kthula') {
      // latigazo de tentáculo
      this.add(0.22, 'top', (ctx, k) => {
        ctx.fillStyle = (ev.n ?? 0) >= 2 ? '#60e0a0' : '#3a8a7a';
        const len = reach * 1.1 * Math.min(1, k * 3);
        for (let s2 = 0; s2 < len; s2 += PIXEL) {
          const wob = Math.sin(s2 / 10 - k * 12) * 8 * (s2 / len);
          const px = x + Math.cos(a) * s2 - Math.sin(a) * wob, py = y + Math.sin(a) * s2 + Math.cos(a) * wob;
          const w = s2 > len * 0.75 ? PIXEL : PIXEL * 2;
          ctx.globalAlpha = 1 - k;
          ctx.fillRect(snap(px), snap(py), w, w);
        }
        ctx.globalAlpha = 1;
      });
      this.burst(ev.x, ev.y - 40, 4, ['#60e0a0', '#a0fff0'], 80, 2, 0, 0.4, true);
    } else if (ev.c === 'zombie') {
      this.clawMarks(x, y, a, '#b0d070', 0.16, reach / 52);
    } else if (ev.c === 'kappa') {
      // tajo de agua: media luna de gotas que barre de un lado a otro y salpica
      this.add(0.26, 'top', (ctx, k) => {
        const sweep = Math.min(1, k * 2.4), half = 1.05;
        for (let i = 0; i <= 16; i++) {
          const t = i / 16;
          if (t > sweep) break;
          const aa = a - half + t * half * 2, rr = reach * (0.55 + Math.sin(t * Math.PI) * 0.35);
          const px = x + Math.cos(aa) * rr, py = y + Math.sin(aa) * rr * 0.8;
          ctx.globalAlpha = (1 - k) * (0.4 + t * 0.6);
          ctx.fillStyle = '#3a90d0'; ctx.fillRect(snap(px), snap(py), PIXEL * 3, PIXEL * 2);
          ctx.fillStyle = '#a0d8f8'; ctx.fillRect(snap(px), snap(py), PIXEL * 2, PIXEL);
          if (i % 4 === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(snap(px + PIXEL), snap(py - PIXEL), PIXEL, PIXEL); }
        }
        ctx.globalAlpha = 1;
      });
      this.spray(ev.x + Math.cos(a) * reach * 0.7, ev.y + Math.sin(a) * reach * 0.5, a, 12, ['#c8e8f8', '#7aa6d0', '#3a90d0', '#ffffff'], 220);
    } else if (ev.c === 'demon') {
      // zarpazo de fuego: arco de llamas y brasas
      this.add(0.24, 'glow', (ctx, k) => {
        for (let i = 0; i <= 12; i++) {
          const t = i / 12, aa = a - 0.9 + t * 1.8, rr = reach * 0.75;
          const px = x + Math.cos(aa) * rr, py = y + Math.sin(aa) * rr * 0.8;
          const fh = PIXEL * (2 + ((i + Math.floor(k * 10)) % 3));
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = '#c02010'; ctx.fillRect(snap(px), snap(py - fh), PIXEL * 2, fh);
          ctx.fillStyle = '#ffb030'; ctx.fillRect(snap(px), snap(py - fh + PIXEL), PIXEL, fh - PIXEL);
        }
        ctx.globalAlpha = 1;
      });
      this.burst(ev.x + Math.cos(a) * reach * 0.6, ev.y - 30 + Math.sin(a) * reach * 0.4, 10, ['#ff6020', '#ffd040', '#c02010'], 160, 3, -80, 0.5, true);
    } else if (ev.c === 'reaper') {
      // guadañazo: media luna fría y ancha con estela de almas
      this.add(0.24, 'top', (ctx, k) => {
        const sweep = Math.min(1, k * 2.6);
        for (let i = 0; i <= 20; i++) {
          const t = i / 20;
          if (t > sweep) break;
          const aa = a + 1.25 - t * 2.5, rr = reach * 0.85;
          const th = Math.max(1, Math.round(Math.sin(t * Math.PI) * 3));
          ctx.globalAlpha = (1 - k) * (0.3 + t * 0.7);
          for (let j = 0; j < th; j++) { ctx.fillStyle = j === 0 ? '#ffffff' : j === 1 ? '#a0ffe0' : '#3a8a78'; ctx.fillRect(snap(x + Math.cos(aa) * (rr - j * PIXEL)), snap(y + Math.sin(aa) * (rr - j * PIXEL) * 0.8), PIXEL * 2, PIXEL); }
        }
        ctx.globalAlpha = 1;
      });
      this.burst(ev.x + Math.cos(a) * reach * 0.6, ev.y - 40, 6, ['#60ffd0', '#e0fff8'], 80, 3, -30, 0.5, true);
    } else if (ev.c === 'invisible') {
      this.add(0.15, 'top', (ctx, k) => {
        ctx.strokeStyle = `rgba(190,220,255,${0.5 * (1 - k)})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, 34 + k * 10, a - 0.5, a + 0.5); ctx.stroke();
      });
    } else {
      this.add(0.15, 'top', (ctx, k) => {
        ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(x, y, 40, a - 0.9, a + 0.9); ctx.stroke();
      });
    }
  }

  /** Tres zarpazos paralelos. */
  private clawMarks(x: number, y: number, a: number, color: string, dur: number, scale: number) {
    this.add(dur, 'top', (ctx, k) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = 1 - k;
      const len = 46 * scale * Math.min(1, k * 4);
      const px = -Math.sin(a), py = Math.cos(a);
      for (let i = -1; i <= 1; i++) {
        const ox = x + px * i * 11 - Math.cos(a) * 14, oy = y + py * i * 11 - Math.sin(a) * 14;
        for (let s = 0; s < len; s += PIXEL) {
          const w = s < len * 0.2 || s > len * 0.8 ? PIXEL : PIXEL * 2;
          const cx = ox + Math.cos(a + 0.5) * s * 0.7 + Math.cos(a) * s * 0.3, cy = oy + Math.sin(a + 0.5) * s * 0.7 + Math.sin(a) * s * 0.3;
          ctx.fillRect(snap(cx), snap(cy), w, w);
        }
      }
      ctx.globalAlpha = 1;
    });
  }

  /** Gotas de sangre (o arena) que viajan de la víctima al atacante. */
  private drain(ev: FxEv) {
    const n = ev.n ?? 3, sand = ev.c === 'sand';
    const drops = Array.from({ length: n }, (_, i) => ({ x: ev.x + (Math.random() - 0.5) * 16, y: ev.y - 40 + (Math.random() - 0.5) * 16, d: i * 0.05, wob: Math.random() * 6 }));
    const tx0 = ev.tx ?? ev.x, ty0 = ev.ty ?? ev.y;
    this.add(0.7, 'glow', (ctx, k, now) => {
      const tp = this.entPos(ev.o ?? -1) ?? { x: tx0, y: ty0 };
      for (const d of drops) {
        const t = Math.max(0, Math.min(1, (k * 0.7 - d.d) / 0.55));
        if (t <= 0 || t >= 1) continue;
        const e = t * t * (3 - 2 * t);
        const x = d.x + (tp.x - d.x) * e + Math.sin(now / 60 + d.wob) * 4 * (1 - e);
        const y = d.y + (tp.y - 45 - d.y) * e - Math.sin(e * Math.PI) * 30;
        ctx.fillStyle = sand ? '#e0c060' : ev.c === 'water' ? '#a0d8f8' : ev.c === 'soul' ? '#60ffd0' : ev.c === 'bone' ? '#80ff60' : '#ff2a40';
        ctx.fillRect(snap(x), snap(y), PIXEL * 2, PIXEL * 2);
        ctx.fillStyle = sand ? 'rgba(224,192,96,0.4)' : ev.c === 'water' ? 'rgba(160,216,248,0.4)' : ev.c === 'soul' ? 'rgba(96,255,208,0.4)' : ev.c === 'bone' ? 'rgba(128,255,96,0.4)' : 'rgba(255,40,60,0.4)';
        ctx.fillRect(snap(x - (tp.x - d.x) * 0.04), snap(y - (tp.y - d.y) * 0.04), PIXEL, PIXEL);
      }
    });
  }

  /** Silueta transparente del cuerpo de la Dama al golpear. */
  private ghostHit(ev: FxEv) {
    const a = ev.r ?? 0, f = Math.cos(a) >= 0 ? 1 : -1;
    const fr = getFrame('monster', 'invisible', ev.s ?? 'classic', Anim.Attack, 2, 0, 0).base;
    this.add(0.32, 'glow', (ctx, k) => {
      const w = SW * PIXEL, h = SH * PIXEL, x = ev.x, y = ev.y;
      ctx.globalAlpha = 0.45 * (1 - k);
      ctx.save();
      if (f === -1) { ctx.translate(x * 2, 0); ctx.scale(-1, 1); }
      ctx.drawImage(fr, x - w / 2 + 3, y - h + 9, w, h);
      ctx.restore();
      ctx.globalAlpha = 1;
    });
  }

  /** La ropa cae al suelo y se queda un rato (el chiste visual). */
  private undress(ev: FxEv) {
    const pile = getClothesPile(ev.s ?? 'classic').base;
    const flip = (ev.r ?? 1) < 0;
    const dur = ev.o === -1 ? 3 : 4.5;
    this.add(dur, 'ground', (ctx, k, _now) => {
      const t = k * dur;
      const fall = Math.min(1, t / 0.28);
      const bounce = t > 0.28 && t < 0.42 ? Math.sin(((t - 0.28) / 0.14) * Math.PI) * 6 : 0;
      const w = pile.width * PIXEL, h = pile.height * PIXEL;
      ctx.globalAlpha = Math.min(1, (dur - t) / 0.6);
      ctx.save();
      if (flip) { ctx.translate(ev.x * 2, 0); ctx.scale(-1, 1); }
      ctx.drawImage(pile, ev.x - w / 2, ev.y - h + 6 - (1 - fall) * 45 - bounce, w, h * (0.6 + 0.4 * fall));
      ctx.restore();
      ctx.globalAlpha = 1;
    });
    this.burst(ev.x, ev.y - 40, 10, ['#a0d0ff', '#ffffff'], 90, 2, 0, 0.5, true);
  }

  private mist(ev: FxEv) {
    const tier = ev.n ?? 0;
    for (let i = 0; i < 18 + tier * 4; i++) this.particles.push({ x: ev.x + (Math.random() - 0.5) * 50, y: ev.y - 30 + (Math.random() - 0.5) * 40, vx: (Math.random() - 0.5) * 50, vy: -15 - Math.random() * 25, life: 1, max: 1, color: ['#3a2050', '#6a4a8a', '#1a0a20'][i % 3], size: 6 + Math.floor(Math.random() * 4), grav: 0 });
    // murciélagos que salen volando
    const bats = Array.from({ length: 4 + tier }, () => ({ a: Math.random() * Math.PI * 2, s: 140 + Math.random() * 100 }));
    this.add(0.8, 'top', (ctx, k, now) => {
      for (const b of bats) {
        const img = getItem(`bat${Math.floor(now / 80) % 2}`).base;
        const d = b.s * k;
        ctx.globalAlpha = 1 - k;
        ctx.drawImage(img, ev.x + Math.cos(b.a) * d - img.width * 1.5, ev.y - 40 + Math.sin(b.a) * d * 0.6 - k * 40, img.width * PIXEL * 0.8, img.height * PIXEL * 0.8);
      }
      ctx.globalAlpha = 1;
    });
    this.burst(ev.x, ev.y - 40, 6, ['#ff2040'], 100, 2, 0, 0.5, true);
  }

  private mistTrail(ev: FxEv) {
    const ax = ev.x, ay = ev.y, bx = ev.tx ?? ev.x, by = ev.ty ?? ev.y;
    const dur = ev.d ?? 2.5;
    const puffs = Array.from({ length: 16 }, (_, i) => ({ t: i / 15, o: (Math.random() - 0.5) * 30, s: 0.6 + Math.random() * 0.6, ph: Math.random() * 6 }));
    this.add(dur, 'ground', (ctx, k, now) => {
      for (const p of puffs) {
        const x = ax + (bx - ax) * p.t, y = ay + (by - ay) * p.t + p.o * 0.4;
        const r = (18 + Math.sin(now / 300 + p.ph) * 4) * p.s;
        ctx.globalAlpha = 0.45 * Math.min(1, (1 - k) * 3);
        ctx.fillStyle = '#4a3060';
        ctx.fillRect(snap(x - r), snap(y - r * 0.5), snap(r * 2), snap(r));
        ctx.fillStyle = '#7a5aa0';
        ctx.fillRect(snap(x - r * 0.5), snap(y - r * 0.4), snap(r), snap(r * 0.5));
      }
      ctx.globalAlpha = 1;
    });
  }

  private crimson(ev: FxEv) {
    const R = ev.r ?? 400;
    this.add(1, 'ground', (ctx, k) => {
      ctx.globalAlpha = 0.5 * (1 - k);
      ctx.fillStyle = '#2a0008';
      ctx.beginPath(); ctx.ellipse(ev.x, ev.y, R * k, R * k * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    });
    this.burst(ev.x, ev.y - 40, 40, ['#ff2040', '#a00818', '#ff6070'], 260, 3, 0, 1, true);
    this.mist({ ...ev, n: 3 });
  }

  private howl(ev: FxEv) {
    const R = ev.r ?? 400, tier = ev.n ?? 0;
    // onda expansiva pixelada (anillos discontinuos) + polvo y hojas levantadas
    this.add(0.8, 'ground', (ctx, k) => {
      for (let ring = 0; ring < 3; ring++) {
        const kk = k * 1.25 - ring * 0.15;
        if (kk <= 0 || kk >= 1) continue;
        const r = R * kk;
        ctx.fillStyle = ring === 0 ? `rgba(220,235,255,${0.8 * (1 - kk)})` : `rgba(255,200,120,${0.5 * (1 - kk)})`;
        const n = Math.round(r / 6);
        for (let i = 0; i < n; i++) {
          if (i % 4 === 3) continue;
          const a = (i / n) * Math.PI * 2;
          ctx.fillRect(snap(ev.x + Math.cos(a) * r), snap(ev.y + Math.sin(a) * r * 0.62), PIXEL * 2, PIXEL);
        }
      }
    });
    const cols = this.terrainColors(ev.x, ev.y);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, s = 200 + Math.random() * 200;
      this.particles.push({ x: ev.x + Math.cos(a) * 30, y: ev.y + Math.sin(a) * 18, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 50, life: 0.8, max: 0.8, color: cols[i % cols.length], size: 3, grav: 120 });
    }
    // chispas lunares
    this.burst(ev.x, ev.y - 60, 14 + tier * 6, ['#e0f0ff', '#a0c8ff'], 160, 2, -20, 1, true);
  }

  private moonFlash(ev: FxEv) {
    this.add(0.6, 'glow', (ctx, k) => {
      ctx.globalAlpha = 0.6 * (1 - k);
      ctx.fillStyle = '#e8f0ff';
      const r = 60 + k * 120;
      ctx.beginPath(); ctx.arc(ev.x, ev.y - 60, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    });
    this.burst(ev.x, ev.y - 60, 20, ['#e8f0ff', '#c0d8ff'], 220, 3, 0, 0.8, true);
  }

  /** Maldición de Ramsés: arena en remolino, jeroglíficos y manos espectrales. */
  private curse(ev: FxEv) {
    const R = ev.r ?? 175, tier = ev.n ?? 0;
    const glyphs = Array.from({ length: 10 + tier * 3 }, (_, i) => ({ a: (i / (10 + tier * 3)) * Math.PI * 2, g: GLYPHS[i % GLYPHS.length], d: Math.random() * 0.25 }));
    const hands = Array.from({ length: 5 + tier * 2 }, () => { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * R * 0.85; return { x: ev.x + Math.cos(a) * d, y: ev.y + Math.sin(a) * d * 0.62, d: Math.random() * 0.3 }; });
    const sandCol = ['#d8b870', '#b89850', '#e8d090'];
    // anillo de arena girando
    for (let i = 0; i < 60 + tier * 20; i++) {
      const a = Math.random() * Math.PI * 2, r = R * (0.75 + Math.random() * 0.3);
      this.particles.push({ x: ev.x + Math.cos(a) * r, y: ev.y + Math.sin(a) * r * 0.62, vx: -Math.sin(a) * 160, vy: Math.cos(a) * 100 - 10, life: 0.9, max: 0.9, color: sandCol[i % 3], size: 3, grav: 0 });
    }
    this.add(1.1, 'ground', (ctx, k) => {
      // símbolo en el suelo (anillo de jeroglíficos)
      ctx.globalAlpha = 0.85 * Math.min(1, (1 - k) * 2.5);
      ctx.fillStyle = tier >= 3 ? '#ffd860' : '#60e0a0';
      for (const g of glyphs) {
        const kk = Math.max(0, Math.min(1, (k - g.d) * 3));
        if (kk <= 0) continue;
        pixelGlyph(ctx, g.g, ev.x + Math.cos(g.a) * R * 0.8 - 7, ev.y + Math.sin(g.a) * R * 0.5 - 7 - kk * 10, PIXEL);
      }
      ctx.globalAlpha = 1;
    });
    this.add(1.1, 'top', (ctx, k) => {
      for (const h of hands) {
        const kk = Math.max(0, k - h.d) / (1 - h.d);
        if (kk <= 0) continue;
        const grow = kk < 0.4 ? kk / 0.4 : kk > 0.75 ? (1 - kk) / 0.25 : 1;
        ctx.globalAlpha = 0.75 * grow;
        spectralHand(ctx, h.x, h.y, 34 * grow + 6, tier >= 3 ? '#c8ffe0' : '#90f0c0');
      }
      ctx.globalAlpha = 1;
    });
    // escarabajos que corren hacia fuera
    const scar = Array.from({ length: 6 }, () => ({ a: Math.random() * Math.PI * 2 }));
    this.add(0.9, 'ground', (ctx, k, now) => {
      const img = getItem(`scarab${Math.floor(now / 70) % 2}`).base;
      for (const s of scar) {
        const d = 20 + R * k;
        ctx.save(); ctx.translate(ev.x + Math.cos(s.a) * d, ev.y + Math.sin(s.a) * d * 0.62); ctx.rotate(s.a);
        ctx.globalAlpha = 1 - k;
        ctx.drawImage(img, -img.width * 1.5, -img.height * 1.5, img.width * PIXEL, img.height * PIXEL);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    });
  }

  private entomb(ev: FxEv) {
    const sand = ['#d8b870', '#b89850', '#e8d090'];
    this.burst(ev.x, ev.y - 30, ev.d ? 26 : 34, sand, ev.d ? 120 : 220, 3, 200, 0.8);
    if (ev.d) {
      this.add(0.8, 'ground', (ctx, k) => {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = '#5ae0e0';
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + k * 2;
          pixelGlyph(ctx, GLYPHS[i % GLYPHS.length], ev.x + Math.cos(a) * 40 - 7, ev.y + Math.sin(a) * 22 - 7, PIXEL);
        }
        ctx.globalAlpha = 1;
      });
    }
  }

  private disguise(ev: FxEv) {
    if (ev.r && ev.r > 0) {
      // en la Dama: ondas de "presencia" que se expanden
      this.ripple(ev.x, ev.y - 30, '#d0b0ff', 0.9, ev.r * 0.5);
      return;
    }
    // en cada humano: nube de telas y sombreros
    const cols = ['#6a5a48', '#4a3e30', '#8a2a3a', '#e8dcc8'];
    this.burst(ev.x, ev.y - 40, 16, cols, 160, 3, 200, 0.6);
    this.burst(ev.x, ev.y - 40, 6, ['#ffffff'], 80, 2, 0, 0.4, true);
  }

  private surprise(ev: FxEv) {
    const dur = ev.d ?? 2.5;
    this.add(dur, 'top', (ctx, k, now) => {
      const p = this.entPos(ev.o ?? -1) ?? { x: ev.x, y: ev.y };
      const bob = Math.sin(now / 120) * 3;
      ctx.globalAlpha = Math.min(1, (1 - k) * 4);
      ctx.font = '22px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000'; ctx.fillText('!?', p.x + 2, p.y - 118 + bob + 2);
      ctx.fillStyle = '#ffe040'; ctx.fillText('!?', p.x, p.y - 118 + bob);
      ctx.globalAlpha = 1;
    });
    this.burst(ev.x, ev.y - 60, 14, ['#ffe040', '#ffffff'], 160, 3, 0, 0.6, true);
  }

  private footprint(ev: FxEv) {
    const img = getItem('footprint').base;
    const a = (ev.r ?? 0) + Math.PI / 2;
    const side = Math.random() < 0.5 ? -1 : 1;
    this.add(3, 'ground', (ctx, k) => {
      ctx.globalAlpha = 0.55 * (1 - k);
      ctx.save(); ctx.translate(ev.x + side * 5, ev.y); ctx.rotate(a);
      ctx.drawImage(img, -img.width, -img.height, img.width * 2, img.height * 2);
      ctx.restore();
      ctx.globalAlpha = 1;
    });
    // hierba / polvo que se aparta al pisar
    if (Math.random() < 0.6) this.spray(ev.x, ev.y, Math.random() * Math.PI * 2, 3, this.terrainColors(ev.x, ev.y), 50);
  }

  /** Distorsión del entorno (onda de presencia invisible). */
  ripple(x: number, y: number, color: string, dur: number, R = 70) {
    this.add(dur, 'glow', (ctx, k) => {
      ctx.fillStyle = color;
      for (let ring = 0; ring < 2; ring++) {
        const r = R * (k + ring * 0.25);
        ctx.globalAlpha = 0.5 * (1 - k);
        const n = Math.max(8, Math.round(r / 5));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const wob = Math.sin(a * 6 + k * 10) * 4;
          ctx.fillRect(snap(x + Math.cos(a) * (r + wob)), snap(y + Math.sin(a) * (r + wob) * 0.65), PIXEL, PIXEL);
        }
      }
      ctx.globalAlpha = 1;
    });
  }

  private evolve(ev: FxEv, _myId: number) {
    const n = ev.n ?? 0;
    if (n < 0) { this.burst(ev.x, ev.y - 40, 10, ['#ffffff', '#a0a0c0'], 100, 2, 0, 0.5); return; }
    const col = { vampire: ['#ff2040', '#ff90a0'], werewolf: ['#c8e0ff', '#ffd040'], mummy: ['#ffd860', '#60e0a0'], invisible: ['#c0e0ff', '#ffffff'] }[ev.c as 'vampire'] ?? ['#ffd040', '#ffffff'];
    this.add(1.2, 'glow', (ctx, k) => {
      ctx.globalAlpha = 0.6 * (1 - k);
      ctx.fillStyle = col[0];
      const w = 40 * (1 - k * 0.5);
      ctx.fillRect(snap(ev.x - w / 2), snap(ev.y - 260 * Math.min(1, k * 3)), snap(w), snap(260 * Math.min(1, k * 3)));
      ctx.globalAlpha = 1;
    });
    for (let i = 0; i < 30 + n * 10; i++) this.particles.push({ x: ev.x + (Math.random() - 0.5) * 50, y: ev.y, vx: (Math.random() - 0.5) * 60, vy: -150 - Math.random() * 200, life: 1.2, max: 1.2, color: col[i % 2], size: 3, grav: 0, glow: true });
    this.ripple(ev.x, ev.y, col[1], 0.8, 120);
  }

  /** Tormenta de arena (proyectil de la R de Ramsés). */
  drawStorm(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, now: number) {
    const R = 72;
    for (let i = 0; i < 46; i++) {
      const ang = now / 140 + i * 2.39;
      const r = R * ((i % 9) / 9 + 0.15);
      const px = x + Math.cos(ang) * r, py = y - 40 + Math.sin(ang) * r * 0.55 - (i % 5) * 6;
      ctx.fillStyle = ['#d8b870', '#b89850', '#e8d090', '#8a7040'][i % 4];
      ctx.globalAlpha = 0.85;
      ctx.fillRect(snap(px), snap(py), PIXEL * (1 + (i % 3 === 0 ? 1 : 0)), PIXEL);
    }
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#c8a860';
    ctx.beginPath(); ctx.ellipse(x, y - 30, R, R * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (Math.random() < 0.8) this.spray(x - Math.cos(a) * 50, y - Math.sin(a) * 30, a + Math.PI, 3, ['#d8b870', '#b89850'], 120);
    if (Math.random() < 0.15) {
      const g = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      const gx = x + (Math.random() - 0.5) * 80, gy = y - 40 + (Math.random() - 0.5) * 40;
      this.add(0.5, 'glow', (c2, k) => { c2.globalAlpha = 1 - k; c2.fillStyle = '#5ae0e0'; pixelGlyph(c2, g, gx, gy - k * 20, PIXEL); c2.globalAlpha = 1; });
    }
  }

  // ------------------------------------------------------------------ Paciente Cero
  private infect(ev: FxEv) {
    if (ev.n === -1) { this.burst(ev.x, ev.y - 30, 14, ['#5a6a40', '#3a4a2a', '#8a9a60'], 120, 3, 300, 0.7); return; } // se desmorona
    this.burst(ev.x, ev.y - 40, 22, ['#80d040', '#a0ff60', '#3a6a20'], 160, 3, 0, 0.8, true);
    // espiral verde del jugador hacia el humano infectado
    if (ev.tx !== undefined) {
      const sx = ev.tx, sy = (ev.ty ?? ev.y) - 45;
      this.add(0.35, 'glow', (ctx, k) => {
        ctx.fillStyle = '#a0ff60';
        for (let i = 0; i < 8; i++) {
          const t = Math.min(1, k * 1.4 - i * 0.05);
          if (t <= 0) continue;
          const px = sx + (ev.x - sx) * t + Math.sin(t * 12 + i) * 8, py = sy + (ev.y - 40 - sy) * t + Math.cos(t * 12 + i) * 8;
          ctx.fillRect(snap(px), snap(py), PIXEL * 2, PIXEL * 2);
        }
      });
    }
  }

  private emerge(ev: FxEv) {
    this.burst(ev.x, ev.y, 26, this.terrainColors(ev.x, ev.y).concat(['#2a1e14']), 150, 3, 420, 0.8);
    this.add(1.2, 'ground', (ctx, k) => {
      ctx.globalAlpha = 0.8 * (1 - k);
      ctx.fillStyle = '#1a120c';
      ctx.beginPath(); ctx.ellipse(ev.x, ev.y + 2, 26, 9, 0, 0, Math.PI * 2); ctx.fill(); // tierra removida
      ctx.globalAlpha = 1;
    });
  }

  private fatboom(ev: FxEv) {
    const R = ev.r ?? 120;
    const powder = ev.c === 'powder'; // barril de pólvora del pirata
    this.add(0.6, 'ground', (ctx, k) => {
      ctx.globalAlpha = 0.6 * (1 - k);
      ctx.fillStyle = powder ? '#3a2010' : '#5a8a20';
      ctx.beginPath(); ctx.ellipse(ev.x, ev.y, R * (0.4 + k * 0.6), R * 0.6 * (0.4 + k * 0.6), 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    });
    this.burst(ev.x, ev.y - 30, 50, powder ? ['#ff8020', '#ffd040', '#3a3430', '#c02010'] : ['#a0e040', '#6a9a20', '#7a1010', '#c0ff60'], 340, 4, 260, 0.9);
    this.burst(ev.x, ev.y - 30, 14, [powder ? '#fff0a0' : '#e0ff80'], 200, 3, 0, 0.5, true);
    this.ripple(ev.x, ev.y, powder ? '#ffb040' : '#c0ff60', 0.5, R);
  }

  private meatThrow(ev: FxEv) {
    const tx = ev.tx ?? ev.x, ty = ev.ty ?? ev.y;
    this.add(0.4, 'top', (ctx, k) => {
      const x = ev.x + (tx - ev.x) * k, y = ev.y - 40 + (ty - ev.y + 40) * k - Math.sin(k * Math.PI) * 60;
      ctx.fillStyle = '#a02828'; ctx.fillRect(snap(x) - 6, snap(y) - 3, 12, 6);
      ctx.fillStyle = '#e8d8c0'; ctx.fillRect(snap(x) + 6, snap(y) - 3, 3, 3);
    });
  }

  // ------------------------------------------------------------------ K'thula
  private tentacleWarn(ev: FxEv) {
    const R = (ev.r ?? 70) * 0.8, dur = ev.d ?? 0.4;
    this.add(dur, 'ground', (ctx, k, now) => {
      ctx.globalAlpha = 0.35 + k * 0.4;
      ctx.fillStyle = '#0a2a30';
      ctx.beginPath(); ctx.ellipse(ev.x, ev.y, R * (0.5 + k * 0.5), R * 0.55 * (0.5 + k * 0.5), 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#80f0d0';
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4 + now / 300, d = (i / 9) * R * 0.8;
        ctx.fillRect(snap(ev.x + Math.cos(a) * d), snap(ev.y + Math.sin(a) * d * 0.55 - ((now / 6 + i * 17) % 18)), PIXEL, PIXEL);
      }
      ctx.globalAlpha = 1;
    });
  }

  private tentacle(ev: FxEv) {
    const R = ev.r ?? 70;
    this.splash(ev.x, ev.y, 0.8);
    // el tentáculo surge, se retuerce y se hunde
    const side = Math.random() < 0.5 ? -1 : 1;
    this.add(0.75, 'top', (ctx, k, now) => {
      const grow = k < 0.25 ? k / 0.25 : k > 0.7 ? (1 - k) / 0.3 : 1;
      const H = 110 * grow;
      for (let s2 = 0; s2 < H; s2 += PIXEL) {
        const t = s2 / 110;
        const wob = Math.sin(t * 5 + now / 90) * 14 * t * side;
        const w = Math.max(PIXEL, Math.round((1 - t) * 6) * PIXEL);
        ctx.fillStyle = s2 % 12 < 6 ? '#2a6a5a' : '#3a8a72';
        ctx.fillRect(snap(ev.x + wob - w / 2), snap(ev.y - s2), w, PIXEL);
        if (s2 % 15 === 0 && t < 0.8) { ctx.fillStyle = '#c0a0b0'; ctx.fillRect(snap(ev.x + wob + w / 2 - PIXEL), snap(ev.y - s2), PIXEL, PIXEL); } // ventosas
      }
    });
    this.add(0.9, 'ground', (ctx, k) => {
      ctx.globalAlpha = 0.5 * (1 - k);
      ctx.strokeStyle = '#60e0a0'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(ev.x, ev.y, R * (1 - k * 0.5), R * 0.55 * (1 - k * 0.5), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }

  /** Salpicadura de agua oscura con burbujas. */
  splash(x: number, y: number, scale = 1) {
    this.burst(x, y - 10, Math.round(20 * scale), ['#1a4a5a', '#3a7a8a', '#80c0d0', '#2a6a5a'], 180 * scale, 3, 420, 0.7);
    this.burst(x, y - 20, Math.round(6 * scale), ['#60e0a0'], 60, 2, -40, 0.9, true);
    this.ripple(x, y, '#80c0d0', 0.6, 50 * scale);
  }

  /** Arrullo: notas y ondas de sueño en cono. */
  private lullaby(ev: FxEv) {
    const a = ev.r ?? 0, R = ev.d ?? 210, cone = (ev.n ?? 95) / 100;
    this.add(0.7, 'glow', (ctx, k) => {
      for (let ring = 0; ring < 3; ring++) {
        const rr = R * Math.min(1, k * 1.4 + ring * 0.12);
        ctx.globalAlpha = 0.5 * (1 - k);
        ctx.fillStyle = ring % 2 ? '#c0a8ff' : '#7a5ad0';
        for (let i = 0; i <= 10; i++) {
          const aa = a - cone / 2 + (i / 10) * cone;
          ctx.fillRect(snap(ev.x + Math.cos(aa) * rr), snap(ev.y - 40 + Math.sin(aa) * rr * 0.7), PIXEL, PIXEL);
        }
      }
      // notas musicales
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#e0d0ff';
      for (let i = 0; i < 4; i++) {
        const aa = a - cone / 3 + (i / 3) * (cone * 0.66), rr = R * k * (0.6 + i * 0.1);
        const nx = ev.x + Math.cos(aa) * rr, ny = ev.y - 50 + Math.sin(aa) * rr * 0.7 - Math.sin(k * 8 + i) * 6;
        ctx.fillRect(snap(nx), snap(ny), PIXEL * 2, PIXEL * 2); ctx.fillRect(snap(nx) + PIXEL * 2, snap(ny) - PIXEL * 4, PIXEL, PIXEL * 5);
      }
      ctx.globalAlpha = 1;
    });
  }

  /** Entre sueños / viaje por espejo: desaparece en humo y reaparece. */
  private dreamwalk(ev: FxEv) {
    const mary = ev.c === 'mary';
    const cols = mary ? ['#e8f4ff', '#ff3040', '#a0c0e0'] : ['#a070ff', '#2a2040', '#e0d0ff'];
    this.burst(ev.x, ev.y - 40, 24, cols, 180, 3, ev.n ? 200 : -60, 0.7, true);
    this.add(0.5, 'glow', (ctx, k) => {
      ctx.globalAlpha = 1 - k;
      pixelEllipse(ctx, ev.x, ev.y, 14 + k * 30, 5 + k * 10, cols[0]);
      ctx.globalAlpha = 1;
    });
  }

  private mirrorBoom(ev: FxEv) {
    const R = ev.r ?? 110;
    this.burst(ev.x, ev.y - 30, 34, ['#e8f4ff', '#a0c0e0', '#ff3040', '#ffffff'], 300, 3, 500, 0.6);
    this.add(0.35, 'glow', (ctx, k) => {
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#e8f4ff';
      for (let i = 0; i < 16; i++) {
        const aa = (i / 16) * Math.PI * 2 + i, rr = R * k;
        ctx.fillRect(snap(ev.x + Math.cos(aa) * rr), snap(ev.y - 20 + Math.sin(aa) * rr * 0.6), PIXEL * 2, PIXEL);
      }
      pixelEllipse(ctx, ev.x, ev.y, R * k, R * k * 0.6, '#ff4060');
      ctx.globalAlpha = 1;
    });
  }

  private slam(ev: FxEv) {
    const R = ev.r ?? 150;
    this.burst(ev.x, ev.y, 30, this.terrainColors(ev.x, ev.y).concat(['#3a2a1a']), 260, 4, 600, 0.6);
    this.add(0.45, 'ground', (ctx, k) => {
      ctx.globalAlpha = 0.8 * (1 - k);
      pixelEllipse(ctx, ev.x, ev.y, R * k, R * k * 0.6, '#c8b090', 2);
      // grietas
      ctx.fillStyle = '#1a1208';
      for (let i = 0; i < 6; i++) {
        const aa = (i / 6) * Math.PI * 2 + 0.3;
        for (let s = 10; s < R * 0.6 * Math.min(1, k * 3); s += PIXEL) ctx.fillRect(snap(ev.x + Math.cos(aa) * s + Math.sin(s) * 3), snap(ev.y + Math.sin(aa) * s * 0.6), PIXEL, PIXEL);
      }
      ctx.globalAlpha = 1;
    });
  }

  /** Descarga eléctrica (Sobrecarga del Reanimado). */
  private spark(ev: FxEv) {
    const R = ev.r ?? 150;
    this.add(0.4, 'glow', (ctx, k) => {
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = Math.random() < 0.5 ? '#c8f0ff' : '#60c8ff';
      for (let i = 0; i < 8; i++) {
        let px = ev.x, py = ev.y - 40;
        const aa = (i / 8) * Math.PI * 2 + k * 3;
        for (let s = 0; s < R; s += 9) {
          px += Math.cos(aa) * 9 + (Math.random() - 0.5) * 10; py += Math.sin(aa) * 6 + (Math.random() - 0.5) * 8;
          ctx.fillRect(snap(px), snap(py), PIXEL, PIXEL);
        }
      }
      ctx.globalAlpha = 1;
    });
    this.burst(ev.x, ev.y - 40, 20, ['#c8f0ff', '#60c8ff', '#ffffff'], 260, 2, 0, 0.4, true);
  }

  /** Rayo pixelado que cae del cielo. */
  lightning(x: number, y: number, small = false) {
    this.lastFlash = performance.now();
    const pts: [number, number][] = [];
    let px = x + (Math.random() - 0.5) * 60, py = y - 420;
    while (py < y) { pts.push([px, py]); py += 18 + Math.random() * 14; px += (Math.random() - 0.5) * 28; }
    pts.push([x, y]);
    this.add(small ? 0.18 : 0.3, 'glow', (ctx, k) => {
      ctx.globalAlpha = k < 0.3 ? 1 : 1 - k;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / PIXEL);
        for (let j = 0; j <= n; j++) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(snap(x0 + (x1 - x0) * (j / n)), snap(y0 + (y1 - y0) * (j / n)), PIXEL, PIXEL);
          ctx.fillStyle = '#80c0ff';
          ctx.fillRect(snap(x0 + (x1 - x0) * (j / n)) + PIXEL, snap(y0 + (y1 - y0) * (j / n)), PIXEL, PIXEL);
        }
      }
      ctx.globalAlpha = 1;
    });
    if (!small) { this.burst(x, y, 16, ['#ffffff', '#c8f0ff', '#60c8ff'], 220, 3, 300, 0.5, true); this.ripple(x, y, '#c8f0ff', 0.35, 50); }
  }

  /** Robar rostro: una máscara viaja del objetivo a Doppy. */
  private faceSteal(ev: FxEv) {
    const sx = ev.x, sy = ev.y - 45, tx = ev.tx ?? ev.x, ty = (ev.ty ?? ev.y) - 45;
    this.add(0.45, 'glow', (ctx, k) => {
      const px = sx + (tx - sx) * k, py = sy + (ty - sy) * k - Math.sin(k * Math.PI) * 40;
      ctx.fillStyle = '#f0e8d8'; ctx.fillRect(snap(px) - 6, snap(py) - 6, 12, 12);
      ctx.fillStyle = '#1a1018'; ctx.fillRect(snap(px) - 3, snap(py) - 3, 3, 3); ctx.fillRect(snap(px) + 3, snap(py) - 3, 3, 3); ctx.fillRect(snap(px) - 3, snap(py) + 3, 9, 3);
    });
    this.burst(sx, sy, 10, ['#ffe060', '#ffffff'], 120, 2, 0, 0.5, true);
  }

  private charmFx(ev: FxEv) {
    const R = ev.r ?? 300;
    this.add(0.8, 'glow', (ctx, k) => {
      ctx.globalAlpha = 0.7 * (1 - k);
      pixelEllipse(ctx, ev.x, ev.y, R * k, R * k * 0.6, '#ff80c0');
      ctx.globalAlpha = 1;
    });
    for (let i = 0; i < 10; i++) this.particles.push({ x: ev.x + (Math.random() - 0.5) * 60, y: ev.y - 40 - Math.random() * 40, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 40, life: 1, max: 1, color: Math.random() < 0.5 ? '#ff80c0' : '#ffd0e8', size: 4, grav: 0, glow: true });
  }

  /** Salpicadura de poción: fuego, ácido o maleficio. */
  private potionSplash(ev: FxEv) {
    const R = ev.r ?? 64, kind = ev.n ?? 0;
    const cols = kind === 0 ? ['#ff6020', '#ffe060', '#c02010'] : kind === 1 ? ['#80e020', '#e0ff80', '#3a6a10'] : ['#a040e0', '#f0c0ff', '#4a1a6a'];
    this.burst(ev.x, ev.y - 10, 26, cols.concat(['#d0e0d8']), R * 2.4, 3, 500, 0.6);
    this.add(0.5, 'ground', (ctx, k) => {
      ctx.globalAlpha = 0.6 * (1 - k);
      ctx.fillStyle = cols[2];
      for (let i = 0; i < 18; i++) {
        const aa = i * 2.4, rr = R * (0.3 + ((i * 37) % 10) / 14);
        ctx.fillRect(snap(ev.x + Math.cos(aa) * rr), snap(ev.y + Math.sin(aa) * rr * 0.6), PIXEL * 2, PIXEL);
      }
      pixelEllipse(ctx, ev.x, ev.y, R * Math.min(1, k * 2), R * Math.min(1, k * 2) * 0.6, cols[0]);
      ctx.globalAlpha = 1;
    });
  }

  /** Raíces que trepan por alguien (enredado) o por el Árbol cuando echa raíces (n = 1). Siguen a la entidad. */
  private rootedFx(ev: FxEv) {
    const dur = ev.d ?? 1.2;
    const own = ev.n === 1;
    this.add(dur, 'top', (ctx, k) => {
      const pos = (ev.o !== undefined ? this.entPos(ev.o) : null) ?? { x: ev.x, y: ev.y };
      const grow = Math.min(1, k * dur * 5), fade = own ? Math.min(1, (1 - k) * 4) : Math.min(1, (1 - k) * dur * 4);
      ctx.globalAlpha = fade;
      for (let i = 0; i < (own ? 7 : 5); i++) {
        const side = i % 2 ? 1 : -1, bx = pos.x + side * (6 + ((i * 5) % 12)), h = (own ? 12 : 26 + (i % 3) * 8) * grow;
        for (let j = 0; j < h; j += PIXEL) {
          ctx.fillStyle = j % 9 < 3 ? '#2e4a24' : '#5a4632';
          ctx.fillRect(snap(bx + Math.sin(j / 6 + i) * 4 * -side), snap(pos.y + 2 - j), PIXEL, PIXEL);
        }
        if (!own && grow >= 1) { ctx.fillStyle = '#a0e040'; ctx.fillRect(snap(bx), snap(pos.y - h), PIXEL, PIXEL); }
        if (own) { ctx.fillStyle = '#3a2c20'; ctx.fillRect(snap(bx + side * 6), snap(pos.y + 3), PIXEL * 3, PIXEL); } // raíces que se hunden en el suelo
      }
      ctx.globalAlpha = 1;
    });
  }

  /** Descarga sobre el agua: chispas que recorren la superficie. */
  private shockFx(ev: FxEv) {
    const R = ev.r ?? 260;
    const pts = Array.from({ length: 40 }, () => { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * R; return [ev.x + Math.cos(a) * d, ev.y + Math.sin(a) * d * 0.62] as [number, number]; })
      .filter(([px, py]) => waterAt(this.map, px, py));
    this.add(0.6, 'glow', (ctx, k) => {
      ctx.globalAlpha = 1 - k;
      for (const [px, py] of pts) {
        if (Math.random() < 0.4) continue;
        ctx.fillStyle = Math.random() < 0.5 ? '#c8f0ff' : '#60c8ff';
        let x = px, y = py;
        for (let s = 0; s < 4; s++) { x += (Math.random() - 0.5) * 14; y += (Math.random() - 0.5) * 8; ctx.fillRect(snap(x), snap(y), PIXEL, PIXEL); }
      }
      ctx.globalAlpha = 1;
    });
    this.ripple(ev.x, ev.y, '#c8f0ff', 0.5, R * 0.6);
  }

  /** Onda de señal (Señal pirata) o aviso de Cambio de canal (n = 1): anillos de estática. */
  private tvWave(ev: FxEv) {
    const R = ev.r ?? 200, col = ev.c ?? '#40ff90';
    this.add(ev.n ? 0.8 : 0.5, 'glow', (ctx, k) => {
      ctx.globalAlpha = 0.8 * (1 - k);
      for (let i = 0; i < 2; i++) { const rr = R * Math.min(1, k * 1.4 + i * 0.15); pixelEllipse(ctx, ev.x, ev.y, rr, rr * 0.62, i ? '#ffffff' : col, 2); }
      ctx.fillStyle = col;
      for (let i = 0; i < 24; i++) { const a = Math.random() * Math.PI * 2, rr = R * k * (0.8 + Math.random() * 0.2); ctx.fillRect(snap(ev.x + Math.cos(a) * rr), snap(ev.y + Math.sin(a) * rr * 0.62), PIXEL, PIXEL); }
      ctx.globalAlpha = 1;
    });
  }

  /** ¡Alianza! Confeti de colores sobre los dos monstruos. */
  private confetti(ev: FxEv) {
    const cols = ['#ff4060', '#ffd040', '#40e0ff', '#80ff60', '#c060ff', '#ffffff'];
    for (const [x, y] of [[ev.x, ev.y], [ev.tx ?? ev.x, ev.ty ?? ev.y]]) {
      for (let i = 0; i < 40; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8, s = 200 + Math.random() * 200;
        this.particles.push({ x, y: y - 50, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.6, max: 1.6, color: cols[i % cols.length], size: 3 + (i % 2) * 3, grav: 380, glow: i % 3 === 0 });
      }
    }
  }

  /** Oferta de alianza (mano tendida sobre la cabeza) o alianza rota (n = -1). */
  private allyAsk(ev: FxEv) {
    const broken = ev.n === -1;
    this.add(broken ? 1 : 2, 'top', (ctx, k) => {
      const pos = (ev.o !== undefined ? this.entPos(ev.o) : null) ?? ev;
      ctx.globalAlpha = Math.min(1, (1 - k) * 4);
      ctx.font = '22px serif'; ctx.textAlign = 'center';
      ctx.fillText(broken ? '💔' : '🤝', pos.x, pos.y - 120 - Math.sin(k * Math.PI) * 10);
      ctx.globalAlpha = 1;
    });
  }

  /** Nube de tormenta que llueve sobre un punto (Kappa nv. 15): la lluvia va formando la poza. */
  private rainCloud(ev: FxEv) {
    const R = ev.r ?? 80, dur = ev.d ?? 2;
    const drops = Array.from({ length: 48 }, (_, i) => ({ x: (hash2(i, 1, R) - 0.5) * R * 2.2, ph: hash2(i, 2, R), sp: 0.8 + hash2(i, 3, R) * 0.5 }));
    const cy = ev.y - 230;
    // la poza crece en el suelo a medida que llueve
    this.add(dur, 'ground', (ctx, k) => {
      const grow = Math.min(1, k * 1.15);
      const rq = Math.max(12, Math.round((R * (0.25 + grow * 0.75)) / 4) * 4);
      const img = bakePuddle(rq, 5);
      ctx.globalAlpha = 0.9 * Math.min(1, k * 4);
      ctx.drawImage(img, snap(ev.x - img.width * PIXEL / 2), snap(ev.y - img.height * PIXEL / 2), img.width * PIXEL, img.height * PIXEL);
      ctx.globalAlpha = 1;
    });
    this.add(dur, 'glow', (ctx, k, now) => {
      const fade = Math.min(1, k * dur * 3, (1 - k) * dur * 3);
      // nube pixelada (la misma masa de nubes que la tormenta del Reanimado, en pequeño)
      const img = bakeClouds(Math.max(120, Math.round((R * 1.8) / 20) * 20), 3); // nube grande que cubre toda la poza
      const w = img.width * PIXEL, h = img.height * PIXEL;
      ctx.globalAlpha = 0.95 * fade;
      ctx.drawImage(img, snap(ev.x - w / 2 + Math.sin(now / 900) * 6), snap(cy - h / 2), w, h);
      // lluvia: trazos pixelados que caen inclinados y salpican al llegar
      for (const d of drops) {
        const t = (k * dur * 2.2 * d.sp + d.ph) % 1;
        const px = ev.x + d.x - t * 18, py = cy + 20 + t * (ev.y - cy - 20);
        ctx.globalAlpha = 0.85 * fade;
        ctx.fillStyle = '#a0c8f0'; ctx.fillRect(snap(px), snap(py), PIXEL, PIXEL * 3);
        if (t > 0.9) { ctx.fillStyle = '#e0f0ff'; ctx.fillRect(snap(px - PIXEL), snap(ev.y + d.x * 0.3 - PIXEL), PIXEL, PIXEL); ctx.fillRect(snap(px + PIXEL), snap(ev.y + d.x * 0.3 - PIXEL * 2), PIXEL, PIXEL); }
      }
      // relámpago ocasional dentro de la nube
      if (Math.floor(now / 90) % 23 === 0) { ctx.globalAlpha = 0.4 * fade; ctx.fillStyle = '#e0e8ff'; ctx.fillRect(snap(ev.x - 20), snap(cy - 10), PIXEL * 12, PIXEL * 4); }
      ctx.globalAlpha = 1;
    });
  }

  /** Rayo de la Emisión nacional: salta de una tele a otra en zigzag. */
  private tvBolt(ev: FxEv) {
    const ax = ev.x, ay = ev.y, bx = ev.tx ?? ev.x, by = ev.ty ?? ev.y, col = ev.c ?? '#40ff90';
    const n = Math.max(4, Math.round(Math.hypot(bx - ax, by - ay) / 28));
    const pts = Array.from({ length: n + 1 }, (_, i) => { const t = i / n, j = i === 0 || i === n ? 0 : (Math.random() - 0.5) * 34; return [ax + (bx - ax) * t - ((by - ay) / (Math.hypot(bx - ax, by - ay) || 1)) * j, ay + (by - ay) * t + ((bx - ax) / (Math.hypot(bx - ax, by - ay) || 1)) * j]; });
    this.add(0.22, 'glow', (ctx, k) => {
      ctx.globalAlpha = 1 - k;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        const m = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / PIXEL));
        for (let s2 = 0; s2 <= m; s2++) {
          const px = x0 + ((x1 - x0) * s2) / m, py = y0 + ((y1 - y0) * s2) / m;
          ctx.fillStyle = col; ctx.fillRect(snap(px) - PIXEL, snap(py), PIXEL * 3, PIXEL);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(snap(px), snap(py), PIXEL, PIXEL);
        }
      }
      ctx.globalAlpha = 1;
    });
    this.burst(bx, by, 8, [col, '#ffffff'], 140, 3, 0, 0.3, true);
  }

  /** La Interferencia entra en una tele (n=0), aparece dentro (n=1) o sale con un chispazo (n=2). */
  private tvPop(ev: FxEv) {
    const col = ev.c ?? '#40ff90';
    if (ev.n === 2) {
      this.burst(ev.x, ev.y - 30, 26, [col, '#ffffff', '#9098a0'], 220, 3, 0, 0.5, true);
      this.ripple(ev.x, ev.y, col, 0.5, ev.r ?? 120);
      return;
    }
    // la imagen se "encoge" en una línea, como al apagar una tele antigua
    this.add(0.35, 'glow', (ctx, k) => {
      const w = 40 * (1 - k * 0.8), h = Math.max(PIXEL, 60 * (1 - k * 1.4));
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(snap(ev.x - w / 2), snap(ev.y - 40 - h / 2), snap(w), snap(h));
      ctx.fillStyle = col; ctx.fillRect(snap(ev.x - w / 2), snap(ev.y - 40), snap(w), PIXEL);
      ctx.globalAlpha = 1;
    });
    this.burst(ev.x, ev.y - 30, 12, [col, '#e8f0f0'], 120, 3, 0, 0.4, true);
  }

  /** La lengua del Kappa se recoge arrastrando a la víctima. */
  private lick(ev: FxEv) {
    this.add(0.22, 'top', (ctx, k) => {
      const ow = (ev.o !== undefined ? this.entPos(ev.o) : null) ?? { x: ev.tx ?? ev.x, y: ev.ty ?? ev.y };
      const ex = ev.x + (ow.x - ev.x) * k, ey = ev.y + (ow.y - ev.y) * k;
      const n = Math.ceil(Math.hypot(ex - ow.x, ey - ow.y) / PIXEL);
      for (let i = 0; i <= n; i++) {
        const t = i / Math.max(1, n);
        ctx.fillStyle = '#c03050'; ctx.fillRect(snap(ow.x + (ex - ow.x) * t), snap(ow.y - 52 + (ey - 40 - ow.y + 52) * t), PIXEL, PIXEL * 2);
        ctx.fillStyle = '#ff7090'; ctx.fillRect(snap(ow.x + (ex - ow.x) * t), snap(ow.y - 52 + (ey - 40 - ow.y + 52) * t), PIXEL, PIXEL);
      }
    });
    this.burst(ev.x, ev.y - 40, 10, ['#c8e8f8', '#ff7090'], 120, 3, 300, 0.4);
  }

  /** Gran tajo de la Parca (danza) o golpe a un marcado (n=1). */
  private reap(ev: FxEv) {
    const R = ev.r ?? 100, a0 = ev.d ?? 0;
    this.add(0.32, 'glow', (ctx, k) => {
      ctx.globalAlpha = 1 - k;
      const sweep = Math.min(1, k * 2.5);
      for (let i = 0; i <= 28; i++) {
        const t = i / 28;
        if (t > sweep) break;
        const aa = a0 - Math.PI + t * Math.PI * 2;
        for (let j = 0; j < 3; j++) {
          const rr = R * (0.7 + j * 0.12);
          ctx.fillStyle = j === 2 ? '#ffffff' : j === 1 ? '#a0ffe0' : '#3a8a78';
          ctx.fillRect(snap(ev.x + Math.cos(aa) * rr), snap(ev.y - 30 + Math.sin(aa) * rr * 0.6), PIXEL * 2, PIXEL);
        }
      }
      ctx.globalAlpha = 1;
    });
    this.burst(ev.x, ev.y - 30, ev.n === 1 ? 24 : 14, ['#60ffd0', '#e0fff8', '#141018'], 220, 3, 100, 0.5, true);
  }

  /** Calavera sobre la cabeza del marcado por la Parca. */
  private deathMark(ev: FxEv) {
    const g = ['.xxx.', 'xoxox', 'xxxxx', '.x.x.'];
    this.add(ev.d ?? 5, 'glow', (ctx, k, now) => {
      const pos = (ev.o !== undefined ? this.entPos(ev.o) : null);
      if (!pos) return;
      ctx.globalAlpha = (Math.floor(now / 200) % 2 ? 1 : 0.7) * Math.min(1, (1 - k) * 8);
      g.forEach((row, j) => [...row].forEach((ch, i) => {
        if (ch === '.') return;
        ctx.fillStyle = ch === 'o' ? '#141018' : '#60ffd0';
        ctx.fillRect(snap(pos.x) + (i - 2) * PIXEL * 2, snap(pos.y - 146) + j * PIXEL * 2, PIXEL * 2, PIXEL * 2);
      }));
      ctx.globalAlpha = 1;
    });
  }

  /** Teletransporte: columna de humo/píxeles que se abre (n=1) o se cierra (n=0). */
  private blink(ev: FxEv) {
    const col = ev.c ?? '#ffffff';
    this.add(0.3, 'glow', (ctx, k) => {
      const kk = ev.n ? 1 - k : k;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = col;
      for (let i = 0; i < 10; i++) {
        const xx = ev.x - 18 + i * 4, hh = (30 + ((i * 7) % 5) * 10) * (1 - kk * 0.8);
        ctx.fillRect(snap(xx), snap(ev.y - hh), PIXEL, snap(hh * (0.3 + kk * 0.7)));
      }
      ctx.globalAlpha = 1;
    });
    this.burst(ev.x, ev.y - 30, 12, [col, '#141018', '#ffffff'], 140, 3, -40, 0.5, true);
  }

  /** Explosión de una Unidad (Convergencia). */
  private unitBoom(ev: FxEv) {
    const R = ev.r ?? 120, col = ev.c ?? '#ff40c0';
    this.add(0.45, 'glow', (ctx, k) => {
      ctx.globalAlpha = 1 - k;
      pixelEllipse(ctx, ev.x, ev.y, R * (0.3 + k * 0.8), R * (0.3 + k * 0.8) * 0.62, col, 2);
      ctx.fillStyle = '#ffffff';
      const r2 = R * 0.35 * (1 - k);
      ctx.fillRect(snap(ev.x - r2), snap(ev.y - 30 - r2 * 0.6), snap(r2 * 2), snap(r2 * 1.2));
      ctx.globalAlpha = 1;
    });
    this.burst(ev.x, ev.y - 20, 40, [col, '#ffffff', '#3a2e52', '#f4f0f8'], R * 2.6, 4, 300, 0.7, true);
  }

  /** Un humano se convierte en Unidad: el ojo se abre y un hilo lo une a su dueña. */
  private assimilate(ev: FxEv) {
    this.add(0.6, 'glow', (ctx, k) => {
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#ff40c0';
      const tx = ev.tx ?? ev.x, ty = ev.ty ?? ev.y;
      const n = Math.ceil(Math.hypot(tx - ev.x, ty - ev.y) / 9);
      for (let i = 0; i <= n; i++) { const t = i / Math.max(1, n); if ((i + Math.floor(k * 12)) % 3) continue; ctx.fillRect(snap(ev.x + (tx - ev.x) * t), snap(ev.y - 40 + (ty - ev.y) * t), PIXEL, PIXEL); }
      ctx.globalAlpha = 1;
    });
    this.burst(ev.x, ev.y - 40, 18, ['#ff40c0', '#f4f0f8', '#5a4a7a'], 130, 3, 0, 0.6, true);
    this.ripple(ev.x, ev.y - 30, '#ff40c0', 0.5, 40);
  }

  /** Aviso: la sombra de un puño/pie de hueso gigante que va a caer. */
  private boneWarn(ev: FxEv) {
    const R = ev.r ?? 80;
    this.add(ev.d ?? 0.45, 'ground', (ctx, k) => {
      ctx.globalAlpha = 0.25 + k * 0.4;
      ctx.fillStyle = '#000000';
      ctx.beginPath(); ctx.ellipse(ev.x, ev.y, R * (0.5 + k * 0.5), R * (0.5 + k * 0.5) * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.6;
      pixelEllipse(ctx, ev.x, ev.y, R, R * 0.6, '#80ff60');
      ctx.globalAlpha = 1;
    });
  }

  /** Puño (n=0) o pie (n=1) esquelético gigante que aplasta el suelo. */
  private boneSlam(ev: FxEv) {
    const R = ev.r ?? 80, foot = ev.n === 1;
    const bone = '#e0d8c8', boneD = '#a8a090', P = PIXEL * 3;
    this.add(0.6, 'top', (ctx, k) => {
      const fall = Math.min(1, k * 5), lift = (1 - fall) * 220 + (k > 0.6 ? (k - 0.6) * 300 : 0);
      ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      const x0 = snap(ev.x - P * 3), y0 = snap(ev.y - P * 4 - lift);
      ctx.fillStyle = bone;
      if (foot) {
        ctx.fillRect(x0, y0, P * 6, P * 2); // empeine
        for (let i = 0; i < 5; i++) ctx.fillRect(x0 + i * P + P / 2, y0 + P * 2, P - PIXEL, P * 2); // dedos
        ctx.fillRect(x0 + P * 2, y0 - P * 5, P * 2, P * 5); // tibia
        ctx.fillStyle = boneD; ctx.fillRect(x0 + P * 2 + PIXEL, y0 - P * 5, PIXEL, P * 5);
      } else {
        ctx.fillRect(x0, y0, P * 6, P * 3); // nudillos y palma
        for (let i = 0; i < 4; i++) ctx.fillRect(x0 + i * P * 1.5, y0 + P * 3, P, P); // falanges
        ctx.fillRect(x0 + P * 2, y0 - P * 5, P * 2, P * 5); // radio
        ctx.fillStyle = boneD; for (let i = 0; i < 4; i++) ctx.fillRect(x0 + i * P * 1.5, y0 + P, PIXEL, P * 2);
      }
      ctx.globalAlpha = 1;
    });
    this.burst(ev.x, ev.y, 30, ['#e0d8c8', ...this.terrainColors(ev.x, ev.y)], R * 3, 4, 500, 0.6);
    this.ripple(ev.x, ev.y, '#80ff60', 0.5, R);
  }

  /** Esqueleto que sale de la tierra (n=0), perro (n=1) o aura de la Marcha (n=2). */
  private raise(ev: FxEv) {
    if (ev.n === 2) { this.burst(ev.x, ev.y - 20, 24, ['#80ff60', '#2a1e3a', '#e0d8c8'], 160, 3, -60, 0.7, true); this.ripple(ev.x, ev.y, '#80ff60', 0.6, 90); return; }
    this.burst(ev.x, ev.y, 18, ['#e0d8c8', '#80ff60', ...this.terrainColors(ev.x, ev.y)], 160, 3, 400, 0.6);
    this.add(0.6, 'ground', (ctx, k) => {
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#80ff60';
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + k * 3; pixelGlyph(ctx, GLYPHS[i % GLYPHS.length], ev.x + Math.cos(a) * 34 - 4, ev.y + Math.sin(a) * 20 - 4, 1); }
      ctx.globalAlpha = 1;
    });
  }

  /** Último conjuro: el fantasma del Nigromante aparece donde murió. */
  private ghostRise(ev: FxEv) {
    this.burst(ev.x, ev.y - 40, 30, ['#80ff60', '#e0ffc0', '#2a1e3a'], 160, 3, -80, 0.8, true);
    this.ripple(ev.x, ev.y, '#80ff60', 0.6, 60);
  }

  /** Mira de R-800 sobre su objetivo fijado (n=1: impacto del golpe extra, n=2: cuenta atrás de la explosión). */
  private lockOn(ev: FxEv) {
    if (ev.n === 1) { this.burst(ev.x, ev.y - 40, 16, ['#ff3040', '#ffffff'], 180, 3, 0, 0.4, true); return; }
    const dur = ev.d ?? 6;
    this.add(Math.max(0.5, dur), 'glow', (ctx, k, now) => {
      const pos = (ev.o !== undefined && ev.o >= 0 ? this.entPos(ev.o) : null) ?? (ev.o === -1 ? ev : null);
      if (!pos) return;
      const pulse = Math.floor(now / 160) % 2;
      const R = ev.n === 2 ? 50 + k * 60 : 26 + pulse * 3 + (1 - Math.min(1, k * 8)) * 30;
      ctx.globalAlpha = Math.min(1, (1 - k) * 6);
      ctx.fillStyle = '#ff3040';
      const cx = snap(pos.x), cy = snap(pos.y - 40);
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.fillRect(cx + sx * R - (sx > 0 ? PIXEL * 3 : 0), cy + sy * R * 0.8, PIXEL * 4, PIXEL);
        ctx.fillRect(cx + sx * R - (sx > 0 ? 0 : 0), cy + sy * R * 0.8 - (sy > 0 ? PIXEL * 3 : 0), PIXEL, PIXEL * 4);
      }
      ctx.fillRect(cx - PIXEL, cy - PIXEL, PIXEL * 2, PIXEL * 2);
      ctx.globalAlpha = 1;
    });
  }

  /** Extinción: un asteroide en llamas cae sobre el huevo del Dinozombie. */
  private asteroid(ev: FxEv) {
    const dur = ev.d ?? 1, R = ev.r ?? 260;
    this.add(dur, 'ground', (ctx, k) => {
      ctx.globalAlpha = 0.25 + k * 0.45;
      ctx.fillStyle = '#000000';
      ctx.beginPath(); ctx.ellipse(ev.x, ev.y, R * (0.3 + k * 0.7), R * (0.3 + k * 0.7) * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.7;
      pixelEllipse(ctx, ev.x, ev.y, R, R * 0.6, '#ff6020', 2);
      ctx.globalAlpha = 1;
    });
    this.add(dur, 'glow', (ctx, k) => {
      // la roca cae en diagonal dejando una estela de fuego
      const sx = ev.x + 420 * (1 - k), sy = ev.y - 40 - 620 * (1 - k);
      for (let i = 0; i < 18; i++) {
        const t = i / 18;
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.fillStyle = i < 4 ? '#ffffff' : i < 9 ? '#ffd040' : '#ff6020';
        const w = (18 - i) * 1.2;
        ctx.fillRect(snap(sx + t * 140 - w / 2), snap(sy - t * 200 - w / 2), snap(w), snap(w));
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#4a3020'; ctx.fillRect(snap(sx - 21), snap(sy - 21), 42, 42);
      ctx.fillStyle = '#6a4a30'; ctx.fillRect(snap(sx - 15), snap(sy - 18), 24, 18);
      ctx.fillStyle = '#ff9030'; ctx.fillRect(snap(sx - 21), snap(sy + 12), 42, 9);
    });
  }

  /** La Gusarena se hunde (n=0), revienta la arena al salir (n=1) o levanta polvo al avanzar (n=2). */
  private burrow(ev: FxEv) {
    const sand = ['#c8a060', '#a8844a', '#7a5e34', '#5a4428'];
    if (ev.n === 2) { this.burst(ev.x, ev.y - 4, 4, sand, 80, 3, 300, 0.4); return; }
    if (ev.n === 1) {
      this.burst(ev.x, ev.y - 20, 50, [...sand, '#f0e8d0'], (ev.r ?? 110) * 3, 4, 600, 0.8);
      this.ripple(ev.x, ev.y, '#c8a060', 0.6, ev.r ?? 110);
      this.add(0.5, 'ground', (ctx, k) => { ctx.globalAlpha = 1 - k; ctx.fillStyle = '#3a2a16'; ctx.beginPath(); ctx.ellipse(ev.x, ev.y, 46, 20, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; });
      return;
    }
    this.burst(ev.x, ev.y - 10, 30, sand, 200, 3, 500, 0.6);
    this.ripple(ev.x, ev.y, '#a8844a', 0.5, 60);
  }

  /** Culatazo de la Cazadora: golpe seco en arco (n=1: cono amplio). */
  private buttStroke(ev: FxEv) {
    const a = ev.r ?? 0, wide = ev.n === 1;
    this.add(0.2, 'top', (ctx, k) => {
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#ffe0a0';
      const half = wide ? 1.3 : 0.6;
      for (let i = 0; i <= 10; i++) { const aa = a - half + (i / 10) * half * 2, rr = 26 + k * 30; ctx.fillRect(snap(ev.x + Math.cos(aa) * rr), snap(ev.y - 30 + Math.sin(aa) * rr * 0.8), PIXEL * 2, PIXEL * 2); }
      ctx.globalAlpha = 1;
    });
    this.burst(ev.x, ev.y - 30, 10, ['#ffe0a0', '#ffffff', '#8a6a40'], 200, 3, 200, 0.4);
  }

  /** Remolino del pterodáctilo: embudo de viento pixelado. */
  drawTwister(ctx: CanvasRenderingContext2D, x: number, y: number, now: number) {
    for (let i = 0; i < 14; i++) {
      const t = i / 14, w = 8 + t * 34, yy = y - t * 70;
      for (let j = 0; j < 3; j++) {
        const a = now / 70 + i * 0.7 + j * 2.1;
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(a);
        ctx.fillStyle = j === 0 ? '#e8f0f8' : j === 1 ? '#a8c0d8' : '#6a8aa8';
        ctx.fillRect(snap(x + Math.cos(a) * w), snap(yy), PIXEL * 2, PIXEL);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** OVNI que se queda sobre un punto con su haz de abducción. */
  private ufoBeam(ev: FxEv) {
    const R = ev.r ?? 70, dur = ev.d ?? 1.5;
    const ufo = getItem('ufo');
    this.add(dur, 'glow', (ctx, k) => {
      const fade = Math.min(1, k * dur * 4, (1 - k) * dur * 4);
      const uy = ev.y - 230 + Math.sin(k * 20) * 4;
      ctx.globalAlpha = 0.28 * fade;
      ctx.fillStyle = '#80ff90';
      for (let yy = uy + 12; yy < ev.y; yy += PIXEL * 2) { const t = (yy - uy) / (ev.y - uy); const hw = 10 + t * R; ctx.fillRect(snap(ev.x - hw), snap(yy), snap(hw * 2), PIXEL * 2); }
      ctx.globalAlpha = 0.6 * fade;
      pixelEllipse(ctx, ev.x, ev.y, R, R * 0.62, '#80ff90');
      ctx.globalAlpha = fade;
      const w = ufo.base.width * PIXEL * 1.6, h = ufo.base.height * PIXEL * 1.6;
      ctx.drawImage(ufo.base, ev.x - w / 2, uy - h / 2, w, h);
      ctx.globalAlpha = 1;
    });
  }

  /** Rayo de un OVNI que cae del cielo sobre un punto. */
  private ufoRay(ev: FxEv) {
    const R = ev.r ?? 60;
    const ufo = getItem('ufo');
    this.add(0.45, 'glow', (ctx, k) => {
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#c0ffd0';
      const w = 6 + (1 - k) * 10;
      ctx.fillRect(snap(ev.x - w / 2), snap(ev.y - 260), snap(w), 260);
      ctx.fillStyle = '#60ff90'; ctx.fillRect(snap(ev.x - w), snap(ev.y - 260), PIXEL, 260); ctx.fillRect(snap(ev.x + w), snap(ev.y - 260), PIXEL, 260);
      const uw = ufo.base.width * PIXEL, uh = ufo.base.height * PIXEL;
      ctx.drawImage(ufo.base, ev.x - uw / 2, ev.y - 275 - uh / 2, uw, uh);
      pixelEllipse(ctx, ev.x, ev.y, R * (0.5 + k), R * (0.5 + k) * 0.62, '#80ff90', 2);
      ctx.globalAlpha = 1;
    });
    this.burst(ev.x, ev.y - 10, 18, ['#c0ffd0', '#60ff90', '#ffffff'], 200, 3, 200, 0.5, true);
  }

  /** Trigo alto de la Cosecha (se dibuja encima de los personajes y se mece con el viento). */
  drawWheat(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, life: number, now: number, seed: number) {
    const fade = Math.min(1, life * 5, (1 - life) * 6 + 0.3);
    const step = 15;
    for (let gy = -r * 0.62; gy <= r * 0.62; gy += step * 0.62) for (let gx = -r; gx <= r; gx += step) {
      if ((gx / r) ** 2 + (gy / (r * 0.62)) ** 2 > 1) continue;
      const h0 = hash2(gx, gy, seed);
      const px = x + gx + (h0 - 0.5) * 10, py = y + gy;
      const h = 36 + h0 * 22;
      const sway = Math.round(Math.sin(now / 600 + gx / 60 + gy / 90) * 2);
      ctx.globalAlpha = 0.88 * fade;
      ctx.fillStyle = h0 < 0.5 ? '#a8862c' : '#c8a040';
      ctx.fillRect(snap(px), snap(py - h), PIXEL, snap(h));
      ctx.fillStyle = '#e0c050';
      ctx.fillRect(snap(px) + sway * PIXEL, snap(py - h - 9), PIXEL * 2, 9); // espiga
      ctx.fillStyle = '#f0d870';
      ctx.fillRect(snap(px) + sway * PIXEL, snap(py - h - 9), PIXEL, PIXEL);
    }
    ctx.globalAlpha = 1;
  }

  /** Zarzas: raíces con espinas que revientan del suelo. */
  private brambleFx(ev: FxEv) {
    const R = ev.r ?? 110;
    if (ev.c === 'web') { this.burst(ev.x, ev.y - 20, 40, ['#e8e8f0', '#ffffff', '#a0a0b0'], R * 2, 3, 200, 0.8); this.ripple(ev.x, ev.y, '#e8e8f0', 0.8, R); return; } // Gran telaraña
    this.burst(ev.x, ev.y, 26, this.terrainColors(ev.x, ev.y).concat(['#5a4632', '#2e4a24']), R * 2, 3, 500, 0.6);
    const spikes = Array.from({ length: 14 }, (_, i) => ({ a: i * 2.4, d: R * (0.2 + ((i * 37) % 10) / 12), h: 20 + ((i * 13) % 4) * 8 }));
    this.add(0.7, 'top', (ctx, k) => {
      const up = k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75 * 0.6;
      ctx.globalAlpha = Math.min(1, (1 - k) * 3);
      for (const s of spikes) {
        const x = ev.x + Math.cos(s.a) * s.d, y = ev.y + Math.sin(s.a) * s.d * 0.62, h = s.h * up;
        ctx.fillStyle = '#3a2c20'; ctx.fillRect(snap(x), snap(y - h), PIXEL * 2, snap(h));
        ctx.fillStyle = '#5a4632'; ctx.fillRect(snap(x), snap(y - h), PIXEL, snap(h));
        ctx.fillStyle = '#d8c8a0'; ctx.fillRect(snap(x) + PIXEL * 2, snap(y - h * 0.6), PIXEL, PIXEL); ctx.fillRect(snap(x) - PIXEL, snap(y - h * 0.3), PIXEL, PIXEL);
      }
      ctx.globalAlpha = 1;
    });
  }

  /** Un objeto se levanta solo antes de salir disparado (o la zona del Revuelo, si trae radio). */
  private objSpawn(ev: FxEv) {
    if (ev.r) { this.ripple(ev.x, ev.y, '#a0e8ff', 0.5, ev.r); return; }
    this.add(0.3, 'glow', (ctx, k) => {
      ctx.globalAlpha = 1 - k;
      for (let i = 0; i < 6; i++) {
        const a = k * 8 + (i / 6) * Math.PI * 2;
        ctx.fillStyle = i % 2 ? '#a0e8ff' : '#ffffff';
        ctx.fillRect(snap(ev.x + Math.cos(a) * (14 - k * 8)), snap(ev.y - 40 + Math.sin(a) * (6 - k * 3)), PIXEL, PIXEL);
      }
      ctx.globalAlpha = 1;
    });
    this.burst(ev.x, ev.y - 10, 5, this.terrainColors(ev.x, ev.y), 80, 3, 300, 0.4);
  }

  /** Drenaje del Poltergeist: hilos de vida que van del enemigo al fantasma (n = 1) o la onda inicial (n = 0). */
  private drainBeam(ev: FxEv) {
    if (!ev.n) { this.ripple(ev.x, ev.y - 20, '#80c8ff', 0.8, ev.r ?? 270); return; }
    const sx = ev.x, sy = ev.y - 40, tx = ev.tx ?? ev.x, ty = (ev.ty ?? ev.y) - 50;
    this.add(0.35, 'glow', (ctx, k) => {
      for (let i = 0; i < 6; i++) {
        const t = (k * 1.6 + i / 6) % 1;
        const px = sx + (tx - sx) * t + Math.sin(t * 9 + i) * 6, py = sy + (ty - sy) * t + Math.cos(t * 9 + i) * 6;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = i % 2 ? '#c01030' : '#80c8ff';
        ctx.fillRect(snap(px), snap(py), PIXEL, PIXEL);
      }
      ctx.globalAlpha = 1;
    });
  }

  /** Un humano cae enamorado (vuela un corazón de la súcubo hacia él) o vuelve en sí (n = -1). */
  private thrallFx(ev: FxEv) {
    if (ev.n === -1) { this.burst(ev.x, ev.y - 45, 10, ['#ffd0e0', '#a0a0a0'], 100, 3, 200, 0.6); return; }
    this.burst(ev.x, ev.y - 45, 14, ['#ff4a8a', '#ffd0e0'], 120, 3, -40, 0.9, true);
    const sx = ev.tx ?? ev.x, sy = (ev.ty ?? ev.y) - 45;
    this.add(0.4, 'glow', (ctx, k) => {
      const px = snap(sx + (ev.x - sx) * k), py = snap(sy + (ev.y - 45 - sy) * k - Math.sin(k * Math.PI) * 20);
      ctx.fillStyle = '#ff4a8a';
      ctx.fillRect(px - 6, py, 6, 3); ctx.fillRect(px + 3, py, 6, 3); ctx.fillRect(px - 6, py + 3, 15, 3); ctx.fillRect(px - 3, py + 6, 9, 3); ctx.fillRect(px, py + 9, 3, 3);
    });
  }

  /** Poción de rabia (rojo) o Pasión desatada de la súcubo (rosa, c = 'love'): estallido enorme. */
  private rageFx(ev: FxEv) {
    const R = ev.r ?? 230;
    const love = ev.c === 'love';
    this.burst(ev.x, ev.y - 20, 40, love ? ['#ff4a8a', '#ffd0e0', '#8a1838', '#ffffff'] : ['#ff2010', '#ff8020', '#5a0a0a', '#ffd060'], 360, 4, 300, 0.8, love);
    this.add(1, 'glow', (ctx, k) => {
      ctx.globalAlpha = 0.8 * (1 - k);
      pixelEllipse(ctx, ev.x, ev.y, R * Math.min(1, k * 2.5), R * Math.min(1, k * 2.5) * 0.62, love ? '#ff4a8a' : '#ff3020', 2);
      ctx.fillStyle = love ? '#ffd0e0' : '#ff6030';
      for (let i = 0; i < 12; i++) {
        const aa = (i / 12) * Math.PI * 2, rr = R * Math.min(1, k * 2.5);
        ctx.fillRect(snap(ev.x + Math.cos(aa) * rr), snap(ev.y + Math.sin(aa) * rr * 0.62) - PIXEL * 4, PIXEL, PIXEL * 4);
      }
      ctx.globalAlpha = 1;
    });
  }

  /** Nubes de tormenta del Reanimado (encima de todo): dos capas horneadas con volumen que derivan
   *  en sentidos opuestos y se iluminan por dentro con cada relámpago. Su dueño ve a través. */
  drawStormClouds(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, life: number, now: number, mine: boolean) {
    const fade = Math.min(1, life * 6, (1 - life) * 8 + 0.15);
    const R = Math.max(60, Math.round(r / 20) * 20);
    const flash = Math.max(0, 1 - (now - this.lastFlash) / 160);
    for (const [seed, dir, alpha] of [[1, -1, 0.92], [2, 1, 0.78]] as const) {
      const img = bakeClouds(R, seed);
      const w = img.width * PIXEL, h = img.height * PIXEL;
      const dx = snap(x - w / 2 + Math.sin(now / 7000 + seed) * 28 * dir);
      const dy = snap(y - h / 2 - 50 + Math.cos(now / 9000 + seed) * 8);
      ctx.globalAlpha = (mine ? 0.16 : alpha) * fade;
      ctx.drawImage(img, dx, dy, w, h);
      if (flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (mine ? 0.08 : 0.35) * fade * flash;
        ctx.drawImage(img, dx, dy, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Columna de luz (llegada del heraldo, invocación del sectario). */
  private lightPillar(x: number, y: number, dur: number, color: string) {
    this.add(dur, 'glow', (ctx, k) => {
      const w = 28 * (1 - k * 0.6);
      ctx.globalAlpha = 0.7 * (1 - k);
      ctx.fillStyle = color;
      for (let yy = -320; yy < 0; yy += PIXEL * 2) {
        const ww = w * (0.6 + 0.4 * Math.sin(yy / 20 + k * 20));
        ctx.fillRect(snap(x - ww / 2), snap(y + yy), snap(ww), PIXEL * 2);
      }
      ctx.globalAlpha = 0.9 * (1 - k);
      pixelEllipse(ctx, x, y, 30 + k * 40, 10 + k * 14, color);
      ctx.globalAlpha = 1;
    });
    this.burst(x, y - 20, 16, [color, '#ffffff'], 140, 3, -60, 1, true);
  }

  /** Golpe de maza del heraldo: anillo de luz que estalla. */
  private smite(x: number, y: number) {
    this.add(0.45, 'glow', (ctx, k) => {
      ctx.globalAlpha = 1 - k;
      pixelEllipse(ctx, x, y, 20 + k * 70, 7 + k * 24, '#fff0a0', 2);
      pixelEllipse(ctx, x, y, 10 + k * 40, 4 + k * 14, '#ffffff');
      ctx.globalAlpha = 1;
    });
    this.burst(x, y - 30, 20, ['#fff0a0', '#ffd040', '#ffffff'], 220, 3, 200, 0.6, true);
  }

  /** El frasco de agua bendita se rompe. */
  private holySplash(x: number, y: number, r: number) {
    this.burst(x, y - 10, 22, ['#c8e8ff', '#80c8ff', '#ffffff', '#d0e8f0'], 200, 3, 500, 0.6);
    this.ripple(x, y, '#c8e8ff', 0.5, r);
  }

  /** Chorro de agua a presión (ataque básico de K'thula en el agua). */
  drawJet(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, now: number) {
    const ca = Math.cos(a), sa = Math.sin(a);
    const nx = -sa, ny = ca;
    const step = PIXEL * 2;
    for (let d = 0; d < len; d += step) {
      const t = d / len;
      const w = 7 + t * 13 + Math.sin(d / 9 - now / 40) * 3;
      const px = x + ca * d, py = y + sa * d * 0.85;
      for (let k = -w; k <= w; k += PIXEL) {
        const edge = Math.abs(k) / w;
        ctx.fillStyle = edge > 0.75 ? '#2a6a8a' : edge > 0.35 ? '#5aa0c8' : '#c8e8f8';
        ctx.fillRect(snap(px + nx * k), snap(py + ny * k), PIXEL, PIXEL * 2);
      }
    }
    // remolino de invocación en el origen
    for (let i = 0; i < 8; i++) {
      const aa = now / 90 + (i / 8) * Math.PI * 2;
      ctx.fillStyle = i % 2 ? '#60e0a0' : '#c8e8f8';
      ctx.fillRect(snap(x + Math.cos(aa) * 12), snap(y + Math.sin(aa) * 12), PIXEL, PIXEL);
    }
    // espuma y gotas al final del chorro
    const ex = x + ca * len, ey = y + sa * len * 0.85;
    if (Math.random() < 0.8) this.spray(ex, ey + 30, a + Math.PI, 3, ['#c8e8f8', '#5aa0c8', '#2a6a8a'], 160);
    ctx.fillStyle = '#e8f8ff';
    for (let i = 0; i < 4; i++) ctx.fillRect(snap(ex + Math.sin(now / 50 + i * 2) * 10), snap(ey + Math.cos(now / 60 + i * 3) * 8), PIXEL * 2, PIXEL * 2);
  }

  /** Marejada (proyectil de la R de K'thula). */
  drawWave(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, now: number) {
    const W = 84;
    const px = -Math.sin(a), py = Math.cos(a);
    for (let i = -W; i <= W; i += PIXEL) {
      const crest = 34 + Math.sin(i / 14 + now / 80) * 8 - Math.abs(i) * 0.18;
      const bx = x + px * i, by = y + py * i * 0.6;
      ctx.fillStyle = '#0e2a3a'; ctx.fillRect(snap(bx), snap(by - crest), PIXEL, snap(crest));
      ctx.fillStyle = '#2a6a7a'; ctx.fillRect(snap(bx), snap(by - crest), PIXEL, snap(crest * 0.45));
      ctx.fillStyle = '#c0e8f0'; ctx.fillRect(snap(bx), snap(by - crest - PIXEL), PIXEL, PIXEL * 2); // espuma
    }
    if (Math.random() < 0.9) this.spray(x - Math.cos(a) * 30, y - Math.sin(a) * 20, a + Math.PI, 4, ['#3a7a8a', '#80c0d0', '#60e0a0'], 140);
  }

  /** Zonas dinámicas: charcas (agua poco profunda), contaminación y carne. */
  drawZone(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, r: number, life: number, now: number, seed: number, bx?: number, by?: number) {
    const fade = Math.min(1, life * 4);
    if (kind === 'puddle') {
      const rq = Math.max(12, Math.round(r / 4) * 4);
      const img = bakePuddle(rq, seed % 16);
      const w = img.width * PIXEL, h = img.height * PIXEL;
      ctx.globalAlpha = 0.92 * fade;
      ctx.drawImage(img, snap(x - w / 2), snap(y - h / 2), w, h);
      // destellos como los del agua del terreno
      ctx.fillStyle = '#7aa6d0';
      for (let i = 0; i < 3; i++) {
        const gx = x + (hash2(i, seed, 3) - 0.5) * rq * 1.1, gy = y + (hash2(seed, i, 4) - 0.5) * rq * 0.6;
        const k = Math.pow(Math.max(0, Math.sin(now / 625 + i * 2.1 + seed)), 6);
        if (k < 0.05) continue;
        ctx.globalAlpha = k * 0.8 * fade;
        ctx.fillRect(snap(gx), snap(gy), PIXEL * 3 + Math.round(k * 2) * PIXEL, PIXEL);
      }
      // onda que se abre de vez en cuando
      const t = (now / 1800 + seed * 0.37) % 1;
      ctx.globalAlpha = 0.45 * (1 - t) * fade;
      pixelEllipse(ctx, x + Math.sin(seed) * rq * 0.25, y, rq * 0.15 + t * rq * 0.5, (rq * 0.15 + t * rq * 0.5) * 0.55, '#6a8eaa');
      ctx.globalAlpha = 1;
    } else if (kind === 'hex') {
      // charco embrujado: violeta, con burbujas que suben y un anillo de runas
      const rq = Math.max(12, Math.round(r / 4) * 4);
      const img = bakePuddle(rq, (seed % 16) + 64);
      ctx.globalAlpha = 0.5 * fade;
      ctx.filter = 'hue-rotate(95deg) saturate(1.6)';
      ctx.drawImage(img, snap(x - img.width * PIXEL / 2), snap(y - img.height * PIXEL / 2), img.width * PIXEL, img.height * PIXEL);
      ctx.filter = 'none';
      for (let i = 0; i < 14; i++) {
        const t = (now / 800 + i / 14) % 1;
        const bx = x + Math.cos(i * 2.4 + seed) * r * 0.75 * (((i * 7) % 10) / 10), by = y + Math.sin(i * 1.9 + seed) * r * 0.45 * (((i * 3) % 10) / 10);
        ctx.globalAlpha = (1 - t) * fade;
        ctx.fillStyle = i % 3 ? '#c060ff' : '#80e020';
        ctx.fillRect(snap(bx), snap(by - t * 26), PIXEL, PIXEL);
      }
      ctx.globalAlpha = 0.7 * fade;
      ctx.fillStyle = '#e0a0ff';
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + now / 2500;
        pixelGlyph(ctx, GLYPHS[i % GLYPHS.length], x + Math.cos(a) * r * 0.9 - 4, y + Math.sin(a) * r * 0.9 * 0.62 - 4, 1.5);
      }
      pixelEllipse(ctx, x, y, r, r * 0.62, '#c060ff');
      ctx.globalAlpha = 1;
    } else if (kind === 'web' || kind === 'bigweb') {
      // telaraña: radios y anillos (la grande, tenue y enorme)
      const big = kind === 'bigweb';
      ctx.globalAlpha = (big ? 0.45 : 0.8) * fade;
      ctx.fillStyle = '#e8e8f0';
      const spokes = big ? 16 : 8, rings = big ? 7 : 4;
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2 + seed;
        for (let d = 0; d < r; d += PIXEL * 2) ctx.fillRect(snap(x + Math.cos(a) * d), snap(y + Math.sin(a) * d * 0.62), PIXEL, PIXEL);
      }
      for (let k = 1; k <= rings; k++) {
        const rr = (r * k) / rings;
        for (let i = 0; i < spokes; i++) {
          const a0 = (i / spokes) * Math.PI * 2 + seed, a1 = ((i + 1) / spokes) * Math.PI * 2 + seed;
          const x0 = x + Math.cos(a0) * rr, y0 = y + Math.sin(a0) * rr * 0.62, x1 = x + Math.cos(a1) * rr, y1 = y + Math.sin(a1) * rr * 0.62;
          const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / (PIXEL * 2)));
          for (let j = 0; j <= n; j++) { const t = j / n, sag = Math.sin(t * Math.PI) * rr * 0.04; ctx.fillRect(snap(x0 + (x1 - x0) * t - (x0 + x1 - 2 * x) / rr * sag), snap(y0 + (y1 - y0) * t - (y0 + y1 - 2 * y) / rr * sag), PIXEL, PIXEL); }
        }
      }
      ctx.globalAlpha = 1;
    } else if (kind === 'thread' && bx !== undefined && by !== undefined) {
      // hilo de seda entre dos telarañas
      ctx.globalAlpha = 0.85 * fade;
      ctx.fillStyle = '#f0f0f8';
      const n = Math.ceil(Math.hypot(bx - x, by - y) / PIXEL);
      for (let j = 0; j <= n; j++) { const t = j / n; ctx.fillRect(snap(x + (bx - x) * t), snap(y + (by - y) * t + Math.sin(t * Math.PI) * 6), PIXEL, PIXEL); if (j % 6 === 0) ctx.fillRect(snap(x + (bx - x) * t), snap(y + (by - y) * t + Math.sin(t * Math.PI) * 6) + PIXEL * 2, PIXEL, PIXEL); }
      ctx.globalAlpha = 1;
    } else if (kind === 'whirl') {
      // remolino del río: agua que gira hacia el centro
      const rq = Math.max(12, Math.round(r / 4) * 4);
      const img = bakePuddle(rq, (seed % 16) + 96);
      ctx.globalAlpha = 0.85 * fade;
      ctx.drawImage(img, snap(x - img.width * PIXEL / 2), snap(y - img.height * PIXEL / 2), img.width * PIXEL, img.height * PIXEL);
      ctx.fillStyle = '#c8e8f8';
      for (let arm = 0; arm < 4; arm++) for (let t = 0; t < 1; t += 0.04) {
        const a = arm * Math.PI / 2 + t * 6 + now / 300, rr = r * (1 - t) * 0.9;
        ctx.globalAlpha = (0.3 + t * 0.6) * fade;
        ctx.fillRect(snap(x + Math.cos(a) * rr), snap(y + Math.sin(a) * rr * 0.62), PIXEL, PIXEL);
      }
      ctx.globalAlpha = 1;
    } else if (kind === 'quicksand') {
      // arenas movedizas: arena tramada que gira hacia el centro
      ctx.globalAlpha = 0.55 * fade;
      ctx.fillStyle = '#a8844a';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c8a060';
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.7, r * 0.62 * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.85 * fade;
      for (let arm = 0; arm < 5; arm++) for (let t = 0; t < 1; t += 0.05) {
        const a = arm * (Math.PI * 2 / 5) + t * 5 - now / 500, rr = r * (1 - t) * 0.95;
        ctx.fillStyle = (Math.floor(t * 20) + arm) % 2 ? '#7a5e34' : '#e0c080';
        ctx.fillRect(snap(x + Math.cos(a) * rr), snap(y + Math.sin(a) * rr * 0.62), PIXEL, PIXEL);
      }
      ctx.globalAlpha = 0.8 * fade;
      pixelEllipse(ctx, x, y, r, r * 0.62, '#7a5e34', 2);
      ctx.globalAlpha = 1;
    } else if (kind === 'laser') {
      // láser del Protocolo de exterminio: rojo, con núcleo blanco que vibra
      const ex = bx ?? x, ey = by ?? y;
      const len = Math.hypot(ex - x, ey - y) || 1, ux = (ex - x) / len, uy = (ey - y) / len, nx = -uy, ny = ux;
      const yo = -34;
      for (const [k, col] of [[1, '#8a0a14'], [0.65, '#ff3040'], [0.3, '#fff0f0']] as [number, string][]) {
        ctx.fillStyle = col;
        for (let d = 0; d < len; d += PIXEL) {
          const half = r * k * (0.8 + 0.2 * Math.sin(d / 14 - now / 30));
          ctx.globalAlpha = (k === 1 ? 0.6 : 0.9) * fade;
          for (let q = -half; q < half; q += PIXEL) ctx.fillRect(snap(x + ux * d + nx * q), snap(y + yo + uy * d + ny * q), PIXEL, PIXEL);
        }
      }
      ctx.globalAlpha = fade;
      pixelEllipse(ctx, ex, ey + yo, r * 0.8 + Math.sin(now / 40) * 4, r * 0.5, '#ffb0b0', 2);
      if (Math.random() < 0.9) this.particles.push({ x: ex + (Math.random() - 0.5) * r, y: ey + yo, vx: (Math.random() - 0.5) * 200, vy: -40 - Math.random() * 150, life: 0.4, max: 0.4, color: Math.random() < 0.5 ? '#ff3040' : '#ffe0a0', size: PIXEL, grav: 300, glow: true });
      ctx.globalAlpha = 1;
    } else if (kind === 'portal') {
      // portal del osario: agujero oscuro con anillo de huesos y runas verdes que giran
      ctx.globalAlpha = 0.85 * fade;
      ctx.fillStyle = '#08040c';
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.5, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a0a24';
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.38, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + now / 1400;
        ctx.fillStyle = i % 2 ? '#e0d8c8' : '#a8a090';
        ctx.fillRect(snap(x + Math.cos(a) * r * 0.52), snap(y + Math.sin(a) * r * 0.32), PIXEL * 2, PIXEL);
      }
      ctx.fillStyle = '#80ff60';
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - now / 900; pixelGlyph(ctx, GLYPHS[i % GLYPHS.length], x + Math.cos(a) * r * 0.7 - 4, y + Math.sin(a) * r * 0.42 - 4, 1); }
      for (let i = 0; i < 5; i++) { const t = (now / 900 + i / 5) % 1; ctx.globalAlpha = (1 - t) * fade; ctx.fillRect(snap(x + Math.cos(i * 2.3 + seed) * r * 0.3), snap(y - t * 40), PIXEL, PIXEL); }
      ctx.globalAlpha = 1;
    } else if (kind === 'lastspell') {
      // fantasma del Nigromante y su gran rayo (ancho, con núcleo blanco, chispas y runas)
      const ex = bx ?? x, ey = by ?? y, oy = y - 30;
      const fr = getFrame('monster', 'necro', 'classic', Anim.Cast, Math.floor(now / 120) % 4, 0, 3).base;
      const w = SW * PIXEL * 1.15, h = SH * PIXEL * 1.15;
      const bob = Math.sin(now / 300) * 4;
      ctx.globalAlpha = (0.55 + Math.sin(now / 70) * 0.1) * fade;
      ctx.drawImage(fr, snap(x - w / 2), snap(y - h + 9 - 14 - bob), w, h);
      const len = Math.hypot(ex - x, ey - oy), ux = (ex - x) / (len || 1), uy = (ey - oy) / (len || 1), nx = -uy, ny = ux;
      const W = r * 2 * (0.85 + Math.sin(now / 60) * 0.15);
      const n = Math.ceil(len / PIXEL);
      const layers: [number, string, number][] = [[1, '#1a5a10', 0.55], [0.72, '#3aa020', 0.8], [0.45, '#80ff60', 0.95], [0.2, '#f0ffe0', 1]];
      for (const [k, col, al] of layers) {
        ctx.fillStyle = col;
        for (let i = 0; i < n; i += 1) {
          const t = i / n, wob = Math.sin(t * 22 - now / 35) * W * 0.08 * (1 - k);
          const half = (W * k) / 2 * (0.75 + 0.25 * Math.sin(t * 9 + now / 50));
          const cx = x + ux * len * t + nx * wob, cy = oy + uy * len * t + ny * wob;
          ctx.globalAlpha = al * fade * (t < 0.05 ? t * 20 : 1);
          ctx.fillRect(snap(cx + nx * -half), snap(cy + ny * -half), PIXEL, PIXEL);
          ctx.fillRect(snap(cx + nx * half), snap(cy + ny * half), PIXEL, PIXEL);
          for (let q = -half; q < half; q += PIXEL) ctx.fillRect(snap(cx + nx * q), snap(cy + ny * q), PIXEL, PIXEL);
        }
      }
      // runas que viajan por el rayo y estallido en la punta
      ctx.fillStyle = '#e0ffc0';
      for (let k = 0; k < 6; k++) { const t = ((now / 500 + k / 6) % 1); ctx.globalAlpha = fade; pixelGlyph(ctx, GLYPHS[k % GLYPHS.length], x + ux * len * t - 4, oy + uy * len * t - 4, 1.5); }
      ctx.globalAlpha = 0.8 * fade;
      pixelEllipse(ctx, ex, ey, W * 0.7 + Math.sin(now / 40) * 6, W * 0.45, '#c0ff90', 2);
      pixelEllipse(ctx, x, oy, 22 + Math.sin(now / 50) * 4, 14, '#80ff60', 2);
      if (Math.random() < 0.8) this.particles.push({ x: ex + (Math.random() - 0.5) * W, y: ey + (Math.random() - 0.5) * W * 0.6, vx: (Math.random() - 0.5) * 160, vy: -60 - Math.random() * 120, life: 0.5, max: 0.5, color: Math.random() < 0.5 ? '#80ff60' : '#f0ffe0', size: PIXEL, grav: 200, glow: true });
      ctx.globalAlpha = 1;
    } else if (kind === 'radiation') {
      ctx.globalAlpha = 0.3 * fade;
      ctx.fillStyle = '#40ff60';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.9 * fade;
      ctx.fillStyle = '#c0ff60';
      for (let i = 0; i < 8; i++) { const t = (now / 700 + i / 8) % 1; ctx.fillRect(snap(x + Math.cos(i * 2.4 + seed) * r * 0.7), snap(y + Math.sin(i * 1.6 + seed) * r * 0.4 - t * 30), PIXEL, PIXEL); }
      ctx.globalAlpha = 1;
    } else if (kind === 'wheat') {
      ctx.globalAlpha = 0.55 * Math.min(1, life * 5);
      ctx.fillStyle = '#5a4a1a';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (kind === 'goo' || kind === 'venom') {
      // baba pegajosa (verde) o rastro de veneno (morado), con burbujas
      const venom = kind === 'venom';
      ctx.globalAlpha = (venom ? 0.45 : 0.6) * fade;
      ctx.fillStyle = venom ? '#6a2a8a' : '#4aa030';
      const ex = bx ?? x, ey = by ?? y;
      const n = Math.max(1, Math.round(Math.hypot(ex - x, ey - y) / (r * 0.6)));
      for (let i = 0; i <= n; i++) { const t = i / n; ctx.beginPath(); ctx.ellipse(x + (ex - x) * t, y + (ey - y) * t, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 0.9 * fade;
      ctx.fillStyle = venom ? '#c070ff' : '#a0ff70';
      for (let i = 0; i < 4; i++) { const t = (now / 900 + i / 4 + seed * 0.1) % 1; ctx.fillRect(snap(x + Math.cos(i * 2.3 + seed) * r * 0.5), snap(y + Math.sin(i * 1.9 + seed) * r * 0.3 - t * 10), PIXEL, PIXEL); }
      ctx.globalAlpha = 1;
    } else if (kind === 'snare') {
      // trampa de raíces de las botas de naturaleza
      ctx.globalAlpha = 0.9 * fade;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + seed, rr = r * 0.6;
        ctx.fillStyle = i % 2 ? '#4a7a34' : '#5a4632';
        ctx.fillRect(snap(x + Math.cos(a) * rr), snap(y + Math.sin(a) * rr * 0.6), PIXEL * 2, PIXEL);
        ctx.fillRect(snap(x + Math.cos(a) * rr * 0.5), snap(y + Math.sin(a) * rr * 0.3) - PIXEL, PIXEL, PIXEL * 2);
      }
      ctx.globalAlpha = 1;
    } else if (kind === 'thorns' || kind === 'forest') {
      // espinos (Zarzas) o Bosque maldito: suelo oscuro, raíces retorcidas y, en el bosque, hojas que caen
      const forest = kind === 'forest';
      ctx.globalAlpha = (forest ? 0.4 : 0.35) * fade;
      ctx.fillStyle = forest ? '#142410' : '#20180e';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.95 * fade;
      const n = forest ? 26 : 10;
      for (let i = 0; i < n; i++) {
        const a = i * 2.39 + seed, rr = r * (0.15 + ((i * 41) % 10) / 11.5);
        const bx = x + Math.cos(a) * rr, by = y + Math.sin(a) * rr * 0.62;
        const len = 5 + (i % 3) * 2;
        for (let j = 0; j < len; j++) {
          ctx.fillStyle = j % 3 ? '#3a2c20' : '#5a4632';
          ctx.fillRect(snap(bx + j * PIXEL * (i % 2 ? 1 : -1)), snap(by + Math.sin(j + i) * 3), PIXEL, PIXEL);
        }
        ctx.fillStyle = '#d8c8a0'; ctx.fillRect(snap(bx), snap(by - PIXEL), PIXEL, PIXEL); // espina
        if (forest && i % 3 === 0) {
          // retoños que se mecen
          const h = 9 + (i % 4) * 3, sway = Math.round(Math.sin(now / 400 + i) * 1.5);
          ctx.fillStyle = '#2e4a24'; ctx.fillRect(snap(bx), snap(by - h), PIXEL, snap(h));
          ctx.fillStyle = '#4a7a34'; ctx.fillRect(snap(bx) + sway * PIXEL - PIXEL, snap(by - h), PIXEL * 3, PIXEL * 2);
          if (i % 2) { ctx.fillStyle = '#a0e040'; ctx.fillRect(snap(bx) + sway * PIXEL, snap(by - h - PIXEL), PIXEL, PIXEL); }
        }
      }
      if (forest) {
        for (let i = 0; i < 10; i++) {
          const t = (now / 2600 + i / 10) % 1;
          const lx = x + Math.cos(i * 2.1 + seed) * r * 0.8 + Math.sin(now / 500 + i) * 10, ly = y + Math.sin(i * 1.3 + seed) * r * 0.5 - 70 + t * 80;
          ctx.globalAlpha = Math.min(1, (1 - t) * 3) * fade;
          ctx.fillStyle = i % 2 ? '#4a7a34' : '#a06a28';
          ctx.fillRect(snap(lx), snap(ly), PIXEL * 2, PIXEL);
        }
        ctx.globalAlpha = 0.7 * fade;
        pixelEllipse(ctx, x, y, r, r * 0.62, '#4a7a34');
      }
      ctx.globalAlpha = 1;
    } else if (kind === 'mirror') {
      // espejo de pie, pequeño, con marco y reflejo que parpadea
      const X = snap(x), Y = snap(y);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(X - 9, Y - 3, 18, 4);
      ctx.fillStyle = '#4a1a1a'; ctx.fillRect(X - 9, Y - 36, 18, 33); // marco
      ctx.fillStyle = '#8a2a2a'; ctx.fillRect(X - 9, Y - 36, 18, 3);
      ctx.fillStyle = '#a8c0d8'; ctx.fillRect(X - 6, Y - 33, 12, 27); // cristal
      ctx.fillStyle = '#e8f4ff'; ctx.fillRect(X - 6, Y - 33, 3, 9); ctx.fillRect(X - 3, Y - 30, 3, 3);
      ctx.fillStyle = '#2a1a1a'; ctx.fillRect(X - 3, Y - 18, 6, 3); ctx.fillRect(X, Y - 27, 3, 12); // grieta
      if (Math.floor(now / 140 + seed) % 9 === 0) { ctx.fillStyle = '#ff3040'; ctx.fillRect(X - 3, Y - 24, 3, 3); ctx.fillRect(X + 3, Y - 24, 3, 3); } // ojos en el reflejo
      ctx.fillStyle = '#4a1a1a'; ctx.fillRect(X - 6, Y - 3, 3, 3); ctx.fillRect(X + 3, Y - 3, 3, 3); // patas
    } else if (kind === 'glass') {
      ctx.globalAlpha = 0.9 * fade;
      for (let i = 0; i < 16; i++) {
        const aa = i * 2.39 + seed, rr = r * (0.2 + ((i * 41) % 10) / 12);
        ctx.fillStyle = i % 3 ? '#c8dcf0' : '#ff4060';
        ctx.fillRect(snap(x + Math.cos(aa) * rr), snap(y + Math.sin(aa) * rr * 0.6), i % 2 ? PIXEL * 2 : PIXEL, PIXEL);
      }
      ctx.globalAlpha = 1;
    } else if (kind === 'nail') {
      // clavo enorme clavado, con chispas
      const X = snap(x), Y = snap(y);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(X - 6, Y - 2, 12, 3);
      ctx.fillStyle = '#6a6a74'; ctx.fillRect(X - 1, Y - 24, 4, 24);
      ctx.fillStyle = '#a8a8b4'; ctx.fillRect(X - 1, Y - 24, 2, 24);
      ctx.fillStyle = '#8a8a94'; ctx.fillRect(X - 6, Y - 27, 14, 4);
      if (Math.random() < 0.25) { ctx.fillStyle = '#c8f0ff'; ctx.fillRect(snap(x + (Math.random() - 0.5) * 16), snap(y - 20 - Math.random() * 16), PIXEL, PIXEL); }
    } else if (kind === 'fire') {
      ctx.globalAlpha = 0.5 * fade;
      ctx.fillStyle = '#3a1008';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = fade;
      for (let i = 0; i < 12; i++) {
        const aa = i * 2.4 + seed, rr = r * (0.15 + ((i * 29) % 10) / 12);
        const fx = x + Math.cos(aa) * rr, fy = y + Math.sin(aa) * rr * 0.6;
        const h = 9 + ((Math.floor(now / 90) + i) % 4) * 3;
        ctx.fillStyle = '#c02010'; ctx.fillRect(snap(fx), snap(fy - h), PIXEL * 2, h);
        ctx.fillStyle = '#ff8020'; ctx.fillRect(snap(fx), snap(fy - h + 3), PIXEL, h - 3);
        ctx.fillStyle = '#ffe060'; ctx.fillRect(snap(fx), snap(fy - 3), PIXEL, PIXEL);
      }
      ctx.globalAlpha = 1;
    } else if (kind === 'holy') {
      // charco sagrado: azul pálido con destellos que suben
      const rq = Math.max(12, Math.round(r / 4) * 4);
      ctx.globalAlpha = 0.55 * fade;
      const img = bakePuddle(rq, (seed % 16) + 32);
      ctx.filter = 'hue-rotate(-15deg) saturate(0.6) brightness(1.9)';
      ctx.drawImage(img, snap(x - img.width * PIXEL / 2), snap(y - img.height * PIXEL / 2), img.width * PIXEL, img.height * PIXEL);
      ctx.filter = 'none';
      ctx.globalAlpha = 0.9 * fade;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 7; i++) {
        const t = (now / 900 + i / 7) % 1;
        ctx.globalAlpha = (1 - t) * fade;
        ctx.fillRect(snap(x + Math.cos(i * 2.4 + seed) * r * 0.6), snap(y + Math.sin(i * 1.7 + seed) * r * 0.35 - t * 30), PIXEL, PIXEL);
      }
      ctx.globalAlpha = 0.6 * fade;
      ctx.fillStyle = '#e0f0ff';
      ctx.fillRect(snap(x) - PIXEL, snap(y) - PIXEL * 4, PIXEL * 2, PIXEL * 8); ctx.fillRect(snap(x) - PIXEL * 3, snap(y) - PIXEL * 2, PIXEL * 6, PIXEL * 2); // cruz
      ctx.globalAlpha = 1;
    } else if (kind === 'ritual') {
      // círculo ritual pixelado: dos anillos, runas que giran y velas
      const pulse = 0.6 + Math.sin(now / 120) * 0.25;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#200010';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = pulse;
      pixelEllipse(ctx, x, y, r, r * 0.62, '#ff2050');
      pixelEllipse(ctx, x, y, r * 0.72, r * 0.72 * 0.62, '#a01040');
      // estrella de 5 puntas
      ctx.fillStyle = '#ff4060';
      const pts = [0, 1, 2, 3, 4].map((i) => { const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5 + now / 3000; return [x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7 * 0.62]; });
      for (let i = 0; i < 5; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % 5];
        const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / PIXEL);
        for (let k = 0; k <= n; k++) ctx.fillRect(snap(x0 + (x1 - x0) * (k / n)), snap(y0 + (y1 - y0) * (k / n)), PIXEL, PIXEL);
      }
      // runas en el anillo
      ctx.fillStyle = '#ffa0b0';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - now / 1500;
        pixelGlyph(ctx, GLYPHS[i % GLYPHS.length], x + Math.cos(a) * r * 0.86 - 4, y + Math.sin(a) * r * 0.86 * 0.62 - 4, 1.5);
      }
      // velas
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const cx = x + Math.cos(a) * r * 1.02, cy = y + Math.sin(a) * r * 0.64;
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#e8e0c8'; ctx.fillRect(snap(cx), snap(cy) - PIXEL * 2, PIXEL, PIXEL * 2);
        ctx.fillStyle = Math.random() < 0.5 ? '#ffd040' : '#ff8020'; ctx.fillRect(snap(cx), snap(cy) - PIXEL * 3, PIXEL, PIXEL);
      }
      // la luz sube conforme avanza el ritual (life va de 1 a 0)
      ctx.globalAlpha = (1 - life) * 0.5;
      ctx.fillStyle = '#ff2050';
      for (let yy = 0; yy < 160 * (1 - life); yy += PIXEL * 2) ctx.fillRect(snap(x - r * 0.3), snap(y - yy), snap(r * 0.6), PIXEL);
      ctx.globalAlpha = 1;
    } else if (kind === 'toxic') {
      ctx.globalAlpha = 0.45 * fade;
      ctx.fillStyle = '#3a6a10';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.9 * fade;
      ctx.fillStyle = '#a0ff40';
      for (let i = 0; i < 6; i++) {
        const t = ((now / 700 + i / 6) % 1);
        ctx.fillRect(snap(x + Math.cos(i * 2.1 + seed) * r * 0.6), snap(y + Math.sin(i * 1.3 + seed) * r * 0.35 - t * 24), PIXEL, PIXEL);
      }
      ctx.globalAlpha = 1;
    } else if (kind === 'meat') {
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(x, y + 4, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a1818'; ctx.fillRect(snap(x) - 9, snap(y) - 6, 18, 9);
      ctx.fillStyle = '#c03030'; ctx.fillRect(snap(x) - 6, snap(y) - 6, 9, 3);
      ctx.fillStyle = '#e8d8c0'; ctx.fillRect(snap(x) + 9, snap(y) - 6, 6, 3); ctx.fillRect(snap(x) + 12, snap(y) - 9, 3, 9);
      ctx.fillStyle = '#101010'; // moscas
      for (let i = 0; i < 3; i++) ctx.fillRect(snap(x + Math.cos(now / 120 + i * 2) * 16), snap(y - 16 + Math.sin(now / 90 + i) * 6), PIXEL, PIXEL);
    }
  }

  // ------------------------------------------------------------------ infraestructura
  add(dur: number, layer: Effect['layer'], draw: Effect['draw']) {
    this.list.push({ t: 0, dur, layer, draw });
    if (this.list.length > 400) this.list.shift();
  }

  update(dt: number) {
    for (const e of this.list) e.t += dt;
    this.list = this.list.filter((e) => e.t < e.dur);
    for (const p of this.particles) { p.life -= dt; p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 1200) this.particles.splice(0, this.particles.length - 1200);
  }

  draw(ctx: CanvasRenderingContext2D, layer: Effect['layer'], now: number) {
    for (const e of this.list) if (e.layer === layer) e.draw(ctx, Math.min(1, e.t / e.dur), now);
    if (layer === 'top' || layer === 'glow') {
      const glow = layer === 'glow';
      for (const p of this.particles) {
        if (!!p.glow !== glow) continue;
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.fillRect(snap(p.x), snap(p.y), p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }
  }
}
