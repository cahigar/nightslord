// Mapas procedurales deterministas: servidor y cliente generan el mismo mapa a partir de (tema, semilla).
// Se usa ruido (fBm) para bosques, lagos y terreno, y caminos serpenteantes por "random walk".
import { MAP_SIZE } from './constants';
import { fbm } from './noise';
import { mulberry32, rint, rpick, rrange, type Rng } from './rng';

export type MapThemeId = 'elm' | 'transylvania' | 'camp';

export type ObstacleType =
  | 'house' | 'fence' | 'tree' | 'car' | 'hedge' | 'lamp' | 'mailbox'
  | 'wall' | 'tomb' | 'crypt' | 'deadtree' | 'tower' | 'brazier' | 'well' | 'statue'
  | 'cabin' | 'pine' | 'water' | 'canoe' | 'rock' | 'firepit' | 'log';

export type DecorType =
  | 'bones' | 'pumpkin' | 'candle' | 'skull' | 'tricycle' | 'cross' | 'mushroom' | 'stump' | 'lantern' | 'sign';

export interface Obstacle { x: number; y: number; w: number; h: number; type: ObstacleType; v: number }
export interface Decor { x: number; y: number; type: DecorType; v: number }
export interface Trail { pts: [number, number][]; w: number; kind: 'road' | 'dirt' | 'cobble' }
export interface Lake { cx: number; cy: number; rx: number; ry: number; seed: number }

export interface MapTheme {
  id: MapThemeId;
  name: string;
  subtitle: string;
  ambient: string; // color de la oscuridad
  moon: string; // tinte de luz de luna
}

export const THEMES: Record<MapThemeId, MapTheme> = {
  elm: { id: 'elm', name: 'Calle del Olmo', subtitle: 'Un barrio tranquilo... demasiado tranquilo', ambient: '#0a0618', moon: 'rgba(120,110,200,' },
  transylvania: { id: 'transylvania', name: 'Transilvania', subtitle: 'El castillo espera a su señor', ambient: '#12040a', moon: 'rgba(200,90,120,' },
  camp: { id: 'camp', name: 'Campamento Lago Sereno', subtitle: 'Nadie volvió del turno de noche', ambient: '#040a14', moon: 'rgba(90,150,210,' },
};

export const THEME_IDS = Object.keys(THEMES) as MapThemeId[];

export interface GameMap {
  theme: MapThemeId;
  seed: number;
  size: number;
  obstacles: Obstacle[];
  decor: Decor[];
  trails: Trail[];
  lakes: Lake[];
  /** Zonas especiales para el terreno (patio del castillo, claro del campamento...). */
  plazas: { x: number; y: number; w: number; h: number; kind: 'stone' | 'dirt' }[];
}

// ---------------------------------------------------------------------------
// Utilidades geométricas
// ---------------------------------------------------------------------------
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export function distToTrail(t: Trail, x: number, y: number) {
  let d = Infinity;
  for (let i = 1; i < t.pts.length; i++) d = Math.min(d, distToSegment(x, y, t.pts[i - 1][0], t.pts[i - 1][1], t.pts[i][0], t.pts[i][1]));
  return d;
}

/** Valor >0 dentro del lago (forma irregular por ruido). */
export function lakeValue(l: Lake, x: number, y: number) {
  const nx = (x - l.cx) / l.rx, ny = (y - l.cy) / l.ry;
  const d = Math.sqrt(nx * nx + ny * ny);
  return 1 - d + (fbm(x, y, l.seed, 260, 3) - 0.5) * 0.7;
}

export function waterAt(map: GameMap, x: number, y: number) {
  for (const l of map.lakes) if (lakeValue(l, x, y) > 0) return true;
  return false;
}

const MARGIN = 100;

class Placer {
  obs: Obstacle[] = [];
  constructor(public r: Rng, public trails: Trail[], public blocked: (x: number, y: number) => boolean = () => false) {}

  free(x: number, y: number, w: number, h: number, pad: number, trailPad = 20) {
    if (x < MARGIN || y < MARGIN || x + w > MAP_SIZE - MARGIN || y + h > MAP_SIZE - MARGIN) return false;
    for (const o of this.obs) if (x < o.x + o.w + pad && x + w + pad > o.x && y < o.y + o.h + pad && y + h + pad > o.y) return false;
    for (const t of this.trails) if (distToTrail(t, x + w / 2, y + h / 2) < t.w / 2 + Math.max(w, h) / 2 + trailPad) return false;
    if (this.blocked(x, y) || this.blocked(x + w, y) || this.blocked(x, y + h) || this.blocked(x + w, y + h) || this.blocked(x + w / 2, y + h / 2)) return false;
    return true;
  }

  add(type: ObstacleType, x: number, y: number, w: number, h: number, v = rint(this.r, 0, 3)) {
    const o: Obstacle = { x: Math.round(x), y: Math.round(y), w, h, type, v };
    this.obs.push(o);
    return o;
  }

  tryAdd(type: ObstacleType, x: number, y: number, w: number, h: number, pad = 40, trailPad = 20) {
    if (!this.free(x, y, w, h, pad, trailPad)) return null;
    return this.add(type, x, y, w, h);
  }

  scatter(type: ObstacleType, n: number, w: number, h: number, pad: number, area?: [number, number, number, number], tries = 25) {
    const [ax, ay, aw, ah] = area ?? [MARGIN, MARGIN, MAP_SIZE - 2 * MARGIN, MAP_SIZE - 2 * MARGIN];
    let placed = 0;
    for (let i = 0; i < n * tries && placed < n; i++) {
      if (this.tryAdd(type, rrange(this.r, ax, ax + aw - w), rrange(this.r, ay, ay + ah - h), w, h, pad)) placed++;
    }
    return placed;
  }

  /** Coloca por densidad de ruido (bosques agrupados). */
  cluster(type: ObstacleType, n: number, w: number, h: number, pad: number, seed: number, scale: number, threshold: number) {
    let placed = 0;
    for (let i = 0; i < n * 12 && placed < n; i++) {
      const x = rrange(this.r, MARGIN, MAP_SIZE - MARGIN - w), y = rrange(this.r, MARGIN, MAP_SIZE - MARGIN - h);
      if (fbm(x, y, seed, scale, 3) < threshold) continue;
      if (this.tryAdd(type, x, y, w, h, pad)) placed++;
    }
  }
}

/** Camino serpenteante entre dos puntos. */
function windingTrail(r: Rng, a: [number, number], b: [number, number], w: number, kind: Trail['kind'], wiggle = 160): Trail {
  const pts: [number, number][] = [a];
  const steps = Math.max(3, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 220));
  const nx = -(b[1] - a[1]), ny = b[0] - a[0];
  const nl = Math.hypot(nx, ny) || 1;
  let off = 0;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    off = off * 0.5 + (r() - 0.5) * wiggle;
    pts.push([a[0] + (b[0] - a[0]) * t + (nx / nl) * off, a[1] + (b[1] - a[1]) * t + (ny / nl) * off]);
  }
  pts.push(b);
  return { pts, w, kind };
}

/** Convierte un lago a rectángulos de colisión (rejilla de 40 px, fusionando filas). */
function lakeObstacles(l: Lake): Obstacle[] {
  const C = 40, out: Obstacle[] = [];
  const x0 = Math.floor((l.cx - l.rx * 1.5) / C) * C, x1 = l.cx + l.rx * 1.5;
  const y0 = Math.floor((l.cy - l.ry * 1.5) / C) * C, y1 = l.cy + l.ry * 1.5;
  for (let y = y0; y < y1; y += C) {
    let run = -1;
    for (let x = x0; x <= x1 + C; x += C) {
      const inside = x <= x1 && lakeValue(l, x + C / 2, y + C / 2) > 0.04;
      if (inside && run < 0) run = x;
      if (!inside && run >= 0) { out.push({ x: run, y, w: x - run, h: C, type: 'water', v: 0 }); run = -1; }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
export function generateMap(theme: MapThemeId, seed: number): GameMap {
  const r = mulberry32(seed);
  const S = MAP_SIZE;
  const trails: Trail[] = [];
  const lakes: Lake[] = [];
  const plazas: GameMap['plazas'] = [];
  const decor: Decor[] = [];
  let P: Placer;

  if (theme === 'elm') {
    // Cuadrícula de calles con desplazamientos por semilla
    const xs = [1, 2, 3].map((i) => i * 800 + rint(r, -90, 90));
    const ys = [1, 2, 3].map((i) => i * 800 + rint(r, -90, 90));
    for (const x of xs) trails.push({ pts: [[x, 40], [x, S - 40]], w: 110, kind: 'road' });
    for (const y of ys) trails.push({ pts: [[40, y], [S - 40, y]], w: 110, kind: 'road' });
    // Un parque con estanque en una manzana aleatoria
    const parkBx = rint(r, 0, 3), parkBy = rint(r, 0, 3);
    const bxEdges = [0, ...xs, S], byEdges = [0, ...ys, S];
    const parkCx = (bxEdges[parkBx] + bxEdges[parkBx + 1]) / 2, parkCy = (byEdges[parkBy] + byEdges[parkBy + 1]) / 2;
    lakes.push({ cx: parkCx, cy: parkCy, rx: 170, ry: 120, seed: seed + 7 });
    P = new Placer(r, trails, (x, y) => lakes.some((l) => lakeValue(l, x, y) > -0.25));
    for (const l of lakes) P.obs.push(...lakeObstacles(l));
    // Casas por parcelas, mirando a la calle más cercana
    for (let bx = 0; bx < 4; bx++) for (let by = 0; by < 4; by++) {
      const x0 = bxEdges[bx] + 70, x1 = bxEdges[bx + 1] - 70, y0 = byEdges[by] + 70, y1 = byEdges[by + 1] - 70;
      if (bx === parkBx && by === parkBy) {
        P.scatter('tree', 9, 60, 60, 40, [x0, y0, x1 - x0, y1 - y0]);
        P.scatter('lamp', 3, 16, 16, 60, [x0, y0, x1 - x0, y1 - y0]);
        continue;
      }
      const lots: [number, number][] = [[x0, y0], [(x0 + x1) / 2, y0], [x0, (y0 + y1) / 2], [(x0 + x1) / 2, (y0 + y1) / 2]];
      const lw = (x1 - x0) / 2, lh = (y1 - y0) / 2;
      for (const [lx, ly] of lots) {
        if (r() < 0.18) { P.scatter('tree', 3, 60, 60, 30, [lx, ly, lw, lh]); continue; }
        const hw = rint(r, 170, 220), hh = rint(r, 130, 160);
        const hx = lx + (lw - hw) / 2 + rint(r, -20, 20), hy = ly + (lh - hh) / 2 + rint(r, -15, 15);
        if (!P.tryAdd('house', hx, hy, hw, hh, 30)) continue;
        if (r() < 0.5) P.tryAdd('car', hx + hw + 20, hy + hh - 90, 50, 90, 10);
        if (r() < 0.6) P.tryAdd('hedge', hx - 10, hy + hh + 30, rint(r, 90, 150), 26, 10);
        if (r() < 0.5) P.tryAdd('fence', lx + 10, ly + lh - 30, lw - 40, 22, 10);
        P.tryAdd('mailbox', hx + hw / 2 - 60, hy + hh + 40, 14, 14, 10);
        if (r() < 0.5) decor.push({ x: hx + hw / 2 + 30, y: hy + hh + 14, type: 'pumpkin', v: rint(r, 0, 3) });
        if (r() < 0.12) decor.push({ x: hx - 30, y: hy + hh + 20, type: 'tricycle', v: 0 });
        P.scatter('tree', rint(r, 1, 2), 60, 60, 30, [lx, ly, lw, lh]);
      }
    }
    // Farolas a lo largo de las calles
    for (const x of xs) for (let y = 260; y < S - 100; y += rint(r, 460, 620)) P.tryAdd('lamp', x + 66, y, 16, 16, 30, -200);
    for (const y of ys) for (let x = 260; x < S - 100; x += rint(r, 460, 620)) if (xs.every((xv) => Math.abs(x - xv) > 100)) P.tryAdd('lamp', x, y + 62, 16, 16, 30, -200);
    P.scatter('rock', 6, 44, 34, 40);
  } else if (theme === 'transylvania') {
    const cx = S / 2 - 400 + rint(r, -200, 200), cy = S / 2 - 320 + rint(r, -200, 200);
    plazas.push({ x: cx + 40, y: cy + 40, w: 720, h: 560, kind: 'stone' });
    // Caminos empedrados desde la puerta del castillo
    const gate: [number, number] = [cx + 400, cy + 660];
    trails.push(windingTrail(r, gate, [rrange(r, 300, S - 300), S - 40], 90, 'cobble'));
    trails.push(windingTrail(r, gate, [40, rrange(r, 600, S - 600)], 80, 'cobble'));
    trails.push(windingTrail(r, gate, [S - 40, rrange(r, 600, S - 600)], 80, 'cobble'));
    P = new Placer(r, trails, (x, y) => x > cx - 60 && x < cx + 860 && y > cy - 60 && y < cy + 700);
    // Castillo
    const t = 40;
    P.add('wall', cx, cy, 800, t, 0);
    P.add('wall', cx, cy + 640 - t, 330, t, 0);
    P.add('wall', cx + 470, cy + 640 - t, 330, t, 0);
    P.add('wall', cx, cy, t, 640, 1);
    P.add('wall', cx + 800 - t, cy, t, 640, 1);
    for (const [tx, ty] of [[cx - 30, cy - 30], [cx + 730, cy - 30], [cx - 30, cy + 570], [cx + 730, cy + 570]]) P.add('tower', tx, ty, 100, 100, 0);
    P.add('brazier', cx + 290, cy + 670, 26, 26, 0);
    P.add('brazier', cx + 484, cy + 670, 26, 26, 0);
    P.add('statue', cx + 380, cy + 260, 40, 40, 0);
    P.add('brazier', cx + 200, cy + 300, 26, 26, 0);
    P.add('brazier', cx + 574, cy + 300, 26, 26, 0);
    // Cementerios agrupados con verja
    for (let g = 0; g < 4; g++) {
      for (let tries = 0; tries < 30; tries++) {
        const gw = rint(r, 360, 520), gh = rint(r, 280, 400);
        const gx = rrange(r, MARGIN, S - MARGIN - gw), gy = rrange(r, MARGIN, S - MARGIN - gh);
        if (!P.free(gx - 20, gy - 20, gw + 40, gh + 40, 60, 10)) continue;
        // verja con hueco de entrada
        const gap = rint(r, 0, 1);
        P.add('fence', gx, gy, gw, 20, 1);
        if (gap) { P.add('fence', gx, gy + gh, gw / 2 - 50, 20, 1); P.add('fence', gx + gw / 2 + 50, gy + gh, gw / 2 - 50, 20, 1); }
        else P.add('fence', gx, gy + gh, gw, 20, 1);
        P.add('fence', gx, gy, 20, gh / 2 - 40, 1); P.add('fence', gx, gy + gh / 2 + 40, 20, gh / 2 - 20, 1);
        P.add('fence', gx + gw - 20, gy, 20, gh + 20, 1);
        P.tryAdd('crypt', gx + gw / 2 - 65, gy + 40, 130, 100, 10, -200);
        for (let row = gy + 170; row < gy + gh - 40; row += 70) {
          for (let col = gx + 50; col < gx + gw - 60; col += rint(r, 55, 75)) {
            if (r() < 0.82) P.tryAdd(r() < 0.15 ? 'statue' : 'tomb', col + rint(r, -6, 6), row + rint(r, -6, 6), 28, 34, 8, -200);
          }
        }
        for (let k = 0; k < 4; k++) decor.push({ x: rrange(r, gx + 30, gx + gw - 30), y: rrange(r, gy + 30, gy + gh - 30), type: rpick(r, ['candle', 'skull', 'bones', 'cross'] as const), v: rint(r, 0, 3) });
        break;
      }
    }
    // Aldea con pozo
    for (let k = 0; k < 6; k++) P.scatter('house', 1, rint(r, 150, 190), rint(r, 120, 140), 70);
    P.scatter('well', 2, 56, 56, 80);
    // Bosque muerto agrupado por ruido
    P.cluster('deadtree', 90, 50, 50, 30, seed + 3, 500, 0.55);
    P.scatter('rock', 14, 44, 34, 40);
    for (let k = 0; k < 30; k++) decor.push({ x: rrange(r, 80, S - 80), y: rrange(r, 80, S - 80), type: rpick(r, ['bones', 'skull', 'mushroom', 'candle'] as const), v: rint(r, 0, 3) });
  } else {
    // Lago irregular
    const lake: Lake = { cx: rrange(r, 1000, 2200), cy: rrange(r, 900, 1400), rx: rrange(r, 420, 560), ry: rrange(r, 300, 400), seed: seed + 11 };
    lakes.push(lake);
    // Claro central con hoguera
    const fx = lake.cx + rrange(r, -300, 300), fy = lake.cy + lake.ry + 520;
    plazas.push({ x: fx - 230, y: fy - 180, w: 460, h: 360, kind: 'dirt' });
    // Senderos desde el claro hacia fuera
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + r() * 0.8;
      let ex = fx + Math.cos(a) * 1800, ey = fy + Math.sin(a) * 1800;
      ex = Math.max(60, Math.min(S - 60, ex)); ey = Math.max(60, Math.min(S - 60, ey));
      const tr = windingTrail(r, [fx, fy], [ex, ey], 60, 'dirt', 220);
      // que el sendero no atraviese el lago: recortar en la orilla
      const cut = tr.pts.findIndex(([x, y]) => lakeValue(lake, x, y) > -0.15);
      if (cut > 1) tr.pts = tr.pts.slice(0, cut);
      if (cut !== 0 && cut !== 1) trails.push(tr);
    }
    P = new Placer(r, trails, (x, y) => lakeValue(lake, x, y) > -0.2 || (x > fx - 230 && x < fx + 230 && y > fy - 180 && y < fy + 180));
    P.obs.push(...lakeObstacles(lake));
    P.add('firepit', fx - 25, fy - 18, 50, 36, 0);
    P.add('log', fx - 120, fy - 90, 80, 24, 0); P.add('log', fx + 40, fy + 60, 80, 24, 1);
    // Cabañas en anillo alrededor del claro
    const nCab = rint(r, 9, 12);
    for (let k = 0; k < nCab; k++) {
      const a = (k / nCab) * Math.PI * 2;
      const d = rrange(r, 420, 700);
      P.tryAdd('cabin', fx + Math.cos(a) * d - 85, fy + Math.sin(a) * d * 0.8 - 65, 170, 130, 60, 10);
    }
    P.scatter('cabin', 5, 170, 130, 120);
    // Canoas en la orilla
    for (let k = 0; k < 40 && P.obs.filter((o) => o.type === 'canoe').length < 4; k++) {
      const a = r() * Math.PI * 2;
      const x = lake.cx + Math.cos(a) * lake.rx * 1.15, y = lake.cy + Math.sin(a) * lake.ry * 1.2;
      if (lakeValue(lake, x, y) < -0.05 && lakeValue(lake, x, y) > -0.35) P.tryAdd('canoe', x - 45, y - 17, 90, 34, 30, 0);
    }
    // Bosque de pinos por ruido (denso en los bordes)
    P.cluster('pine', 230, 52, 52, 22, seed + 5, 420, 0.42);
    P.scatter('rock', 16, 44, 34, 40);
    P.scatter('log', 8, 80, 24, 40);
    for (let k = 0; k < 6; k++) decor.push({ x: rrange(r, 100, S - 100), y: rrange(r, 100, S - 100), type: 'lantern', v: 0 });
    for (let k = 0; k < 20; k++) decor.push({ x: rrange(r, 80, S - 80), y: rrange(r, 80, S - 80), type: rpick(r, ['mushroom', 'stump', 'bones'] as const), v: rint(r, 0, 3) });
    decor.push({ x: fx + 150, y: fy - 150, type: 'sign', v: 0 });
  }

  const obstacles = P.obs;
  // Quitar decoración que caiga sobre obstáculos
  const clean = decor.filter((d) => !obstacles.some((o) => d.x > o.x - 20 && d.x < o.x + o.w + 20 && d.y > o.y - 20 && d.y < o.y + o.h + 20));
  return { theme, seed, size: S, obstacles, decor: clean, trails, lakes, plazas };
}
