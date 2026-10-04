// Arte procedural de escenarios: suelo, obstáculos y decoración en pixel art (bloques de PIXEL px).
import { PIXEL } from '../shared/constants';
import type { Decor, GameMap, Obstacle } from '../shared/maps';
import { THEMES } from '../shared/maps';
import { mulberry32 } from '../shared/rng';
import { shade } from './sprites';

const O = '#0b0710';

export interface Prerendered { cv: HTMLCanvasElement; ox: number; oy: number } // offset desde (x,y) del obstáculo

function mk(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w)); cv.height = Math.max(1, Math.ceil(h));
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [cv, ctx];
}

/** Pinta en "píxeles gordos" de PIXEL unidades. */
function pen(ctx: CanvasRenderingContext2D) {
  return (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x) * PIXEL, Math.round(y) * PIXEL, Math.round(w) * PIXEL, Math.round(h) * PIXEL);
  };
}

export const LIGHT_COLORS = { warm: 'rgba(255,170,60,', cold: 'rgba(120,160,255,', green: 'rgba(90,255,120,' };
export interface Light { x: number; y: number; r: number; c: keyof typeof LIGHT_COLORS; flicker?: boolean }

// ---------------------------------------------------------------------------
export function renderObstacle(o: Obstacle, theme: string): Prerendered {
  const W = Math.round(o.w / PIXEL), H = Math.round(o.h / PIXEL);
  const r = mulberry32(o.x * 31 + o.y * 17 + o.v);
  switch (o.type) {
    case 'house': {
      const up = 26;
      const [cv, ctx] = mk(o.w + 12, o.h + up * PIXEL);
      const p = pen(ctx);
      const walls = ['#6a5a7a', '#5a6a5a', '#7a5a4a', '#4a5a6a'][o.v % 4];
      const roof = ['#3a2030', '#2a2a3a', '#40281e', '#202a30'][o.v % 4];
      // pared (zona de colisión + fachada)
      p(0, up - 2, W, H + 2, O);
      p(1, up - 1, W - 2, H, walls);
      for (let y = up; y < up + H; y += 3) p(1, y, W - 2, 1, shade(walls, -0.12));
      // tejado
      for (let i = 0; i < up; i++) {
        const inset = Math.max(0, Math.round((up - i) * 0.8) - 6);
        p(inset - 1, i, W - inset * 2 + 2, 1, O);
        if (i > 0) p(inset, i, W - inset * 2, 1, i % 3 === 0 ? shade(roof, -0.3) : roof);
      }
      // chimenea
      p(W - 14, 0, 5, 8, O); p(W - 13, 1, 3, 7, '#5a3a3a');
      // ventanas (algunas encendidas)
      const winY = up + 6;
      for (let wx = 6; wx < W - 10; wx += 16) {
        const lit = r() < 0.45;
        p(wx - 1, winY - 1, 8, 9, O);
        p(wx, winY, 6, 7, lit ? '#ffd060' : '#1a1a2e');
        p(wx + 3, winY, 1, 7, O); p(wx, winY + 3, 6, 1, O);
      }
      // puerta
      const dx = Math.floor(W / 2) - 4;
      p(dx - 1, up + H - 16, 10, 16, O); p(dx, up + H - 15, 8, 15, '#3a2018'); p(dx + 6, up + H - 8, 1, 1, '#e0c040');
      return { cv, ox: 0, oy: -up * PIXEL };
    }
    case 'cabin': {
      const up = 18;
      const [cv, ctx] = mk(o.w, o.h + up * PIXEL);
      const p = pen(ctx);
      p(0, up - 1, W, H + 1, O);
      for (let y = up; y < up + H - 1; y += 2) {
        p(1, y, W - 2, 2, y % 4 === 0 ? '#6a4228' : '#5a3820');
        p(1, y + 1, W - 2, 1, '#3a2414');
      }
      for (let i = 0; i < up; i++) {
        const inset = Math.max(0, Math.round((up - i) * 1.1) - 4);
        p(inset - 1, i, W - inset * 2 + 2, 1, O);
        if (i > 0) p(inset, i, W - inset * 2, 1, i % 2 ? '#2e3a24' : '#26301e');
      }
      const lit = r() < 0.5;
      p(6, up + 6, 8, 7, O); p(7, up + 7, 6, 5, lit ? '#ffb040' : '#141420');
      p(W - 16, up + H - 15, 10, 15, O); p(W - 15, up + H - 14, 8, 14, '#2a1a10');
      return { cv, ox: 0, oy: -up * PIXEL };
    }
    case 'tree': case 'pine': case 'deadtree': {
      const up = o.type === 'pine' ? 30 : 22;
      const [cv, ctx] = mk(o.w + 24, o.h + up * PIXEL);
      const p = pen(ctx);
      const cx = Math.floor((W + 8) / 2);
      const baseY = up + H - 4;
      p(cx - 2, baseY - 10, 5, 12, O); p(cx - 1, baseY - 10, 3, 11, '#4a3020');
      if (o.type === 'pine') {
        const greens = ['#1e3a2a', '#24442e', '#183022'];
        for (let t = 0; t < 4; t++) {
          const ty = baseY - 12 - t * 8, half = 11 - t * 2;
          for (let i = 0; i < 9; i++) {
            const hw = Math.round((half * (i + 1)) / 9);
            p(cx - hw - 1, ty - 9 + i, hw * 2 + 3, 1, O);
            p(cx - hw, ty - 9 + i, hw * 2 + 1, 1, i < 3 ? shade(greens[t % 3], 0.1) : greens[t % 3]);
          }
        }
      } else if (o.type === 'tree') {
        const g = ['#22401e', '#2a4a24', '#1e361c'][o.v % 3];
        const R = 11;
        for (let y = -R; y <= R; y++) {
          const hw = Math.round(Math.sqrt(R * R - y * y));
          p(cx - hw - 1, baseY - 20 + y, hw * 2 + 3, 1, O);
        }
        for (let y = -R + 1; y < R; y++) {
          const hw = Math.round(Math.sqrt((R - 1) ** 2 - y * y));
          p(cx - hw, baseY - 20 + y, hw * 2 + 1, 1, y < -4 ? shade(g, 0.12) : g);
        }
        for (let k = 0; k < 10; k++) p(cx - 8 + Math.floor(r() * 16), baseY - 28 + Math.floor(r() * 16), 2, 1, shade(g, -0.3));
      } else {
        const bark = '#3a2a2a';
        const branch = (x: number, y: number, dx: number, len: number) => {
          for (let i = 0; i < len; i++) { p(x + dx * i - 1, y - i - 1, 3, 3, O); }
          for (let i = 0; i < len; i++) p(x + dx * i, y - i, 1, 1, bark);
        };
        p(cx - 2, baseY - 22, 5, 24, O); p(cx - 1, baseY - 22, 3, 23, bark);
        branch(cx, baseY - 18, 1, 9); branch(cx, baseY - 14, -1, 8); branch(cx, baseY - 22, 0.5, 6); branch(cx, baseY - 20, -0.6, 7);
      }
      return { cv, ox: -12, oy: -up * PIXEL };
    }
    case 'hedge': {
      const [cv, ctx] = mk(o.w, o.h + 12);
      const p = pen(ctx);
      p(0, 0, W, H + 4, O); p(1, 1, W - 2, H + 2, '#1e3a1e');
      for (let i = 0; i < W * 2; i++) p(1 + Math.floor(r() * (W - 2)), 1 + Math.floor(r() * (H + 2)), 1, 1, r() < 0.5 ? '#2a4a26' : '#16301a');
      return { cv, ox: 0, oy: -12 };
    }
    case 'fence': {
      const vertical = o.h > o.w;
      const [cv, ctx] = mk(o.w, o.h + 24);
      const p = pen(ctx);
      const col = theme === 'transylvania' ? '#2a2a32' : '#c8c0b0';
      if (vertical) {
        p(W / 2 - 2, 0, 4, H + 8, O); p(W / 2 - 1, 0, 2, H + 7, col);
        for (let y = 0; y < H + 6; y += 6) p(W / 2 - 3, y, 6, 2, O);
      } else {
        for (let x = 0; x < W; x += 4) { p(x, 0, 3, H + 8, O); p(x + 1, 1, 1, H + 6, col); if (theme === 'transylvania') p(x + 1, 0, 1, 1, '#808090'); }
        p(0, 3, W, 2, O); p(0, H + 3, W, 2, O); p(0, 4, W, 1, shade(col, -0.2));
      }
      return { cv, ox: 0, oy: -24 };
    }
    case 'car': {
      const [cv, ctx] = mk(o.w, o.h + 18);
      const p = pen(ctx);
      const body = ['#6a1a1a', '#1a3a5a', '#3a3a3a', '#5a4a1a'][o.v % 4];
      p(0, 2, W, H + 4, O); p(1, 3, W - 2, H + 2, body);
      p(3, 5, W - 6, H - 4, shade(body, 0.15));
      p(4, 6, W - 8, Math.max(2, H - 6), '#1a2030');
      p(0, H + 1, 4, 4, '#101010'); p(W - 4, H + 1, 4, 4, '#101010');
      p(0, 0, 4, 4, '#101010'); p(W - 4, 0, 4, 4, '#101010');
      return { cv, ox: 0, oy: -18 };
    }
    case 'wall': {
      const up = 14;
      const [cv, ctx] = mk(o.w, o.h + up * PIXEL);
      const p = pen(ctx);
      p(0, 0, W, H + up, O);
      p(1, 1, W - 2, H + up - 2, '#4a4652');
      for (let y = 1; y < H + up - 1; y += 3) for (let x = (y % 2) * 3; x < W - 1; x += 6) p(1 + x, y, 1, 3, '#2a2830');
      for (let y = 4; y < H + up; y += 3) p(1, y, W - 2, 1, '#38343e');
      for (let x = 0; x < W; x += 6) p(x, 0, 3, 2, '#5a5662');
      return { cv, ox: 0, oy: -up * PIXEL };
    }
    case 'tower': {
      const up = 40;
      const [cv, ctx] = mk(o.w, o.h + up * PIXEL);
      const p = pen(ctx);
      p(1, up - 10, W - 2, H + 10, O);
      p(2, up - 9, W - 4, H + 8, '#4e4a58');
      for (let y = up - 8; y < up + H; y += 3) p(2, y, W - 4, 1, '#3a3644');
      p(W / 2 - 2, up + 2, 4, 6, O); p(W / 2 - 1, up + 3, 2, 4, '#ffb040');
      for (let i = 0; i < up - 9; i++) {
        const hw = Math.round(((W / 2) * i) / (up - 9));
        p(W / 2 - hw - 1, i, hw * 2 + 2, 1, O);
        p(W / 2 - hw, i, hw * 2, 1, i % 4 === 0 ? '#2a1420' : '#3a1a2a');
      }
      return { cv, ox: 0, oy: -up * PIXEL };
    }
    case 'tomb': {
      const [cv, ctx] = mk(o.w, o.h + 30);
      const p = pen(ctx);
      const stone = ['#6a6a72', '#5a5a64', '#7a7880'][o.v % 3];
      if (o.v % 2 === 0) {
        p(0, 2, W, H + 8, O); p(1, 3, W - 2, H + 6, stone); p(1, 1, W - 2, 2, O); p(2, 2, W - 4, 1, stone);
        p(W / 2 - 1, 5, 2, 1, shade(stone, -0.4)); p(2, 7, W - 4, 1, shade(stone, -0.4)); p(3, 9, W - 6, 1, shade(stone, -0.4));
      } else {
        p(W / 2 - 2, 0, 4, H + 10, O); p(W / 2 - 1, 1, 2, H + 8, stone);
        p(1, 4, W - 2, 4, O); p(2, 5, W - 4, 2, stone);
      }
      p(-1, H + 7, W + 2, 3, '#2a2420');
      return { cv, ox: 0, oy: -30 };
    }
    case 'crypt': {
      const up = 22;
      const [cv, ctx] = mk(o.w, o.h + up * PIXEL);
      const p = pen(ctx);
      p(0, up - 4, W, H + 4, O); p(1, up - 3, W - 2, H + 2, '#5a5866');
      for (let x = 3; x < W - 3; x += 7) { p(x, up, 3, H - 2, '#6e6c78'); p(x, up, 1, H - 2, '#46444e'); }
      for (let i = 0; i < up - 3; i++) {
        const inset = Math.round((up - 3 - i) * 1.4);
        p(inset - 1, i, W - inset * 2 + 2, 1, O);
        if (i) p(inset, i, W - inset * 2, 1, '#3e3c48');
      }
      p(W / 2 - 5, up + H - 14, 10, 14, O); p(W / 2 - 4, up + H - 13, 8, 13, '#141018');
      p(W / 2 - 1, 3, 2, 6, '#8a8890'); p(W / 2 - 3, 5, 6, 2, '#8a8890');
      return { cv, ox: 0, oy: -up * PIXEL };
    }
    case 'water': {
      const [cv, ctx] = mk(o.w, o.h);
      const p = pen(ctx);
      p(0, 0, W, H, '#0e2236');
      for (let i = 0; i < (W * H) / 40; i++) p(Math.floor(r() * W), Math.floor(r() * H), 3 + Math.floor(r() * 4), 1, r() < 0.5 ? '#163454' : '#0a1828');
      return { cv, ox: 0, oy: 0 };
    }
    case 'canoe': {
      const [cv, ctx] = mk(o.w, o.h + 6);
      const p = pen(ctx);
      p(1, 1, W - 2, H, O); p(0, 3, W, H - 4, O);
      p(2, 2, W - 4, H - 2, '#8a4a20'); p(4, 4, W - 8, H - 6, '#4a2810');
      return { cv, ox: 0, oy: -6 };
    }
    case 'rock': {
      const [cv, ctx] = mk(o.w, o.h + 15);
      const p = pen(ctx);
      p(2, 0, W - 4, H + 5, O); p(0, 3, W, H - 1, O);
      p(3, 1, W - 6, H + 3, '#5a5a62'); p(1, 4, W - 2, H - 3, '#5a5a62'); p(3, 1, W - 8, 2, '#7a7a82');
      return { cv, ox: 0, oy: -15 };
    }
  }
  const [cv, ctx] = mk(o.w, o.h);
  ctx.fillStyle = '#f0f'; ctx.fillRect(0, 0, o.w, o.h);
  return { cv, ox: 0, oy: 0 };
}

// ---------------------------------------------------------------------------
const decorCache = new Map<string, HTMLCanvasElement>();
export function renderDecor(d: Decor): HTMLCanvasElement {
  const key = `${d.type}|${d.v}`;
  let cv = decorCache.get(key);
  if (cv) return cv;
  const [c, ctx] = mk(16 * PIXEL, 14 * PIXEL);
  const p = pen(ctx);
  switch (d.type) {
    case 'grass': p(3, 9, 1, 3, '#3a5a2a'); p(5, 8, 1, 4, '#466a30'); p(7, 9, 1, 3, '#3a5a2a'); p(9, 10, 1, 2, '#466a30'); break;
    case 'flowers': for (const [x, y] of [[3, 8], [7, 6], [10, 9]]) { p(x, y + 1, 1, 3, '#3a5a2a'); p(x - 1, y, 3, 1, ['#c04060', '#e0c040', '#8060c0'][d.v % 3]); } break;
    case 'leaves': for (let i = 0; i < 6; i++) p(2 + ((i * 5 + d.v) % 11), 4 + ((i * 3) % 8), 2, 1, ['#8a4a1a', '#a0601a', '#6a3a14'][i % 3]); break;
    case 'bones': p(3, 8, 7, 1, '#d8d0c0'); p(2, 7, 2, 3, '#d8d0c0'); p(9, 7, 2, 3, '#d8d0c0'); p(6, 10, 5, 1, '#c8c0b0'); break;
    case 'skull': p(4, 6, 6, 5, O); p(5, 6, 4, 4, '#e0d8c8'); p(5, 8, 1, 1, O); p(7, 8, 1, 1, O); p(6, 10, 2, 1, '#e0d8c8'); break;
    case 'pumpkin': p(3, 6, 9, 7, O); p(4, 7, 7, 5, '#e07010'); p(7, 5, 1, 2, '#3a5a1a'); p(5, 8, 1, 1, '#ffe060'); p(9, 8, 1, 1, '#ffe060'); p(6, 10, 3, 1, '#ffe060'); break;
    case 'candle': p(6, 6, 3, 6, O); p(7, 7, 1, 5, '#e8e0c8'); p(7, 4, 1, 2, '#ffd040'); p(7, 3, 1, 1, '#fff0a0'); break;
    case 'puddle': p(2, 9, 10, 3, '#14202e'); p(4, 9, 4, 1, '#2a3a50'); break;
    case 'mushroom': p(5, 7, 5, 3, O); p(6, 7, 3, 2, d.v % 2 ? '#c03030' : '#a060c0'); p(7, 9, 1, 3, '#e0d8c0'); p(6, 7, 1, 1, '#ffffff'); break;
    case 'campfire': p(3, 10, 9, 2, '#4a2a14'); p(5, 6, 5, 4, '#e05010'); p(6, 4, 3, 3, '#ffa020'); p(7, 3, 1, 2, '#fff080'); break;
    case 'stump': p(4, 7, 7, 5, O); p(5, 8, 5, 4, '#5a3a20'); p(5, 7, 5, 1, '#a07a50'); break;
    case 'tricycle': p(3, 9, 3, 3, O); p(10, 9, 3, 3, O); p(5, 7, 6, 1, '#c02020'); p(9, 4, 1, 4, '#c02020'); p(8, 4, 3, 1, '#202020'); break;
    case 'cross': p(7, 3, 2, 9, O); p(5, 5, 6, 2, O); p(7, 4, 1, 8, '#6a6a70'); p(6, 5, 4, 1, '#6a6a70'); break;
  }
  decorCache.set(key, c);
  return c;
}

export function lightsFor(map: GameMap, obstacles: Obstacle[]): Light[] {
  const lights: Light[] = [];
  for (const d of map.decor) {
    if (d.type === 'candle') lights.push({ x: d.x + 22, y: d.y + 12, r: 70, c: 'warm', flicker: true });
    if (d.type === 'campfire') lights.push({ x: d.x + 22, y: d.y + 20, r: 220, c: 'warm', flicker: true });
    if (d.type === 'pumpkin') lights.push({ x: d.x + 22, y: d.y + 25, r: 70, c: 'warm', flicker: true });
  }
  for (const o of obstacles) {
    if (o.type === 'house' || o.type === 'cabin') lights.push({ x: o.x + o.w / 2, y: o.y + o.h * 0.4, r: 160, c: 'warm' });
    if (o.type === 'tower') lights.push({ x: o.x + o.w / 2, y: o.y, r: 120, c: 'warm', flicker: true });
    if (o.type === 'water' && o.v === 0) lights.push({ x: o.x + o.w / 2, y: o.y + o.h / 2, r: 420, c: 'cold' });
  }
  return lights;
}

/** Patrón de suelo repetible. */
export function groundPattern(theme: keyof typeof THEMES, seed: number): HTMLCanvasElement {
  const t = THEMES[theme];
  const S = 64;
  const [cv, ctx] = mk(S * PIXEL, S * PIXEL);
  const p = pen(ctx);
  const r = mulberry32(seed);
  p(0, 0, S, S, t.ground[0]);
  for (let i = 0; i < 220; i++) p(Math.floor(r() * S), Math.floor(r() * S), 1 + Math.floor(r() * 3), 1, r() < 0.5 ? t.ground[1] : t.ground[2]);
  return cv;
}

export function pathPattern(theme: keyof typeof THEMES, seed: number): HTMLCanvasElement {
  const t = THEMES[theme];
  const S = 32;
  const [cv, ctx] = mk(S * PIXEL, S * PIXEL);
  const p = pen(ctx);
  const r = mulberry32(seed + 9);
  p(0, 0, S, S, t.path);
  for (let i = 0; i < 90; i++) p(Math.floor(r() * S), Math.floor(r() * S), 1 + Math.floor(r() * 2), 1, r() < 0.5 ? shade(t.path, 0.08) : shade(t.path, -0.15));
  return cv;
}
