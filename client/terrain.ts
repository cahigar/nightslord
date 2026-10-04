// Terreno procedural en pixel art, generado por trozos (chunks) bajo demanda.
// Cada píxel de arte (PIXEL px de mundo) se decide con ruido fBm + tramado Bayer, caminos, agua y sombras.
import { MAP_SIZE, PIXEL } from '../shared/constants';
import { lakeValue, type GameMap, type Obstacle, type Trail } from '../shared/maps';
import { fbm, hashAt } from '../shared/noise';

export const CHUNK = 96; // píxeles de arte por chunk
const CW = CHUNK * PIXEL; // tamaño del chunk en mundo

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

type RGB = [number, number, number];
const hex = (h: string): RGB => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const ramp = (...cs: string[]) => cs.map(hex);

// Materiales (rampas de oscuro a claro)
const M = {
  grass: ramp('#15261a', '#1c3120', '#233b26', '#2c462c'),
  lawn: ramp('#17291a', '#1f3622', '#284428', '#335230'),
  deadgrass: ramp('#221f1c', '#2b2822', '#353128', '#403a2c'),
  forest: ramp('#111d14', '#16251a', '#1d2e1f', '#253824'),
  needles: ramp('#241a12', '#2e2216', '#3a2c1c', '#463522'),
  dirt: ramp('#231a14', '#2e2219', '#3a2c20', '#463626'),
  mud: ramp('#1a1512', '#221c17', '#2b231c', '#352b22'),
  sand: ramp('#3a3226', '#463c2c', '#544834', '#62543c'),
  gravel: ramp('#24222a', '#2d2b33', '#38363e', '#44424a'),
  moss: ramp('#16241a', '#1d2e1e', '#263a22', '#30462a'),
  asphalt: ramp('#18171c', '#1d1c22', '#232229', '#2a2930'),
  sidewalk: ramp('#34323a', '#3e3c44', '#4a4850', '#56545c'),
  cobble: ramp('#25232b', '#302e37', '#3c3a44', '#4a4852'),
  mortar: ramp('#141218', '#18161c', '#1c1a20', '#201e24'),
  flagstone: ramp('#2a2830', '#33313a', '#3e3c46', '#4a4852'),
  water: ramp('#06101c', '#0a1828', '#0e2236', '#143048'),
  foam: ramp('#2a4a66', '#3a5e7e', '#4e7494', '#6a8eaa'),
};
type Mat = keyof typeof M;

interface ThemeGround { base: (n: number, d: number) => Mat }
const THEME_GROUND: Record<string, ThemeGround> = {
  elm: { base: (n, d) => (n < 0.33 ? 'dirt' : n < 0.4 ? 'mud' : d > 0.62 ? 'lawn' : 'grass') },
  transylvania: { base: (n, d) => (n < 0.3 ? 'gravel' : n < 0.42 ? 'dirt' : d > 0.64 ? 'moss' : 'deadgrass') },
  camp: { base: (n, d) => (n < 0.3 ? 'dirt' : n > 0.62 ? 'needles' : d > 0.6 ? 'grass' : 'forest') },
};

export class Terrain {
  private chunks = new Map<number, HTMLCanvasElement>();
  private queue: number[] = [];
  private nx = Math.ceil(MAP_SIZE / CW);
  waterGlints: { x: number; y: number; ph: number }[] = [];

  constructor(private map: GameMap) {
    // puntos de brillo sobre el agua (animados en el render)
    let s = 0;
    for (const l of map.lakes) {
      for (let i = 0; i < 260; i++) {
        const x = l.cx + (hashAt(i, s, map.seed) - 0.5) * l.rx * 2.4;
        const y = l.cy + (hashAt(s, i, map.seed + 1) - 0.5) * l.ry * 2.4;
        if (lakeValue(l, x, y) > 0.08) this.waterGlints.push({ x, y, ph: hashAt(i, i, map.seed) * 6.28 });
      }
      s++;
    }
  }

  /** Dibuja el suelo visible. Genera como mucho `budget` chunks nuevos por frame. */
  draw(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, budget = 3) {
    const cx0 = Math.max(0, Math.floor(x0 / CW)), cy0 = Math.max(0, Math.floor(y0 / CW));
    const cx1 = Math.min(this.nx - 1, Math.floor(x1 / CW)), cy1 = Math.min(this.nx - 1, Math.floor(y1 / CW));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const key = cy * this.nx + cx;
      let c = this.chunks.get(key);
      if (!c && budget > 0) { c = this.build(cx, cy); this.chunks.set(key, c); budget--; }
      if (c) ctx.drawImage(c, cx * CW, cy * CW, CW, CW);
      else { ctx.fillStyle = '#141c16'; ctx.fillRect(cx * CW, cy * CW, CW, CW); }
    }
  }

  /** Pregenera chunks alrededor de un punto (al entrar a la sala). */
  warm(x: number, y: number, radius: number) {
    const cx0 = Math.max(0, Math.floor((x - radius) / CW)), cy0 = Math.max(0, Math.floor((y - radius) / CW));
    const cx1 = Math.min(this.nx - 1, Math.floor((x + radius) / CW)), cy1 = Math.min(this.nx - 1, Math.floor((y + radius) / CW));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const key = cy * this.nx + cx;
      if (!this.chunks.has(key)) this.chunks.set(key, this.build(cx, cy));
    }
  }

  private build(cx: number, cy: number): HTMLCanvasElement {
    const map = this.map;
    const seed = map.seed;
    const cv = document.createElement('canvas');
    cv.width = CHUNK; cv.height = CHUNK;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(CHUNK, CHUNK);
    const D = img.data;
    const mats = new Array<Mat>(CHUNK * CHUNK);
    const wx0 = cx * CW, wy0 = cy * CW;
    const ground = THEME_GROUND[map.theme];

    // segmentos de caminos cercanos
    const segs: { ax: number; ay: number; bx: number; by: number; t: Trail; along0: number }[] = [];
    for (const t of map.trails) {
      let along = 0;
      for (let i = 1; i < t.pts.length; i++) {
        const [ax, ay] = t.pts[i - 1], [bx, by] = t.pts[i];
        const pad = t.w + 30;
        if (Math.max(ax, bx) + pad > wx0 && Math.min(ax, bx) - pad < wx0 + CW && Math.max(ay, by) + pad > wy0 && Math.min(ay, by) - pad < wy0 + CW) segs.push({ ax, ay, bx, by, t, along0: along });
        along += Math.hypot(bx - ax, by - ay);
      }
    }
    const lakes = map.lakes.filter((l) => l.cx + l.rx * 1.6 > wx0 && l.cx - l.rx * 1.6 < wx0 + CW && l.cy + l.ry * 1.6 > wy0 && l.cy - l.ry * 1.6 < wy0 + CW);
    const plazas = map.plazas.filter((p) => p.x < wx0 + CW && p.x + p.w > wx0 && p.y < wy0 + CW && p.y + p.h > wy0);

    for (let py = 0; py < CHUNK; py++) for (let px = 0; px < CHUNK; px++) {
      const gx = cx * CHUNK + px, gy = cy * CHUNK + py; // coordenadas globales de arte
      const x = gx * PIXEL + 1, y = gy * PIXEL + 1;
      const b = bayer(gx, gy);
      const n = fbm(x, y, seed, 420, 3) + b * 0.06;
      const d = fbm(x, y, seed + 77, 90, 2);
      let mat: Mat = ground.base(n, d + b * 0.08);
      let tone = d + b * 0.35;

      for (const p of plazas) {
        if (x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) {
          if (p.kind === 'stone') {
            const sx = Math.floor((x - p.x) / 36), sy = Math.floor((y - p.y) / 36);
            const ex = (x - p.x) % 36, ey = (y - p.y) % 36;
            mat = ex < 3 || ey < 3 ? 'mortar' : 'flagstone';
            tone = hashAt(sx, sy, seed) * 0.6 + 0.2 + b * 0.2;
          } else {
            const edge = Math.min(x - p.x, p.x + p.w - x, y - p.y, p.y + p.h - y);
            if (edge > 20 + (d - 0.5) * 60) mat = 'dirt';
          }
        }
      }

      // caminos
      for (const s of segs) {
        const dx = s.bx - s.ax, dy = s.by - s.ay;
        const l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / l2));
        const dist = Math.hypot(x - (s.ax + dx * t), y - (s.ay + dy * t));
        const half = s.t.w / 2;
        if (s.t.kind === 'road') {
          if (dist < half - 14) {
            mat = 'asphalt';
            tone = 0.45 + (d - 0.5) * 0.8 + b * 0.25;
            const along = s.along0 + Math.sqrt(l2) * t;
            if (dist < 3 && along % 72 < 36) { mat = 'sand'; tone = 0.95; } // línea discontinua
            if (hashAt(gx, gy, seed + 5) < 0.012) tone = 0.05; // grietas
          } else if (dist < half) {
            mat = 'sidewalk';
            tone = (Math.floor((s.t.pts[0][0] === s.t.pts[1][0] ? y : x) / 30) % 2) * 0.2 + 0.4 + b * 0.2;
            if (dist > half - 3) tone = 0.95;
          }
        } else {
          const wob = (fbm(x, y, seed + 9, 50, 2) - 0.5) * 22;
          if (dist < half + wob) {
            if (s.t.kind === 'cobble') {
              const row = Math.floor(y / 15);
              const off = (row % 2) * 10;
              const ex = (x + off) % 20, ey = y % 15;
              mat = ex < 3 || ey < 3 ? 'mortar' : 'cobble';
              tone = hashAt(Math.floor((x + off) / 20), row, seed) * 0.7 + 0.15 + b * 0.15;
              if (dist > half + wob - 8 && hashAt(gx, gy, seed) < 0.4) mat = 'moss';
            } else {
              mat = dist > half + wob - 6 ? 'mud' : 'dirt';
              tone = 0.4 + (d - 0.5) + b * 0.3;
            }
          }
        }
      }

      // agua y orillas
      for (const l of lakes) {
        const v = lakeValue(l, x, y);
        if (v > 0.04) { mat = 'water'; tone = Math.max(0, Math.min(0.99, 0.85 - v * 1.6 + b * 0.12 + (d - 0.5) * 0.3)); }
        else if (v > 0.0) { mat = 'foam'; tone = 0.5 + b; }
        else if (v > -0.07) { mat = map.theme === 'transylvania' ? 'mud' : 'sand'; tone = 0.4 + (v + 0.07) * 6 + b * 0.3; }
        else if (v > -0.13 && b > (v + 0.13) * 6 - 0.5) mat = 'mud';
      }

      mats[py * CHUNK + px] = mat;
      const r = M[mat];
      const c = r[Math.max(0, Math.min(r.length - 1, Math.floor(tone * r.length)))];
      const o = (py * CHUNK + px) * 4;
      D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2]; D[o + 3] = 255;
    }

    // micro-decoración horneada: briznas, flores, piedrecitas, hojas, agujas
    const put = (px: number, py: number, c: RGB) => {
      if (px < 0 || py < 0 || px >= CHUNK || py >= CHUNK) return;
      const o = (py * CHUNK + px) * 4;
      D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2];
    };
    const FLOWERS = [hex('#c04060'), hex('#e0c040'), hex('#8060c0'), hex('#e0e0f0')];
    for (let i = 0; i < 260; i++) {
      const px = Math.floor(hashAt(i, cx * 31 + cy, seed + 13) * CHUNK), py = Math.floor(hashAt(cy * 17 + cx, i, seed + 14) * CHUNK);
      const mat = mats[py * CHUNK + px];
      const h = hashAt(px, py, seed + 15);
      if (mat === 'grass' || mat === 'lawn' || mat === 'forest' || mat === 'moss') {
        const g = M[mat];
        put(px, py, g[3]); put(px, py - 1, g[3]); put(px + 1, py, g[2]);
        if (h < 0.12 && map.theme !== 'transylvania') put(px, py - 2, FLOWERS[Math.floor(h * 33) % 4]);
      } else if (mat === 'deadgrass') {
        put(px, py, M.deadgrass[3]); put(px - 1, py - 1, M.deadgrass[3]); put(px + 1, py - 1, M.deadgrass[2]);
      } else if (mat === 'dirt' || mat === 'gravel' || mat === 'mud') {
        put(px, py, M.gravel[3]); put(px + 1, py, M.gravel[1]);
      } else if (mat === 'needles') {
        put(px, py, M.needles[3]); put(px + 1, py + 1, M.needles[3]);
      } else if (mat === 'asphalt' && h < 0.2) {
        put(px, py, M.asphalt[0]); put(px + 1, py, M.asphalt[0]);
      }
    }
    // hojas secas otoñales en el barrio
    if (map.theme === 'elm') for (let i = 0; i < 70; i++) {
      const px = Math.floor(hashAt(i, cx + 99, seed + 20 + cy) * CHUNK), py = Math.floor(hashAt(cy + 55, i, seed + 21 + cx) * CHUNK);
      if (mats[py * CHUNK + px] === 'water') continue;
      put(px, py, hex(['#8a4a1a', '#a0601a', '#6a3a14', '#9a2a14'][i % 4]));
    }

    // sombras de obstáculos (luz de luna desde arriba-izquierda)
    const shadowOf = (o: Obstacle) => {
      const tall = ['house', 'cabin', 'crypt', 'wall', 'tower'].includes(o.type);
      const round = ['tree', 'pine', 'deadtree', 'rock', 'well', 'statue', 'brazier', 'lamp', 'firepit', 'mailbox', 'tomb'].includes(o.type);
      if (o.type === 'water') return null;
      if (tall) return { kind: 'rect' as const, x: o.x + 10, y: o.y + 8, w: o.w + 14, h: o.h + 10 };
      if (round) return { kind: 'ell' as const, x: o.x + o.w / 2 + 8, y: o.y + o.h - 2, rx: o.w * 0.75 + 6, ry: Math.max(10, o.h * 0.4) };
      return { kind: 'rect' as const, x: o.x + 4, y: o.y + 6, w: o.w + 6, h: o.h + 4 };
    };
    for (const o of map.obstacles) {
      if (o.x > wx0 + CW + 60 || o.x + o.w < wx0 - 60 || o.y > wy0 + CW + 60 || o.y + o.h < wy0 - 60) continue;
      const s = shadowOf(o);
      if (!s) continue;
      for (let py = 0; py < CHUNK; py++) for (let px = 0; px < CHUNK; px++) {
        const x = wx0 + px * PIXEL + 1, y = wy0 + py * PIXEL + 1;
        let inside = false;
        if (s.kind === 'rect') inside = x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h;
        else inside = ((x - s.x) / s.rx) ** 2 + ((y - s.y) / s.ry) ** 2 < 1 + bayer(px, py) * 0.15;
        if (!inside) continue;
        const i = (py * CHUNK + px) * 4;
        D[i] *= 0.55; D[i + 1] *= 0.55; D[i + 2] *= 0.62;
      }
    }

    ctx.putImageData(img, 0, 0);
    return cv;
  }

  dispose() { this.chunks.clear(); this.queue = []; }
}
