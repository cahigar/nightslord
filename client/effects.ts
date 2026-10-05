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

export class Effects {
  list: Effect[] = [];
  particles: Particle[] = [];
  constructor(private map: GameMap, private entPos: (id: number) => Pos) {}

  /** Color de partícula según el terreno bajo un punto (polvo, hojas, agujas, salpicaduras). */
  terrainColors(x: number, y: number): string[] {
    if (waterAt(this.map, x, y)) return ['#6a9ac0', '#a0c8e8', '#3a6a90'];
    const n = fbm(x, y, this.map.seed, 420, 3);
    switch (this.map.theme) {
      case 'elm': return n < 0.4 ? ['#5a4632', '#3a2c20', '#7a6046'] : ['#a0501a', '#c07020', '#3a6a2a', '#8a2a14'];
      case 'transylvania': return n < 0.42 ? ['#5a5660', '#3a3640', '#7a7680'] : ['#5a5236', '#3a3424', '#2e4a2e'];
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
        ctx.fillStyle = sand ? '#e0c060' : '#ff2a40';
        ctx.fillRect(snap(x), snap(y), PIXEL * 2, PIXEL * 2);
        ctx.fillStyle = sand ? 'rgba(224,192,96,0.4)' : 'rgba(255,40,60,0.4)';
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
    this.add(0.6, 'ground', (ctx, k) => {
      ctx.globalAlpha = 0.6 * (1 - k);
      ctx.fillStyle = '#5a8a20';
      ctx.beginPath(); ctx.ellipse(ev.x, ev.y, R * (0.4 + k * 0.6), R * 0.6 * (0.4 + k * 0.6), 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    });
    this.burst(ev.x, ev.y - 30, 50, ['#a0e040', '#6a9a20', '#7a1010', '#c0ff60'], 340, 4, 260, 0.9);
    this.burst(ev.x, ev.y - 30, 14, ['#e0ff80'], 200, 3, 0, 0.5, true);
    this.ripple(ev.x, ev.y, '#c0ff60', 0.5, R);
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
  drawZone(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, r: number, life: number, now: number, seed: number) {
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
