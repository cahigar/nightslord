// Mapas procedurales deterministas: servidor y cliente generan el mismo mapa a partir de (tema, semilla).
// Se usa ruido (fBm) para bosques, lagos y terreno, y caminos serpenteantes por "random walk".
import { MAP_SIZE } from './constants';

/** Tamaño del mapa que se está generando (cada tema puede tener el suyo). */
let MS = MAP_SIZE;
import { fbm } from './noise';
import { mulberry32, rint, rpick, rrange, type Rng } from './rng';

export type MapThemeId = 'elm' | 'transylvania' | 'camp' | 'swamp' | 'nile' | 'jungle' | 'cemetery' | 'cityz';

export type ObstacleType =
  | 'house' | 'fence' | 'tree' | 'car' | 'hedge' | 'lamp' | 'mailbox'
  | 'wall' | 'tomb' | 'crypt' | 'deadtree' | 'tower' | 'brazier' | 'well' | 'statue'
  | 'cabin' | 'pine' | 'water' | 'canoe' | 'rock' | 'firepit' | 'log'
  | 'shop' | 'barricade'
  | 'cypress' | 'hut' | 'cauldron'
  | 'pyramid' | 'sphinx' | 'obelisk' | 'column' | 'palm' | 'adobe'
  | 'jtree' | 'temple' | 'ruin' | 'tent' | 'crate'
  | 'block' | 'wreck' | 'barn' | 'hay';

export type DecorType =
  | 'bones' | 'pumpkin' | 'candle' | 'skull' | 'tricycle' | 'cross' | 'mushroom' | 'stump' | 'lantern' | 'sign' | 'reeds' | 'totem'
  | 'urn' | 'fern' | 'flower' | 'fossil';

export interface Obstacle { x: number; y: number; w: number; h: number; type: ObstacleType; v: number; body?: number }
export interface Decor { x: number; y: number; type: DecorType; v: number }
export interface Trail { pts: [number, number][]; w: number; kind: 'road' | 'dirt' | 'cobble' }
export interface Lake { cx: number; cy: number; rx: number; ry: number; seed: number }

/** Agua: tipo de terreno identificable para futuros personajes (nadar, aparecer, etc.). */
export type WaterKind = 'lake' | 'pond' | 'pool' | 'river';
export interface WaterBody { id: number; kind: WaterKind; x: number; y: number; w: number; h: number }
/** Río. shallow: agua poco profunda que se puede cruzar a pie, pero con corriente que arrastra río abajo (de pts[0] al final). */
export interface River { pts: [number, number][]; w: number; seed: number; bridges: { x: number; y: number }[]; shallow?: boolean; vertical?: boolean }
/** Distancias a un puente: a lo ancho del puente (a) y a lo largo, cruzando el río (c). El río vertical tiene los puentes en horizontal. */
export const bridgeAxes = (r: River, b: { x: number; y: number }, x: number, y: number) => (r.vertical ? { a: Math.abs(y - b.y), c: Math.abs(x - b.x) } : { a: Math.abs(x - b.x), c: Math.abs(y - b.y) });
export interface Pool { x: number; y: number; w: number; h: number }

/** Televisión: entidad localizable para futuros teletransportes. host = índice del obstáculo que la contiene (-1 si está al aire libre). */
export interface TV { id: number; x: number; y: number; w: number; h: number; kind: 'window' | 'shop' | 'outdoor'; host: number }
/** Punto de la calle frente a una tele (desde donde emite la Interferencia). */
export const tvSpot = (tv: TV) => ({ x: tv.x + tv.w / 2, y: tv.y + tv.h + (tv.kind === 'outdoor' ? 0 : 20) });
/** Conexiones de la Emisión nacional: cada tele con sus 2 más cercanas (determinista, igual en servidor y cliente). */
export function tvLinks(tvs: TV[]): [number, number][] {
  const pts = tvs.map(tvSpot), out: [number, number][] = [], seen = new Set<string>();
  pts.forEach((a, i) => {
    const near = pts.map((b, j) => [j, (a.x - b.x) ** 2 + (a.y - b.y) ** 2] as [number, number]).filter(([j]) => j !== i).sort((x, y) => x[1] - y[1]).slice(0, 2);
    for (const [j] of near) { const k = i < j ? `${i}-${j}` : `${j}-${i}`; if (!seen.has(k)) { seen.add(k); out.push([Math.min(i, j), Math.max(i, j)]); } }
  });
  return out;
}

/** Cómo se ve cada borde del mapa (el mundo continúa más allá, pero no se puede pasar). */
export type EdgeKind = 'forest' | 'water' | 'cliff' | 'fence' | 'wall' | 'houses' | 'hedge' | 'graves';
export type Side = 'n' | 's' | 'e' | 'w';
export const BORDER_DEPTH = 720; // franja visual fuera del área jugable

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
  swamp: { id: 'swamp', name: 'Pantano de la Bruja', subtitle: 'El caldero lleva siglos sin apagarse', ambient: '#050e08', moon: 'rgba(120,200,120,' },
  nile: { id: 'nile', name: 'Orillas del Nilo', subtitle: 'Algo se mueve bajo el agua', ambient: '#0e0a14', moon: 'rgba(210,180,120,' },
  jungle: { id: 'jungle', name: 'Jungla Jurásica', subtitle: 'La expedición no volvió del templo', ambient: '#04100a', moon: 'rgba(120,210,150,' },
  cemetery: { id: 'cemetery', name: 'Cementerio', subtitle: 'Los monstruos se reúnen antes del amanecer', ambient: '#0a0812', moon: 'rgba(150,140,220,' },
  cityz: { id: 'cityz', name: 'Ciudad Z', subtitle: 'Nadie quedó vivo tras la invasión... casi nadie', ambient: '#0a0a0c', moon: 'rgba(170,190,160,' },
};

/** Mapas del modo normal (rotación de salas). El Cementerio y la Ciudad Z son del modo El Señor de la Noche. */
export const THEME_IDS: MapThemeId[] = ['elm', 'transylvania', 'camp', 'swamp', 'nile', 'jungle'];
export const ALL_THEME_IDS = Object.keys(THEMES) as MapThemeId[];
/** Tamaño de cada mapa (los que no aparecen usan MAP_SIZE). */
export const MAP_SIZES: Partial<Record<MapThemeId, number>> = { cemetery: 2000, cityz: 5600 };
export const mapSizeOf = (t: MapThemeId) => MAP_SIZES[t] ?? MAP_SIZE;
/** Variante de humano zombi (Ciudad Z): 'z:citizen'. */
export const isZombieNpc = (variant: string) => variant.startsWith('z:');

/** Humanos que pasean por cada mapa. */
export const NPC_VARIANTS: Record<MapThemeId, string[]> = {
  elm: ['teen', 'neighbor', 'jock', 'nerd'],
  transylvania: ['villager', 'priest', 'maid', 'villager'],
  camp: ['camper', 'counselor', 'jock', 'nerd'],
  swamp: ['villager', 'camper', 'priest', 'maid'],
  nile: ['fellah', 'fellah', 'tourist', 'archaeologist'],
  jungle: ['explorer', 'explorer', 'porter', 'scientist'],
  cemetery: ['gravedigger', 'priest', 'villager', 'maid'],
  cityz: ['z:citizen', 'z:citizen', 'z:citizen', 'z:survivor', 'z:soldier', 'survivor', 'survivor'],
};


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
  rivers: River[];
  pools: Pool[];
  /** Todas las masas de agua jugables (lago, estanque, piscina, río). */
  water: WaterBody[];
  /** Todas las televisiones del mapa. */
  tvs: TV[];
  edges: Record<Side, EdgeKind>;
  /** Obstáculos decorativos fuera del área jugable (solo visuales). */
  border: Obstacle[];
  /** Altares oscuros (dan experiencia mientras estás encima, modo El Señor de la Noche). */
  altars: { x: number; y: number }[];
  /** Círculo de «listos» de la previa (Cementerio). */
  ready?: { x: number; y: number; r: number };
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

/** Valor >0 dentro del río. */
export function riverValue(r: River, x: number, y: number) {
  let d = Infinity;
  for (let i = 1; i < r.pts.length; i++) d = Math.min(d, distToSegment(x, y, r.pts[i - 1][0], r.pts[i - 1][1], r.pts[i][0], r.pts[i][1]));
  return r.w / 2 - d + (fbm(x, y, r.seed, 120, 2) - 0.5) * 22;
}

/** Corriente del agua poco profunda en un punto (dirección río abajo) o null. Compartido para que el cliente la prediga. */
export function currentAt(map: GameMap, x: number, y: number): { dx: number; dy: number } | null {
  for (const r of map.rivers) {
    if (!r.shallow || riverValue(r, x, y) <= 0) continue;
    let best = Infinity, dx = 1, dy = 0;
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i];
      const d = distToSegment(x, y, ax, ay, bx, by);
      if (d < best) { best = d; const l = Math.hypot(bx - ax, by - ay) || 1; dx = (bx - ax) / l; dy = (by - ay) / l; }
    }
    return { dx, dy };
  }
  return null;
}

export function onBridge(r: River, x: number, y: number) {
  for (const b of r.bridges) { const k = bridgeAxes(r, b, x, y); if (k.a < 46 && k.c < r.w) return true; }
  return false;
}

/** ¿Hay agua jugable en este punto? (lagos, estanques, ríos, piscinas) */
export function waterAt(map: GameMap, x: number, y: number) {
  for (const l of map.lakes) if (lakeValue(l, x, y) > 0) return true;
  for (const r of map.rivers) if (riverValue(r, x, y) > 0 && !onBridge(r, x, y)) return true; // (también el poco profundo)
  for (const p of map.pools) if (x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h) return true;
  return false;
}

const MARGIN = 100;
const hashTV = (o: Obstacle) => { const n = Math.sin(o.x * 12.9898 + o.y * 78.233) * 43758.5453; return n - Math.floor(n); };

const PCELL = 240;
class Placer {
  obs: Obstacle[] = [];
  /** Rejilla espacial para comprobar huecos rápido (los mapas grandes tienen miles de obstáculos). */
  private cells = new Map<number, Obstacle[]>();
  constructor(public r: Rng, public trails: Trail[], public blocked: (x: number, y: number) => boolean = () => false) {}

  private index(o: Obstacle) {
    const x0 = Math.floor(o.x / PCELL), x1 = Math.floor((o.x + o.w) / PCELL), y0 = Math.floor(o.y / PCELL), y1 = Math.floor((o.y + o.h) / PCELL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const k = cx * 4096 + cy;
      let c = this.cells.get(k);
      if (!c) this.cells.set(k, (c = []));
      c.push(o);
    }
  }

  push(...list: Obstacle[]) { for (const o of list) { this.obs.push(o); this.index(o); } }

  free(x: number, y: number, w: number, h: number, pad: number, trailPad = 20) {
    if (x < MARGIN || y < MARGIN || x + w > MS - MARGIN || y + h > MS - MARGIN) return false;
    const x0 = Math.floor((x - pad) / PCELL), x1 = Math.floor((x + w + pad) / PCELL), y0 = Math.floor((y - pad) / PCELL), y1 = Math.floor((y + h + pad) / PCELL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const c = this.cells.get(cx * 4096 + cy);
      if (c) for (const o of c) if (x < o.x + o.w + pad && x + w + pad > o.x && y < o.y + o.h + pad && y + h + pad > o.y) return false;
    }
    for (const t of this.trails) if (distToTrail(t, x + w / 2, y + h / 2) < t.w / 2 + Math.max(w, h) / 2 + trailPad) return false;
    if (this.blocked(x, y) || this.blocked(x + w, y) || this.blocked(x, y + h) || this.blocked(x + w, y + h) || this.blocked(x + w / 2, y + h / 2)) return false;
    return true;
  }

  add(type: ObstacleType, x: number, y: number, w: number, h: number, v = rint(this.r, 0, 3)) {
    const o: Obstacle = { x: Math.round(x), y: Math.round(y), w, h, type, v };
    this.push(o);
    return o;
  }

  tryAdd(type: ObstacleType, x: number, y: number, w: number, h: number, pad = 40, trailPad = 20) {
    if (!this.free(x, y, w, h, pad, trailPad)) return null;
    return this.add(type, x, y, w, h);
  }

  scatter(type: ObstacleType, n: number, w: number, h: number, pad: number, area?: [number, number, number, number], tries = 25) {
    const [ax, ay, aw, ah] = area ?? [MARGIN, MARGIN, MS - 2 * MARGIN, MS - 2 * MARGIN];
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
      const x = rrange(this.r, MARGIN, MS - MARGIN - w), y = rrange(this.r, MARGIN, MS - MARGIN - h);
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

/** Río serpenteante: rectángulos de colisión (sin cubrir los puentes). */
function riverObstacles(r: River): Obstacle[] {
  const C = 40, out: Obstacle[] = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of r.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  x0 = Math.max(0, Math.floor((x0 - r.w) / C) * C); y0 = Math.max(0, Math.floor((y0 - r.w) / C) * C);
  x1 = Math.min(MS, x1 + r.w); y1 = Math.min(MS, y1 + r.w);
  for (let y = y0; y < y1; y += C) {
    let run = -1;
    for (let x = x0; x <= x1 + C; x += C) {
      const cx = x + C / 2, cy = y + C / 2;
      const inside = x <= x1 && riverValue(r, cx, cy) > 6 && !r.bridges.some((b) => { const k = bridgeAxes(r, b, cx, cy); return k.a < 70 && k.c < r.w + 20; });
      if (inside && run < 0) run = x;
      if (!inside && run >= 0) { out.push({ x: run, y, w: x - run, h: C, type: 'water', v: 0 }); run = -1; }
    }
  }
  return out;
}

/** Puentes donde los caminos cruzan el río. */
function findBridges(r: River, trails: Trail[]) {
  for (const t of trails) {
    for (let i = 1; i < t.pts.length; i++) {
      const [ax, ay] = t.pts[i - 1], [bx, by] = t.pts[i];
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 12);
      let best: { x: number; y: number; v: number } | null = null;
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
        const v = riverValue(r, x, y);
        if (v > -10 && (!best || v > best.v)) best = { x, y, v };
        else if (best && v < -40) { if (!r.bridges.some((b) => Math.hypot(b.x - best!.x, b.y - best!.y) < 150)) r.bridges.push({ x: best.x, y: best.y }); best = null; }
      }
      if (best && !r.bridges.some((b) => Math.hypot(b.x - best!.x, b.y - best!.y) < 150)) r.bridges.push({ x: best.x, y: best.y });
    }
  }
}

/** Ventanas de las fachadas (coinciden con el arte de client/tiles.ts, en píxeles de arte de 3 px). */
export const FACADE = {
  house: { F: 18, winY: 4, winW: 6, winH: 7, firstX: 4, stepX: 13 },
  cabin: { winX: 5, winYFromBase: 12, winW: 7, winH: 6 },
  shop: { F: 26, winX: 4, winY: 5, winRight: 20, winH: 13 },
};

function houseTV(o: Obstacle, idx: number, id: number): TV | null {
  const W = Math.ceil(o.w / 3), H = Math.ceil(o.h / 3), f = FACADE.house;
  for (let wx = f.firstX; wx < W - 10; wx += f.stepX) {
    if (Math.abs(wx + 3 - W / 2) < 7) continue;
    return { id, x: o.x + wx * 3, y: o.y + (H - f.F + f.winY) * 3, w: f.winW * 3, h: f.winH * 3, kind: 'window', host: idx };
  }
  return null;
}

/** Franja exterior temática: el mundo continúa, pero se entiende que no se puede pasar. */
function buildBorder(r: Rng, theme: MapThemeId, edges: Record<Side, EdgeKind>, trails: Trail[]): Obstacle[] {
  const S = MS, D = BORDER_DEPTH, out: Obstacle[] = [];
  const treeType: ObstacleType = theme === 'elm' || theme === 'cityz' ? 'tree' : theme === 'cemetery' ? 'deadtree' : theme === 'transylvania' ? 'deadtree' : theme === 'swamp' ? 'cypress' : theme === 'nile' ? 'palm' : theme === 'jungle' ? 'jtree' : 'pine';
  const nearRoad = (x: number, y: number, pad: number) => trails.some((t) => t.kind === 'road' && distToTrail(t, x, y) < t.w / 2 + pad);
  const add = (type: ObstacleType, x: number, y: number, w: number, h: number, v = rint(r, 0, 3)) => {
    if (nearRoad(x + w / 2, y + h / 2, Math.max(w, h) / 2 + 6)) return;
    out.push({ x: Math.round(x), y: Math.round(y), w, h, type, v });
  };
  // cada lado: recorre su longitud; 'dOut' = distancia hacia fuera del mapa
  const sides: Side[] = ['n', 's', 'w', 'e'];
  for (const side of sides) {
    const kind = edges[side];
    const horiz = side === 'n' || side === 's';
    const len0 = horiz ? -D : 0, len1 = horiz ? S + D : S;
    const at = (l: number, dOut: number, w: number, h: number): [number, number] => {
      switch (side) {
        case 'n': return [l, -dOut - h];
        case 's': return [l, S + dOut];
        case 'w': return [-dOut - w, l];
        default: return [S + dOut, l];
      }
    };
    const line = (type: ObstacleType, segW: number, thick: number, dOut: number, v = 1) => {
      for (let l = len0; l < len1; l += segW) {
        const [x, y] = at(l, dOut, horiz ? segW : thick, horiz ? thick : segW);
        add(type, x, y, horiz ? segW : thick, horiz ? thick : segW, v);
      }
    };
    const fill = (type: ObstacleType, w: number, h: number, step: number, from: number, to: number, density = 1) => {
      for (let l = len0; l < len1; l += step) for (let d = from; d < to; d += step) {
        if (r() > density) continue;
        const [x, y] = at(l + rrange(r, -step * 0.35, step * 0.35), d + rrange(r, -step * 0.3, step * 0.3), w, h);
        add(type, x, y, w, h);
      }
    };
    switch (kind) {
      case 'forest':
        fill(treeType, 52, 52, 46, 8, 160, 1); // barrera densa
        fill(treeType, 52, 52, 70, 160, D, 0.85);
        break;
      case 'hedge':
        line('hedge', 160, 26, 14);
        fill('tree', 56, 56, 110, 120, D, 0.6);
        break;
      case 'fence':
        line('fence', 200, 22, 18, theme === 'elm' ? 0 : 1);
        fill(treeType, 52, 52, 120, 140, D, 0.55);
        break;
      case 'wall':
        line('wall', 200, 40, 10, 0);
        fill(treeType, 50, 50, 100, 120, D, 0.6);
        break;
      case 'houses':
        line('fence', 200, 22, 18, 0);
        for (let l = len0 + 40; l < len1; l += rint(r, 250, 300)) { const [x, y] = at(l, 230, 200, 150); add('house', x, y, 200, 150); }
        fill('tree', 56, 56, 140, 420, D, 0.5);
        break;
      case 'graves':
        line('fence', 200, 20, 16, 1);
        fill('tomb', 28, 34, 64, 90, 480, 0.75);
        fill('deadtree', 50, 50, 120, 480, D, 0.6);
        break;
      case 'cliff':
        for (let l = len0; l < len1; l += rint(r, 50, 80)) { const [x, y] = at(l, rrange(r, 0, 26), 46, 36); add('rock', x, y, 46, 36); }
        if (theme === 'nile') fill('rock', 44, 34, 150, 120, D, 0.25); // desierto rocoso
        break;
      case 'water':
        for (let l = len0; l < len1; l += rint(r, 160, 320)) { const [x, y] = at(l, rrange(r, 4, 20), 44, 34); add('rock', x, y, 44, 34); }
        break;
    }
  }
  // vallas de obra donde las calles salen del mapa
  for (const t of trails) {
    if (t.kind !== 'road') continue;
    const [ax, ay] = t.pts[0], [bx, by] = t.pts[t.pts.length - 1];
    if (ax === bx) { out.push({ x: ax - 60, y: -40, w: 120, h: 20, type: 'barricade', v: 0 }); out.push({ x: ax - 60, y: S + 20, w: 120, h: 20, type: 'barricade', v: 0 }); }
    if (ay === by) { out.push({ x: -40, y: ay - 60, w: 20, h: 120, type: 'barricade', v: 1 }); out.push({ x: S + 20, y: ay - 60, w: 20, h: 120, type: 'barricade', v: 1 }); }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Modo El Señor de la Noche: Cementerio (previa) y Ciudad Z (partida)
// ---------------------------------------------------------------------------
function genCemetery(r: Rng, S: number, seed: number, trails: Trail[], plazas: GameMap['plazas'], decor: Decor[]) {
  const c = S / 2;
  const ready = { x: c, y: c, r: 150 };
  plazas.push({ x: c - 240, y: c - 240, w: 480, h: 480, kind: 'stone' });
  // cuatro caminos empedrados desde el círculo de los listos
  for (const [ex, ey] of [[c + rrange(r, -200, 200), -BORDER_DEPTH], [c + rrange(r, -200, 200), S + BORDER_DEPTH], [-BORDER_DEPTH, c + rrange(r, -200, 200)], [S + BORDER_DEPTH, c + rrange(r, -200, 200)]] as [number, number][]) {
    trails.push(windingTrail(r, [c, c], [ex, ey], 70, 'cobble', 120));
  }
  const P = new Placer(r, trails, (x, y) => Math.hypot(x - c, y - c) < 300);
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k * Math.PI) / 2; P.add('brazier', c + Math.cos(a) * 250 - 13, c + Math.sin(a) * 250 - 13, 26, 26, 0); }
  // un mausoleo por cuadrante y filas de tumbas
  for (const [qx, qy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const ax = qx ? c + 300 : MARGIN + 40, ay = qy ? c + 300 : MARGIN + 40, aw = c - 300 - MARGIN - 40, ah = aw;
    P.scatter('crypt', 1, 150, 110, 60, [ax, ay, aw, ah], 40);
    for (let row = ay + 30; row < ay + ah - 40; row += 74) {
      for (let col = ax + 20; col < ax + aw - 30; col += rint(r, 56, 72)) {
        if (r() < 0.7) P.tryAdd(r() < 0.12 ? 'statue' : 'tomb', col + rint(r, -6, 6), row + rint(r, -6, 6), 28, 34, 10, 10);
      }
    }
  }
  P.cluster('deadtree', 30, 50, 50, 40, seed + 3, 300, 0.5);
  for (let k = 0; k < 50; k++) decor.push({ x: rrange(r, 80, S - 80), y: rrange(r, 80, S - 80), type: rpick(r, ['candle', 'candle', 'cross', 'skull', 'bones', 'pumpkin'] as const), v: rint(r, 0, 3) });
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; decor.push({ x: c + Math.cos(a) * 175, y: c + Math.sin(a) * 175, type: 'candle', v: k % 3 }); } // velas alrededor del círculo
  return { P, ready };
}

function genCityZ(r: Rng, S: number, seed: number, trails: Trail[], plazas: GameMap['plazas'], decor: Decor[], lakes: Lake[], rivers: River[], altars: GameMap['altars'], shops: Obstacle[]): Placer {
  const west = r() < 0.5; // lado del agua (río, lagos y marismas)
  const rx = west ? S * 0.17 : S * 0.83;
  // ciudad: rejilla de calles en el centro, desplazada hacia el lado contrario al agua
  const cx0 = west ? S * 0.3 : S * 0.12, cx1 = west ? S * 0.88 : S * 0.7, cy0 = S * 0.18, cy1 = S * 0.8;
  const xs: number[] = [], ys: number[] = [];
  for (let x = cx0; x <= cx1 + 1; x += 580) xs.push(Math.round(x + rint(r, -50, 50)));
  for (let y = cy0; y <= cy1 + 1; y += 580) ys.push(Math.round(y + rint(r, -50, 50)));
  const hw = ys[Math.floor(ys.length / 2)], vw = xs[Math.floor(xs.length / 2)];
  for (const x of xs) trails.push(x === vw ? { pts: [[x, -BORDER_DEPTH], [x, S + BORDER_DEPTH]], w: 120, kind: 'road' } : { pts: [[x, cy0 - 160], [x, cy1 + 160]], w: 100, kind: 'road' });
  for (const y of ys) trails.push(y === hw ? { pts: [[-BORDER_DEPTH, y], [S + BORDER_DEPTH, y]], w: 120, kind: 'road' } : { pts: [[cx0 - 160, y], [cx1 + 160, y]], w: 100, kind: 'road' });
  // río ancho
  const river: River = { ...windingTrail(r, [rx + rrange(r, -150, 150), -BORDER_DEPTH], [rx + rrange(r, -150, 150), S + BORDER_DEPTH], 0, 'dirt', 300), w: 210, seed: seed + 21, bridges: [], vertical: true };
  for (const pt of river.pts) pt[0] = Math.max(rx - 260, Math.min(rx + 260, pt[0]));
  // caminos de tierra hacia las granjas (uno cruza el río por un puente de madera)
  const farmYs = [S * 0.1, S * 0.9];
  trails.push(windingTrail(r, [vw, cy0 - 160], [rrange(r, S * 0.3, S * 0.7), 40], 60, 'dirt', 260));
  trails.push(windingTrail(r, [vw, cy1 + 160], [rrange(r, S * 0.3, S * 0.7), S - 40], 60, 'dirt', 260));
  trails.push(windingTrail(r, [west ? cx0 - 160 : cx1 + 160, ys[0]], [west ? 40 : S - 40, farmYs[0] + rrange(r, 200, 600)], 56, 'dirt', 260));
  trails.push(windingTrail(r, [west ? cx1 + 160 : cx0 - 160, ys[ys.length - 1]], [west ? S - 40 : 40, farmYs[1] - rrange(r, 200, 600)], 56, 'dirt', 260));
  findBridges(river, trails);
  rivers.push(river);
  // lagos y charcas en el lado del agua
  const wx = west ? S * 0.06 : S * 0.94;
  for (const fy of [0.28, 0.66]) lakes.push({ cx: wx + rrange(r, -60, 60), cy: S * fy + rrange(r, -150, 150), rx: rrange(r, 200, 260), ry: rrange(r, 240, 340), seed: seed + 40 + fy * 10 });
  const reserved: [number, number, number, number][] = [];
  const inRes = (x: number, y: number) => reserved.some(([a, b, w, h]) => x > a && x < a + w && y > b && y < b + h);
  const P = new Placer(r, trails, (x, y) => riverValue(river, x, y) > -60 || lakes.some((l) => lakeValue(l, x, y) > -0.2) || inRes(x, y));
  P.push(...riverObstacles(river));
  for (const l of lakes) P.push(...lakeObstacles(l));
  // altares oscuros: plaza de la ciudad, junto al agua y en el campo
  const altarAt = (x: number, y: number) => { altars.push({ x: Math.round(x), y: Math.round(y) }); plazas.push({ x: x - 90, y: y - 90, w: 180, h: 180, kind: 'stone' }); reserved.push([x - 110, y - 110, 220, 220]); };
  const bi = Math.floor(xs.length / 2) - 1, bj = Math.floor(ys.length / 2) - 1;
  const sqx = (xs[Math.max(0, bi)] + xs[Math.max(1, bi + 1)]) / 2, sqy = (ys[Math.max(0, bj)] + ys[Math.max(1, bj + 1)]) / 2;
  plazas.push({ x: sqx - 210, y: sqy - 210, w: 420, h: 420, kind: 'stone' });
  altarAt(sqx, sqy);
  reserved.push([sqx - 220, sqy - 220, 440, 440]);
  const tryAltar = (ax: number, ay: number, aw: number, ah: number) => {
    for (let k = 0; k < 60; k++) {
      const x = rrange(r, ax, ax + aw), y = rrange(r, ay, ay + ah);
      if (x < 300 || y < 300 || x > S - 300 || y > S - 300 || !P.free(x - 110, y - 110, 220, 220, 10, 10) || altars.some((a) => Math.hypot(a.x - x, a.y - y) < 1300)) continue;
      altarAt(x, y); return;
    }
  };
  tryAltar(west ? rx + 200 : rx - 600, S * 0.3, 400, S * 0.4); // junto al río
  tryAltar(S * 0.15, 200, S * 0.7, S * 0.12); // campo norte
  tryAltar(S * 0.15, S * 0.86, S * 0.7, S * 0.12); // campo sur
  tryAltar(200, 200, S - 400, S - 400);
  // manzanas de la ciudad: bloques de pisos en ruinas, tiendas saqueadas y parques
  const cityRect: [number, number, number, number] = [cx0 - 200, cy0 - 200, cx1 - cx0 + 400, cy1 - cy0 + 400];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    const x0 = xs[i] + 70, x1 = xs[i + 1] - 70, y0 = ys[j] + 70, y1 = ys[j + 1] - 70;
    const area: [number, number, number, number] = [x0, y0, x1 - x0, y1 - y0];
    if (r() < 0.14) { P.scatter('tree', 6, 60, 60, 40, area); P.scatter('lamp', 2, 16, 16, 60, area); continue; } // parque
    const nb = rint(r, 3, 5);
    for (let k = 0; k < nb; k++) { if (r() < 0.75) P.scatter('block', 1, rint(r, 150, 210), rint(r, 120, 160), 34, area, 30); else P.scatter('house', 1, rint(r, 160, 200), rint(r, 120, 150), 34, area, 30); }
    if (r() < 0.45) { const sw = 210, sh = 132; const o = P.tryAdd('shop', rrange(r, x0, x1 - sw), rrange(r, y0, y1 - sh), sw, sh, 30); if (o) shops.push(o); }
    P.scatter('crate', rint(r, 1, 3), 30, 26, 20, area);
    P.scatter('barricade', r() < 0.3 ? 1 : 0, 120, 20, 30, area);
    for (let k = 0; k < 3; k++) decor.push({ x: rrange(r, x0, x1), y: rrange(r, y0, y1), type: rpick(r, ['bones', 'skull', 'sign'] as const), v: rint(r, 0, 3) });
  }
  // coches calcinados y farolas por las calles
  for (const t of trails) {
    if (t.kind !== 'road') continue;
    const [a, b] = [t.pts[0], t.pts[t.pts.length - 1]];
    const vert = a[0] === b[0];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let d = 200; d < len - 100; d += rint(r, 240, 420)) {
      const px = a[0] + ((b[0] - a[0]) * d) / len, py = a[1] + ((b[1] - a[1]) * d) / len;
      if (r() < 0.42) {
        const off = rpick(r, [-26, 26]);
        if (vert) P.tryAdd('wreck', px + off - 27, py - 48, 54, 96, 30, -1000); else P.tryAdd('wreck', px - 48, py + off - 27, 96, 54, 30, -1000);
      }
      if (r() < 0.4) { if (vert) P.tryAdd('lamp', px + t.w / 2 + 12, py, 16, 16, 30, -200); else P.tryAdd('lamp', px, py + t.w / 2 + 8, 16, 16, 30, -200); }
    }
  }
  reserved.push(cityRect);
  // afueras: granjas con granero, pacas de heno y campos vallados
  for (let k = 0; k < 9; k++) {
    for (let tries = 0; tries < 40; tries++) {
      const fw = rint(r, 460, 620), fh = rint(r, 340, 460);
      const fx = rrange(r, MARGIN, S - MARGIN - fw), fy = rrange(r, MARGIN, S - MARGIN - fh);
      if (!P.free(fx - 30, fy - 30, fw + 60, fh + 60, 40, 20)) continue;
      plazas.push({ x: fx, y: fy, w: fw, h: fh, kind: 'dirt' });
      P.add('barn', fx + 20, fy + 20, 210, 160, rint(r, 0, 3));
      P.add('house', fx + fw - 200, fy + 30, 180, 140, rint(r, 0, 3));
      for (let h = 0; h < 6; h++) P.tryAdd('hay', fx + rrange(r, 30, fw - 70), fy + rrange(r, 220, fh - 50), 40, 30, 16, 0);
      P.add('fence', fx, fy + fh, fw / 2 - 50, 20, 0); P.add('fence', fx + fw / 2 + 50, fy + fh, fw / 2 - 50, 20, 0);
      P.add('fence', fx, fy, 20, fh, 0); P.add('fence', fx + fw - 20, fy, 20, fh, 0);
      decor.push({ x: fx + fw / 2, y: fy + fh + 30, type: 'sign', v: 0 });
      break;
    }
  }
  // campamento de supervivientes
  P.scatter('tent', 3, 96, 66, 40);
  P.scatter('firepit', 2, 50, 36, 300);
  // bosquecillos y árboles sueltos fuera de la ciudad
  for (let i = 0, placed = 0; i < 2600 && placed < 260; i++) {
    const x = rrange(r, MARGIN, S - MARGIN - 60), y = rrange(r, MARGIN, S - MARGIN - 60);
    if (fbm(x, y, seed + 5, 520, 3) < 0.48) continue;
    if (P.tryAdd(r() < 0.25 ? 'deadtree' : 'tree', x, y, 56, 56, 26)) placed++;
  }
  P.scatter('rock', 26, 44, 34, 40);
  P.scatter('wreck', 10, 96, 54, 50);
  for (let k = 0; k < 120; k++) decor.push({ x: rrange(r, 80, S - 80), y: rrange(r, 80, S - 80), type: rpick(r, ['bones', 'skull', 'stump', 'mushroom', 'bones'] as const), v: rint(r, 0, 3) });
  for (const l of lakes) for (let k = 0; k < 8; k++) { const a = r() * Math.PI * 2; decor.push({ x: l.cx + Math.cos(a) * l.rx * 1.12, y: l.cy + Math.sin(a) * l.ry * 1.15, type: 'reeds', v: rint(r, 0, 3) }); }
  return P;
}

// ---------------------------------------------------------------------------
export function generateMap(theme: MapThemeId, seed: number): GameMap {
  const r = mulberry32(seed);
  const S = (MS = MAP_SIZES[theme] ?? MAP_SIZE);
  const trails: Trail[] = [];
  const lakes: Lake[] = [];
  const plazas: GameMap['plazas'] = [];
  const decor: Decor[] = [];
  const rivers: River[] = [];
  const pools: Pool[] = [];
  const tvs: TV[] = [];
  const shops: Obstacle[] = [];
  const altars: GameMap['altars'] = [];
  let ready: GameMap['ready'];
  let P: Placer;

  if (theme === 'elm') {
    // Cuadrícula de calles con desplazamientos por semilla
    const xs = [1, 2, 3].map((i) => i * 800 + rint(r, -90, 90));
    const ys = [1, 2, 3].map((i) => i * 800 + rint(r, -90, 90));
    // las calles siguen más allá del borde del mapa (el barrio continúa)
    for (const x of xs) trails.push({ pts: [[x, -BORDER_DEPTH], [x, S + BORDER_DEPTH]], w: 110, kind: 'road' });
    for (const y of ys) trails.push({ pts: [[-BORDER_DEPTH, y], [S + BORDER_DEPTH, y]], w: 110, kind: 'road' });
    const shopLots = new Set([rint(r, 0, 15), rint(r, 0, 15)]);
    // Un parque con estanque en una manzana aleatoria
    const parkBx = rint(r, 0, 3), parkBy = rint(r, 0, 3);
    const bxEdges = [0, ...xs, S], byEdges = [0, ...ys, S];
    const parkCx = (bxEdges[parkBx] + bxEdges[parkBx + 1]) / 2, parkCy = (byEdges[parkBy] + byEdges[parkBy + 1]) / 2;
    lakes.push({ cx: parkCx, cy: parkCy, rx: 170, ry: 120, seed: seed + 7 });
    P = new Placer(r, trails, (x, y) => lakes.some((l) => lakeValue(l, x, y) > -0.25));
    for (const l of lakes) P.push(...lakeObstacles(l));
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
      let lotN = 0;
      for (const [lx, ly] of lots) {
        // tienda de electrodomésticos con televisiones en el escaparate
        if (lotN++ === 0 && shopLots.has(bx * 4 + by)) {
          const sw = 210, sh = 132;
          const o = P.tryAdd('shop', lx + (lw - sw) / 2, ly + (lh - sh) / 2, sw, sh, 30);
          if (o) { shops.push(o); continue; }
        }
        if (r() < 0.18) { P.scatter('tree', 3, 60, 60, 30, [lx, ly, lw, lh]); continue; }
        const hw = rint(r, 170, 220), hh = rint(r, 130, 160);
        const hx = lx + (lw - hw) / 2 + rint(r, -20, 20), hy = ly + (lh - hh) / 2 + rint(r, -15, 15);
        if (!P.tryAdd('house', hx, hy, hw, hh, 30)) continue;
        if (r() < 0.5) P.tryAdd('car', hx + hw + 20, hy + hh - 90, 50, 90, 10);
        // piscina en el patio trasero
        if (r() < 0.22) {
          const pw = rint(r, 100, 130), ph = rint(r, 56, 70);
          const pool = P.tryAdd('water', hx + hw / 2 - pw / 2, hy - ph - 34, pw, ph, 14, 10);
          if (pool) pools.push({ x: pool.x, y: pool.y, w: pool.w, h: pool.h });
        }
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
    // río que cruza el valle por debajo del castillo (con puentes donde pasan los caminos)
    const ry = Math.min(S - 260, cy + 640 + rrange(r, 200, 380));
    const river: River = { ...windingTrail(r, [-BORDER_DEPTH, ry + rrange(r, -150, 150)], [S + BORDER_DEPTH, ry + rrange(r, -150, 150)], 0, 'dirt', 260), w: 96, seed: seed + 21, bridges: [] };
    for (const pt of river.pts) pt[1] = Math.max(cy + 790, Math.min(S - 160, pt[1])); // siempre por debajo del castillo
    findBridges(river, trails);
    // al menos tres pasos (puentes de madera) repartidos a lo ancho
    for (const fx of [0.16, 0.5, 0.84].map((f) => f * S)) {
      if (river.bridges.some((b) => Math.abs(b.x - fx) < 380)) continue;
      let best = { y: 0, v: -Infinity };
      for (let y = cy + 700; y < S - 60; y += 8) { const v = riverValue(river, fx, y); if (v > best.v) best = { y, v }; }
      if (best.v > 0) river.bridges.push({ x: fx, y: best.y });
    }
    rivers.push(river);
    P = new Placer(r, trails, (x, y) => (x > cx - 60 && x < cx + 860 && y > cy - 60 && y < cy + 700) || riverValue(river, x, y) > -40);
    P.push(...riverObstacles(river));
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
  } else if (theme === 'swamp') {
    // Pantano: muchas charcas de agua negra unidas por pasarelas de tierra, la choza de la bruja en el centro
    const hx = S / 2 + rint(r, -260, 260) - 110, hy = S / 2 + rint(r, -260, 260) - 80;
    plazas.push({ x: hx - 140, y: hy - 90, w: 500, h: 360, kind: 'dirt' });
    const nPonds = rint(r, 9, 12);
    for (let k = 0, tries = 0; k < nPonds && tries < 200; tries++) {
      const cx = rrange(r, 260, S - 260), cy = rrange(r, 260, S - 260);
      if (cx > hx - 360 && cx < hx + 580 && cy > hy - 320 && cy < hy + 480) continue; // la isla de la choza queda seca
      const rx = rrange(r, 130, 250), ry = rrange(r, 100, 190);
      if (lakes.some((l) => Math.hypot(l.cx - cx, l.cy - cy) < l.rx + rx + 90)) continue;
      lakes.push({ cx, cy, rx, ry, seed: seed + 31 + k });
      k++;
    }
    // senderos fangosos desde la choza
    const door: [number, number] = [hx + 110, hy + 190];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + r() * 0.7;
      const ex = Math.max(60, Math.min(S - 60, door[0] + Math.cos(a) * 1900)), ey = Math.max(60, Math.min(S - 60, door[1] + Math.sin(a) * 1900));
      trails.push(windingTrail(r, door, [ex, ey], 54, 'dirt', 260));
    }
    P = new Placer(r, trails, (x, y) => lakes.some((l) => lakeValue(l, x, y) > -0.2) || (x > hx - 140 && x < hx + 360 && y > hy - 90 && y < hy + 270));
    for (const l of lakes) P.push(...lakeObstacles(l));
    P.add('hut', hx, hy, 220, 160, 0);
    P.add('cauldron', hx + 280, hy + 150, 44, 36, 0);
    for (const [dx, dy] of [[-100, 40], [-80, 210], [300, 20]]) decor.push({ x: hx + dx, y: hy + dy, type: 'totem', v: rint(r, 0, 3) });
    // chozas de pescadores (algunas con tele)
    P.scatter('cabin', 5, 170, 130, 140);
    // cipreses y árboles muertos agrupados, más densos en la orilla
    P.cluster('cypress', 150, 56, 56, 22, seed + 9, 380, 0.4);
    P.cluster('deadtree', 40, 50, 50, 30, seed + 4, 300, 0.55);
    P.scatter('rock', 10, 44, 34, 40);
    P.scatter('log', 10, 80, 24, 40);
    // juncos en las orillas y setas brillantes
    for (const l of lakes) for (let k = 0; k < 7; k++) {
      const a = r() * Math.PI * 2;
      decor.push({ x: l.cx + Math.cos(a) * l.rx * 1.12, y: l.cy + Math.sin(a) * l.ry * 1.15, type: 'reeds', v: rint(r, 0, 3) });
    }
    for (let k = 0; k < 26; k++) decor.push({ x: rrange(r, 80, S - 80), y: rrange(r, 80, S - 80), type: rpick(r, ['mushroom', 'mushroom', 'bones', 'skull', 'candle', 'stump'] as const), v: rint(r, 0, 3) });
  } else if (theme === 'nile') {
    // El Nilo cruza el desierto de norte a sur; pirámides y esfinge en una orilla, templo en ruinas y aldea en la otra
    const rx = S * (0.4 + r() * 0.2);
    const river: River = { ...windingTrail(r, [rx + rrange(r, -180, 180), -BORDER_DEPTH], [rx + rrange(r, -180, 180), S + BORDER_DEPTH], 0, 'dirt', 300), w: 200, seed: seed + 21, bridges: [], vertical: true };
    for (const pt of river.pts) pt[0] = Math.max(700, Math.min(S - 700, pt[0]));
    // caminos de arena que cruzan el río por pasarelas
    for (const fy of [0.22 + r() * 0.12, 0.66 + r() * 0.12]) trails.push(windingTrail(r, [-BORDER_DEPTH, fy * S], [S + BORDER_DEPTH, fy * S + rrange(r, -160, 160)], 66, 'dirt', 200));
    findBridges(river, trails);
    rivers.push(river);
    const west = rx > S / 2; // las pirámides, en la orilla más ancha
    const desert: [number, number, number, number] = west ? [MARGIN, MARGIN, rx - 380 - MARGIN, S - 2 * MARGIN] : [rx + 380, MARGIN, S - rx - 380 - MARGIN, S - 2 * MARGIN];
    const other: [number, number, number, number] = west ? [rx + 260, MARGIN, S - rx - 260 - MARGIN, S - 2 * MARGIN] : [MARGIN, MARGIN, rx - 260 - MARGIN, S - 2 * MARGIN];
    // templo: patio de losas con columnas, obeliscos a la entrada
    const tw = 520, thh = 360;
    const tx = other[0] + rrange(r, 40, Math.max(41, other[2] - tw - 40)), ty = S / 2 - thh / 2 + rint(r, -500, 500);
    plazas.push({ x: tx, y: ty, w: tw, h: thh, kind: 'stone' });
    P = new Placer(r, trails, (x, y) => riverValue(river, x, y) > -70 || (x > tx - 40 && x < tx + tw + 40 && y > ty - 40 && y < ty + thh + 40));
    P.push(...riverObstacles(river));
    for (let x = tx + 20; x < tx + tw - 30; x += 96) { P.add('column', x, ty + 10, 28, 28, rint(r, 0, 3)); if (r() < 0.75) P.add('column', x, ty + thh - 40, 28, 28, rint(r, 0, 3)); }
    for (let y = ty + 110; y < ty + thh - 110; y += 96) { P.add('column', tx + 10, y, 28, 28, 1); P.add('column', tx + tw - 38, y, 28, 28, 2); }
    P.add('statue', tx + tw / 2 - 20, ty + thh / 2 - 20, 40, 40, 0);
    for (let k = 0; k < 6; k++) decor.push({ x: rrange(r, tx + 60, tx + tw - 60), y: rrange(r, ty + 60, ty + thh - 60), type: rpick(r, ['urn', 'candle', 'skull'] as const), v: rint(r, 0, 3) });
    // pirámides y esfinge
    const sizes: [number, number][] = [[360, 260], [280, 210], [220, 170]];
    for (const [w, h] of sizes) P.scatter('pyramid', 1, w, h, 140, desert, 60);
    P.scatter('sphinx', 1, 210, 100, 90, desert, 60);
    P.scatter('obelisk', 4, 26, 26, 160, desert);
    P.scatter('obelisk', 2, 26, 26, 160, other);
    // aldea de adobe junto al río
    const band: [number, number, number, number] = [Math.max(MARGIN, rx - 700), MARGIN, 1400, S - 2 * MARGIN];
    P.scatter('adobe', 9, 160, 116, 80, band, 40);
    // palmeras en las orillas (oasis del Nilo) y papiros
    for (let i = 0; i < river.pts.length - 1; i++) {
      const [ax, ay] = river.pts[i], [bx, by] = river.pts[i + 1];
      for (let t = 0; t < 1; t += 0.2) for (const side of [-1, 1]) {
        if (r() < 0.45) continue;
        const x = ax + (bx - ax) * t + side * rrange(r, river.w / 2 + 50, river.w / 2 + 170), y = ay + (by - ay) * t;
        P.tryAdd('palm', x - 26, y - 26, 52, 52, 18);
        if (r() < 0.6) decor.push({ x: ax + (bx - ax) * t + side * (river.w / 2 + 14), y, type: 'reeds', v: rint(r, 0, 3) });
      }
    }
    P.cluster('palm', 24, 52, 52, 24, seed + 9, 260, 0.62);
    P.scatter('rock', 16, 44, 34, 50);
    for (let k = 0; k < 26; k++) decor.push({ x: rrange(r, 80, S - 80), y: rrange(r, 80, S - 80), type: rpick(r, ['bones', 'skull', 'urn', 'urn', 'bones'] as const), v: rint(r, 0, 3) });
  } else if (theme === 'cemetery') {
    ({ P, ready } = genCemetery(r, S, seed, trails, plazas, decor));
  } else if (theme === 'cityz') {
    P = genCityZ(r, S, seed, trails, plazas, decor, lakes, rivers, altars, shops);
  } else if (theme === 'jungle') {
    // Jungla: un río poco profundo con corriente cruza de oeste a este; templo en ruinas y campamento de la expedición
    const ry = S * (0.38 + r() * 0.24);
    const river: River = { ...windingTrail(r, [-BORDER_DEPTH, ry + rrange(r, -200, 200)], [S + BORDER_DEPTH, ry + rrange(r, -200, 200)], 0, 'dirt', 340), w: 190, seed: seed + 21, bridges: [], shallow: true };
    for (const pt of river.pts) pt[1] = Math.max(600, Math.min(S - 600, pt[1]));
    rivers.push(river);
    const north = r() < 0.5;
    const tY = north ? rrange(r, 260, Math.max(270, ry - 700)) : rrange(r, Math.min(S - 560, ry + 500), S - 560);
    const tX = rrange(r, 400, S - 800);
    plazas.push({ x: tX - 120, y: tY - 90, w: 560, h: 420, kind: 'stone' });
    const cY = north ? rrange(r, Math.min(S - 500, ry + 480), S - 500) : rrange(r, 300, Math.max(310, ry - 600));
    const cX = rrange(r, 400, S - 700);
    plazas.push({ x: cX - 60, y: cY - 60, w: 440, h: 340, kind: 'dirt' });
    // una laguna profunda y senderos (cruzan el río vadeando)
    const lake: Lake = { cx: rrange(r, 500, S - 500), cy: north ? rrange(r, Math.min(S - 400, ry + 700), S - 400) : rrange(r, 400, Math.max(410, ry - 700)), rx: rrange(r, 200, 280), ry: rrange(r, 150, 210), seed: seed + 11 };
    if (Math.hypot(lake.cx - cX, lake.cy - cY) > 600 && Math.hypot(lake.cx - tX, lake.cy - tY) > 600) lakes.push(lake);
    trails.push(windingTrail(r, [cX + 160, cY + 110], [tX + 160, tY + 120], 56, 'dirt', 300));
    trails.push(windingTrail(r, [cX + 160, cY + 110], [north ? cX : cX, north ? S - 40 : 40], 50, 'dirt', 260));
    trails.push(windingTrail(r, [tX + 160, tY + 120], [rpick(r, [40, S - 40]), tY + rrange(r, -300, 300)], 50, 'dirt', 260));
    P = new Placer(r, trails, (x, y) => riverValue(river, x, y) > -40 || lakes.some((l) => lakeValue(l, x, y) > -0.2)
      || (x > tX - 120 && x < tX + 440 && y > tY - 90 && y < tY + 330) || (x > cX - 60 && x < cX + 380 && y > cY - 60 && y < cY + 280));
    for (const l of lakes) P.push(...lakeObstacles(l));
    // templo escalonado en ruinas, con bloques caídos
    P.add('temple', tX, tY, 320, 220, 0);
    for (const [dx, dy] of [[-90, 40], [350, 60], [-70, 250], [380, 250]]) P.add('ruin', tX + dx, tY + dy, 70, 40, rint(r, 0, 3));
    for (const [dx, dy] of [[-40, 260], [340, 270]]) P.add('column', tX + dx, tY + dy, 28, 28, 3);
    // campamento: tiendas, hoguera y cajas de material
    P.add('firepit', cX + 135, cY + 92, 50, 36, 0);
    for (const [dx, dy] of [[0, 0], [250, 10], [10, 190], [250, 190]]) P.add('tent', cX + dx, cY + dy, 96, 66, rint(r, 0, 3));
    for (const [dx, dy] of [[120, 10], [170, 210], [-40, 120]]) P.add('crate', cX + dx, cY + dy, 30, 26, rint(r, 0, 3));
    decor.push({ x: cX + 200, y: cY + 150, type: 'lantern', v: 0 }, { x: cX + 60, y: cY + 140, type: 'lantern', v: 0 }, { x: cX + 330, y: cY - 30, type: 'sign', v: 0 });
    // selva densa: árboles gigantes, palmeras y ruinas sueltas
    P.cluster('jtree', 220, 64, 64, 18, seed + 5, 380, 0.38);
    P.cluster('palm', 40, 52, 52, 22, seed + 7, 300, 0.55);
    P.scatter('ruin', 8, 70, 40, 60);
    P.scatter('rock', 12, 44, 34, 40);
    P.scatter('log', 8, 80, 24, 40);
    for (let k = 0; k < 90; k++) decor.push({ x: rrange(r, 80, S - 80), y: rrange(r, 80, S - 80), type: rpick(r, ['fern', 'fern', 'fern', 'flower', 'flower', 'fossil', 'mushroom'] as const), v: rint(r, 0, 3) });
    for (let i = 0; i < river.pts.length - 1; i++) for (const side of [-1, 1]) {
      const [ax, ay] = river.pts[i];
      decor.push({ x: ax + rrange(r, -80, 80), y: ay + side * (river.w / 2 + rrange(r, 8, 30)), type: rpick(r, ['reeds', 'fern'] as const), v: rint(r, 0, 3) });
    }
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
    P.push(...lakeObstacles(lake));
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

  // ---- masas de agua (identificables para futuros personajes)
  const water: WaterBody[] = [];
  let wid = 1;
  for (const l of lakes) water.push({ id: wid++, kind: theme === 'elm' || theme === 'swamp' || theme === 'jungle' ? 'pond' : 'lake', x: Math.round(l.cx - l.rx * 1.3), y: Math.round(l.cy - l.ry * 1.3), w: Math.round(l.rx * 2.6), h: Math.round(l.ry * 2.6) });
  for (const p of pools) water.push({ id: wid++, kind: 'pool', ...p });
  for (const rv of rivers) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of rv.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const bx0 = Math.max(0, x0 - rv.w), by0 = Math.max(0, y0 - rv.w);
    water.push({ id: wid++, kind: 'river', x: Math.round(bx0), y: Math.round(by0), w: Math.round(Math.min(S, x1 + rv.w) - bx0), h: Math.round(Math.min(S, y1 + rv.w) - by0) });
  }
  for (const o of obstacles) if (o.type === 'water') {
    const b = water.find((w) => o.x + o.w / 2 >= w.x && o.x + o.w / 2 <= w.x + w.w && o.y + o.h / 2 >= w.y && o.y + o.h / 2 <= w.y + w.h);
    if (b) o.body = b.id;
  }

  // ---- televisiones (entidades localizables)
  let tid = 1;
  obstacles.forEach((o, i) => {
    if (o.type === 'shop') {
      const W = Math.ceil(o.w / 3), H = Math.ceil(o.h / 3), f = FACADE.shop;
      const winW = W - f.winX - f.winRight;
      const n = 3;
      for (let k = 0; k < n; k++) {
        const ax = f.winX + 1 + Math.floor((winW / n) * k) + 1, ay = H - f.F + f.winY + 3;
        tvs.push({ id: tid++, x: o.x + ax * 3, y: o.y + ay * 3, w: 8 * 3, h: 7 * 3, kind: 'shop', host: i });
      }
    } else if (o.type === 'house' && (theme === 'elm' || theme === 'cityz') && hashTV(o) < 0.16) {
      const tv = houseTV(o, i, tid);
      if (tv) { tvs.push(tv); tid++; }
    } else if (o.type === 'cabin' && hashTV(o) < 0.3) {
      const H = Math.ceil(o.h / 3), f = FACADE.cabin;
      tvs.push({ id: tid++, x: o.x + f.winX * 3, y: o.y + (H - f.winYFromBase) * 3, w: f.winW * 3, h: f.winH * 3, kind: 'window', host: i });
    }
  });
  // televisores abandonados a la intemperie (inquietantes)
  const outdoor = theme === 'cityz' ? 14 : theme === 'transylvania' ? 9 : theme === 'camp' || theme === 'swamp' || theme === 'nile' || theme === 'jungle' ? 8 : 4; // solo se ven si hay una Interferencia en la sala
  for (let k = 0, tries = 0; k < outdoor && tries < 80; tries++) {
    const x = rrange(r, 200, S - 200), y = rrange(r, 200, S - 200);
    if (!P.free(x - 20, y - 20, 40, 34, 20)) continue;
    if (lakes.some((l) => lakeValue(l, x, y) > -0.2) || rivers.some((rv) => riverValue(rv, x, y) > -40)) continue;
    tvs.push({ id: tid++, x: Math.round(x - 15), y: Math.round(y - 30), w: 30, h: 30, kind: 'outdoor', host: -1 });
    k++;
  }

  // ---- bordes temáticos
  const EDGE_OPTS: Record<MapThemeId, EdgeKind[]> = {
    elm: ['houses', 'hedge', 'fence', 'houses', 'water'],
    transylvania: ['cliff', 'forest', 'wall', 'graves'],
    camp: ['forest', 'forest', 'water', 'cliff'],
    swamp: ['forest', 'water', 'forest', 'graves'],
    nile: ['cliff', 'forest', 'cliff', 'water'],
    jungle: ['forest', 'forest', 'water', 'cliff'],
    cemetery: ['graves', 'wall', 'graves', 'forest'],
    cityz: ['houses', 'fence', 'forest', 'houses'],
  };
  const edges = {} as Record<Side, EdgeKind>;
  let usedWater = false, usedCliff = false;
  for (const side of ['n', 'e', 's', 'w'] as Side[]) {
    let k = rpick(r, EDGE_OPTS[theme]);
    if ((k === 'water' && usedWater) || (k === 'cliff' && usedCliff)) k = EDGE_OPTS[theme][0] === 'cliff' ? 'forest' : EDGE_OPTS[theme][0];
    if (k === 'water') usedWater = true;
    if (k === 'cliff') usedCliff = true;
    edges[side] = k;
  }
  const border = buildBorder(r, theme, edges, trails);

  // Quitar decoración que caiga sobre obstáculos
  const clean = decor.filter((d) => !obstacles.some((o) => d.x > o.x - 20 && d.x < o.x + o.w + 20 && d.y > o.y - 20 && d.y < o.y + o.h + 20));
  void shops;
  return { theme, seed, size: S, obstacles, decor: clean, trails, lakes, plazas, rivers, pools, water, tvs, edges, border, altars, ready };
}
