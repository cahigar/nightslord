// Arte procedural de obstáculos y decoración (pixel art a escala PIXEL), con sombreado automático,
// contorno coloreado y ventanas/fuegos emisivos que brillan en la oscuridad.
import { PIXEL } from '../shared/constants';
import type { Decor, GameMap, Obstacle } from '../shared/maps';
import { hashAt } from '../shared/noise';
import { mulberry32, type Rng } from '../shared/rng';
import { PB, shade, type Baked } from './pixel';

export interface Prerendered { base: HTMLCanvasElement; glow: HTMLCanvasElement | null; ox: number; oy: number } // offset en mundo desde (o.x, o.y)

export const LIGHT_COLORS = { warm: 'rgba(255,170,60,', cold: 'rgba(120,160,255,', green: 'rgba(90,255,120,', white: 'rgba(255,240,200,' };
export interface Light { x: number; y: number; r: number; c: keyof typeof LIGHT_COLORS; flicker?: boolean }

const GLASS_LIT = '#ffd36a', GLASS_DARK = '#141a2a';

/** ¿Tiene la casa luz dentro? (determinista para que coincidan arte y luces) */
export const isLit = (o: Obstacle) => hashAt(o.x, o.y, 7) < 0.55;

function window_(b: PB, x: number, y: number, w: number, h: number, lit: boolean, trim: string, r: Rng) {
  b.rect(x - 1, y - 1, w + 2, h + 2, trim);
  b.rect(x, y, w, h, lit ? GLASS_LIT : GLASS_DARK, lit);
  if (lit) {
    b.rect(x, y, w, 1, '#ffeaa0', true);
    if (r() < 0.35) b.rect(x + Math.floor(w / 2) - 1, y + h - 3, 2, 3, '#3a2010'); // silueta en la ventana...
  } else b.set(x + 1, y + 1, '#3a4a6a', false, true);
  b.rect(x + Math.floor(w / 2), y, 1, h, trim); b.rect(x, y + Math.floor(h / 2), w, 1, trim);
}

// ---------------------------------------------------------------------------
type Draw = (b: PB, W: number, H: number, up: number, o: Obstacle, r: Rng, theme: string) => void;

const house: Draw = (b, W, H, up, o, r, theme) => {
  const F = 18; // alto de fachada
  const base = up + H;
  const top = base - F;
  const lit = isLit(o);
  if (theme === 'transylvania') {
    // casa de piedra con entramado de madera y tejado empinado
    const stone = '#5a5662', beam = '#3a261a', roof = '#5a1e22';
    b.rect(0, top, W, F, stone);
    for (let y = top + 1; y < base; y += 3) for (let x = (y % 2) * 3; x < W; x += 6) b.set(x, y, shade(stone, -0.25));
    b.rect(0, top, W, 1, beam); b.rect(0, top + 8, W, 1, beam);
    for (let x = 0; x < W; x += 9) b.rect(x, top, 1, F, beam);
    for (let i = 0; i < top; i++) {
      const inset = Math.max(0, Math.round((top - i) * 0.9) - 10);
      b.rect(inset, i, W - inset * 2, 1, i % 3 === 0 ? shade(roof, -0.3) : roof);
    }
    for (let x = 4; x < W - 6; x += 7) for (let y = 4; y < top - 2; y += 3) b.set(x + (y % 2) * 3, y, shade(roof, 0.15));
    for (let wx = 5; wx < W - 8; wx += 14) { b.rect(wx, top + 2, 4, 5, beam); b.rect(wx + 1, top + 3, 2, 4, lit ? '#ffb040' : GLASS_DARK, lit); }
    const dx = Math.floor(W / 2) - 3;
    b.rect(dx, base - 10, 7, 10, beam); b.rect(dx + 1, base - 9, 5, 9, '#2a1810'); b.set(dx + 5, base - 5, '#c0a040', false, true);
    return;
  }
  const walls = ['#7a6a8a', '#6a7a6a', '#8a6a5a', '#5a6a7a'][o.v % 4];
  const roof = ['#3a2434', '#2a2a3c', '#46301e', '#22303a'][o.v % 4];
  const trim = '#d8d0c8';
  // tejado a dos aguas visto desde arriba
  for (let i = 0; i < top; i++) {
    const inset = Math.max(0, Math.round((top - i) * 0.7) - 8);
    b.rect(inset, i, W - inset * 2, 1, roof);
    if (i % 3 === 2) for (let x = inset + (i % 6 === 2 ? 0 : 2); x < W - inset; x += 4) b.set(x, i, shade(roof, -0.35));
  }
  b.rect(Math.floor(W * 0.15), Math.floor(top * 0.38), Math.floor(W * 0.7), 1, shade(roof, 0.25)); // cumbrera
  // chimenea
  const chx = W - 13;
  b.rect(chx, 0, 5, Math.floor(top * 0.6), '#6a3a30'); b.rect(chx - 1, 0, 7, 2, '#4a2a24');
  for (let y = 3; y < top * 0.6; y += 2) b.set(chx + 1 + (y % 4 === 1 ? 2 : 0), y, '#4a2a24');
  // canalón y fachada de tablas
  b.rect(0, top - 1, W, 1, shade(roof, -0.4));
  b.rect(0, top, W, F, walls);
  for (let y = top + 2; y < base - 1; y += 2) b.rect(0, y, W, 1, shade(walls, -0.12));
  b.rect(0, base - 2, W, 2, '#3a3438'); // cimientos
  // ventanas
  for (let wx = 4; wx < W - 10; wx += 13) {
    if (Math.abs(wx + 3 - W / 2) < 7) continue;
    window_(b, wx, top + 4, 6, 7, lit && r() < 0.8, trim, r);
    b.rect(wx - 2, top + 3, 1, 9, shade(walls, -0.35)); b.rect(wx + 7, top + 3, 1, 9, shade(walls, -0.35)); // contraventanas
  }
  // porche y puerta
  const dx = Math.floor(W / 2) - 4;
  b.rect(dx - 3, top + 1, 14, 2, shade(roof, -0.1));
  b.rect(dx, base - 12, 8, 12, trim); b.rect(dx + 1, base - 11, 6, 11, ['#5a2018', '#203a2a', '#2a2a4a', '#4a3a20'][o.v % 4]);
  b.set(dx + 5, base - 6, '#e0c040', false, true);
  b.set(dx + 9, base - 10, lit ? '#fff0b0' : '#806040', lit); // luz del porche
  b.rect(dx - 1, base - 1, 10, 1, '#8a8088'); // escalón
};

const cabin: Draw = (b, W, H, up, o, r) => {
  const F = 16, base = up + H, top = base - F;
  const lit = isLit(o);
  const log = '#6a4428', logD = '#3a2414', roof = '#2a3422';
  for (let i = 0; i < top; i++) {
    const inset = Math.max(0, Math.round((top - i) * 1.0) - 6);
    b.rect(inset, i, W - inset * 2, 1, i % 2 ? roof : shade(roof, -0.25));
  }
  for (let k = 0; k < 14; k++) b.set(Math.floor(r() * W), Math.floor(r() * top), '#3a5a2a'); // musgo
  for (let y = top; y < base; y += 3) {
    b.rect(0, y, W, 3, log); b.rect(0, y + 2, W, 1, logD); b.rect(0, y, W, 1, shade(log, 0.2));
    b.set(0, y + 1, '#a07a50'); b.set(W - 1, y + 1, '#a07a50'); // testas
  }
  window_(b, 5, top + 4, 7, 6, lit, '#3a2414', r);
  b.rect(W - 15, base - 13, 9, 13, logD); b.rect(W - 14, base - 12, 7, 12, '#2a1a0e'); b.set(W - 9, base - 6, '#a08040');
  if (r() < 0.5) { b.rect(W / 2 - 3, top + 3, 6, 3, '#4a3020'); b.rect(W / 2 - 2, top + 4, 4, 1, '#c0a070'); } // cartel
};

const tree: Draw = (b, W, H, up, o, r, theme) => {
  const cx = Math.floor(W / 2) + 4, baseY = up + H - 2;
  const palettes = theme === 'elm' ? [['#1e3a1e', '#2a4e26', '#3a6630'], ['#5a2a10', '#8a4418', '#b8662a'], ['#5a1410', '#8a2418', '#b04028']] : [['#1a3220', '#24442a', '#305634']];
  const pal = palettes[o.v % palettes.length];
  b.rect(cx - 2, baseY - 12, 4, 13, '#3a2618'); b.set(cx - 3, baseY, '#3a2618'); b.set(cx + 2, baseY, '#3a2618');
  b.line(cx, baseY - 10, cx - 5, baseY - 16, '#3a2618'); b.line(cx + 1, baseY - 11, cx + 6, baseY - 17, '#3a2618');
  const blobs = 6;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2;
    b.ellipse(cx + Math.cos(a) * 6, baseY - 22 + Math.sin(a) * 4, 6, 5, pal[0]);
  }
  b.ellipse(cx, baseY - 24, 8, 7, pal[1]);
  for (let i = 0; i < 26; i++) {
    const x = cx + Math.round((r() - 0.5) * 22), y = baseY - 24 + Math.round((r() - 0.6) * 16);
    if (b.get(x, y)) b.set(x, y, r() < 0.5 ? pal[2] : pal[0]);
  }
  b.ellipse(cx - 3, baseY - 28, 3, 2, pal[2]);
};

const pine: Draw = (b, W, H, up, _o, r) => {
  const cx = Math.floor(W / 2) + 4, baseY = up + H - 2;
  b.rect(cx - 1, baseY - 7, 3, 8, '#3a2618');
  const greens = ['#142a1e', '#1a3424', '#21402c'];
  for (let t = 0; t < 4; t++) {
    const ty = baseY - 8 - t * 8, half = 11 - t * 2;
    for (let i = 0; i < 11; i++) {
      const hw = Math.round((half * (i + 1)) / 11);
      const y = ty - 10 + i;
      b.rect(cx - hw, y, hw * 2 + 1, 1, greens[t % 3]);
      if (i === 10) for (let x = cx - hw; x <= cx + hw; x += 2) b.set(x, y + 1, greens[t % 3]); // borde dentado
    }
  }
  b.set(cx, baseY - 41, greens[2]);
  for (let i = 0; i < 18; i++) { const x = cx + Math.round((r() - 0.7) * 14), y = baseY - 8 - Math.floor(r() * 32); if (b.get(x, y)) b.set(x, y, '#2c5236'); }
};

const deadtree: Draw = (b, W, H, up, o, r) => {
  const cx = Math.floor(W / 2) + 4, baseY = up + H - 2;
  const bark = '#3a302e';
  b.rect(cx - 2, baseY - 18, 4, 19, bark); b.set(cx - 3, baseY, bark); b.set(cx + 2, baseY, bark);
  const branch = (x: number, y: number, a: number, len: number, depth: number) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    b.line(x, y, x2, y2, depth > 1 ? bark : shade(bark, 0.15));
    if (depth > 1) b.line(x + 1, y, x2 + 1, y2, bark);
    if (depth <= 0) return;
    branch(x2, y2, a - 0.4 - r() * 0.4, len * 0.68, depth - 1);
    branch(x2, y2, a + 0.4 + r() * 0.4, len * 0.68, depth - 1);
  };
  branch(cx, baseY - 17, -Math.PI / 2 - 0.5, 9, 3);
  branch(cx, baseY - 17, -Math.PI / 2 + 0.5, 9, 3);
  if (o.v === 0) { // cuervo
    const x = cx + 6, y = baseY - 30;
    b.rect(x, y, 3, 2, '#101014'); b.set(x + 3, y, '#101014'); b.set(x + 2, y - 1, '#ff2030', true);
  }
};

const hedge: Draw = (b, W, H, up, _o, r) => {
  const g = ['#16301a', '#1e3c20', '#284a28'];
  for (let x = 2; x < W - 2; x += 4) b.ellipse(x, up + H - 5, 3, 4, g[1]);
  b.rect(1, up + 1, W - 2, H, g[1]);
  for (let i = 0; i < W * 2; i++) { const x = Math.floor(r() * W), y = up + Math.floor(r() * H); if (b.get(x, y)) b.set(x, y, r() < 0.5 ? g[2] : g[0]); }
};

const fence: Draw = (b, W, H, up, o, _r, theme) => {
  const vertical = H > W;
  const iron = theme === 'transylvania' || o.v === 1;
  const col = iron ? '#2a2a36' : '#d8d0c4';
  if (vertical) {
    const x = Math.floor(W / 2) - 1;
    b.rect(x, 0, 2, up + H, col);
    for (let y = 2; y < up + H; y += 5) { b.rect(x - 1, y, 4, 1, col); if (iron) b.set(x, y - 1, '#6a6a7a'); }
  } else {
    for (let x = 0; x < W; x += iron ? 3 : 4) {
      b.rect(x, 2, iron ? 1 : 2, up + H - 2, col);
      if (iron) b.set(x, 1, '#7a7a8a'); else b.set(x, 1, col);
    }
    b.rect(0, 5, W, 1, shade(col, -0.2)); b.rect(0, up + H - 3, W, 1, shade(col, -0.2));
  }
};

const car: Draw = (b, W, H, up, o) => {
  const body = ['#6a1a1a', '#1a3a5a', '#3a3a3a', '#5a4a1a'][o.v % 4];
  const vertical = H > W;
  const y0 = up;
  b.rect(1, y0 + 1, W - 2, H - 2, body);
  b.rect(0, y0 + 3, W, H - 6, body);
  if (vertical) {
    b.rect(3, y0 + 6, W - 6, 5, '#1a2436'); b.rect(3, y0 + H - 10, W - 6, 4, '#1a2436'); b.rect(3, y0 + 11, W - 6, H - 21, shade(body, 0.15));
    b.set(4, y0 + 7, '#5a7090', false, true);
    const on = o.v === 1;
    b.set(2, y0 + 1, on ? '#fff8d0' : '#c0c0a0', on); b.set(W - 3, y0 + 1, on ? '#fff8d0' : '#c0c0a0', on);
    b.set(2, y0 + H - 2, '#c02020', on); b.set(W - 3, y0 + H - 2, '#c02020', on);
  } else {
    b.rect(5, y0 + 3, 5, H - 6, '#1a2436'); b.rect(W - 9, y0 + 3, 4, H - 6, '#1a2436'); b.rect(10, y0 + 3, W - 19, H - 6, shade(body, 0.15));
  }
  b.rect(0, y0 + 2, 1, 3, '#101010'); b.rect(W - 1, y0 + 2, 1, 3, '#101010'); b.rect(0, y0 + H - 5, 1, 3, '#101010'); b.rect(W - 1, y0 + H - 5, 1, 3, '#101010');
};

const lamp: Draw = (b, W, H, up) => {
  const cx = Math.floor(W / 2) + 1;
  b.rect(cx - 1, up + H - 2, 4, 2, '#2a2a30');
  b.rect(cx, 4, 2, up + H - 4, '#34343c');
  b.rect(cx - 2, 2, 6, 3, '#24242a'); b.rect(cx - 1, 4, 4, 2, '#fff2c0', true); b.set(cx, 1, '#24242a');
};

const mailbox: Draw = (b, W, H, up) => {
  b.rect(2, up - 2, 1, H + 2, '#4a3020');
  b.rect(0, up - 5, 5, 4, '#3a4a6a'); b.rect(4, up - 6, 1, 3, '#c02020');
};

const wall: Draw = (b, W, H, up, o) => {
  const stone = '#4c4856';
  b.rect(0, 2, W, up + H - 2, stone);
  for (let y = 3; y < up + H; y += 3) {
    b.rect(0, y, W, 1, shade(stone, -0.22));
    for (let x = (Math.floor(y / 3) % 2) * 3; x < W; x += 6) b.set(x, y + 1, shade(stone, -0.22));
  }
  for (let x = 0; x < W; x += 4) b.rect(x, 0, 2, 3, shade(stone, 0.1)); // almenas
  if (o.v === 0) for (let x = 10; x < W - 6; x += 22) { b.rect(x, up + H - 9, 2, 3, '#3a2a1a'); b.set(x, up + H - 11, '#ff9020', true); b.set(x + 1, up + H - 10, '#ffd060', true); b.set(x, up + H - 10, '#ff6010', true); }
  for (let k = 0; k < W / 3; k++) { const x = Math.floor(hashAt(k, o.x, 3) * W), y = Math.floor(hashAt(o.y, k, 4) * (up + H)); if (b.get(x, y)) b.set(x, y, '#2e4a2e'); }
};

const tower: Draw = (b, W, H, up) => {
  const stone = '#4e4a5a', base = up + H;
  const bodyTop = 14;
  for (let y = bodyTop; y < base; y++) {
    for (let x = 1; x < W - 1; x++) {
      const u = (x - W / 2) / (W / 2);
      const c = Math.abs(u) > 0.7 ? shade(stone, -0.25) : u < -0.3 ? shade(stone, 0.12) : stone;
      b.set(x, y, (y + Math.floor(x / 4) * 2) % 4 === 0 ? shade(c, -0.2) : c);
    }
  }
  for (let x = 0; x < W; x += 4) b.rect(x, bodyTop - 2, 2, 3, stone);
  for (let i = 0; i < bodyTop - 2; i++) {
    const hw = Math.round(((W / 2) * (i + 1)) / (bodyTop - 2));
    b.rect(W / 2 - hw, i, hw * 2, 1, i % 3 ? '#3a1828' : '#2a1020');
  }
  b.rect(W / 2 - 2, bodyTop + 6, 4, 6, '#1a1218'); b.rect(W / 2 - 1, bodyTop + 7, 2, 5, '#ffb040', true);
  b.rect(W / 2 - 1, bodyTop + 18, 2, 4, '#ffb040', true);
};

const tomb: Draw = (b, W, H, up, o) => {
  const stone = ['#6a6a74', '#5a5a66', '#787682'][o.v % 3];
  const cx = Math.floor(W / 2);
  b.rect(1, up + H - 3, W - 2, 3, '#2a2420'); // montículo
  switch (o.v % 3) {
    case 0: // lápida redondeada
      b.rect(1, up - 6, W - 2, H + 4, stone); b.rect(2, up - 8, W - 4, 2, stone); b.set(cx, up - 4, shade(stone, -0.4)); b.rect(cx - 1, up - 3, 3, 1, shade(stone, -0.4)); b.set(cx, up - 2, shade(stone, -0.4));
      b.rect(3, up + 1, W - 6, 1, shade(stone, -0.35)); b.rect(3, up + 3, W - 7, 1, shade(stone, -0.35));
      break;
    case 1: // cruz
      b.rect(cx - 1, up - 10, 3, H + 8, stone); b.rect(cx - 4, up - 7, 9, 2, stone);
      break;
    case 2: // obelisco
      b.rect(cx - 2, up - 12, 5, H + 10, stone); b.set(cx, up - 13, stone); b.rect(cx - 3, up + H - 5, 7, 2, shade(stone, -0.1));
      break;
  }
  b.set(2, up + H - 4, '#2e4a2e'); b.set(W - 3, up - 1, '#2e4a2e');
};

const crypt: Draw = (b, W, H, up) => {
  const stone = '#5a5866', base = up + H, top = base - 20;
  for (let i = 0; i < top; i++) {
    const inset = Math.round((top - i) * 1.3);
    b.rect(inset, i, W - inset * 2, 1, i % 3 ? '#403e4a' : '#36343e');
  }
  b.rect(0, top, W, base - top, stone);
  for (let x = 3; x < W - 3; x += 8) { b.rect(x, top + 2, 3, base - top - 3, '#6e6c7a'); b.rect(x, top + 1, 4, 1, '#7a7886'); }
  b.rect(W / 2 - 6, base - 14, 12, 14, '#1a1620'); b.rect(W / 2 - 5, base - 13, 10, 13, '#24202a');
  b.line(W / 2 - 5, base - 9, W / 2 + 4, base - 9, '#4a4650'); b.set(W / 2 + 2, base - 6, '#808090', false, true);
  b.rect(W / 2 - 1, top - 10, 2, 7, '#8a8894'); b.rect(W / 2 - 3, top - 8, 6, 2, '#8a8894');
};

const statue: Draw = (b, W, H, up) => {
  const st = '#7a7882', cx = Math.floor(W / 2);
  b.rect(1, up + H - 6, W - 2, 6, '#56545e');
  b.rect(cx - 2, up - 12, 4, 15, st); b.ellipse(cx, up - 15, 2, 2, st);
  b.line(cx - 2, up - 10, cx - 7, up - 16, shade(st, 0.1)); b.line(cx - 2, up - 9, cx - 7, up - 13, shade(st, 0.1)); b.line(cx - 3, up - 8, cx - 6, up - 10, st);
  b.line(cx + 2, up - 10, cx + 7, up - 16, st); b.line(cx + 2, up - 9, cx + 7, up - 13, st);
  b.set(cx + 1, up - 15, '#c0102a', true); // lágrima de sangre
};

const brazier: Draw = (b, W, H, up) => {
  const cx = Math.floor(W / 2);
  b.line(cx - 3, up + H - 1, cx, up + 2, '#2a2a30'); b.line(cx + 3, up + H - 1, cx, up + 2, '#2a2a30');
  b.rect(cx - 4, up - 1, 9, 3, '#3a3a42'); b.rect(cx - 3, up + 2, 7, 1, '#2a2a30');
  b.rect(cx - 3, up - 4, 7, 3, '#ff7a10', true); b.rect(cx - 2, up - 7, 5, 3, '#ffb020', true); b.set(cx, up - 9, '#fff080', true); b.set(cx - 1, up - 8, '#ffe060', true);
};

const well: Draw = (b, W, H, up) => {
  const stone = '#5a5862';
  b.ellipse(W / 2, up + H / 2, W / 2 - 1, H / 2 - 2, stone);
  b.ellipse(W / 2, up + H / 2 - 1, W / 2 - 4, H / 2 - 5, '#0a0a12');
  b.rect(2, up - 12, 2, H / 2 + 12, '#4a3020'); b.rect(W - 4, up - 12, 2, H / 2 + 12, '#4a3020');
  for (let i = 0; i < 6; i++) b.rect(1 + i, up - 14 - i, W - 2 - i * 2, 1, '#5a2a20');
  b.line(W / 2, up - 12, W / 2, up + 2, '#a08060'); b.rect(W / 2 - 1, up + 2, 3, 3, '#6a4a30');
};

const rock: Draw = (b, W, H, up, o, r) => {
  const g = ['#4a4a54', '#56525a', '#4a4e48'][o.v % 3];
  b.ellipse(W / 2, up + H / 2 - 2, W / 2 - 1, H / 2 + 1, g);
  b.ellipse(W / 2 - 3, up + H / 2 - 5, W / 3, H / 3, shade(g, 0.12));
  for (let i = 0; i < 8; i++) { const x = Math.floor(r() * W), y = up + Math.floor(r() * H * 0.5); if (b.get(x, y)) b.set(x, y, '#2e4a2e'); }
};

const canoe: Draw = (b, W, H, up) => {
  b.ellipse(W / 2, up + H / 2, W / 2 - 1, H / 2 - 1, '#8a4a20');
  b.ellipse(W / 2, up + H / 2, W / 2 - 4, H / 2 - 3, '#4a2810');
  b.rect(W / 2 - 1, up + 2, 2, H - 4, '#8a4a20'); b.line(W / 2 - 8, up + H / 2, W / 2 + 10, up + H / 2 - 2, '#c0a070');
};

const firepit: Draw = (b, W, H, up) => {
  const cx = W / 2, cy = up + H / 2;
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; b.ellipse(cx + Math.cos(a) * (W / 2 - 3), cy + Math.sin(a) * (H / 2 - 2), 2, 1, '#5a5860'); }
  b.line(cx - 5, cy + 1, cx + 5, cy - 1, '#4a2a14'); b.line(cx - 5, cy - 1, cx + 5, cy + 1, '#3a2010');
  b.rect(cx - 3, cy - 4, 7, 4, '#ff6a10', true); b.rect(cx - 2, cy - 8, 5, 4, '#ffa020', true); b.rect(cx - 1, cy - 11, 2, 3, '#fff080', true);
};

const log_: Draw = (b, W, H, up, o) => {
  const c = '#5a3a20';
  b.rect(2, up + 1, W - 4, H - 2, c);
  for (let x = 4; x < W - 4; x += 5) b.set(x, up + 2 + (x % 3), shade(c, -0.3));
  b.ellipse(2, up + H / 2, 2, H / 2 - 1, '#a07a50'); b.set(2, up + H / 2, '#6a4a2a');
  if (o.v) b.set(W / 2, up, '#3a6a2a');
};

const DRAWS: Partial<Record<Obstacle['type'], { up: number; draw: Draw; pad?: number }>> = {
  house: { up: 16, draw: house }, cabin: { up: 14, draw: cabin },
  tree: { up: 20, draw: tree, pad: 8 }, pine: { up: 30, draw: pine, pad: 8 }, deadtree: { up: 26, draw: deadtree, pad: 8 },
  hedge: { up: 5, draw: hedge }, fence: { up: 7, draw: fence }, car: { up: 2, draw: car },
  lamp: { up: 26, draw: lamp }, mailbox: { up: 6, draw: mailbox },
  wall: { up: 12, draw: wall }, tower: { up: 34, draw: tower },
  tomb: { up: 14, draw: tomb }, crypt: { up: 18, draw: crypt }, statue: { up: 18, draw: statue, pad: 4 },
  brazier: { up: 10, draw: brazier }, well: { up: 14, draw: well },
  rock: { up: 4, draw: rock }, canoe: { up: 1, draw: canoe }, firepit: { up: 10, draw: firepit }, log: { up: 1, draw: log_ },
};

export function renderObstacle(o: Obstacle, theme: string): Prerendered {
  const d = DRAWS[o.type];
  const W = Math.ceil(o.w / PIXEL), H = Math.ceil(o.h / PIXEL);
  if (!d) {
    const c = document.createElement('canvas'); c.width = 1; c.height = 1;
    return { base: c, glow: null, ox: 0, oy: 0 };
  }
  const pad = d.pad ?? 0;
  const b = new PB(W + pad * 2 + 2, H + d.up + 2);
  const r = mulberry32(o.x * 31 + o.y * 17 + o.v);
  b.offX = pad;
  d.draw(b, W, H, d.up, o, r, theme);
  const baked: Baked = b.finish({ outline: 'selout' });
  return { base: baked.base, glow: baked.glow, ox: -(pad + 1) * PIXEL, oy: -(d.up + 1) * PIXEL };
}

// ---------------------------------------------------------------------------
// Decoración pequeña
// ---------------------------------------------------------------------------
const decorCache = new Map<string, Baked>();
export function renderDecor(d: Decor): Baked {
  const key = `${d.type}|${d.v}`;
  let c = decorCache.get(key);
  if (c) return c;
  const b = new PB(16, 14);
  switch (d.type) {
    case 'pumpkin':
      b.ellipse(7, 8, 5, 4, '#d86a10'); b.line(4, 6, 4, 11, '#a04a08'); b.line(10, 6, 10, 11, '#a04a08'); b.rect(7, 3, 1, 2, '#3a5a1a');
      b.set(5, 7, '#ffe060', true); b.set(9, 7, '#ffe060', true); b.rect(5, 10, 5, 1, '#ffd040', true); b.set(6, 9, '#ffd040', true); b.set(8, 9, '#ffd040', true);
      break;
    case 'candle': b.rect(6, 7, 3, 5, '#e8e0c8'); b.rect(5, 11, 5, 1, '#c8c0a8'); b.set(7, 6, '#ffb040', true); b.set(7, 5, '#ffe060', true); b.set(7, 4, '#fff8c0', true); break;
    case 'lantern': b.rect(5, 6, 5, 6, '#3a3020'); b.rect(6, 7, 3, 4, '#ffc040', true); b.set(7, 8, '#fff0a0', true); b.rect(6, 4, 3, 2, '#2a2418'); break;
    case 'skull': b.ellipse(7, 8, 3, 3, '#e0d8c8'); b.rect(6, 11, 3, 1, '#e0d8c8'); b.set(6, 8, '#141018', false, true); b.set(8, 8, '#141018', false, true); break;
    case 'bones': b.line(3, 9, 11, 7, '#d8d0c0'); b.rect(2, 8, 2, 3, '#d8d0c0'); b.rect(11, 6, 2, 3, '#d8d0c0'); b.line(5, 11, 10, 11, '#c8c0b0'); break;
    case 'cross': b.rect(7, 3, 2, 9, '#6a6a72'); b.rect(5, 5, 6, 2, '#6a6a72'); break;
    case 'mushroom':
      b.ellipse(7, 7, 4, 2, d.v % 2 ? '#c03030' : '#40c0a0'); b.rect(7, 9, 1, 3, '#e0d8c0'); b.set(6, 6, '#ffffff', false, true);
      if (d.v % 2 === 0) { b.set(8, 7, '#a0ffe0', true); b.set(5, 7, '#80f0d0', true); }
      break;
    case 'stump': b.rect(4, 7, 7, 5, '#5a3a20'); b.rect(4, 7, 7, 1, '#a07a50'); b.set(7, 7, '#6a4a2a'); break;
    case 'tricycle': b.ellipse(4, 10, 2, 2, '#202020'); b.ellipse(11, 10, 2, 2, '#202020'); b.line(4, 9, 10, 6, '#c02020'); b.rect(9, 3, 1, 5, '#c02020'); b.rect(8, 3, 3, 1, '#202020'); break;
    case 'sign': b.rect(7, 6, 1, 7, '#4a3020'); b.rect(2, 2, 11, 5, '#6a4428'); b.rect(3, 4, 2, 1, '#e0d0a0'); b.rect(6, 4, 2, 1, '#e0d0a0'); b.rect(9, 4, 3, 1, '#e0d0a0'); b.set(12, 3, '#a01010'); break;
  }
  c = b.finish({ outline: 'selout' });
  decorCache.set(key, c);
  return c;
}

// ---------------------------------------------------------------------------
// Luces del escenario
// ---------------------------------------------------------------------------
export function lightsFor(map: GameMap): Light[] {
  const lights: Light[] = [];
  const DX = 8 * PIXEL; // la decoración se dibuja desde su esquina
  for (const d of map.decor) {
    if (d.type === 'candle') lights.push({ x: d.x + DX, y: d.y + 15, r: 80, c: 'warm', flicker: true });
    if (d.type === 'pumpkin') lights.push({ x: d.x + DX, y: d.y + 24, r: 90, c: 'warm', flicker: true });
    if (d.type === 'lantern') lights.push({ x: d.x + DX, y: d.y + 24, r: 150, c: 'warm', flicker: true });
    if (d.type === 'mushroom' && d.v % 2 === 0) lights.push({ x: d.x + DX, y: d.y + 21, r: 50, c: 'green' });
  }
  for (const o of map.obstacles) {
    const cx = o.x + o.w / 2;
    switch (o.type) {
      case 'house': case 'cabin': if (isLit(o)) lights.push({ x: cx, y: o.y + o.h + 10, r: 170, c: 'warm' }); break;
      case 'lamp': lights.push({ x: cx, y: o.y - 50, r: 210, c: 'white', flicker: hashAt(o.x, o.y, 2) < 0.25 }); break;
      case 'brazier': lights.push({ x: cx, y: o.y - 10, r: 230, c: 'warm', flicker: true }); break;
      case 'firepit': lights.push({ x: cx, y: o.y, r: 340, c: 'warm', flicker: true }); break;
      case 'tower': lights.push({ x: cx, y: o.y + 20, r: 140, c: 'warm', flicker: true }); break;
      case 'wall': if (o.v === 0) for (let x = 10; x < o.w / PIXEL - 6; x += 22) lights.push({ x: o.x + x * PIXEL, y: o.y + o.h - 20, r: 120, c: 'warm', flicker: true }); break;
      case 'car': if (o.v === 1) lights.push({ x: cx, y: o.y - 40, r: 140, c: 'white' }); break;
      case 'statue': lights.push({ x: cx, y: o.y - 30, r: 40, c: 'warm' }); break;
    }
  }
  for (const l of map.lakes) lights.push({ x: l.cx, y: l.cy, r: Math.max(l.rx, l.ry) * 1.1, c: 'cold' });
  return lights;
}
