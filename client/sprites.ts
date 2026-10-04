// Generador procedural de sprites pixel art.
// Todos los personajes comparten el MISMO esqueleto y las MISMAS poses de animación;
// cada monstruo/NPC es una "forma" (cabeza, ropa, extras) + una paleta. Nuevas skins = nueva paleta.
import { getSkin, type CharacterId, type Palette } from '../shared/characters';
import { Anim } from '../shared/protocol';

export const SW = 22; // ancho del sprite (incluye 1px de margen para el contorno)
export const SH = 26;
const OUTLINE = '#0b0710';

// ---------------------------------------------------------------------------
// Buffer de píxeles
// ---------------------------------------------------------------------------
class PB {
  px: (string | null)[] = new Array(SW * SH).fill(null);
  set(x: number, y: number, c: string | null) {
    x = Math.round(x) + 1; y = Math.round(y) + 1;
    if (x < 0 || y < 0 || x >= SW || y >= SH || c === null) return;
    this.px[y * SW + x] = c;
  }
  clear(x: number, y: number) {
    x = Math.round(x) + 1; y = Math.round(y) + 1;
    if (x < 0 || y < 0 || x >= SW || y >= SH) return;
    this.px[y * SW + x] = null;
  }
  get(x: number, y: number) {
    x = Math.round(x) + 1; y = Math.round(y) + 1;
    if (x < 0 || y < 0 || x >= SW || y >= SH) return null;
    return this.px[y * SW + x];
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  outline(color = OUTLINE) {
    const src = this.px.slice();
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      if (src[y * SW + x]) continue;
      const n = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < SW && yy < SH && !!src[yy * SW + xx] && src[yy * SW + xx] !== 'GHOST';
      if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) this.px[y * SW + x] = color;
    }
  }
  toCanvas(alphaMap?: Record<string, number>): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = SW; cv.height = SH;
    const ctx = cv.getContext('2d')!;
    for (let i = 0; i < this.px.length; i++) {
      const c = this.px[i];
      if (!c || c === 'GHOST') continue;
      ctx.globalAlpha = alphaMap?.[c] ?? 1;
      ctx.fillStyle = c;
      ctx.fillRect(i % SW, Math.floor(i / SW), 1, 1);
    }
    return cv;
  }
}

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Poses (esqueleto común)
// ---------------------------------------------------------------------------
export interface Pose {
  by: number; // desplazamiento vertical del cuerpo
  la: number; // ángulo brazo trasero (0 abajo, PI/2 al frente, PI arriba)
  ra: number; // ángulo brazo delantero
  ll: [number, number]; // pierna trasera [dx, levantar]
  rl: [number, number]; // pierna delantera
  lean?: number; // inclinación de cabeza
  mouth?: boolean; // boca abierta
  sway?: number; // para capas, colas...
}

const P = (by: number, la: number, ra: number, ll: [number, number], rl: [number, number], lean = 0, mouth = false, sway = 0): Pose =>
  ({ by, la, ra, ll, rl, lean, mouth, sway });

export interface AnimDef { frames: Pose[]; dur: number; loop: boolean }

export const ANIMS: Record<Anim, AnimDef> = {
  [Anim.Idle]: { dur: 0.45, loop: true, frames: [P(0, 0.1, -0.1, [0, 0], [0, 0]), P(1, 0.15, -0.05, [0, 0], [0, 0], 0, false, 1)] },
  [Anim.Walk]: {
    dur: 0.11, loop: true, frames: [
      P(0, -0.5, 0.5, [2, 0], [-2, 0], 0, false, 1), P(-1, -0.1, 0.1, [1, 1], [-1, 0], 0, false, 2),
      P(0, 0.5, -0.5, [-2, 0], [2, 0], 0, false, 1), P(-1, 0.1, -0.1, [-1, 0], [1, 1], 0, false, 2),
    ],
  },
  [Anim.Attack]: {
    dur: 0.08, loop: false, frames: [
      P(0, -0.3, -1.0, [-1, 0], [1, 0], -1), P(0, 0.3, 1.7, [-2, 0], [2, 0], 1, true, 2), P(0, 0.3, 1.4, [-2, 0], [2, 0], 1, true, 2), P(0, 0.2, 0.9, [-1, 0], [1, 0]),
    ],
  },
  [Anim.Cast]: {
    dur: 0.12, loop: false, frames: [P(0, 1.2, 1.2, [0, 0], [0, 0]), P(-1, 2.7, 2.7, [-1, 0], [1, 0], 0, true, 2), P(-1, 2.9, 2.9, [-1, 0], [1, 0], 0, true, 2), P(0, 2.4, 2.4, [0, 0], [0, 0])],
  },
  [Anim.Wave]: {
    dur: 0.15, loop: true, frames: [P(0, 0.1, 2.8, [0, 0], [0, 0], 0, true), P(0, 0.1, 2.3, [0, 0], [0, 0], 0, true), P(0, 0.1, 2.8, [0, 0], [0, 0], 0, true), P(0, 0.1, 2.3, [0, 0], [0, 0])],
  },
  [Anim.Taunt]: {
    // un bailecito ridículo: salto, señalar, reírse
    dur: 0.13, loop: true, frames: [
      P(-2, 2.8, 2.8, [1, 2], [-1, 2], 0, true, 2), P(0, 0.4, -0.4, [0, 0], [0, 0]), P(-2, -0.6, 2.8, [2, 2], [-2, 0], 1, true, 1),
      P(0, 0.3, 1.6, [0, 0], [0, 0], 1), P(-1, 1.6, 1.6, [-2, 0], [2, 1], -1, true, 2), P(0, 0.6, 0.6, [0, 0], [0, 0], -1, true),
    ],
  },
  [Anim.Hurt]: { dur: 0.1, loop: false, frames: [P(0, -0.8, -0.6, [1, 0], [-1, 0], -1, true)] },
  [Anim.Dead]: { dur: 1, loop: false, frames: [P(0, 0.4, 0.4, [0, 0], [0, 0], 0, true)] },
};

// ---------------------------------------------------------------------------
// Partes del cuerpo comunes
// ---------------------------------------------------------------------------
function arm(b: PB, sx: number, sy: number, ang: number, len: number, color: string, hand: string) {
  const dx = Math.sin(ang), dy = Math.cos(ang);
  for (let i = 0; i <= len; i++) {
    const x = sx + dx * i, y = sy + dy * i;
    const c = i >= len - 1 ? hand : color;
    b.set(x, y, c); b.set(x + 1, y, c);
  }
}

function legs(b: PB, p: Pose, back: string, front: string, shoe: string, top = 17) {
  const leg = (x: number, [dx, lift]: [number, number], c: string) => {
    for (let y = top; y < top + 3; y++) b.rect(x, y, 2, 1, c);
    for (let y = top + 3; y < 22 - lift; y++) b.rect(x + dx, y, 2, 1, c);
    b.rect(x + dx, 22 - lift, 3, 1, shoe);
  };
  leg(8, p.ll, back);
  leg(10, p.rl, front);
}

function torso(b: PB, by: number, main: string, dark: string, top = 10, bottom = 17) {
  b.rect(7, top + by, 6, bottom - top, main);
  b.rect(7, top + by, 1, bottom - top, dark);
}

interface HeadOpts { skin: string; hair: string; eye: string; style: 'short' | 'long' | 'bald' | 'cap' | 'bun' | 'spiky'; glasses?: string; cap?: string }

function humanHead(b: PB, p: Pose, o: HeadOpts) {
  const by = p.by, lx = p.lean ?? 0;
  const X = 6 + lx, Y = 2 + by;
  b.rect(X, Y + 1, 7, 7, o.skin); // cara
  b.set(X + 7, Y + 4, o.skin); // nariz
  b.rect(X, Y + 1, 1, 7, shade(o.skin, -0.18));
  // ojo y ceja
  b.set(X + 5, Y + 3, o.eye);
  b.set(X + 5, Y + 2, shade(o.hair, -0.1));
  // boca
  if (p.mouth) { b.set(X + 5, Y + 6, '#5a0a10'); b.set(X + 6, Y + 6, '#5a0a10'); }
  else b.set(X + 5, Y + 6, shade(o.skin, -0.3));
  switch (o.style) {
    case 'short': b.rect(X, Y, 7, 2, o.hair); b.rect(X, Y + 2, 2, 3, o.hair); break;
    case 'spiky': b.rect(X, Y, 7, 2, o.hair); b.set(X + 1, Y - 1, o.hair); b.set(X + 3, Y - 1, o.hair); b.set(X + 5, Y - 1, o.hair); b.rect(X, Y + 2, 2, 2, o.hair); break;
    case 'long': b.rect(X, Y, 7, 2, o.hair); b.rect(X - 1, Y + 1, 3, 8, o.hair); break;
    case 'bun': b.rect(X, Y, 7, 2, o.hair); b.rect(X - 1, Y - 1, 3, 3, o.hair); b.rect(X, Y + 2, 2, 3, o.hair); break;
    case 'cap': b.rect(X, Y, 7, 2, o.cap ?? '#c03030'); b.rect(X + 6, Y + 1, 3, 1, o.cap ?? '#c03030'); b.rect(X, Y + 2, 2, 2, o.hair); break;
    case 'bald': b.rect(X, Y, 7, 1, shade(o.skin, -0.1)); b.rect(X, Y + 2, 1, 2, o.hair); break;
  }
  if (o.glasses) { b.set(X + 4, Y + 3, o.glasses); b.set(X + 6, Y + 3, o.glasses); b.set(X + 5, Y + 3, o.glasses); }
}

// ---------------------------------------------------------------------------
// Formas de monstruos
// ---------------------------------------------------------------------------
type FormFn = (b: PB, p: Pose, pal: Palette) => void;

const vampire: FormFn = (b, p, c) => {
  const by = p.by, sw = p.sway ?? 0;
  // capa por detrás
  for (let y = 9; y <= 21; y++) {
    const spread = Math.floor((y - 9) / 3);
    const back = 6 - spread - (y > 14 ? sw : 0);
    b.rect(back, y + (y < 17 ? by : 0), 13 - back - 1, 1, c.cloth2);
    b.set(back, y + (y < 17 ? by : 0), c.accent);
  }
  // cuello alto de la capa
  b.rect(5, 6 + by, 2, 5, c.accent); b.rect(5, 5 + by, 1, 2, c.cloth2);
  arm(b, 8, 11 + by, p.la, 5, shade(c.cloth, -0.3), c.skin);
  legs(b, p, shade(c.cloth, -0.35), c.cloth2, '#0a0a0a');
  torso(b, by, c.cloth, c.cloth2);
  b.rect(10, 10 + by, 2, 3, '#e8e8f0'); // camisa
  b.set(10, 13 + by, c.accent); // medallón
  humanHead(b, p, { skin: c.skin, hair: c.hair, eye: c.eye, style: 'short' });
  const X = 6 + (p.lean ?? 0), Y = 2 + by;
  b.set(X + 3, Y + 1, c.hair); b.set(X + 4, Y + 1, c.hair); // pico de viuda
  b.set(X + 5, Y + 7, '#ffffff'); // colmillo
  if (p.mouth) b.set(X + 6, Y + 7, '#ffffff');
  arm(b, 11, 11 + by, p.ra, 5, c.cloth, c.skin);
};

const werewolf: FormFn = (b, p, c) => {
  const by = p.by, sw = p.sway ?? 0;
  // cola
  b.rect(4 - (sw > 1 ? 1 : 0), 14 + by, 3, 2, c.hair); b.rect(3 - sw, 13 + by, 2, 2, shade(c.hair, 0.15));
  arm(b, 8, 11 + by, p.la, 6, shade(c.hair, -0.25), c.accent);
  legs(b, p, shade(c.cloth2, -0.2), c.cloth2, c.hair);
  b.rect(7, 10 + by, 7, 7, c.cloth); b.rect(7, 10 + by, 1, 7, shade(c.cloth, -0.3));
  b.rect(10, 10 + by, 3, 4, c.hair); // pecho peludo
  b.clear(13, 15 + by); b.clear(7, 16 + by); // camisa rota
  b.set(12, 16 + by, c.hair);
  const X = 6 + (p.lean ?? 0), Y = 2 + by;
  b.rect(X, Y + 1, 7, 7, c.hair);
  b.rect(X, Y + 1, 1, 7, shade(c.hair, -0.25));
  b.rect(X + 5, Y + 4, 4, 3, shade(c.hair, 0.15)); // hocico
  b.set(X + 8, Y + 4, '#141014'); // nariz
  b.set(X + 4, Y + 3, c.eye); b.set(X + 5, Y + 2, shade(c.hair, -0.4));
  b.set(X + 1, Y - 1, c.hair); b.set(X + 1, Y, c.hair); b.set(X + 2, Y, c.hair); // oreja
  b.set(X + 4, Y - 1, c.hair); b.set(X + 4, Y, c.hair); b.set(X + 3, Y, c.hair);
  b.set(X + 6, Y + 7, '#ffffff'); b.set(X + 8, Y + 7, '#ffffff');
  if (p.mouth) { b.rect(X + 6, Y + 6, 3, 1, '#5a0a10'); b.set(X + 7, Y + 7, '#ffffff'); }
  arm(b, 11, 11 + by, p.ra, 6, c.hair, c.accent);
};

const mummy: FormFn = (b, p, c) => {
  const by = p.by, sw = p.sway ?? 0;
  const band = (y: number) => (y % 2 === 0 ? c.cloth : c.cloth2);
  // venda suelta
  for (let i = 0; i < 4; i++) b.set(6 - i - sw, 13 + by + (i % 2), c.hair);
  arm(b, 8, 11 + by, p.la, 5, c.cloth2, c.cloth2);
  // piernas vendadas
  const leg = (x: number, [dx, lift]: [number, number]) => {
    for (let y = 17; y < 22 - lift; y++) b.rect(x + (y >= 20 ? dx : 0), y, 2, 1, band(y));
    b.rect(x + dx, 22 - lift, 2, 1, c.cloth2);
  };
  leg(8, p.ll); leg(10, p.rl);
  for (let y = 10; y < 17; y++) b.rect(7, y + by, 6, 1, band(y));
  b.set(8, 12 + by, c.accent); b.set(11, 14 + by, c.accent); // amuletos
  const X = 6 + (p.lean ?? 0), Y = 2 + by;
  for (let y = 0; y < 8; y++) b.rect(X, Y + y, 7, 1, band(y));
  b.set(X + 7, Y + 4, c.cloth);
  b.rect(X + 3, Y + 3, 4, 1, c.skin); // rendija de los ojos
  b.set(X + 5, Y + 3, c.eye);
  if (p.mouth) b.rect(X + 4, Y + 6, 3, 1, c.skin);
  arm(b, 11, 11 + by, p.ra, 5, c.cloth, c.cloth);
};

const invisible: FormFn = (b, p, c) => {
  const by = p.by;
  // sin cuerpo: solo ropa flotante. 'GHOST' marca huecos que no dibujan contorno.
  arm(b, 8, 11 + by, p.la, 5, shade(c.cloth, -0.3), c.skin);
  const shoe = c.accent;
  b.rect(8 + p.ll[0], 22 - p.ll[1], 3, 1, shoe);
  b.rect(10 + p.rl[0], 22 - p.rl[1], 3, 1, shoe);
  // abrigo largo con falda
  b.rect(7, 10 + by, 6, 7, c.cloth); b.rect(7, 10 + by, 1, 7, c.cloth2);
  b.rect(6, 17, 8, 3, c.cloth); b.rect(6, 17, 1, 3, c.cloth2);
  b.rect(8, 10 + by, 4, 2, c.hair); // bufanda
  b.set(12, 12 + by, c.hair); b.set(13, 13 + by, c.hair);
  const X = 6 + (p.lean ?? 0), Y = 2 + by;
  // sombrero de ala ancha + velo
  b.rect(X - 1, Y + 1, 10, 1, c.cloth2);
  b.rect(X + 1, Y - 1, 6, 2, c.cloth2);
  b.rect(X + 1, Y, 6, 1, c.accent === '#202020' ? '#8a2a3a' : c.accent); // cinta
  // gafas flotando
  b.rect(X + 3, Y + 4, 2, 1, '#101018'); b.rect(X + 6, Y + 4, 2, 1, '#101018'); b.set(X + 5, Y + 4, '#606070');
  b.set(X + 4, Y + 4, c.eye);
  if (p.mouth) b.rect(X + 5, Y + 6, 2, 1, '#c03050'); // carmín
  arm(b, 11, 11 + by, p.ra, 5, c.cloth, c.skin);
};

export const FORMS: Record<CharacterId, FormFn> = { vampire, werewolf, mummy, invisible };

// ---------------------------------------------------------------------------
// Humanos y Helsing
// ---------------------------------------------------------------------------
const SKIN_TONES = ['#f2c8a0', '#d9a07a', '#a8704a', '#6e4630', '#e8b890'];
const HAIR = ['#2a1a10', '#6a3a1a', '#d8b050', '#1a1a1a', '#a03a20', '#808080'];

interface NpcLook { top: string; top2: string; legs: string; shoe: string; style: HeadOpts['style']; glasses?: string; cap?: string; extra?: (b: PB, p: Pose) => void }

const NPC_LOOKS: Record<string, NpcLook[]> = {
  teen: [{ top: '#c03040', top2: '#f0f0f0', legs: '#3050a0', shoe: '#f0f0f0', style: 'long' }, { top: '#e0a020', top2: '#804010', legs: '#3a3a50', shoe: '#202020', style: 'spiky' }],
  neighbor: [{ top: '#a0c0e0', top2: '#7090b0', legs: '#a0c0e0', shoe: '#c08080', style: 'bun' }, { top: '#8a6a4a', top2: '#5a4a3a', legs: '#404040', shoe: '#202020', style: 'bald' }],
  jock: [{ top: '#20a040', top2: '#f0f0f0', legs: '#e0e0e0', shoe: '#f0f0f0', style: 'short' }, { top: '#3040c0', top2: '#e0c020', legs: '#303030', shoe: '#e0e0e0', style: 'cap', cap: '#3040c0' }],
  nerd: [{ top: '#6a8a3a', top2: '#f0e8d0', legs: '#6a5a40', shoe: '#3a2a1a', style: 'short', glasses: '#202020' }],
  villager: [{ top: '#7a5a3a', top2: '#c0a070', legs: '#4a3a2a', shoe: '#2a1a10', style: 'short' }, { top: '#8a3030', top2: '#e0d0b0', legs: '#4a3a2a', shoe: '#2a1a10', style: 'long' }],
  priest: [{ top: '#18181e', top2: '#ffffff', legs: '#18181e', shoe: '#101010', style: 'bald' }],
  maid: [{ top: '#202030', top2: '#f0f0f0', legs: '#202030', shoe: '#101010', style: 'bun' }],
  camper: [{ top: '#e07020', top2: '#ffffff', legs: '#5a7a3a', shoe: '#6a4a2a', style: 'cap', cap: '#2a5a2a' }, { top: '#e07020', top2: '#ffffff', legs: '#3a5a8a', shoe: '#f0f0f0', style: 'long' }],
  counselor: [{ top: '#c02020', top2: '#ffffff', legs: '#e0d0a0', shoe: '#f0f0f0', style: 'short' }],
};

function drawNpc(b: PB, p: Pose, variant: string, seed: number) {
  const looks = NPC_LOOKS[variant] ?? NPC_LOOKS.teen;
  const L = looks[seed % looks.length];
  const skin = SKIN_TONES[seed % SKIN_TONES.length];
  const hair = HAIR[(seed >> 3) % HAIR.length];
  const by = p.by;
  arm(b, 8, 11 + by, p.la, 4, shade(L.top, -0.3), skin);
  legs(b, p, shade(L.legs, -0.25), L.legs, L.shoe);
  torso(b, by, L.top, shade(L.top, -0.3));
  if (variant === 'priest') b.set(11, 10 + by, '#ffffff');
  else if (variant === 'maid') b.rect(9, 12 + by, 3, 5, L.top2);
  else if (variant === 'counselor') { b.set(11, 12 + by, '#e0e0e0'); b.set(11, 11 + by, '#909090'); }
  else b.rect(10, 12 + by, 2, 1, L.top2);
  humanHead(b, p, { skin, hair, eye: '#1a1a1a', style: L.style, glasses: L.glasses, cap: L.cap });
  arm(b, 11, 11 + by, p.ra, 4, L.top, skin);
}

function drawHelsing(b: PB, p: Pose) {
  const by = p.by;
  const coat = '#5a4030', coat2 = '#3a2a20', skin = '#d8a880', hat = '#2a2020';
  arm(b, 8, 11 + by, p.la, 5, shade(coat, -0.3), '#3a2a20');
  legs(b, p, '#2a2a30', '#34343c', '#141414', 18);
  // abrigo largo
  b.rect(6, 10 + by, 8, 9, coat); b.rect(6, 10 + by, 1, 9, coat2);
  b.rect(6, 19, 3, 1, coat2); b.rect(11, 19, 3, 1, coat2);
  b.rect(9, 10 + by, 2, 7, '#c8b8a0'); // camisa
  b.rect(7, 14 + by, 7, 1, '#2a1a10'); b.set(10, 14 + by, '#c0c0c0'); // cinturón
  b.set(8, 12 + by, '#d0d0d0'); b.set(8, 11 + by, '#d0d0d0'); b.set(7, 12 + by, '#d0d0d0'); b.set(9, 12 + by, '#d0d0d0'); // cruz
  humanHead(b, p, { skin, hair: '#4a3020', eye: '#1a1a1a', style: 'short' });
  const X = 6 + (p.lean ?? 0), Y = 2 + by;
  b.rect(X + 2, Y + 5, 5, 3, '#4a3020'); b.set(X + 5, Y + 6, '#6a2020'); // barba
  b.rect(X - 2, Y + 1, 12, 1, hat); b.rect(X, Y - 2, 7, 3, hat); b.rect(X, Y, 7, 1, '#6a1a1a');
  // ballesta en la mano delantera
  const dx = Math.sin(p.ra), dy = Math.cos(p.ra);
  const hx = 11 + dx * 5, hy = 11 + by + dy * 5;
  arm(b, 11, 11 + by, p.ra, 5, coat, '#3a2a20');
  b.rect(hx, hy - 1, 5, 1, '#6a4020'); b.set(hx + 5, hy - 1, '#c0c0d0');
  b.rect(hx + 2, hy - 3, 1, 5, '#3a2a1a');
}

// ---------------------------------------------------------------------------
// Caché de frames
// ---------------------------------------------------------------------------
const cache = new Map<string, HTMLCanvasElement>();

export function frameCount(a: Anim) { return ANIMS[a].frames.length; }

export function getFrame(kind: 'monster' | 'npc' | 'helsing', variant: string, skin: string, anim: Anim, frame: number, seed = 0): HTMLCanvasElement {
  const key = `${kind}|${variant}|${skin}|${anim}|${frame}|${kind === 'npc' ? seed % 60 : 0}`;
  let cv = cache.get(key);
  if (cv) return cv;
  const pose = ANIMS[anim].frames[frame % ANIMS[anim].frames.length];
  const b = new PB();
  if (kind === 'monster') {
    const ch = variant as CharacterId;
    FORMS[ch](b, pose, getSkin(ch, skin).palette);
  } else if (kind === 'helsing') drawHelsing(b, pose);
  else drawNpc(b, pose, variant, seed % 60);
  b.outline(kind === 'monster' && variant === 'invisible' ? 'rgba(10,7,16,0.55)' : OUTLINE);
  cv = b.toCanvas();
  cache.set(key, cv);
  return cv;
}

// ---------------------------------------------------------------------------
// Objetos pequeños: power-ups, proyectiles
// ---------------------------------------------------------------------------
type Art = string[];
const ITEM_ART: Record<string, { art: Art; pal: Record<string, string> }> = {
  blood: { art: ['....oo....', '....ww....', '...owwo...', '..orrrro..', '.orrRrrro.', '.orRRrrro.', '.orrrrrro.', '..orrrro..', '...oooo...'], pal: { o: OUTLINE, w: '#d0d0e0', r: '#c01020', R: '#ff5060' } },
  speed: { art: ['.....oo...', '....oyo...', '...oyyo...', '..oyyyooo.', '.oyyyyyyo.', '.ooooyyo..', '....oyo...', '...oyo....', '...oo.....'], pal: { o: OUTLINE, y: '#ffe040' } },
  fury: { art: ['..oooooo..', '.orrrrrro.', 'orrrrrrrro', 'orkkrrkkro', 'orkkrrkkro', 'orrrrrrrro', '.orrkkrro.', '..orrrro..', '..owowwo..'], pal: { o: OUTLINE, r: '#e03020', k: '#200808', w: '#f0f0f0' } },
  shield: { art: ['.oooooooo.', 'obbbwwbbbo', 'obbbwwbbbo', 'obwwwwwwbo', 'obbbwwbbbo', '.obbwwbbo.', '.obbbbbbo.', '..obbbbo..', '...oooo...'], pal: { o: OUTLINE, b: '#3060d0', w: '#f0f0f0' } },
  coin: { art: ['...oooo...', '..oyyyyo..', '.oyYyyyyo.', '.oyYyooyo.', '.oyYyyyyo.', '.oyYyooyo.', '.oyyyyyyo.', '..oyyyyo..', '...oooo...'], pal: { o: OUTLINE, y: '#e0a020', Y: '#fff080' } },
  xp: { art: ['....oo....', '...oppo...', '..oppPpo..', '.oppPPPpo.', '.opPPWPpo.', '.oppPPPpo.', '..opppPo..', '...oppo...', '....oo....'], pal: { o: OUTLINE, p: '#7030c0', P: '#b070ff', W: '#ffffff' } },
  bat0: { art: ['o.......o', 'ko.ooo.ok', 'kkokkkokk', '.kkkrkkk.', '..o.k.o..'], pal: { o: OUTLINE, k: '#2a1a3a', r: '#ff2040' } },
  bat1: { art: ['...ooo...', '..okkko..', '.kkkrkkk.', 'kko.k.okk', 'o.......o'], pal: { o: OUTLINE, k: '#2a1a3a', r: '#ff2040' } },
  bandage: { art: ['.oooooo.', 'owwcwwco', 'ocwwcwwo', '.oooooo.'], pal: { o: OUTLINE, w: '#e8dcb0', c: '#b0a070' } },
  bolt: { art: ['......o.', 'ooooooso', 'bbbbbbss', 'ooooooso', '......o.'], pal: { o: OUTLINE, b: '#8a5a2a', s: '#d8d8e8' } },
};

const itemCache = new Map<string, HTMLCanvasElement>();
export function getItem(id: string): HTMLCanvasElement {
  let cv = itemCache.get(id);
  if (cv) return cv;
  const def = ITEM_ART[id] ?? ITEM_ART.xp;
  cv = document.createElement('canvas');
  cv.width = def.art[0].length; cv.height = def.art.length;
  const ctx = cv.getContext('2d')!;
  def.art.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    ctx.fillStyle = def.pal[ch] ?? '#ff00ff';
    ctx.fillRect(x, y, 1, 1);
  }));
  itemCache.set(id, cv);
  return cv;
}
