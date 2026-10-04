// Mapas procedurales deterministas: servidor y cliente generan el mismo mapa a partir de (tema, semilla).
import { MAP_SIZE } from './constants';
import { mulberry32, rint, rpick, rrange, type Rng } from './rng';

export type MapThemeId = 'elm' | 'transylvania' | 'camp';

export type ObstacleType =
  | 'house' | 'fence' | 'tree' | 'car' | 'hedge'
  | 'wall' | 'tomb' | 'crypt' | 'deadtree' | 'tower'
  | 'cabin' | 'pine' | 'water' | 'canoe' | 'rock';

export type DecorType =
  | 'grass' | 'flowers' | 'leaves' | 'bones' | 'pumpkin' | 'candle'
  | 'puddle' | 'mushroom' | 'campfire' | 'skull' | 'stump' | 'tricycle' | 'cross';

export interface Obstacle { x: number; y: number; w: number; h: number; type: ObstacleType; v: number }
export interface Decor { x: number; y: number; type: DecorType; v: number }

export interface MapTheme {
  id: MapThemeId;
  name: string;
  subtitle: string;
  ground: [string, string, string]; // base, variación, detalle
  path: string;
  ambient: string; // color de la niebla/oscuridad
}

export const THEMES: Record<MapThemeId, MapTheme> = {
  elm: {
    id: 'elm', name: 'Calle del Olmo', subtitle: 'Un barrio tranquilo... demasiado tranquilo',
    ground: ['#23331f', '#2a3b24', '#1b2918'], path: '#3a3530', ambient: '#0a0618',
  },
  transylvania: {
    id: 'transylvania', name: 'Transilvania', subtitle: 'El castillo espera a su señor',
    ground: ['#2a2530', '#312b38', '#221e28'], path: '#3e3a40', ambient: '#12040a',
  },
  camp: {
    id: 'camp', name: 'Campamento Lago Sereno', subtitle: 'Nadie volvió del turno de noche',
    ground: ['#1e2e22', '#24382a', '#17241a'], path: '#4a3c2a', ambient: '#040a14',
  },
};

export const THEME_IDS = Object.keys(THEMES) as MapThemeId[];

export interface GameMap {
  theme: MapThemeId;
  seed: number;
  size: number;
  obstacles: Obstacle[];
  decor: Decor[];
  paths: { x: number; y: number; w: number; h: number }[];
}

const MARGIN = 120;

function overlaps(list: Obstacle[], x: number, y: number, w: number, h: number, pad: number) {
  for (const o of list) {
    if (x < o.x + o.w + pad && x + w + pad > o.x && y < o.y + o.h + pad && y + h + pad > o.y) return true;
  }
  return false;
}

function place(r: Rng, list: Obstacle[], type: ObstacleType, w: number, h: number, pad = 70, tries = 30, area?: [number, number, number, number]) {
  const [ax, ay, aw, ah] = area ?? [MARGIN, MARGIN, MAP_SIZE - MARGIN * 2, MAP_SIZE - MARGIN * 2];
  for (let i = 0; i < tries; i++) {
    const x = Math.round(rrange(r, ax, ax + aw - w));
    const y = Math.round(rrange(r, ay, ay + ah - h));
    if (!overlaps(list, x, y, w, h, pad)) {
      const o: Obstacle = { x, y, w, h, type, v: rint(r, 0, 3) };
      list.push(o);
      return o;
    }
  }
  return null;
}

export function generateMap(theme: MapThemeId, seed: number): GameMap {
  const r = mulberry32(seed);
  const obs: Obstacle[] = [];
  const decor: Decor[] = [];
  const paths: GameMap['paths'] = [];
  const S = MAP_SIZE;

  if (theme === 'elm') {
    // Calles en cuadrícula
    for (let i = 1; i < 4; i++) {
      paths.push({ x: 0, y: i * 800 - 40, w: S, h: 80 });
      paths.push({ x: i * 800 - 40, y: 0, w: 80, h: S });
    }
    // Casas en cada manzana
    for (let bx = 0; bx < 4; bx++) for (let by = 0; by < 4; by++) {
      const ox = bx * 800 + 80, oy = by * 800 + 80;
      const n = rint(r, 1, 2);
      for (let k = 0; k < n; k++) place(r, obs, 'house', 200, 160, 90, 20, [ox + 20, oy + 20, 600, 600]);
      for (let k = 0; k < 2; k++) place(r, obs, 'hedge', rpick(r, [140, 200]), 30, 60, 10, [ox, oy, 640, 640]);
      for (let k = 0; k < 3; k++) place(r, obs, 'tree', 56, 56, 60, 10, [ox, oy, 640, 640]);
      if (r() < 0.4) place(r, obs, 'fence', 30, rpick(r, [160, 220]), 60, 10, [ox, oy, 640, 640]);
    }
    for (let k = 0; k < 10; k++) {
      const vertical = r() < 0.5;
      const lane = rint(r, 1, 3) * 800;
      if (vertical) place(r, obs, 'car', 50, 90, 40, 10, [lane - 35, 100, 70, S - 200]);
      else place(r, obs, 'car', 90, 50, 40, 10, [100, lane - 35, S - 200, 70]);
    }
    scatter(r, decor, ['grass', 'flowers', 'leaves', 'pumpkin', 'tricycle', 'puddle'], [30, 12, 30, 10, 4, 10]);
  } else if (theme === 'transylvania') {
    // Castillo central
    const cx = S / 2 - 400, cy = S / 2 - 320;
    const t = 40;
    obs.push({ x: cx, y: cy, w: 800, h: t, type: 'wall', v: 0 });
    obs.push({ x: cx, y: cy + 640 - t, w: 330, h: t, type: 'wall', v: 0 });
    obs.push({ x: cx + 470, y: cy + 640 - t, w: 330, h: t, type: 'wall', v: 0 });
    obs.push({ x: cx, y: cy, w: t, h: 640, type: 'wall', v: 1 });
    obs.push({ x: cx + 800 - t, y: cy, w: t, h: 640, type: 'wall', v: 1 });
    for (const [tx, ty] of [[cx - 30, cy - 30], [cx + 770, cy - 30], [cx - 30, cy + 580], [cx + 770, cy + 580]]) {
      obs.push({ x: tx, y: ty, w: 100, h: 100, type: 'tower', v: 0 });
    }
    paths.push({ x: S / 2 - 60, y: cy + 600, w: 120, h: S - (cy + 600) });
    paths.push({ x: cx + 60, y: cy + 60, w: 680, h: 520 });
    // Cementerio
    for (let k = 0; k < 70; k++) place(r, obs, 'tomb', 28, 36, 40);
    for (let k = 0; k < 8; k++) place(r, obs, 'crypt', 130, 100, 90);
    for (let k = 0; k < 40; k++) place(r, obs, 'deadtree', 50, 50, 60);
    for (let k = 0; k < 12; k++) place(r, obs, 'fence', r() < 0.5 ? 200 : 26, r() < 0.5 ? 26 : 200, 70);
    scatter(r, decor, ['bones', 'skull', 'candle', 'cross', 'grass', 'mushroom'], [20, 14, 18, 14, 30, 12]);
  } else {
    // Lago (varios rectángulos para formar una masa irregular)
    const lx = rrange(r, 700, 1300), ly = rrange(r, 700, 1300);
    const lw = 900, lh = 650;
    obs.push({ x: lx, y: ly, w: lw, h: lh, type: 'water', v: 0 });
    obs.push({ x: lx + 120, y: ly - 100, w: lw - 260, h: 100, type: 'water', v: 1 });
    obs.push({ x: lx + 80, y: ly + lh, w: lw - 200, h: 110, type: 'water', v: 1 });
    obs.push({ x: lx - 90, y: ly + 100, w: 90, h: lh - 200, type: 'water', v: 1 });
    obs.push({ x: lx + lw, y: ly + 140, w: 100, h: lh - 260, type: 'water', v: 1 });
    paths.push({ x: lx - 260, y: ly + lh + 160, w: lw + 600, h: 70 });
    paths.push({ x: lx + lw + 160, y: 200, w: 70, h: S - 400 });
    for (let k = 0; k < 4; k++) place(r, obs, 'canoe', 90, 34, 40, 20, [lx - 200, ly + lh + 110, lw + 400, 60]);
    for (let k = 0; k < 14; k++) place(r, obs, 'cabin', 170, 130, 100);
    for (let k = 0; k < 110; k++) place(r, obs, 'pine', 52, 52, 45);
    for (let k = 0; k < 18; k++) place(r, obs, 'rock', 50, 40, 50);
    scatter(r, decor, ['grass', 'mushroom', 'stump', 'leaves', 'bones', 'campfire'], [40, 16, 16, 24, 6, 6]);
  }

  // Quitar decoración que caiga sobre obstáculos
  const clean = decor.filter((d) => !overlaps(obs, d.x - 10, d.y - 10, 20, 20, 0));
  return { theme, seed, size: S, obstacles: obs, decor: clean, paths };
}

function scatter(r: Rng, out: Decor[], types: DecorType[], counts: number[]) {
  types.forEach((t, i) => {
    for (let k = 0; k < counts[i]; k++) out.push({ x: rrange(r, 60, MAP_SIZE - 60), y: rrange(r, 60, MAP_SIZE - 60), type: t, v: rint(r, 0, 3) });
  });
}
