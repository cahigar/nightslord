// Arte procedural de obstáculos y decoración (pixel art a escala PIXEL), con sombreado automático,
// contorno coloreado y ventanas/fuegos emisivos que brillan en la oscuridad.
import { PIXEL } from '../shared/constants';
import { FACADE, type Decor, type GameMap, type Obstacle, type TV } from '../shared/maps';
import { hashAt } from '../shared/noise';
import { mulberry32, type Rng } from '../shared/rng';
import { PB, shade, type Baked } from './pixel';

export interface Prerendered { base: HTMLCanvasElement; glow: HTMLCanvasElement | null; ox: number; oy: number } // offset en mundo desde (o.x, o.y)

export const LIGHT_COLORS = { warm: 'rgba(255,170,60,', cold: 'rgba(120,160,255,', green: 'rgba(90,255,120,', white: 'rgba(255,240,200,', purple: 'rgba(170,80,255,' };
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
  const ruined = theme === 'cityz';
  const walls = ruined ? ['#5a5258', '#4e564e', '#5e4e46', '#4a525a'][o.v % 4] : ['#7a6a8a', '#6a7a6a', '#8a6a5a', '#5a6a7a'][o.v % 4];
  const roof = ruined ? ['#2a2024', '#22222a', '#30241a', '#1e2428'][o.v % 4] : ['#3a2434', '#2a2a3c', '#46301e', '#22303a'][o.v % 4];
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
  if (ruined) {
    // abandonada: agujeros en el tejado, tablones en las ventanas y pintadas
    for (let k = 0; k < 2; k++) { const x = 6 + Math.floor(r() * (W - 18)), y = 3 + Math.floor(r() * Math.max(1, top - 10)); b.rect(x, y, 7, 4, '#0c0a0e'); b.rect(x + 1, y + 4, 5, 1, '#0c0a0e'); }
    for (let wx = 4; wx < W - 10; wx += 13) { if (Math.abs(wx + 3 - W / 2) < 7 || r() < 0.4) continue; b.line(wx - 1, top + 5, wx + 7, top + 9, '#6a4a2a'); b.line(wx - 1, top + 9, wx + 7, top + 6, '#5a3a20'); }
    for (let k = 0; k < W; k++) { const x = Math.floor(r() * W), y = top + Math.floor(r() * F); if (b.get(x, y)) b.set(x, y, r() < 0.5 ? shade(walls, -0.35) : '#3a4a2a'); }
  }
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

const shop: Draw = (b, W, H, up, o) => {
  const f = FACADE.shop;
  const base = up + H, top = base - f.F;
  const brick = ['#6a3a32', '#4a4a5a', '#5a4a3a'][o.v % 3];
  // tejado plano con máquinas de aire acondicionado
  b.rect(0, 2, W, top - 2, '#2e2a34');
  for (let y = 4; y < top - 1; y += 4) b.rect(1, y, W - 2, 1, '#26222c');
  b.rect(6, 5, 8, 5, '#5a5a66'); b.rect(7, 6, 6, 1, '#3a3a44'); b.rect(W - 18, 6, 6, 4, '#5a5a66');
  b.rect(0, top - 2, W, 2, '#1a1820');
  // fachada de ladrillo
  b.rect(0, top, W, f.F, brick);
  for (let y = top + 1; y < base; y += 3) for (let x = (Math.floor(y / 3) % 2) * 3; x < W; x += 6) b.set(x, y, shade(brick, -0.25));
  // rótulo luminoso
  const sx = 4, sy = top + 1;
  b.rect(sx, sy, W - 24, 3, '#1a1018');
  const letters = 'TV-RADIO';
  for (let i = 0; i < letters.length; i++) { b.set(sx + 2 + i * 3, sy + 1, '#60e0ff', true); b.set(sx + 3 + i * 3, sy + 1, '#60e0ff', true); }
  // toldo a rayas
  for (let x = 2; x < W - 18; x++) b.set(x, top + f.winY - 1, (x >> 1) % 2 ? '#c03030' : '#e8e0d0');
  // escaparate (las televisiones son entidades que se dibujan encima)
  const wx = f.winX, wy = top + f.winY, ww = W - f.winX - f.winRight, wh = f.winH;
  b.rect(wx - 1, wy - 1, ww + 2, wh + 2, '#c8c0b0');
  b.rect(wx, wy, ww, wh, '#141a2a');
  b.rect(wx, wy + wh - 3, ww, 3, '#3a3040'); // estante
  // puerta
  b.rect(W - 15, base - 15, 9, 15, '#c8c0b0'); b.rect(W - 14, base - 14, 7, 14, '#2a3a4a'); b.set(W - 9, base - 7, '#e0c040', false, true);
  b.rect(0, base - 1, W, 1, '#3a3438');
};

const barricade: Draw = (b, W, H, up, o) => {
  const vertical = o.v === 1;
  const len = vertical ? H : W;
  for (let i = 0; i < len; i++) {
    const c = Math.floor(i / 3) % 2 ? '#e07010' : '#f0f0f0';
    if (vertical) b.rect(Math.floor(W / 2) - 1, up + i, 3, 1, c); else b.rect(i, up - 3, 1, 3, c);
  }
  if (vertical) { b.rect(Math.floor(W / 2) - 3, up, 7, 1, '#3a3a40'); b.rect(Math.floor(W / 2) - 3, up + H - 1, 7, 1, '#3a3a40'); b.set(Math.floor(W / 2), up - 2, '#ffb020', true); }
  else { b.rect(1, up, 1, H, '#3a3a40'); b.rect(W - 2, up, 1, H, '#3a3a40'); b.set(2, up - 5, '#ffb020', true); b.set(W - 3, up - 5, '#ffb020', true); }
};


const cypress: Draw = (b, W, H, up, o, r) => {
  // ciprés del pantano: raíces aéreas, tronco ensanchado y copa colgante con musgo
  const cx = Math.floor(W / 2) + 4, baseY = up + H - 2;
  const bark = '#3a3024', barkD = '#251e16';
  b.rect(cx - 3, baseY - 16, 6, 16, bark); b.rect(cx - 4, baseY - 6, 8, 6, bark);
  for (const d of [-6, -3, 3, 6]) { b.line(cx + Math.sign(d) * 2, baseY - 7, cx + d, baseY, barkD); b.set(cx + d, baseY, bark); } // raíces aéreas
  b.line(cx - 1, baseY - 14, cx - 1, baseY - 2, barkD);
  const greens = ['#16241a', '#1e3020', '#283c26'];
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; b.ellipse(cx + Math.cos(a) * 8, baseY - 26 + Math.sin(a) * 4, 6, 4, greens[i % 2]); }
  b.ellipse(cx, baseY - 28, 9, 6, greens[1]); b.ellipse(cx - 2, baseY - 31, 5, 3, greens[2]);
  // musgo colgante
  for (let i = 0; i < 9; i++) {
    const x = cx - 13 + Math.floor(r() * 27), y0 = baseY - 24 + Math.floor(r() * 5), len = 3 + Math.floor(r() * 6);
    for (let y = 0; y < len; y++) if (b.get(x, y0 - 1) || y > 0) b.set(x, y0 + y, y === len - 1 ? '#5a6a40' : '#3a4a2c');
  }
  if (o.v === 1) { b.set(cx + 5, baseY - 22, '#a0ff60', true); b.set(cx - 7, baseY - 19, '#a0ff60', true); } // luciérnagas
};

const hut: Draw = (b, W, H, up, o, r) => {
  // choza de la bruja sobre pilotes: tejado de paja torcido, chimenea humeante, ventana verde y calaveras
  const F = 18, base = up + H, top = base - F;
  const wood = '#4a3626', woodD = '#2a1e14', thatch = '#5a4a2a', thatchD = '#3a2e1a';
  for (let i = 0; i < top; i++) {
    const inset = Math.max(0, Math.round((top - i) * 1.1) - 8) + (i < 4 ? 2 : 0);
    const lean = Math.round(i * 0.12);
    b.rect(inset + lean, i, W - inset * 2, 1, i % 2 ? thatch : thatchD);
  }
  for (let k = 0; k < 30; k++) { const x = Math.floor(r() * W), y = Math.floor(r() * top); if (b.get(x, y)) b.set(x, y, r() < 0.5 ? '#6a5a32' : '#2a3a1a'); }
  b.rect(W - 18, 0, 6, top - 4, '#3a3438'); b.rect(W - 19, 0, 8, 2, '#2a2428'); // chimenea
  for (let y = top; y < base - 4; y += 3) { b.rect(1, y, W - 2, 3, wood); b.rect(1, y + 2, W - 2, 1, woodD); }
  for (const x of [2, Math.floor(W / 2) - 1, W - 4]) b.rect(x, base - 4, 2, 4, woodD); // pilotes
  b.rect(1, base - 5, W - 2, 1, woodD);
  // ventana con luz verde de caldero
  b.rect(6, top + 4, 8, 6, '#1a2a14'); b.rect(7, top + 5, 6, 4, '#80ff60', true); b.rect(9, top + 5, 1, 4, woodD); b.rect(7, top + 7, 6, 1, woodD);
  // puerta torcida con calavera
  const dx = Math.floor(W / 2) + 6;
  b.rect(dx, top + 3, 9, F - 7, woodD); b.rect(dx + 1, top + 4, 7, F - 8, '#1a120c');
  b.rect(dx + 3, top + 5, 3, 3, '#e0d8c8'); b.set(dx + 3, top + 6, '#101010'); b.set(dx + 5, top + 6, '#101010');
  // ristra de huesos y amuletos en el alero
  for (let x = 4; x < W - 4; x += 7) { b.set(x, top + 1, '#e0d8c8'); b.set(x, top + 2, o.v ? '#c060ff' : '#e0d8c8', !!o.v); }
};

const cauldron: Draw = (b, W, H, up) => {
  // caldero burbujeante sobre brasas
  const cx = Math.floor(W / 2), cy = up + H - 6;
  b.ellipse(cx, cy + 3, W / 2 - 3, 3, '#3a2010'); b.rect(cx - 4, cy + 3, 8, 2, '#ff6a10', true); b.set(cx, cy + 4, '#ffd040', true);
  b.ellipse(cx, cy - 2, W / 2 - 2, 5, '#1c1a20'); b.rect(cx - (W / 2 - 3), cy - 6, W - 6, 2, '#2c2a30');
  b.ellipse(cx, cy - 6, W / 2 - 4, 1, '#60e040'); b.set(cx - 3, cy - 7, '#c0ff80', true); b.set(cx + 2, cy - 8, '#a0ff60', true); b.set(cx, cy - 9, '#a0ff60', true);
  b.set(cx - 5, cy - 6, '#80ff60', true); b.set(cx + 4, cy - 6, '#80ff60', true);
  b.rect(1, cy - 4, 2, 2, '#2c2a30'); b.rect(W - 3, cy - 4, 2, 2, '#2c2a30'); // asas
};


// ---------------------------------------------------------------------------
// Orillas del Nilo
// ---------------------------------------------------------------------------
const SAND = '#c8a868', SAND_D = '#9a7e48', SAND_L = '#e0c888', GOLD = '#f0c040';

const pyramid: Draw = (b, W, H, up, o, r) => {
  // pirámide escalonada de bloques de arenisca con remate de oro y entrada oscura
  const base = up + H - 1, apex = Math.max(0, base - Math.round(W * 0.62));
  const cx = Math.floor(W / 2);
  for (let y = apex; y <= base; y++) {
    const half = Math.round(((y - apex) / (base - apex)) * (W / 2));
    const step = (y - apex) % 4 === 3;
    b.rect(cx - half, y, half, 1, step ? SAND_D : SAND); // cara iluminada
    b.rect(cx, y, half, 1, step ? shade(SAND_D, -0.15) : shade(SAND, -0.16)); // cara en sombra
    if (!step) for (let x = cx - half + ((y >> 2) % 2) * 3; x < cx + half; x += 6) b.set(x, y, shade(SAND, -0.08)); // juntas de bloques
  }
  b.line(cx, apex, cx, base, SAND_L); // arista
  for (let k = 0; k < W * 1.2; k++) { const x = Math.floor(r() * W), y = apex + Math.floor(r() * (base - apex)); if (b.get(x, y)) b.set(x, y, r() < 0.5 ? SAND_D : SAND_L); }
  // remate dorado
  for (let y = 0; y < 5; y++) b.rect(cx - y, apex + y, y * 2 + 1, 1, y < 2 ? '#fff0a0' : GOLD, y < 3 && o.v % 2 === 0);
  // entrada
  b.rect(cx - 3, base - 9, 6, 9, '#2a1a0e'); b.rect(cx - 4, base - 10, 8, 1, SAND_D); b.rect(cx - 2, base - 8, 4, 8, '#140a06');
  // arena acumulada al pie
  for (let x = 0; x < W; x++) { const h = 1 + Math.round(Math.abs(Math.sin(x * 0.3 + o.v)) * 2); b.rect(x, base - h + 1, 1, h, x % 3 ? SAND_L : SAND); }
};

const sphinx: Draw = (b, W, H, up) => {
  // esfinge tumbada: cuerpo de león, garras delante y cabeza con tocado a rayas
  const base = up + H - 1;
  const bodyTop = base - 16;
  b.rect(2, bodyTop, W - 22, 14, SAND); b.rect(2, bodyTop, W - 22, 2, SAND_L); b.rect(2, base - 3, W - 22, 2, SAND_D);
  b.ellipse(4, bodyTop + 6, 4, 6, SAND); // anca
  b.line(1, base - 2, 0, base - 8, SAND_D); // cola
  for (let x = 6; x < W - 22; x += 7) b.set(x, bodyTop + 6, SAND_D); // costillas talladas
  // garras extendidas
  b.rect(W - 26, base - 5, 24, 5, SAND); b.rect(W - 26, base - 5, 24, 1, SAND_L);
  for (const x of [W - 4, W - 6]) b.set(x, base - 1, SAND_D);
  // cabeza con tocado
  const hx = W - 20, hy = bodyTop - 14;
  b.rect(hx - 2, hy + 4, 14, 18, '#3a6aa0'); for (let y = hy + 5; y < hy + 22; y += 2) b.rect(hx - 2, y, 14, 1, '#e0c040'); // tocado a rayas
  b.rect(hx + 1, hy, 8, 4, '#3a6aa0'); b.rect(hx + 1, hy, 8, 1, '#e0c040');
  b.rect(hx + 2, hy + 4, 7, 10, SAND); b.rect(hx + 2, hy + 4, 7, 1, SAND_L); // rostro
  b.rect(hx + 3, hy + 7, 2, 1, '#2a1a0e'); b.rect(hx + 6, hy + 7, 2, 1, '#2a1a0e'); b.set(hx + 4, hy + 7, '#5ae0e0', true); b.set(hx + 7, hy + 7, '#5ae0e0', true);
  b.rect(hx + 4, hy + 11, 3, 1, SAND_D); b.rect(hx + 4, hy + 14, 3, 3, '#3a6aa0'); // barba postiza
  b.set(hx + 8, hy + 9, SAND_D); // nariz rota
};

const obelisk: Draw = (b, W, H, up, o) => {
  // obelisco con jeroglíficos y punta dorada
  const cx = Math.floor(W / 2), base = up + H - 1;
  for (let y = 4; y <= base; y++) { const half = y < base - 3 ? 2 + Math.floor((y - 4) / 18) : 4; b.rect(cx - half, y, half * 2 + 1, 1, y < base - 3 ? SAND : SAND_D); b.set(cx + half, y, shade(SAND, -0.18)); }
  for (let y = 0; y < 4; y++) b.rect(cx - y, y + 1, y * 2 + 1, 1, GOLD, y < 2);
  for (let y = 8; y < base - 6; y += 3) b.set(cx - 1 + (y % 2), y, o.v % 2 ? '#5ae0e0' : '#7a5a30', o.v % 2 === 1);
};

const column: Draw = (b, W, H, up, o, _r, theme) => {
  // columna: egipcia con capitel de papiro y bandas pintadas; en la jungla, columna rota cubierta de musgo
  const cx = Math.floor(W / 2), base = up + H - 1;
  const jungle = theme === 'jungle' || o.v === 3;
  const stone = jungle ? '#8a8a7a' : SAND, stoneD = jungle ? '#5a5a4e' : SAND_D;
  const top = jungle ? up - 12 + (o.v % 2) * 6 : 4;
  b.rect(cx - 3, top, 7, base - top, stone); b.rect(cx + 2, top, 2, base - top, shade(stone, -0.15));
  b.rect(cx - 4, base - 2, 9, 2, stoneD);
  if (!jungle) {
    b.rect(cx - 5, top - 3, 11, 3, SAND_L); b.rect(cx - 4, top - 4, 9, 1, '#4a8a50'); // capitel de papiro
    for (const y of [top + 4, top + 7, base - 6]) { b.rect(cx - 3, y, 7, 1, '#3a6aa0'); b.rect(cx - 3, y + 1, 7, 1, '#c03020'); }
  } else {
    b.set(cx - 3, top, null); b.set(cx + 3, top + 1, stoneD); b.set(cx - 2, top - 1, stone); // rotura
    for (let k = 0; k < 10; k++) b.set(cx - 3 + ((k * 5) % 7), top + 2 + ((k * 7) % (base - top - 2)), k % 2 ? '#3a6a2a' : '#4a8a34'); // musgo
    b.rect(cx + 5, base - 2, 3, 2, stoneD); // cascote
  }
};

const palm: Draw = (b, W, H, up, o, r) => {
  // palmera: tronco curvo anillado, penacho de hojas y cocos
  const baseX = Math.floor(W / 2) + 2, baseY = up + H - 2;
  const lean = o.v % 2 ? 1 : -1;
  let tx = baseX, ty = baseY;
  for (let i = 0; i < 26; i++) {
    tx = baseX + Math.round(lean * (i / 26) ** 2 * 7); ty = baseY - i;
    b.rect(tx - 1, ty, 3, 1, i % 3 === 0 ? '#5a4024' : '#7a5a34');
  }
  const leaves = ['#2a5a24', '#3a7a2e', '#4a8a34'];
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + (k - 3) * 0.48 + (r() - 0.5) * 0.15;
    const len = 11 + Math.floor(r() * 3);
    for (let j = 1; j <= len; j++) {
      const droop = (j / len) ** 2 * 6;
      const x = tx + Math.round(Math.cos(a) * j), y = ty + Math.round(Math.sin(a) * j * 0.7 + droop);
      b.set(x, y, leaves[(j + k) % 3]); if (j > 2 && j < len - 1) { b.set(x, y + 1, leaves[0]); if (j % 2) b.set(x + (Math.cos(a) > 0 ? -1 : 1), y + 2, leaves[1]); }
    }
  }
  for (const [dx, dy] of [[-1, 2], [1, 2], [0, 3]]) b.set(tx + dx, ty + dy, '#5a3a18');
};

const adobe: Draw = (b, W, H, up, o, r) => {
  // casa de adobe de tejado plano con cántaros en la azotea
  const F = 14, base = up + H, top = base - F;
  const lit = isLit(o);
  const mud = ['#b08858', '#a07a4e', '#c09868'][o.v % 3], mudD = shade(mud, -0.22);
  b.rect(0, 0, W, top, shade(mud, 0.12)); // azotea
  b.rect(0, 0, W, 1, shade(mud, -0.1)); b.rect(0, top - 2, W, 2, mudD);
  for (let k = 0; k < W; k++) b.set(Math.floor(r() * W), Math.floor(r() * (top - 2)), shade(mud, 0.2));
  b.rect(3, 3, 5, 4, '#8a5a30'); b.rect(4, 2, 3, 1, '#6a4020'); // cántaro
  if (o.v % 2) { b.rect(W - 12, 2, 8, 6, '#d8d0c0'); b.rect(W - 12, 2, 8, 1, '#a09880'); } // tela tendida
  b.rect(0, top, W, F, mud);
  for (let k = 0; k < W; k++) { const x = Math.floor(r() * W), y = top + Math.floor(r() * F); b.set(x, y, r() < 0.5 ? mudD : shade(mud, 0.1)); }
  for (let wx = 5; wx < W - 8; wx += 12) { b.rect(wx, top + 3, 4, 4, lit && r() < 0.8 ? '#ffc060' : '#2a1a0e', lit); b.rect(wx - 1, top + 2, 6, 1, mudD); }
  const dx = Math.floor(W / 2) - 3;
  b.rect(dx, base - 10, 7, 10, '#2a1a0e'); b.rect(dx, base - 10, 7, 1, mudD); b.rect(dx + 1, base - 9, 5, 9, ['#3a5a8a', '#6a3a20', '#2a6a5a'][o.v % 3]);
  b.rect(0, base - 1, W, 1, mudD);
};

// ---------------------------------------------------------------------------
// Jungla jurásica
// ---------------------------------------------------------------------------
const jtree: Draw = (b, W, H, up, o, r) => {
  // árbol gigante de la selva: raíces tabulares, tronco grueso, copa enorme a capas y lianas
  const cx = Math.floor(W / 2) + 4, baseY = up + H - 2;
  const bark = '#4a3a26', barkD = '#2e2418', barkL = '#6a5634';
  b.rect(cx - 3, baseY - 22, 7, 22, bark); b.rect(cx - 3, baseY - 22, 2, 22, barkL); b.rect(cx + 3, baseY - 22, 1, 22, barkD);
  for (const d of [-7, -5, 5, 8]) { b.line(cx + Math.sign(d) * 3, baseY - 9, cx + d, baseY, barkD); b.line(cx + Math.sign(d) * 2, baseY - 8, cx + d - Math.sign(d), baseY, bark); } // raíces
  const greens = o.v % 2 ? ['#123018', '#1c4422', '#28582c', '#3a7036'] : ['#14301a', '#1e4026', '#2a5430', '#3c6c3a'];
  for (let layer = 0; layer < 3; layer++) {
    const y = baseY - 30 - layer * 6, rw = 14 - layer * 3;
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; b.ellipse(cx + Math.cos(a) * rw * 0.7, y + Math.sin(a) * 3, 6, 4, greens[layer]); }
    b.ellipse(cx, y - 1, rw * 0.7, 4, greens[layer + 1]);
  }
  for (let i = 0; i < 40; i++) { const x = cx + Math.round((r() - 0.5) * 30), y = baseY - 40 + Math.round((r() - 0.5) * 22); if (b.get(x, y)) b.set(x, y, r() < 0.5 ? greens[3] : greens[0]); }
  // lianas colgando
  for (let k = 0; k < 6; k++) {
    const x = cx - 12 + Math.floor(r() * 25), y0 = baseY - 28 + Math.floor(r() * 4), len = 5 + Math.floor(r() * 10);
    for (let y = 0; y < len; y++) b.set(x + (y > len / 2 ? 1 : 0), y0 + y, y === len - 1 ? '#5a8a3a' : '#2e5a24');
  }
  if (o.v === 2) { b.set(cx - 8, baseY - 26, '#ff4080', true); b.set(cx + 9, baseY - 30, '#ffd040', true); } // flores que brillan
};

const temple: Draw = (b, W, H, up, o, r) => {
  // templo escalonado en ruinas: cuatro gradas, escalinata central, santuario arriba con runas verdes
  const base = up + H - 1, top = 4;
  const stone = '#7a7a68', stoneD = '#4e4e42', stoneL = '#9a9a86';
  const tiers = 4, th = Math.floor((base - top - 10) / tiers);
  for (let t = 0; t < tiers; t++) {
    const y0 = base - (t + 1) * th, inset = t * Math.floor(W / 9);
    b.rect(inset, y0, W - inset * 2, th, stone); b.rect(inset, y0, W - inset * 2, 1, stoneL); b.rect(inset, y0 + th - 1, W - inset * 2, 1, stoneD);
    for (let x = inset + 2; x < W - inset - 2; x += 5) b.set(x, y0 + Math.floor(th / 2), stoneD);
  }
  // santuario
  const sw = Math.floor(W / 3), sx = Math.floor((W - sw) / 2), sy = base - tiers * th - 10;
  b.rect(sx, Math.max(top, sy), sw, 10, stone); b.rect(sx - 1, Math.max(top, sy) - 1, sw + 2, 2, stoneL);
  b.rect(sx + Math.floor(sw / 2) - 3, Math.max(top, sy) + 3, 6, 7, '#0a0a08'); // puerta
  for (const dx of [2, sw - 3]) b.set(sx + dx, Math.max(top, sy) + 4, '#60ff90', true); // runas
  // escalinata central
  const stw = Math.floor(W / 6), stx = Math.floor((W - stw) / 2);
  for (let y = sy + 10; y < base; y += 2) { b.rect(stx, y, stw, 1, stoneL); b.rect(stx, y + 1, stw, 1, stoneD); }
  // musgo, lianas y grietas
  for (let k = 0; k < W * 2; k++) { const x = Math.floor(r() * W), y = Math.floor(r() * base); if (b.get(x, y)) b.set(x, y, r() < 0.6 ? '#3a6a2a' : '#2a4a20'); }
  for (let k = 0; k < 8; k++) { const x = Math.floor(r() * W), y0 = sy + Math.floor(r() * 20), len = 4 + Math.floor(r() * 10); for (let y = 0; y < len; y++) if (b.get(x, y0 + y)) b.set(x, y0 + y, '#2e5a24'); }
  for (let k = 0; k < 5; k++) { const x = 4 + Math.floor(r() * (W - 8)), y = base - 2 - Math.floor(r() * tiers * th); b.set(x, y, '#60ff90', true); } // runas que brillan
};

const ruin: Draw = (b, W, H, up, o, r) => {
  // muro de piedra derrumbado con musgo
  const base = up + H - 1;
  const stone = o.v % 2 ? '#8a8a78' : '#7a7a6a', stoneD = shade(stone, -0.3);
  for (let x = 0; x < W; x++) {
    const h = 6 + Math.round(Math.abs(Math.sin(x * 0.5 + o.v * 2)) * 8) + (x > W / 2 ? 2 : 0);
    b.rect(x, base - h - H + 4, 1, h + H - 4, stone);
    if ((x + o.v) % 4 === 0) b.set(x, base - h - H + 4, stoneD);
  }
  for (let y = 0; y < base; y += 4) for (let x = (y % 8) ? 2 : 0; x < W; x += 5) if (b.get(x, y)) b.set(x, y, stoneD);
  for (let k = 0; k < W; k++) { const x = Math.floor(r() * W), y = Math.floor(r() * base); if (b.get(x, y)) b.set(x, y, r() < 0.5 ? '#3a6a2a' : '#4a8a34'); }
  b.rect(W - 4, base - 2, 4, 2, stoneD); b.rect(-1, base - 1, 3, 1, stoneD); // cascotes
};

const tent: Draw = (b, W, H, up, o, r) => {
  // tienda de lona de la expedición, con la entrada abierta y un farol dentro
  const base = up + H - 1, peak = 2;
  const canvas = ['#b8a878', '#8a8a5a', '#a07850'][o.v % 3], canvasD = shade(canvas, -0.25);
  for (let y = peak; y <= base; y++) {
    const half = Math.round(((y - peak) / (base - peak)) * (W / 2));
    b.rect(Math.floor(W / 2) - half, y, half, 1, canvas); b.rect(Math.floor(W / 2), y, half, 1, canvasD);
  }
  b.line(Math.floor(W / 2), peak, Math.floor(W / 2), base, shade(canvas, 0.2)); // cumbrera
  const dw = 5;
  for (let y = base - 10; y <= base; y++) { const half = Math.round(((y - (base - 10)) / 10) * dw); b.rect(Math.floor(W / 2) - half, y, half * 2, 1, '#2a1e10'); }
  b.set(Math.floor(W / 2), base - 3, '#ffc040', true); b.set(Math.floor(W / 2) - 1, base - 2, '#ffe080', true);
  b.line(0, base, -2, base + 2, '#5a4030'); b.line(W - 1, base, W + 1, base + 2, '#5a4030'); // vientos
  for (let k = 0; k < 6; k++) b.set(Math.floor(r() * W), peak + 4 + Math.floor(r() * (base - peak - 4)), canvasD);
};

const crate: Draw = (b, W, H, up, o) => {
  // caja de madera con marcas de la expedición
  const base = up + H - 1, top = 2;
  const wood = '#8a6a3a', woodD = '#5a4224';
  b.rect(0, top, W, base - top + 1, wood); b.rect(0, top, W, 2, shade(wood, 0.2));
  b.rect(0, top, 1, base - top + 1, woodD); b.rect(W - 1, top, 1, base - top + 1, woodD); b.rect(0, base, W, 1, woodD);
  b.line(1, top + 2, W - 2, base - 1, woodD); // travesaño
  if (o.v % 2) { b.rect(2, top + 4, 3, 2, '#c02020'); } else b.set(3, top + 5, '#202020');
};

// ---- Ciudad Z (tras la invasión zombi) ----
const block: Draw = (b, W, H, up, o, r) => {
  // bloque de pisos abandonado: azotea, fachada de hormigón con ventanas rotas o tapiadas y alguna encendida
  const base = up + H - 1, F = Math.min(up + Math.floor(H * 0.55), 34), top = base - F;
  const conc = ['#5a5a62', '#6a6058', '#4e5660', '#665a5a'][o.v % 4], concD = shade(conc, -0.3), concL = shade(conc, 0.2);
  b.rect(0, 0, W, top, shade(conc, -0.12)); // azotea
  b.rect(0, 0, W, 1, concL); b.rect(0, top - 1, W, 1, concD);
  for (let k = 0; k < 3; k++) { const x = 3 + Math.floor(r() * (W - 10)), y = 2 + Math.floor(r() * Math.max(1, top - 8)); b.rect(x, y, 5, 4, '#3a3a40'); b.rect(x + 1, y + 1, 3, 1, '#5a5a62'); } // máquinas del aire
  if (r() < 0.6) { const x = 4 + Math.floor(r() * (W - 14)), y = 3 + Math.floor(r() * Math.max(1, top - 10)); b.rect(x, y, 8, 6, '#0c0a0e'); b.rect(x - 1, y + 6, 10, 1, concD); } // boquete en la azotea
  b.rect(0, top, W, F, conc);
  for (let y = top + 1; y < base; y += 9) b.rect(0, y, W, 1, concD); // forjados
  const lit = isLit(o);
  for (let y = top + 3; y < base - 6; y += 9) for (let x = 3; x < W - 5; x += 7) {
    const k = r();
    if (k < 0.3) { b.rect(x, y, 4, 5, '#0a0a10'); b.set(x + 1, y + 1, '#2a3040'); b.set(x + 3, y + 4, '#8090a0'); } // cristal roto
    else if (k < 0.55) { b.rect(x, y, 4, 5, '#5a4028'); b.line(x, y + 1, x + 3, y + 3, '#7a5a38'); } // tapiada
    else if (k < 0.6 && lit) b.rect(x, y, 4, 5, '#ffc860', true);
    else b.rect(x, y, 4, 5, GLASS_DARK);
  }
  const dx = Math.floor(W / 2) - 4;
  b.rect(dx, base - 8, 8, 8, '#141016'); b.rect(dx - 1, base - 9, 10, 1, concD); // portal
  for (let k = 0; k < W * 0.6; k++) { const x = Math.floor(r() * W), y = top + Math.floor(r() * F); if (b.get(x, y)) b.set(x, y, r() < 0.5 ? concD : '#3a4a2a'); } // grietas y musgo
  for (let k = 0; k < 3; k++) { const x = Math.floor(r() * W); for (let y = top; y < top + 4 + Math.floor(r() * 10); y++) b.set(x, y, '#2a2420'); } // churretones
  b.rect(-1, base, 3, 1, concD); b.rect(W - 3, base, 4, 1, concD); // cascotes
  if (r() < 0.5) { const x = 2 + Math.floor(r() * (W - 20)); b.rect(x, top + 2, 14, 3, '#e0d8c8'); b.rect(x + 1, top + 3, 12, 1, '#c02020'); } // pintada SOS
};

const wreck: Draw = (b, W, H, up, o, r) => {
  // coche calcinado: chapa oxidada, sin cristales, ruedas reventadas
  const vertical = H > W, y0 = up;
  const rust = ['#5a3a24', '#4a3a34', '#3a3030', '#6a4a2a'][o.v % 4];
  b.rect(1, y0 + 1, W - 2, H - 2, rust); b.rect(0, y0 + 3, W, H - 6, rust);
  for (let k = 0; k < W * H * 0.08; k++) b.set(Math.floor(r() * W), y0 + Math.floor(r() * H), r() < 0.5 ? '#2a1a14' : '#8a5a30');
  if (vertical) { b.rect(3, y0 + 6, W - 6, 5, '#0c0a0c'); b.rect(3, y0 + H - 10, W - 6, 4, '#0c0a0c'); b.rect(3, y0 + 11, W - 6, H - 21, shade(rust, -0.25)); }
  else { b.rect(5, y0 + 3, 5, H - 6, '#0c0a0c'); b.rect(W - 9, y0 + 3, 4, H - 6, '#0c0a0c'); b.rect(10, y0 + 3, W - 19, H - 6, shade(rust, -0.25)); }
  b.rect(0, y0 + 2, 1, 3, '#101010'); b.rect(W - 1, y0 + H - 5, 1, 3, '#101010');
  if (o.v === 0) for (let k = 0; k < 3; k++) b.set(2 + Math.floor(r() * (W - 4)), y0 + 2 + Math.floor(r() * (H - 4)), '#ff7020', true); // brasas
};

const barn: Draw = (b, W, H, up, o, r) => {
  // granero rojo con tejado a dos aguas y portón
  const base = up + H - 1, F = 20, top = base - F;
  const red = ['#7a2a22', '#6a2a2a', '#5a3a2a'][o.v % 3], roof = '#3a3034';
  for (let i = 0; i < top; i++) { const inset = Math.max(0, Math.round((top - i) * 0.6) - 6); b.rect(inset, i, W - inset * 2, 1, i % 4 === 0 ? shade(roof, -0.3) : roof); }
  for (let k = 0; k < 6; k++) b.set(Math.floor(r() * W), Math.floor(r() * top), '#0c0a0c'); // tejas que faltan
  b.rect(0, top, W, F, red);
  for (let x = 0; x < W; x += 3) b.rect(x, top, 1, F, shade(red, -0.2));
  const dw = 16, dx = Math.floor(W / 2) - dw / 2;
  b.rect(dx, base - 15, dw, 15, '#e0d8c8'); b.rect(dx + 1, base - 14, dw - 2, 14, shade(red, -0.35));
  b.line(dx + 1, base - 14, dx + dw - 2, base - 1, '#e0d8c8'); b.line(dx + dw - 2, base - 14, dx + 1, base - 1, '#e0d8c8');
  b.rect(dx + 4, top + 1, 8, 3, '#141014'); // ventanuco del pajar
};

const hay: Draw = (b, W, H, up, o, r) => {
  const base = up + H - 1, top = 3;
  const c = '#c8a850', d = '#8a7030';
  b.rect(0, top, W, base - top + 1, c); b.rect(0, top, W, 2, shade(c, 0.2)); b.rect(0, base - 1, W, 2, d);
  b.rect(Math.floor(W / 3), top, 1, base - top, d); b.rect(Math.floor((W * 2) / 3), top, 1, base - top, d);
  for (let k = 0; k < W; k++) b.set(Math.floor(r() * W), top + Math.floor(r() * (base - top)), r() < 0.5 ? d : '#e8d080');
  void o;
};

const DRAWS: Partial<Record<Obstacle['type'], { up: number; draw: Draw; pad?: number }>> = {
  shop: { up: 12, draw: shop }, barricade: { up: 8, draw: barricade },
  house: { up: 16, draw: house }, cabin: { up: 14, draw: cabin },
  tree: { up: 20, draw: tree, pad: 8 }, pine: { up: 30, draw: pine, pad: 8 }, deadtree: { up: 26, draw: deadtree, pad: 8 },
  hedge: { up: 5, draw: hedge }, fence: { up: 7, draw: fence }, car: { up: 2, draw: car },
  lamp: { up: 26, draw: lamp }, mailbox: { up: 6, draw: mailbox },
  wall: { up: 12, draw: wall }, tower: { up: 34, draw: tower },
  tomb: { up: 14, draw: tomb }, crypt: { up: 18, draw: crypt }, statue: { up: 18, draw: statue, pad: 4 },
  brazier: { up: 10, draw: brazier }, well: { up: 14, draw: well },
  rock: { up: 4, draw: rock }, canoe: { up: 1, draw: canoe }, firepit: { up: 10, draw: firepit }, log: { up: 1, draw: log_ },
  cypress: { up: 26, draw: cypress, pad: 9 }, hut: { up: 22, draw: hut }, cauldron: { up: 8, draw: cauldron },
  pyramid: { up: 70, draw: pyramid }, sphinx: { up: 26, draw: sphinx }, obelisk: { up: 44, draw: obelisk }, column: { up: 34, draw: column, pad: 4 },
  palm: { up: 34, draw: palm, pad: 12 }, adobe: { up: 12, draw: adobe },
  jtree: { up: 46, draw: jtree, pad: 12 }, temple: { up: 60, draw: temple }, ruin: { up: 10, draw: ruin }, tent: { up: 16, draw: tent, pad: 3 }, crate: { up: 6, draw: crate },
  block: { up: 40, draw: block }, wreck: { up: 2, draw: wreck }, barn: { up: 26, draw: barn }, hay: { up: 5, draw: hay },
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
// Televisiones (entidades del mapa): 4 frames de imagen parpadeante
// ---------------------------------------------------------------------------
const tvCache = new Map<string, Baked>();
export function renderTV(tv: TV, frame: number): Baked {
  const key = `${tv.kind}|${tv.w}x${tv.h}|${frame}|${tv.id % 3}`;
  let c = tvCache.get(key);
  if (c) return c;
  const W = Math.round(tv.w / PIXEL), H = Math.round(tv.h / PIXEL);
  const outdoor = tv.kind === 'outdoor';
  const b = new PB(W + 2, H + (outdoor ? 6 : 2));
  const SCREENS = [['#3a6aff', '#80a0ff'], ['#e0e0f0', '#808090'], ['#40ff90', '#109050'], ['#ff4080', '#a01040']];
  const [s1, s2] = SCREENS[(frame + tv.id) % SCREENS.length];
  const by = outdoor ? 4 : 0;
  if (tv.kind === 'window') b.rect(0, 0, W, H, '#2a2018'); // interior de la casa
  // carcasa
  const tw = Math.min(W, outdoor ? W : W - 1), th = Math.min(H - 1, outdoor ? H - 2 : Math.round(H * 0.75));
  const tx = Math.floor((W - tw) / 2), ty = by + (outdoor ? 0 : H - th - 1);
  b.rect(tx, ty, tw, th, '#3a3438');
  b.rect(tx + 1, ty + 1, tw - 3, th - 2, s1, true);
  // estática / imagen
  for (let i = 0; i < tw * th * 0.4; i++) {
    const n = Math.sin((i + 1) * 12.9898 * (frame + 1) + tv.id) * 43758.5453;
    const r = n - Math.floor(n);
    const px = tx + 1 + Math.floor(r * (tw - 3)), py = ty + 1 + Math.floor(((r * 7) % 1) * (th - 2));
    b.set(px, py, (i + frame) % 3 ? s2 : '#ffffff', true);
  }
  b.set(tx + tw - 2, ty + 1, '#c04040'); b.set(tx + tw - 2, ty + 3, '#808088');
  if (outdoor) { b.line(tx + 2, ty, tx, ty - 4, '#9090a0'); b.line(tx + tw - 4, ty, tx + tw - 1, ty - 4, '#9090a0'); b.rect(tx + 1, ty + th, 2, 2, '#2a2428'); b.rect(tx + tw - 3, ty + th, 2, 2, '#2a2428'); }
  else b.rect(tx + Math.floor(tw / 2) - 1, ty + th, 3, 1, '#2a2428');
  c = b.finish({ outline: tv.kind === 'window' || tv.kind === 'shop' ? 'none' : 'selout', autoShade: false });
  tvCache.set(key, c);
  return c;
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
    case 'reeds':
      for (let i = 0; i < 6; i++) { const x = 3 + i * 2, h = 6 + ((i * 5 + d.v) % 4); b.line(x, 12, x + (i % 2 ? 1 : -1), 12 - h, i % 2 ? '#3a5a2a' : '#4a6a34'); }
      b.rect(5, 3, 1, 3, '#5a3a20'); b.rect(10, 4, 1, 3, '#5a3a20'); // espadañas
      break;
    case 'totem':
      b.line(7, 12, 7, 2, '#4a3020'); b.line(4, 4, 10, 4, '#4a3020');
      b.ellipse(7, 3, 2, 2, '#e0d8c8'); b.set(6, 3, '#101010'); b.set(8, 3, '#101010');
      b.set(4, 5, '#c060ff', true); b.set(10, 5, '#80ff60', true); b.line(4, 5, 4, 8, '#8a7a5a'); b.line(10, 5, 10, 8, '#8a7a5a');
      break;
    case 'urn': b.ellipse(7, 9, 3, 3, '#a0603a'); b.rect(6, 4, 3, 2, '#a0603a'); b.rect(5, 4, 5, 1, '#7a4428'); b.rect(5, 9, 5, 1, '#3a6aa0'); b.set(6, 8, '#d08860'); break;
    case 'fern':
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.55; for (let j = 1; j < 7; j++) { const x = 7 + Math.round(Math.cos(a) * j), y = 12 + Math.round(Math.sin(a) * j * 0.9 + (j / 7) ** 2 * 3); b.set(x, y, j % 2 ? '#2e6a28' : '#4a8a34'); } }
      break;
    case 'flower':
      b.line(7, 12, 7, 7, '#2e6a28'); b.set(5, 10, '#3a7a30'); b.set(9, 9, '#3a7a30');
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) b.set(7 + dx, 6 + dy, d.v % 2 ? '#ff3060' : '#ff8020');
      b.set(7, 6, '#ffe060', true);
      break;
    case 'fossil': b.ellipse(7, 9, 4, 3, '#c8c0a8'); b.ellipse(7, 9, 2, 1, '#8a8270'); b.set(7, 9, '#5a5446'); b.line(3, 9, 11, 9, '#a8a088'); break;
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
    if (d.type === 'flower') lights.push({ x: d.x + DX, y: d.y + 18, r: 34, c: 'warm' });
    if (d.type === 'totem') lights.push({ x: d.x + DX, y: d.y + 12, r: 60, c: 'green', flicker: true });
  }
  for (const o of map.obstacles) {
    const cx = o.x + o.w / 2;
    switch (o.type) {
      case 'house': case 'cabin': if (isLit(o)) lights.push({ x: cx, y: o.y + o.h + 10, r: 170, c: 'warm' }); break;
      case 'lamp': if (map.theme === 'cityz' && hashAt(o.x, o.y, 3) > 0.45) break; lights.push({ x: cx, y: o.y - 50, r: 210, c: 'white', flicker: hashAt(o.x, o.y, 2) < 0.25 }); break;
      case 'brazier': lights.push({ x: cx, y: o.y - 10, r: 230, c: 'warm', flicker: true }); break;
      case 'firepit': lights.push({ x: cx, y: o.y, r: 340, c: 'warm', flicker: true }); break;
      case 'tower': lights.push({ x: cx, y: o.y + 20, r: 140, c: 'warm', flicker: true }); break;
      case 'wall': if (o.v === 0) for (let x = 10; x < o.w / PIXEL - 6; x += 22) lights.push({ x: o.x + x * PIXEL, y: o.y + o.h - 20, r: 120, c: 'warm', flicker: true }); break;
      case 'car': if (o.v === 1) lights.push({ x: cx, y: o.y - 40, r: 140, c: 'white' }); break;
      case 'statue': lights.push({ x: cx, y: o.y - 30, r: 40, c: 'warm' }); break;
      case 'cauldron': lights.push({ x: cx, y: o.y, r: 260, c: 'green', flicker: true }); break;
      case 'hut': lights.push({ x: o.x + 30, y: o.y + o.h + 10, r: 160, c: 'green', flicker: true }); break;
      case 'adobe': if (isLit(o)) lights.push({ x: cx, y: o.y + o.h + 10, r: 150, c: 'warm' }); break;
      case 'tent': lights.push({ x: cx, y: o.y + o.h, r: 120, c: 'warm', flicker: true }); break;
      case 'temple': lights.push({ x: cx, y: o.y + 20, r: 220, c: 'green', flicker: true }); break;
      case 'block': if (isLit(o)) lights.push({ x: cx, y: o.y + o.h + 6, r: 130, c: 'warm' }); break;
      case 'wreck': if (o.v === 0) lights.push({ x: cx, y: o.y + o.h / 2, r: 90, c: 'warm', flicker: true }); break;
      case 'pyramid': if (o.v % 2 === 0) lights.push({ x: cx, y: o.y - 160, r: 90, c: 'warm' }); break;
    }
  }
  for (const l of map.lakes) lights.push({ x: l.cx, y: l.cy, r: Math.max(l.rx, l.ry) * 1.1, c: 'cold' });
  for (const a of map.altars) lights.push({ x: a.x, y: a.y, r: 230, c: 'purple', flicker: true });
  for (const o of map.obstacles) if (o.type === 'shop') lights.push({ x: o.x + o.w / 2, y: o.y + o.h + 20, r: 180, c: 'cold' });
  for (const o of map.border) if (o.type === 'barricade') lights.push({ x: o.x + o.w / 2, y: o.y, r: 60, c: 'warm', flicker: true });
  return lights;
}
