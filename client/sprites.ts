// Generador procedural de sprites pixel art (24x32).
// Todos los personajes comparten el MISMO esqueleto y las MISMAS poses de animación;
// cada monstruo/NPC es una "forma" (cabeza, ropa, extras) + una paleta. Nueva skin = nueva paleta.
// El post-proceso (pixel.ts) añade sombreado, contorno coloreado y brillos emisivos.
import { getSkin, type CharacterId, type Palette } from '../shared/characters';
import { Anim } from '../shared/protocol';
import { PB, shade, mix, type Baked } from './pixel';

export const IW = 24; // tamaño interno del personaje
export const IH = 32;
export const SW = IW + 2; // con margen de 1 px para el contorno
export const SH = IH + 2;
export { shade };

// ---------------------------------------------------------------------------
// Poses (esqueleto común)
// ---------------------------------------------------------------------------
export interface Pose {
  by: number; // desplazamiento vertical del cuerpo
  la: number; // ángulo brazo trasero (0 abajo, PI/2 al frente, PI arriba)
  ra: number; // ángulo brazo delantero
  ll: [number, number]; // pierna trasera [dx, levantar]
  rl: [number, number]; // pierna delantera
  lean?: number; // inclinación de la cabeza
  mouth?: boolean; // boca abierta
  sway?: number; // para capas, colas, bufandas...
  blink?: boolean;
}

const P = (by: number, la: number, ra: number, ll: [number, number], rl: [number, number], lean = 0, mouth = false, sway = 0, blink = false): Pose =>
  ({ by, la, ra, ll, rl, lean, mouth, sway, blink });

export interface AnimDef { frames: Pose[]; dur: number; loop: boolean }

export const ANIMS: Record<Anim, AnimDef> = {
  [Anim.Idle]: {
    dur: 0.38, loop: true, frames: [
      P(0, 0.12, -0.08, [0, 0], [0, 0], 0, false, 0), P(0, 0.14, -0.06, [0, 0], [0, 0], 0, false, 1),
      P(1, 0.18, -0.02, [0, 0], [0, 0], 0, false, 1), P(1, 0.16, -0.04, [0, 0], [0, 0], 0, false, 0),
      P(0, 0.12, -0.08, [0, 0], [0, 0], 0, false, 0), P(0, 0.12, -0.08, [0, 0], [0, 0], 0, false, 1, true),
    ],
  },
  [Anim.Walk]: {
    dur: 0.1, loop: true, frames: [
      P(0, -0.55, 0.55, [3, 0], [-3, 0], 0, false, 1), P(-1, -0.25, 0.25, [1, 1], [-1, 0], 0, false, 2),
      P(-1, 0.1, -0.1, [-1, 2], [1, 0], 0, false, 2), P(0, 0.55, -0.55, [-3, 0], [3, 0], 0, false, 1),
      P(-1, 0.25, -0.25, [-1, 0], [1, 1], 0, false, 2), P(-1, -0.1, 0.1, [1, 0], [-1, 2], 0, false, 2),
    ],
  },
  [Anim.Attack]: {
    dur: 0.07, loop: false, frames: [
      P(0, -0.3, -1.1, [-1, 0], [1, 0], -1), P(0, 0.2, -1.6, [-1, 0], [1, 0], -1, true),
      P(0, 0.4, 1.8, [-3, 0], [3, 0], 1, true, 2), P(0, 0.4, 1.6, [-3, 0], [3, 0], 1, true, 2), P(0, 0.3, 1.0, [-1, 0], [1, 0]),
    ],
  },
  [Anim.Cast]: {
    dur: 0.1, loop: false, frames: [P(0, 1.2, 1.2, [0, 0], [0, 0]), P(-1, 2.6, 2.6, [-1, 0], [1, 0], 0, true, 2), P(-2, 2.95, 2.95, [-1, 1], [1, 1], 0, true, 2), P(-1, 2.8, 2.8, [-1, 0], [1, 0], 0, true, 1), P(0, 2.2, 2.2, [0, 0], [0, 0])],
  },
  [Anim.Wave]: {
    dur: 0.14, loop: true, frames: [P(0, 0.1, 2.9, [0, 0], [0, 0], 0, true), P(0, 0.1, 2.4, [0, 0], [0, 0], 0, true), P(0, 0.1, 2.9, [0, 0], [0, 0], 0, true), P(0, 0.1, 2.4, [0, 0], [0, 0])],
  },
  [Anim.Taunt]: {
    // bailecito: salto, señalar, reírse, contonearse
    dur: 0.12, loop: true, frames: [
      P(-3, 2.9, 2.9, [1, 3], [-1, 3], 0, true, 2), P(0, 0.5, -0.5, [0, 0], [0, 0]), P(-2, -0.7, 2.9, [3, 2], [-3, 0], 1, true, 1),
      P(0, 0.3, 1.7, [0, 0], [0, 0], 1), P(-1, 1.7, 1.7, [-3, 0], [3, 2], -1, true, 2), P(0, 0.7, 0.7, [0, 0], [0, 0], -1, true),
      P(-1, 2.2, -0.4, [2, 0], [-2, 1], 1, true, 1), P(0, -0.4, 2.2, [-2, 1], [2, 0], -1, true, 2),
    ],
  },
  [Anim.Hurt]: { dur: 0.1, loop: false, frames: [P(0, -0.9, -0.7, [1, 0], [-1, 0], -1, true)] },
  [Anim.Dead]: { dur: 1, loop: false, frames: [P(0, 0.5, 0.5, [0, 0], [0, 0], 0, true, 0, true)] },
};

// ---------------------------------------------------------------------------
// Partes del cuerpo comunes (coordenadas internas, mirando a la derecha)
// ---------------------------------------------------------------------------
const FLOOR = 31;
const HIP = 21;

function arm(b: PB, sx: number, sy: number, ang: number, len: number, sleeve: string, hand: string, handLen = 2, glove = false) {
  const dx = Math.sin(ang), dy = Math.cos(ang);
  const thickX = Math.abs(dy) > 0.5;
  for (let i = 0; i <= len; i++) {
    const x = sx + dx * i, y = sy + dy * i;
    const c = i > len - handLen ? hand : sleeve;
    b.set(x, y, c); b.set(thickX ? x + 1 : x, thickX ? y : y + 1, c);
  }
  if (glove) b.set(sx + dx * (len + 1), sy + dy * (len + 1), hand);
}

function legs(b: PB, p: Pose, back: string, front: string, shoe: string, opts: { width?: number; top?: number; boots?: string } = {}) {
  const w = opts.width ?? 3, top = opts.top ?? HIP;
  const leg = (x: number, [dx, lift]: [number, number], c: string) => {
    const knee = top + 4;
    for (let y = top; y < knee; y++) b.rect(x + Math.round(dx / 3), y, w, 1, c);
    for (let y = knee; y < FLOOR - 1 - lift; y++) b.rect(x + dx, y, w, 1, opts.boots && y > FLOOR - 5 ? opts.boots : c);
    b.rect(x + dx, FLOOR - 1 - lift, w + 1, 2, shoe);
    b.set(x + dx + w, FLOOR - 1 - lift, shade(shoe, 0.3), false, true); // brillo puntera
  };
  leg(9, p.ll, back);
  leg(12, p.rl, front);
}

function torso(b: PB, by: number, main: string, opts: { top?: number; bottom?: number; x?: number; w?: number } = {}) {
  const top = opts.top ?? 12, bottom = opts.bottom ?? HIP, x = opts.x ?? 8, w = opts.w ?? 8;
  b.rect(x, top + by, w, bottom - top + (by < 0 ? -by : 0), main);
  b.clear(x, top + by); b.clear(x + w - 1, top + by); // hombros redondeados
}

type HairStyle = 'short' | 'long' | 'bald' | 'cap' | 'bun' | 'spiky' | 'ponytail' | 'afro' | 'mohawk' | 'beanie' | 'pigtails' | 'slick';

interface HeadOpts { skin: string; hair: string; eye: string; style: HairStyle; glasses?: string; cap?: string; eyeGlow?: boolean; beard?: string }

/** Cabeza humana (10x10) en x 7..16, y 2..11. */
function humanHead(b: PB, p: Pose, o: HeadOpts) {
  const X = 7 + (p.lean ?? 0), Y = 2 + p.by;
  // cráneo con esquinas redondeadas
  b.rect(X + 1, Y + 1, 8, 9, o.skin);
  b.rect(X, Y + 2, 10, 6, o.skin);
  b.rect(X + 2, Y + 10, 6, 1, o.skin); // barbilla
  b.set(X + 10, Y + 5, o.skin); b.set(X + 10, Y + 6, o.skin); // nariz
  // oreja
  b.rect(X + 3, Y + 5, 2, 2, shade(o.skin, -0.15)); b.set(X + 3, Y + 6, shade(o.skin, -0.3));
  // ojo y ceja
  if (p.blink) b.rect(X + 6, Y + 5, 2, 1, shade(o.skin, -0.45));
  else {
    b.set(X + 6, Y + 5, o.eyeGlow ? o.eye : '#f4f0e8', !!o.eyeGlow, true);
    b.set(X + 7, Y + 5, o.eyeGlow ? shade(o.eye, 0.3) : o.eye, !!o.eyeGlow, true);
  }
  b.rect(X + 6, Y + 4, 3, 1, shade(o.hair, -0.15));
  // boca
  if (p.mouth) { b.rect(X + 7, Y + 8, 2, 1, '#4a0a12'); b.set(X + 8, Y + 9, '#4a0a12'); }
  else b.rect(X + 7, Y + 8, 2, 1, shade(o.skin, -0.35));
  b.set(X + 9, Y + 4, shade(o.skin, 0.2), false, true); // brillo frente
  const H = o.hair, H2 = shade(o.hair, 0.25);
  switch (o.style) {
    case 'short': b.rect(X + 1, Y, 8, 2, H); b.rect(X, Y + 1, 3, 4, H); b.rect(X + 1, Y + 2, 6, 1, H); b.set(X + 4, Y, H2); break;
    case 'slick': b.rect(X + 1, Y, 8, 2, H); b.rect(X, Y + 1, 4, 6, H); b.rect(X + 1, Y + 2, 5, 1, H); b.set(X + 6, Y + 2, H); b.set(X + 6, Y + 3, H); b.line(X + 2, Y, X + 6, Y, H2); break;
    case 'spiky': b.rect(X + 1, Y, 8, 2, H); for (const sx of [1, 3, 5, 7]) b.set(X + sx, Y - 1, H); b.rect(X, Y + 1, 3, 4, H); b.set(X + 3, Y - 1, H2); break;
    case 'long': b.rect(X + 1, Y, 8, 2, H); b.rect(X - 1, Y + 1, 4, 11, H); b.rect(X + 1, Y + 2, 6, 1, H); b.line(X, Y + 3, X, Y + 10, H2); break;
    case 'ponytail': b.rect(X + 1, Y, 8, 2, H); b.rect(X, Y + 1, 3, 4, H); b.rect(X - 2, Y + 3, 2, 6, H); b.set(X - 1, Y + 2, '#c03050'); break;
    case 'pigtails': b.rect(X + 1, Y, 8, 2, H); b.rect(X, Y + 1, 3, 4, H); b.rect(X - 2, Y + 5, 2, 4, H); b.rect(X + 5, Y + 9, 2, 3, H); break;
    case 'bun': b.rect(X + 1, Y, 8, 2, H); b.rect(X - 1, Y - 2, 4, 4, H); b.rect(X, Y + 2, 3, 4, H); b.set(X, Y - 1, H2); break;
    case 'afro': b.ellipse(X + 4, Y + 2, 6, 4, H); b.rect(X - 1, Y + 2, 4, 5, H); b.set(X + 2, Y - 1, H2); b.set(X + 6, Y, H2); break;
    case 'mohawk': b.rect(X + 2, Y - 2, 5, 3, H); b.rect(X, Y + 2, 2, 3, shade(H, -0.4)); b.set(X + 3, Y - 2, H2); break;
    case 'beanie': b.rect(X, Y - 1, 10, 4, o.cap ?? '#3a5aa0'); b.rect(X, Y + 2, 10, 1, shade(o.cap ?? '#3a5aa0', 0.2)); b.set(X + 4, Y - 2, '#f0f0f0'); b.rect(X, Y + 3, 3, 2, H); break;
    case 'cap': b.rect(X, Y - 1, 9, 3, o.cap ?? '#c03030'); b.rect(X + 8, Y + 1, 4, 1, shade(o.cap ?? '#c03030', -0.2)); b.rect(X, Y + 2, 3, 3, H); break;
    case 'bald': b.rect(X + 1, Y + 3, 3, 3, H); b.set(X + 6, Y + 1, shade(o.skin, 0.3), false, true); break;
  }
  if (o.beard) { b.rect(X + 3, Y + 7, 6, 3, o.beard); b.rect(X + 4, Y + 10, 4, 1, o.beard); b.set(X + 8, Y + 8, '#4a0a12'); }
  if (o.glasses) { b.rect(X + 5, Y + 5, 3, 1, o.glasses); b.set(X + 6, Y + 5, '#c0e0ff', false, true); b.rect(X + 3, Y + 5, 2, 1, o.glasses); }
}

/** Textura de pelaje/ruido sobre una zona ya pintada. */
function texture(b: PB, x0: number, y0: number, w: number, h: number, c: string, density: number, seed: number) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
    if (n - Math.floor(n) < density && b.get(x, y)) b.set(x, y, c);
  }
}

// ---------------------------------------------------------------------------
// Formas de monstruos
// ---------------------------------------------------------------------------
type FormFn = (b: PB, p: Pose, pal: Palette, anim: Anim, tier: number) => void;

const vampire: FormFn = (b, p, c, _anim, tier) => {
  const by = p.by, sw = p.sway ?? 0;
  // capa por detrás (con forro y bajo festoneado)
  for (let y = 11; y <= 29; y++) {
    const yy = y + (y < HIP ? by : 0);
    const back = 8 - Math.floor((y - 11) / 2.6) - (y > 18 ? sw : 0);
    const front = 15;
    if (y === 29 && (back + y) % 3 === 0) continue;
    b.rect(back, yy, front - back, 1, c.cloth2);
    b.set(back, yy, c.accent); b.set(back + 1, yy, shade(c.accent, -0.3));
  }
  // cuello alto
  b.rect(5, 5 + by, 2, 8, c.cloth2); b.rect(7, 6 + by, 1, 7, c.accent); b.set(5, 4 + by, c.cloth2); b.set(4, 4 + by, c.cloth2);
  arm(b, 10, 13 + by, p.la, 7, shade(c.cloth, -0.25), c.skin);
  legs(b, p, shade(c.cloth2, -0.2), c.cloth2, '#0c0a10');
  torso(b, by, c.cloth);
  b.rect(13, 12 + by, 2, 6, '#e8e4f0'); b.set(14, 13 + by, '#ffffff', false, true); // camisa y chorrera
  b.rect(12, 12 + by, 1, 7, shade(c.cloth, -0.3)); // solapa
  b.set(13, 17 + by, c.accent, true); // medallón brillante
  if (tier >= 2) { b.set(14, 17 + by, c.accent, true); b.set(13, 18 + by, shade(c.accent, 0.3), true); } // medallón mayor
  if (tier >= 2) for (let y = 24; y <= 28; y += 2) b.set(8 - Math.floor((y - 11) / 2.6) - sw, y, shade(c.accent, 0.25), true); // forro encendido
  b.rect(8, 19 + by, 8, 1, shade(c.cloth, -0.35)); // faldón
  humanHead(b, p, { skin: c.skin, hair: c.hair, eye: c.eye, style: 'slick', eyeGlow: true });
  const X = 7 + (p.lean ?? 0), Y = 2 + by;
  b.set(X + 6, Y + 2, c.hair); b.set(X + 6, Y + 3, c.hair); // pico de viuda
  b.set(X + 3, Y + 4, c.skin); b.set(X + 3, Y + 3, c.skin); // oreja puntiaguda
  b.set(X + 6, Y + 6, shade(c.skin, -0.25)); // ojeras
  b.set(X + 8, Y + 9, '#ffffff', false, true); // colmillo
  if (p.mouth) b.set(X + 7, Y + 9, '#ffffff', false, true);
  if (tier >= 1 && !p.blink) { b.set(X + 7, Y + 5, shade(c.eye, 0.35), true); b.set(X + 8, Y + 5, c.eye, true); } // mirada más intensa
  if (tier >= 3) { b.set(5, 3 + by, c.accent, true); b.set(4, 3 + by, c.accent, true); } // puntas del cuello encendidas
  arm(b, 13, 13 + by, p.ra, 7, c.cloth, c.skin);
};

const werewolf: FormFn = (b, p, c, _anim, tier) => {
  const by = p.by, sw = p.sway ?? 0;
  const fur = c.hair, furL = shade(c.hair, 0.22), furD = shade(c.hair, -0.3);
  // cola peluda
  b.ellipse(6 - sw, 20 + by, 2, 2, fur); b.rect(3 - sw, 18 + by, 3, 3, fur); b.set(2 - sw * 2, 17 + by, furL); b.set(3 - sw, 18 + by, furL);
  arm(b, 10, 13 + by, p.la, 8, furD, furD, 3);
  b.set(10 + Math.sin(p.la) * 9, 13 + by + Math.cos(p.la) * 9, c.accent, false, true);
  // piernas: pantalón roto + patas
  legs(b, p, shade(c.cloth2, -0.2), c.cloth2, fur, { boots: fur });
  // torso ancho, camisa abierta, pecho peludo
  torso(b, by, c.cloth, { x: 7, w: 10 });
  b.rect(11, 12 + by, 4, 7, furL); b.rect(12, 18 + by, 2, 2, furL);
  texture(b, 7, 12 + by, 10, 9, furD, 0.1, 3);
  b.clear(16, 19 + by); b.clear(7, 20 + by); b.set(16, 20 + by, fur);
  // melena
  b.rect(6, 7 + by, 4, 7, furD);
  // cabeza de lobo
  const X = 7 + (p.lean ?? 0), Y = 2 + by;
  b.rect(X + 1, Y + 1, 8, 9, fur); b.rect(X, Y + 2, 10, 6, fur);
  b.rect(X + 7, Y + 5, 5, 4, furL); b.rect(X + 8, Y + 9, 3, 1, furL); // hocico
  b.set(X + 12, Y + 5, '#141014', false, true); b.set(X + 11, Y + 5, '#141014'); // nariz
  b.rect(X + 1, Y - 2, 2, 3, fur); b.set(X + 1, Y - 3, fur); b.set(X + 2, Y - 1, '#c08080'); // oreja trasera
  b.rect(X + 4, Y - 2, 2, 3, fur); b.set(X + 5, Y - 3, fur); b.set(X + 4, Y - 1, '#c08080'); // oreja
  b.rect(X + 5, Y + 3, 3, 1, furD); // ceño
  if (!p.blink) { b.set(X + 6, Y + 4, c.eye, true); b.set(X + 7, Y + 4, shade(c.eye, 0.4), true); if (tier >= 1) b.set(X + 5, Y + 4, shade(c.eye, -0.2), true); }
  if (tier >= 3) { b.set(X + 1, Y - 4, fur); b.set(X + 4, Y - 4, fur); for (const [dx, dy] of [[-1, 6], [0, 9], [-1, 11]]) b.set(6 + dx, dy + by, '#c8e0ff', true); } // melena lunar
  b.rect(X + 8, Y + 8, 4, 1, '#3a0a10');
  b.set(X + 9, Y + 9, '#ffffff', false, true); b.set(X + 11, Y + 9, '#ffffff', false, true); b.set(X + 10, Y + 7, '#ffffff', false, true);
  if (p.mouth) { b.rect(X + 8, Y + 8, 4, 2, '#5a0a14'); b.set(X + 9, Y + 8, '#ffffff', false, true); b.set(X + 11, Y + 10, '#ffffff', false, true); }
  texture(b, X, Y, 10, 6, furD, 0.12, 9);
  arm(b, 13, 13 + by, p.ra, 8, fur, fur, 3);
  const hx = 13 + Math.sin(p.ra) * 9, hy = 13 + by + Math.cos(p.ra) * 9;
  const clawGlow = tier >= 2;
  b.set(hx, hy, clawGlow ? '#d8f0ff' : c.accent, clawGlow, true); b.set(hx + 1, hy, clawGlow ? '#d8f0ff' : c.accent, clawGlow, true);
  if (clawGlow) b.set(10 + Math.sin(p.la) * 9, 13 + by + Math.cos(p.la) * 9, '#d8f0ff', true);
};

const mummy: FormFn = (b, p, c, anim, tier) => {
  // pose clásica de momia: brazos al frente al andar/parado
  if (anim === Anim.Idle || anim === Anim.Walk) p = { ...p, la: 1.45 + p.la * 0.15, ra: 1.5 + p.ra * 0.15 };
  const by = p.by, sw = p.sway ?? 0;
  const band = (x: number, y: number) => (((x + y * 2) % 5) < 2 ? c.cloth2 : c.cloth);
  const wrap = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (b.get(x, y)) b.set(x, y, band(x, y));
  };
  // vendas sueltas
  b.line(8, 16 + by, 4 - sw, 19 + by + sw, c.hair); b.line(9, 21, 6 - sw, 26, c.hair);
  arm(b, 10, 13 + by, p.la, 7, c.cloth, c.cloth);
  wrap(4, 10, 20, 12);
  legs(b, p, c.cloth2, c.cloth, c.cloth2);
  wrap(6, HIP, 14, 11);
  torso(b, by, c.cloth);
  wrap(8, 12 + by, 8, 10);
  b.rect(12, 14 + by, 2, 2, c.accent, tier >= 2); b.set(12, 14 + by, shade(c.accent, 0.4), tier >= 2, true); // escarabajo
  const X = 7 + (p.lean ?? 0), Y = 2 + by;
  b.rect(X + 1, Y, 8, 10, c.cloth); b.rect(X, Y + 2, 10, 6, c.cloth); b.set(X + 10, Y + 5, c.cloth);
  wrap(X, Y, 11, 10);
  b.rect(X + 4, Y + 4, 6, 2, c.skin); // rendija oscura
  if (!p.blink) { b.set(X + 7, Y + 4, c.eye, true); b.set(X + 7, Y + 5, shade(c.eye, -0.3), true); if (tier >= 1) b.set(X + 8, Y + 4, shade(c.eye, 0.3), true); }
  if (p.mouth) b.rect(X + 6, Y + 8, 3, 1, c.skin);
  if (tier >= 2) b.rect(X, Y + 1, 10, 1, '#d8b040'); // diadema de faraón
  if (tier >= 3) for (const [gx, gy] of [[9, 13], [11, 16], [10, 19], [13, 11]]) b.set(gx, gy + by, '#ffd860', true); // jeroglíficos que brillan
  b.line(X + 1, Y + 1, X - 2, Y - 1 + sw, c.hair); // venda de la cabeza
  arm(b, 13, 13 + by, p.ra, 7, c.cloth, c.cloth);
  wrap(12, 10, 12, 12);
};

const invisible: FormFn = (b, p, c, _anim, tier) => {
  const by = p.by, sw = p.sway ?? 0;
  // bufanda ondeando
  b.line(9, 12 + by, 4 - sw, 14 + by + (sw > 1 ? 1 : 0), c.hair); b.line(9, 13 + by, 5 - sw, 16 + by, c.hair);
  arm(b, 10, 13 + by, p.la, 7, shade(c.cloth, -0.2), c.skin, 2, true);
  // zapatos flotando (sin piernas)
  const shoe = c.accent === '#202020' ? '#2a1a1a' : shade(c.accent, -0.4);
  b.rect(9 + p.ll[0], FLOOR - 1 - p.ll[1], 4, 2, shoe);
  b.rect(12 + p.rl[0], FLOOR - 1 - p.rl[1], 4, 2, shoe);
  // gabardina larga
  torso(b, by, c.cloth, { bottom: 26 });
  b.rect(7, HIP + 1, 10, 5, c.cloth); b.rect(7, 26, 2, 1, c.cloth); b.rect(15, 26, 2, 1, c.cloth);
  b.rect(8, 17 + by, 8, 1, c.cloth2); b.set(12, 17 + by, '#c0a040', false, true); // cinturón y hebilla
  b.set(14, 14 + by, c.cloth2); b.set(14, 20 + by, c.cloth2); b.set(14, 23, c.cloth2); // botones
  b.line(12, 18 + by, 12, 26, shade(c.cloth, -0.25)); // abertura
  b.rect(9, 11 + by, 6, 2, c.hair); // bufanda al cuello
  // sombrero de ala ancha y gafas flotando
  const X = 7 + (p.lean ?? 0), Y = 2 + by;
  b.rect(X - 2, Y + 2, 14, 1, c.cloth2); b.rect(X - 1, Y + 3, 12, 1, shade(c.cloth2, -0.2));
  b.rect(X + 1, Y - 1, 8, 3, c.cloth2); b.rect(X + 1, Y + 1, 8, 1, c.accent === '#202020' ? '#8a2a3a' : c.accent);
  b.rect(X + 4, Y + 6, 3, 2, '#0e0e18'); b.rect(X + 8, Y + 6, 3, 2, '#0e0e18'); b.set(X + 7, Y + 6, '#707080');
  b.set(X + 5, Y + 6, '#ffffff', true); b.set(X + 9, Y + 6, c.eye, true);
  if (tier >= 1) { b.set(X + 8, Y + 6, '#ffffff', true); b.set(X + 4, Y + 6, c.eye, true); }
  if (tier >= 2) b.rect(X + 1, Y + 1, 8, 1, shade(c.accent === '#202020' ? '#c03a50' : c.accent, 0.2), true);
  if (tier >= 3) { b.set(12, 17 + by, '#ffe080', true); b.set(14, 14 + by, '#c0e0ff', true); b.set(14, 20 + by, '#c0e0ff', true); }
  if (p.mouth) b.rect(X + 7, Y + 9, 2, 1, '#d03050', true);
  arm(b, 13, 13 + by, p.ra, 7, c.cloth, c.skin, 2, true);
};

const zombieForm: FormFn = (b, p, c, anim, tier) => {
  // Paciente Cero: bata de hospital, piel verdosa, una mano siempre adelante
  if (anim === Anim.Idle || anim === Anim.Walk) p = { ...p, ra: 1.4 + p.ra * 0.2, mouth: true };
  const by = p.by;
  arm(b, 10, 13 + by, p.la, 7, shade(c.skin, -0.2), c.skin);
  legs(b, p, shade(c.skin, -0.25), c.skin, '#d8d8d0', { top: 24 });
  // bata abierta con la espalda al aire
  torso(b, by, c.cloth, { bottom: 25 });
  b.rect(7, 22, 10, 4, c.cloth); for (const x of [7, 10, 13, 16]) b.set(x, 25, shade(c.cloth, -0.3));
  for (let y = 13; y < 24; y += 3) b.set(11, y + by, c.cloth2); // estampado
  b.rect(13, 15 + by, 2, 3, c.accent); b.set(14, 16 + by, shade(c.accent, -0.3)); // herida
  b.rect(9, 12 + by, 2, 1, '#ffffff'); // pulsera de hospital
  humanHead(b, p, { skin: c.skin, hair: c.hair, eye: c.eye, style: 'bald', eyeGlow: true });
  const X = 7 + (p.lean ?? 0), Y = 2 + by;
  b.rect(X + 1, Y, 3, 2, c.hair); b.set(X + 5, Y, c.hair); // pelo ralo
  b.set(X + 4, Y + 3, shade(c.skin, -0.35)); b.set(X + 2, Y + 7, shade(c.skin, -0.35)); // manchas
  b.set(X + 8, Y + 9, c.accent); b.set(X + 7, Y + 9, '#e8e0c8', false, true);
  if (tier >= 1 && !p.blink) b.set(X + 8, Y + 5, shade(c.eye, 0.3), true);
  if (tier >= 2) for (const [x, y] of [[9, 16], [15, 20], [12, 23]]) b.set(x, y + (y < 22 ? by : 0), '#a0ff60', true); // pústulas
  if (tier >= 3) { b.set(14, 17 + by, '#c0ff40', true); b.set(X + 3, Y + 1, '#a0ff60', true); } // goteo tóxico
  arm(b, 13, 13 + by, p.ra, 7, shade(c.skin, -0.05), c.skin);
};

const kthulaForm: FormFn = (b, p, c, _anim, tier) => {
  // K'thula: cabeza de pulpo, barba de tentáculos, túnica y alas pequeñas
  const by = p.by, sw = p.sway ?? 0;
  b.line(8, 12 + by, 4 - sw, 9 + by, c.hair); b.line(8, 13 + by, 3 - sw, 12 + by, c.hair); b.line(4 - sw, 9 + by, 3 - sw, 13 + by, c.hair); // alas
  arm(b, 10, 13 + by, p.la, 7, shade(c.cloth, -0.2), c.skin, 2, true);
  legs(b, p, shade(c.cloth2, -0.1), c.cloth2, c.skin, { top: 25 });
  torso(b, by, c.cloth, { bottom: 26 });
  b.rect(7, 22, 10, 5, c.cloth); b.rect(7, 26, 10, 1, c.cloth2);
  b.line(12, 13 + by, 12, 26, c.cloth2);
  const runes = tier >= 3;
  for (const [x, y] of [[9, 16], [14, 19], [10, 22]]) b.set(x, y + (y < 22 ? by : 0), runes ? c.accent : shade(c.cloth, 0.15), runes);
  const X = 7 + (p.lean ?? 0), Y = 2 + by;
  // cabeza abombada (manto de pulpo hacia atrás)
  b.ellipse(X + 4, Y + 2, 5, 4, c.skin);
  b.rect(X + 1, Y + 3, 9, 5, c.skin);
  b.rect(X - 1, Y, 3, 4, shade(c.skin, -0.15)); // manto
  for (const [x, y] of [[X + 2, Y], [X + 5, Y - 1], [X + 3, Y + 3]]) b.set(x, y, shade(c.skin, 0.2)); // manchas
  if (!p.blink) { b.set(X + 7, Y + 4, c.eye, true); b.set(X + 8, Y + 4, shade(c.eye, 0.3), true); if (tier >= 1) b.set(X + 6, Y + 4, shade(c.eye, -0.2), true); }
  b.rect(X + 6, Y + 3, 3, 1, shade(c.skin, -0.35));
  // barba de tentáculos que ondea
  for (let k = 0; k < 4; k++) {
    const tx = X + 4 + k * 1.5, len = 4 + (k % 2) * 2;
    for (let i = 0; i < len; i++) b.set(tx + Math.round(Math.sin((i + k + sw) * 0.9) * 0.8), Y + 8 + i, i === len - 1 && tier >= 2 ? c.accent : shade(c.skin, k % 2 ? -0.1 : 0.05), i === len - 1 && tier >= 2);
  }
  if (tier >= 3) for (const dx of [0, 2, 4, 6]) b.set(X + 1 + dx, Y - 3 + (dx % 4 ? 0 : -1), c.accent, true); // corona de púas
  arm(b, 13, 13 + by, p.ra, 7, c.cloth, c.skin, 2, true);
};

const nightmareForm: FormFn = (b, p, c, _anim, tier) => {
  // Pesadilla: sombra alta y delgada que flota, jirones en vez de piernas, ojos como lunas pálidas
  const by = p.by, sw = p.sway ?? 0;
  const body = c.skin, robe = c.cloth, robe2 = c.cloth2;
  arm(b, 10, 13 + by, p.la, 9, shade(robe, -0.1), body, 4); // brazos largos y finos
  // jirones que se deshacen (sin pies)
  for (let i = 0; i < 5; i++) {
    const x = 8 + i * 2, len = 4 + ((i + sw) % 3);
    for (let y = 0; y < len; y++) b.set(x + Math.round(Math.sin((y + i + sw) * 0.8)), 23 + y, y > len - 2 ? robe2 : robe);
  }
  for (const x of [9, 13]) b.set(x, 29 + (sw % 2), c.accent, true); // brasas de sueño al caer
  torso(b, by, robe, { x: 7, w: 10, bottom: 24 });
  b.rect(7, 20, 10, 4, robe); b.line(7, 12 + by, 7, 23, shade(robe, 0.25)); b.line(16, 12 + by, 16, 23, shade(robe, -0.2)); b.line(12, 13 + by, 12, 23, robe2);
  // cabeza redonda de sombra con capucha suave
  const X = 7 + (p.lean ?? 0), Y = 2 + by;
  b.ellipse(X + 5, Y + 5, 5, 5, body);
  b.rect(X, Y + 2, 3, 8, robe); b.set(X + 1, Y + 1, robe); b.set(X + 2, Y, robe); // capucha
  // ojos: medias lunas grandes y pálidas
  if (!p.blink) {
    b.set(X + 6, Y + 4, c.eye, true); b.set(X + 7, Y + 4, c.eye, true); b.set(X + 7, Y + 5, shade(c.eye, -0.2), true);
    b.set(X + 9, Y + 4, c.eye, true); b.set(X + 9, Y + 5, shade(c.eye, -0.2), true);
    if (tier >= 1) { b.set(X + 6, Y + 3, shade(c.eye, 0.2), true); b.set(X + 9, Y + 3, shade(c.eye, 0.2), true); }
  }
  if (p.mouth) b.rect(X + 6, Y + 8, 4, 1, c.accent, true); // sonrisa que brilla
  else b.line(X + 6, Y + 8, X + 8, Y + 8, shade(body, 0.25));
  if (tier >= 2) for (const [x, y] of [[9, 15], [14, 18], [10, 21]]) b.set(x, y + (y < 20 ? by : 0), c.accent, true); // motas de sueño
  if (tier >= 3) { b.rect(X + 2, Y - 3, 3, 1, c.accent, true); b.set(X + 1, Y - 2, c.accent, true); b.set(X + 5, Y - 2, c.accent, true); } // media luna
  arm(b, 13, 13 + by, p.ra, 9, robe, body, 4);
  const hx = 13 + Math.sin(p.ra) * 9, hy = 13 + by + Math.cos(p.ra) * 9;
  b.set(hx + 1, hy, shade(body, 0.3)); b.set(hx + 1, hy + 1, shade(body, 0.3)); // dedos largos
};

const maryForm: FormFn = (b, p, c, _anim, tier) => {
  // Bloody Mary: vestido largo, melena que tapa media cara, trozo de espejo en la mano
  const by = p.by, sw = p.sway ?? 0;
  b.rect(5 - sw, 3 + by, 4, 13, c.hair); // melena por detrás
  arm(b, 10, 13 + by, p.la, 7, shade(c.cloth, -0.2), c.skin);
  legs(b, p, shade(c.cloth2, -0.1), c.cloth2, '#140a0c', { top: 26 });
  torso(b, by, c.cloth, { bottom: 27 });
  b.rect(6 - Math.min(1, sw), 21, 12, 7, c.cloth); // falda acampanada
  for (const x of [6, 9, 12, 15]) b.set(x - Math.min(1, sw), 27, c.cloth2);
  b.rect(8, 12 + by, 8, 1, c.cloth2); b.set(12, 14 + by, c.accent, false, true);
  for (const [x, y] of [[10, 17], [14, 22], [8, 24]]) b.set(x, y + (y < 20 ? by : 0), '#5a0a10'); // manchas
  humanHead(b, p, { skin: c.skin, hair: c.hair, eye: c.eye, style: 'long', eyeGlow: true });
  const X = 7 + (p.lean ?? 0), Y = 2 + by;
  b.rect(X + 1, Y + 1, 5, 6, c.hair); // flequillo que tapa media cara
  b.set(X + 7, Y + 6, '#a01020'); b.set(X + 7, Y + 7, '#a01020'); // lágrima de sangre
  if (tier >= 1 && !p.blink) b.set(X + 8, Y + 5, shade(c.eye, 0.3), true);
  if (tier >= 2) { b.rect(X, Y - 1, 9, 1, '#c8d8e8'); b.set(X + 4, Y - 2, '#e8f8ff', true); } // diadema de cristal
  arm(b, 13, 13 + by, p.ra, 7, c.cloth, c.skin);
  // fragmento de espejo en la mano (brilla)
  const hx = 13 + Math.sin(p.ra) * 8, hy = 13 + by + Math.cos(p.ra) * 8;
  b.rect(hx, hy - 3, 2, 4, c.accent); b.set(hx + 1, hy - 3, '#ffffff', true); b.set(hx, hy - 4, shade(c.accent, 0.2));
  if (tier >= 3) { b.set(hx + 2, hy - 2, '#ff4060', true); b.set(9, 19 + by, '#e8f8ff', true); }
};

const reanimatedForm: FormFn = (b, p, c, _anim, tier) => {
  // Reanimado: corpachón cosido y asimétrico, placas de metal, bobinas y clavos a la espalda
  const by = p.by;
  // clavos en la espalda
  for (const [x, y] of [[5, 12], [4, 15], [5, 18], [4, 21]]) { b.line(x, y + by, x - 2, y - 1 + by, '#8a8a92'); b.set(x - 2, y - 1 + by, '#c8c8d0'); }
  arm(b, 10, 13 + by, p.la, 8, shade(c.skin, -0.2), shade(c.skin, -0.1), 3); // brazo trasero, más delgado
  legs(b, p, shade(c.cloth2, -0.1), c.cloth2, '#1a1612', { width: 4, boots: '#2a2420' });
  torso(b, by, c.cloth, { x: 6, w: 12, top: 11 });
  b.rect(7, 11 + by, 9, 4, c.skin); // pecho al aire
  b.line(9, 12 + by, 9, 20 + by, shade(c.skin, -0.4)); for (let y = 12; y < 20; y += 2) { b.set(8, y + by, shade(c.skin, -0.35)); b.set(10, y + by, shade(c.skin, -0.35)); } // costura
  b.rect(13, 15 + by, 4, 4, '#6a6a74'); b.set(13, 15 + by, '#a0a0aa'); b.set(16, 18 + by, '#a0a0aa'); // placa de metal
  b.rect(6, 19 + by, 12, 1, '#3a2a1a');
  // bobinas en los hombros
  for (const x of [6, 16]) { b.rect(x, 9 + by, 2, 3, '#8a5a2a'); b.set(x, 9 + by, c.accent, tier >= 1); b.set(x + 1, 8 + by, c.accent, true); }
  // cabeza ladeada y deforme, con placa a un lado
  const X = 7 + (p.lean ?? 0), Y = 3 + by;
  b.rect(X + 1, Y, 9, 9, c.skin); b.rect(X, Y + 2, 11, 5, c.skin); b.rect(X + 2, Y + 9, 7, 1, c.skin);
  b.rect(X, Y, 4, 4, '#7a7a84'); b.set(X + 1, Y + 1, '#b0b0ba'); b.set(X + 3, Y + 3, '#b0b0ba'); // placa en el cráneo
  b.rect(X + 4, Y, 6, 1, c.hair); b.set(X + 6, Y - 1, c.hair);
  b.line(X + 4, Y + 2, X + 9, Y + 3, shade(c.skin, -0.4)); // cicatriz
  if (!p.blink) { b.rect(X + 6, Y + 4, 2, 2, c.eye, true); b.set(X + 9, Y + 5, shade(c.eye, -0.2), true); } // un ojo más grande que otro
  b.rect(X + 6, Y + 8, 4, 1, shade(c.skin, -0.45)); for (const x of [X + 6, X + 8]) b.set(x, Y + 7, shade(c.skin, -0.35));
  if (tier >= 2) for (const [x, y] of [[X - 1, Y + 1], [X + 4, Y - 1]]) b.set(x, y, c.accent, true); // chispas
  if (tier >= 3) { b.set(11, 13 + by, c.accent, true); b.set(15, 16 + by, c.accent, true); b.set(12, 21, c.accent, true); }
  // brazo delantero enorme
  arm(b, 14, 13 + by, p.ra, 8, c.skin, c.skin, 3);
  const dx = Math.sin(p.ra), dy = Math.cos(p.ra);
  for (let i = 1; i < 8; i++) b.set(15 + dx * i, 13 + by + dy * i, shade(c.skin, -0.12));
  b.rect(14 + dx * 9, 12 + by + dy * 9, 3, 3, shade(c.skin, -0.05)); // puño
  b.set(14 + dx * 4, 13 + by + dy * 4, '#3a2a2a'); // grapa
};

const doppyForm: FormFn = (b, p, c, _anim, tier) => {
  // Doppy: maniquí sin rasgos, traje gris y una sonrisa demasiado ancha
  const by = p.by;
  arm(b, 10, 13 + by, p.la, 7, shade(c.cloth, -0.2), c.skin, 2, true);
  legs(b, p, shade(c.cloth, -0.3), shade(c.cloth, -0.1), '#141414');
  torso(b, by, c.cloth);
  b.rect(11, 12 + by, 3, 7, c.cloth2); b.rect(12, 13 + by, 1, 5, c.accent); // camisa y corbata
  b.line(10, 12 + by, 11, 16 + by, shade(c.cloth, -0.3)); b.line(15, 12 + by, 14, 16 + by, shade(c.cloth, -0.3));
  const X = 7 + (p.lean ?? 0), Y = 2 + by;
  b.rect(X + 1, Y, 8, 10, c.skin); b.rect(X, Y + 2, 10, 6, c.skin); b.rect(X + 2, Y + 10, 6, 1, c.skin); // cabeza lisa
  b.set(X + 2, Y + 1, shade(c.skin, 0.2), false, true);
  if (!p.blink) { b.set(X + 6, Y + 5, c.eye); b.set(X + 9, Y + 5, c.eye); }
  // sonrisa de oreja a oreja
  const smile = p.mouth ? 2 : 1;
  b.rect(X + 4, Y + 8, 6, smile, '#1a1018'); b.set(X + 3, Y + 7, '#1a1018'); b.set(X + 10, Y + 7, '#1a1018');
  if (tier >= 1) for (const x of [X + 5, X + 7, X + 9]) b.set(x, Y + 8, '#f0f0f0'); // dientes
  if (tier >= 2) b.set(X + 6, Y + 5, '#ffe060', true);
  if (tier >= 3) { b.set(X + 9, Y + 5, '#ffe060', true); b.rect(X + 3, Y + 3, 1, 3, shade(c.skin, -0.25)); } // grieta: hay otra cara debajo
  arm(b, 13, 13 + by, p.ra, 7, c.cloth, c.skin, 2, true);
};

const witchForm: FormFn = (b, p, c, _anim, tier) => {
  // Hécuba: bruja encorvada, nariz larga, sombrero picudo torcido, frascos al cinto
  const by = p.by + 2, sw = p.sway ?? 0;
  b.rect(5 - sw, 13 + by, 3, 10, c.hair); // melena enmarañada
  arm(b, 10, 13 + by, p.la, 7, shade(c.cloth, -0.2), c.skin);
  legs(b, p, shade(c.cloth2, -0.1), c.cloth2, '#1a1410', { top: 25 });
  torso(b, by, c.cloth, { bottom: 27 });
  b.rect(7 - sw, 21, 10, 6, c.cloth); for (const x of [7, 10, 13, 16]) b.clear(x - sw, 26); // falda raída
  b.rect(8, 19 + by, 8, 1, '#3a2a1a');
  // frascos al cinto (brillan)
  b.rect(9, 20 + by, 2, 2, c.accent, true); b.rect(13, 20 + by, 2, 2, '#ff6020', true); b.set(9, 19 + by, '#d0d0d0'); b.set(13, 19 + by, '#d0d0d0');
  humanHead(b, p, { skin: c.skin, hair: c.hair, eye: c.eye, style: 'long', eyeGlow: true });
  const X = 7 + (p.lean ?? 0), Y = 2 + by;
  b.rect(X + 10, Y + 5, 2, 2, c.skin); b.set(X + 12, Y + 7, c.skin); b.set(X + 11, Y + 7, shade(c.skin, -0.2)); // narizota
  b.set(X + 10, Y + 4, '#5a3a20'); // verruga
  if (p.mouth) { b.rect(X + 7, Y + 8, 3, 1, '#2a0a0a'); b.set(X + 8, Y + 8, '#f0e0a0'); }
  // sombrero picudo torcido
  b.rect(X - 2, Y + 1, 14, 1, c.cloth2); b.rect(X - 1, Y + 2, 12, 1, shade(c.cloth2, -0.2));
  b.rect(X + 1, Y - 1, 8, 2, c.cloth2); b.rect(X + 2, Y - 3, 6, 2, c.cloth2); b.rect(X + 3, Y - 4, 3, 1, c.cloth2); b.set(X + 2, Y - 5, c.cloth2); b.set(X + 1, Y - 5, c.cloth2);
  b.rect(X + 1, Y, 8, 1, c.accent, tier >= 2); // cinta
  if (tier >= 3) b.set(X + 1, Y - 5, c.accent, true);
  if (tier >= 1 && !p.blink) b.set(X + 7, Y + 5, shade(c.eye, 0.3), true);
  arm(b, 13, 13 + by, p.ra, 7, c.cloth, c.skin);
  const hx = 13 + Math.sin(p.ra) * 8, hy = 13 + by + Math.cos(p.ra) * 8;
  b.rect(hx, hy - 2, 2, 3, ['#ff6020', '#a0ff40', '#e02010'][Math.floor(sw) % 3], true); b.set(hx, hy - 3, '#d0d0d0'); // frasco en la mano
};

const succubusForm: FormFn = (b, p, c, anim, tier) => {
  // Lilith: alas de murciélago a la espalda, cuernos, corpiño, botas altas y cola acabada en corazón
  const by = p.by, sw = p.sway ?? 0;
  const flap = anim === Anim.Walk || anim === Anim.Cast ? sw : 0;
  const memb = c.cloth2, bone = shade(c.cloth2, -0.35);
  // ala (detrás): huesos en abanico y membrana con bordes festoneados
  const root: [number, number] = [8, 12 + by];
  const tips: [number, number][] = [[1, 3 + by - flap], [0, 9 + by - flap], [2, 15 + by], [5, 19 + by]];
  for (let i = 0; i < tips.length - 1; i++) {
    const [ax, ay] = tips[i], [bx, by2] = tips[i + 1];
    for (let t = 0; t <= 1; t += 0.08) {
      const ex = ax + (bx - ax) * t, ey = ay + (by2 - ay) * t + (t > 0.2 && t < 0.8 ? 1 : 0); // festón
      b.line(root[0], root[1], ex, ey, memb);
    }
  }
  for (const [tx, ty] of tips) b.line(root[0], root[1], tx, ty, bone);
  b.set(tips[0][0], tips[0][1] - 1, bone); // garra del ala
  // cola con punta de corazón
  b.line(9, 20, 5 - sw, 24, c.cloth2); b.line(5 - sw, 24, 3 - sw, 27, c.cloth2);
  for (const [hx, hy] of [[1, 26], [3, 26], [1, 27], [2, 27], [3, 27], [2, 28]]) b.set(hx - sw, hy, hy === 28 ? shade(c.accent, -0.2) : c.accent, true);
  arm(b, 10, 13 + by, p.la, 7, c.skin, c.skin);
  legs(b, p, shade(c.skin, -0.12), c.skin, '#140a10', { boots: c.cloth2 });
  for (const [x, l] of [[9, p.ll], [12, p.rl]] as [number, [number, number]][]) b.rect(x + l[0], 25 - Math.min(1, l[1]), 3, 1, c.cloth2); // caña de las botas
  torso(b, by, c.skin, { bottom: HIP });
  b.rect(8, 15 + by, 8, 5, c.cloth); b.rect(9, 14 + by, 2, 1, c.cloth); b.rect(13, 14 + by, 2, 1, c.cloth); // corpiño
  b.line(9, 16 + by, 15, 19 + by, shade(c.cloth, -0.3)); b.line(15, 16 + by, 9, 19 + by, shade(c.cloth, -0.3)); // cordones
  b.rect(8, 20, 8, 2, c.cloth2); // falda corta
  b.set(12, 14 + by, c.accent, true); // colgante de corazón
  humanHead(b, p, { skin: c.skin, hair: c.hair, eye: c.eye, style: 'long', eyeGlow: true });
  const X = 7 + (p.lean ?? 0), Y = 2 + by;
  // cuernos curvos
  const horn = tier >= 2 ? c.accent : '#2a1a1a';
  b.rect(X + 3, Y - 1, 2, 1, '#2a1a1a'); b.set(X + 3, Y - 2, '#3a2a2a'); b.set(X + 2, Y - 3, '#3a2a2a'); b.set(X + 2, Y - 4, horn, tier >= 2);
  b.rect(X + 7, Y - 1, 2, 1, '#2a1a1a'); b.set(X + 8, Y - 2, '#3a2a2a'); b.set(X + 9, Y - 3, '#3a2a2a'); b.set(X + 9, Y - 4, horn, tier >= 2);
  b.rect(X + 7, Y + 8, 2, 1, c.accent); if (p.mouth) b.set(X + 8, Y + 9, shade(c.accent, -0.3)); // labios
  b.set(X + 8, Y + 4, shade(c.hair, -0.2)); // pestañas
  if (tier >= 1 && !p.blink) b.set(X + 8, Y + 5, shade(c.eye, 0.3), true);
  if (tier >= 3) for (const [x, y] of [[19, 6], [21, 12], [18, 1]]) { b.set(x, y + by, c.accent, true); b.set(x + 1, y + by, c.accent, true); b.set(x, y + 1 + by, shade(c.accent, -0.2), true); } // corazones flotando
  arm(b, 13, 13 + by, p.ra, 7, c.skin, c.skin);
  const hx = 13 + Math.sin(p.ra) * 8, hy = 13 + by + Math.cos(p.ra) * 8;
  b.set(hx, hy, shade(c.accent, -0.1)); // uñas pintadas
};

const poltergeistForm: FormFn = (b, p, c, anim, tier) => {
  // Poltergeist: sábana flotante con agujeros por ojos; sin pies, el bajo ondea
  const by = p.by - 1, sw = p.sway ?? 0;
  const lift = anim === Anim.Walk ? 1 : 0;
  const body = (y: number) => (y < 8 ? 2 + (y - 3) : y < 19 ? 7 : 7 + Math.floor((y - 19) / 3)); // media anchura
  for (let y = 3; y <= 27; y++) {
    const yy = y + by - lift, half = body(y);
    b.rect(12 - half, yy, half * 2, 1, c.skin);
    b.set(12 - half, yy, c.cloth); // sombra en el borde trasero
  }
  // bajo deshilachado que ondea
  for (let i = 0; i < 7; i++) { const x = 5 + i * 2 - (sw % 2); b.rect(x, 28 + by - lift, 2, 1 + ((i + sw) % 2), i % 2 ? c.cloth : c.skin); }
  // pliegues
  b.line(8, 11 + by - lift, 7, 26 + by - lift, c.cloth); b.line(15, 13 + by - lift, 16, 26 + by - lift, shade(c.skin, -0.1)); b.line(11, 20 + by - lift, 11, 27 + by - lift, c.cloth);
  // brazos: bultos bajo la sábana que se mueven con la pose
  for (const [ang, x0] of [[p.la, 9], [p.ra, 14]] as [number, number][]) {
    const ax = x0 + Math.sin(ang) * 6, ay = 14 + by - lift + Math.cos(ang) * 5;
    b.ellipse(ax, ay, 2, 2, x0 === 9 ? c.cloth : c.skin);
  }
  // cara: dos agujeros y boca
  const X = 7 + (p.lean ?? 0), Y = 2 + by - lift;
  if (!p.blink) { b.rect(X + 5, Y + 5, 2, 3, c.eye); b.rect(X + 8, Y + 5, 2, 3, c.eye); }
  else { b.rect(X + 5, Y + 6, 2, 1, c.eye); b.rect(X + 8, Y + 6, 2, 1, c.eye); }
  b.rect(X + 6, Y + 10, 3, p.mouth ? 3 : 1, c.eye);
  if (tier >= 1 && !p.blink) { b.set(X + 5, Y + 5, c.accent, true); b.set(X + 8, Y + 5, c.accent, true); } // brillo en los ojos
  if (tier >= 2) for (const [x, y] of [[4, 14], [19, 18], [6, 24], [18, 8]]) b.set(x, y + by, c.accent, true); // ectoplasma
  if (tier >= 3) { b.rect(X + 2, Y - 1, 7, 1, c.accent, true); b.set(X + 4, Y - 2, c.accent, true); } // halo espectral
};

const treeForm: FormFn = (b, p, c, anim, tier) => {
  // Raíz Negra: tronco que camina sobre raíces, ramas por brazos, copa en la cabeza y una cara tallada en la corteza
  const by = p.by, sw = p.sway ?? 0;
  const bark = c.skin, barkD = shade(c.skin, -0.3), barkL = shade(c.skin, 0.18), leaf = c.hair, leafL = shade(c.hair, 0.25), leafD = shade(c.hair, -0.3);
  // rama trasera
  arm(b, 9, 12 + by, p.la, 8, barkD, barkD, 2);
  const lx = 9 + Math.sin(p.la) * 9, ly = 12 + by + Math.cos(p.la) * 9;
  b.ellipse(lx, ly, 2, 1, leafD);
  // raíces por pies
  const foot = (x: number, [dx, lift]: [number, number], col: string) => {
    for (let y = HIP; y < FLOOR - lift; y++) b.rect(x + Math.round(dx * (y - HIP) / 10), y, 3, 1, col);
    const fx = x + dx, fy = FLOOR - lift;
    b.rect(fx - 2, fy, 7, 1, col); b.set(fx - 3, fy + 1 - (lift ? 1 : 0), col); b.set(fx + 5, fy + 1 - (lift ? 1 : 0), col); // raíces que se abren
  };
  foot(8, p.ll, barkD);
  foot(13, p.rl, bark);
  // tronco
  b.rect(7, 9 + by, 10, HIP - 8, bark);
  b.rect(6, 13 + by, 1, 8, bark); b.rect(17, 12 + by, 1, 9, barkD);
  for (const [x, y0, y1] of [[9, 10, 20], [12, 11, 21], [15, 9, 19]] as [number, number, number][]) b.line(x, y0 + by, x + (x === 12 ? 1 : 0), y1 + by, barkD); // vetas
  b.set(10, 14 + by, barkL); b.set(14, 17 + by, barkL);
  b.ellipse(10, 18 + by, 1, 1, shade(c.skin, -0.5)); // nudo
  // musgo / hojas pegadas al tronco
  b.set(7, 16 + by, leaf); b.set(16, 11 + by, leaf); b.set(8, 20 + by, leafD);
  // copa (la cabeza)
  const X = 7 + (p.lean ?? 0), Y = 2 + by;
  b.ellipse(X + 5, Y + 2, 7, 4, leaf);
  b.ellipse(X + 1, Y + 4, 3, 3, leafD); b.ellipse(X + 9, Y + 3, 3, 3, leaf);
  for (const [x, y] of [[X + 3, Y - 1], [X + 7, Y], [X + 5, Y + 2], [X + 10, Y + 2], [X, Y + 3]]) b.set(x, y, leafL);
  if (sw) b.set(X - 2, Y + 6 + sw, leaf); // hoja que cae
  // cara tallada en la parte alta del tronco
  b.rect(X + 2, Y + 7, 8, 4, bark);
  if (!p.blink) { b.rect(X + 4, Y + 8, 2, 1, c.eye, true); b.rect(X + 7, Y + 8, 2, 1, c.eye, true); }
  else { b.rect(X + 4, Y + 8, 2, 1, barkD); b.rect(X + 7, Y + 8, 2, 1, barkD); }
  b.rect(X + 5, Y + 10, 3, p.mouth ? 2 : 1, '#140c08');
  if (tier >= 1) for (const [x, y] of [[X + 2, Y + 1], [X + 9, Y]]) b.set(x, y, c.accent, true); // brotes que brillan
  if (tier >= 2) { b.set(12, 15 + by, c.accent, true); b.set(13, 15 + by, c.accent, true); b.set(12, 16 + by, shade(c.accent, -0.2), true); } // savia que brilla en el pecho
  if (tier >= 3) for (const [x, y] of [[X - 1, Y + 1], [X + 11, Y + 4], [X + 6, Y - 2], [X + 3, Y + 4]]) b.set(x, y, c.accent, true); // flores en la copa
  // rama delantera (más gruesa) con ramitas
  arm(b, 15, 12 + by, p.ra, 8, bark, barkD, 2);
  const hx = 15 + Math.sin(p.ra) * 9, hy = 12 + by + Math.cos(p.ra) * 9;
  b.set(hx + 1, hy - 1, barkD); b.set(hx - 1, hy + 1, barkD); b.set(hx + 1, hy + 1, leaf);
  void anim;
};

const pirateForm: FormFn = (b, p, c, _anim, tier) => {
  // Capitán Ahogado: fantasma de piel azulada, tricornio con calavera, casaca larga, garfio y pata de palo
  const by = p.by, sw = p.sway ?? 0;
  arm(b, 10, 13 + by, p.la, 7, shade(c.cloth, -0.2), c.skin);
  // pierna trasera de palo, delantera con bota
  const pl = p.ll, pr = p.rl;
  b.rect(9 + Math.round(pl[0] / 3), HIP, 3, 4, c.cloth2); b.line(10 + pl[0], HIP + 4, 10 + pl[0], FLOOR - pl[1], '#7a5a34'); b.set(10 + pl[0], FLOOR - pl[1], '#4a3420');
  b.rect(12 + Math.round(pr[0] / 3), HIP, 3, 4, c.cloth2); b.rect(12 + pr[0], HIP + 4, 3, FLOOR - HIP - 5 - pr[1], '#1a1410'); b.rect(12 + pr[0], FLOOR - 1 - pr[1], 4, 2, '#1a1410');
  // casaca con faldones
  torso(b, by, c.cloth, { bottom: HIP + 3 });
  b.rect(7 - sw, HIP, 2, 4, c.cloth); b.rect(15, HIP, 2, 4, shade(c.cloth, -0.15));
  b.rect(11, 12 + by, 2, 8, '#d8d0c0'); // camisa
  for (let y = 13; y < 21; y += 3) { b.set(10, y + by, c.accent); b.set(13, y + by, c.accent); } // botones dorados
  b.rect(8, 19 + by, 8, 1, '#3a2418'); b.set(12, 19 + by, c.accent); // cinturón
  // cabeza: piel ahogada, barba revuelta
  humanHead(b, p, { skin: c.skin, hair: c.hair, eye: c.eye, style: 'short', eyeGlow: true, beard: shade(c.hair, 0.15) });
  const X = 7 + (p.lean ?? 0), Y = 2 + by;
  b.rect(X + 4, Y + 4, 3, 2, '#141414'); // parche
  b.line(X + 3, Y + 3, X + 8, Y + 2, '#141414');
  // tricornio
  b.rect(X - 2, Y, 14, 2, c.cloth2); b.rect(X, Y - 2, 10, 2, c.cloth2); b.set(X - 3, Y - 1, c.cloth2); b.set(X + 12, Y - 1, c.cloth2);
  b.rect(X - 2, Y + 1, 14, 1, c.accent); // ribete
  b.rect(X + 4, Y - 2, 2, 2, '#e8e8e0'); b.set(X + 4, Y - 1, '#141414'); // calavera
  // algas y gotas: lleva siglos bajo el mar
  b.set(7, 17 + by, '#3a7a5a'); b.set(8, 21, '#3a7a5a'); b.set(16, 14 + by, '#3a7a5a');
  if (tier >= 1) b.set(X + 7, Y + 5, shade(c.eye, 0.3), true);
  if (tier >= 2) { b.set(X + 4, Y - 2, c.eye, true); b.set(X + 5, Y - 2, c.eye, true); } // la calavera brilla
  if (tier >= 3) for (const [x, y] of [[6, 10], [17, 18], [5, 24]]) b.set(x, y + by, c.eye, true); // fuegos fatuos
  // brazo delantero con garfio
  arm(b, 13, 13 + by, p.ra, 7, c.cloth, c.cloth);
  const hx = 13 + Math.sin(p.ra) * 8, hy = 13 + by + Math.cos(p.ra) * 8;
  b.set(hx, hy, '#c0c0c8'); b.set(hx + 1, hy + 1, '#c0c0c8'); b.set(hx + 2, hy, '#e0e0e8', false, true); b.set(hx + 2, hy - 1, '#c0c0c8');
};

const spiderForm: FormFn = (b, p, c, anim, tier) => {
  // Aracne: mujer pálida con un mono negro, melena oscura, reloj de arena rojo y cuatro patas de araña a la espalda
  const by = p.by, sw = p.sway ?? 0;
  const leg = shade(c.cloth, 0.45), legL = shade(c.cloth, 0.75);
  const flex = anim === Anim.Walk ? (sw % 2 ? 1 : -1) : 0;
  // patas de araña (detrás): salen de la espalda, suben hasta la rodilla y bajan en abanico
  const knees: [number, number][] = [[4, 3], [1, 7], [0, 12], [2, 16]];
  const feet: [number, number][] = [[0, 15], [0, 22], [2, 27], [5, 30]];
  for (let i = 0; i < 4; i++) {
    const [kx, ky] = knees[i], [fx, fy] = feet[i];
    const fl = i % 2 ? flex : -flex;
    b.line(8, 12 + i * 2 + by, kx + fl, ky + by, leg);
    b.line(kx + fl, ky + by, fx - fl, Math.min(FLOOR, fy + (i < 2 ? by : 0)), leg);
    b.set(kx + fl, ky + by, legL); b.set(kx + fl, ky + by - 1, legL); // rodilla
  }
  arm(b, 10, 13 + by, p.la, 7, c.cloth, c.skin);
  legs(b, p, shade(c.cloth2, -0.1), c.cloth2, '#0a060c', { boots: c.cloth });
  torso(b, by, c.cloth);
  b.rect(10, 12 + by, 4, 2, c.skin); // escote
  b.set(11, 16 + by, c.accent, true); b.set(12, 16 + by, c.accent, true); b.set(11, 17 + by, c.accent); b.set(12, 18 + by, c.accent, true); b.set(11, 18 + by, c.accent); // reloj de arena
  b.line(8, 15 + by, 15, 15 + by, shade(c.cloth, 0.2)); b.line(9, 19 + by, 14, 19 + by, shade(c.cloth, 0.2)); // dibujo de telaraña
  humanHead(b, p, { skin: c.skin, hair: c.hair, eye: c.eye, style: 'long', eyeGlow: true });
  const X = 7 + (p.lean ?? 0), Y = 2 + by;
  b.set(X + 8, Y + 4, c.eye, true); // segundo par de ojos
  b.set(X + 7, Y + 8, '#5a0a18'); if (p.mouth) { b.set(X + 8, Y + 9, '#f0f0f0'); b.set(X + 7, Y + 9, '#f0f0f0'); } // colmillos
  if (tier >= 1) b.set(X + 9, Y + 5, shade(c.eye, 0.3), true);
  if (tier >= 2) for (let i = 0; i < 4; i++) b.set(2 - i, 6 + i * 3 + by, c.accent, true); // rodillas que brillan
  if (tier >= 3) { b.line(X + 1, Y - 1, X + 9, Y - 1, '#e8e8f0'); b.set(X + 5, Y - 2, c.accent, true); } // diadema de seda
  arm(b, 13, 13 + by, p.ra, 7, c.cloth, c.skin);
  const hx = 13 + Math.sin(p.ra) * 8, hy = 13 + by + Math.cos(p.ra) * 8;
  b.set(hx + 1, hy, shade(c.accent, -0.2)); // uñas
};

/** Arañita (Gran telaraña): 2 fotogramas. */
const spiderlingCache: Baked[] = [];
export function getSpiderling(frame: number): Baked {
  const f = frame % 2;
  if (spiderlingCache[f]) return spiderlingCache[f];
  const b = new PB(14, 10);
  b.ellipse(6, 5, 3, 2, '#1a1020'); b.ellipse(9, 4, 2, 2, '#2a1830');
  b.set(10, 3, '#ff2040', true); b.set(9, 3, '#ff2040', true);
  for (let i = 0; i < 4; i++) { const x = 3 + i * 2, up = (i + f) % 2; b.set(x, 2 - up, '#1a1020'); b.set(x - 1, 1 - up, '#1a1020'); b.set(x, 8 + up, '#1a1020'); b.set(x - 1, 9, '#1a1020'); }
  spiderlingCache[f] = b.finish({ outline: 'selout' });
  return spiderlingCache[f];
}

const scarecrowForm: FormFn = (b, p, c, anim, tier) => {
  // El Segador: saco cosido por cabeza bajo un sombrero de paja, camisa a cuadros remendada, paja asomando y guadaña
  const by = p.by, sw = p.sway ?? 0;
  const straw = c.hair, strawD = shade(c.hair, -0.3);
  arm(b, 10, 13 + by, p.la, 7, c.cloth, straw);
  // piernas de palo con paja en los bajos
  legs(b, p, shade(c.cloth2, -0.1), c.cloth2, strawD, { width: 3 });
  for (const [x, l] of [[9, p.ll], [12, p.rl]] as [number, [number, number]][]) { b.set(x + l[0] - 1, FLOOR - 2 - l[1], straw); b.set(x + l[0] + 3, FLOOR - 3 - l[1], straw); }
  torso(b, by, c.cloth, { bottom: HIP + 1 });
  for (let y = 12; y <= HIP; y += 3) b.line(8, y + by, 15, y + by, shade(c.cloth, -0.25)); // cuadros
  for (const x of [10, 13]) b.line(x, 12 + by, x, HIP + by, shade(c.cloth, -0.25));
  b.rect(13, 16 + by, 3, 3, c.accent); b.set(14, 17 + by, shade(c.accent, -0.3)); // remiendo
  b.rect(8, HIP - 1 + by, 8, 1, '#5a3a1a'); // cuerda
  b.set(7, 13 + by, straw); b.set(6, 14 + by, straw); b.set(16, 13 + by, straw); b.set(8, HIP + 1, straw); b.set(15, HIP + 2, straw); // paja que asoma
  // cabeza de saco
  const X = 7 + (p.lean ?? 0), Y = 2 + by;
  b.rect(X + 1, Y + 1, 8, 9, c.skin); b.rect(X, Y + 2, 10, 6, c.skin); b.rect(X + 2, Y + 10, 6, 1, c.skin);
  b.rect(X + 3, Y + 10, 4, 1, '#5a3a1a'); b.set(X + 2, Y + 11, straw); b.set(X + 7, Y + 11, straw); // cuello atado
  // ojos recortados que brillan y boca cosida
  if (!p.blink) { b.rect(X + 5, Y + 4, 2, 2, '#140c08'); b.rect(X + 8, Y + 4, 2, 2, '#140c08'); b.set(X + 6, Y + 5, c.eye, true); b.set(X + 9, Y + 5, c.eye, true); }
  b.line(X + 4, Y + 8, X + 9, Y + 8, '#3a2414');
  for (const x of [X + 5, X + 7, X + 9]) b.set(x, p.mouth ? Y + 9 : Y + 7, '#3a2414');
  // sombrero de paja
  b.rect(X - 2, Y + 1, 14, 1, straw); b.rect(X - 1, Y + 2, 1, 1, strawD); b.rect(X + 1, Y - 2, 8, 3, straw); b.rect(X + 2, Y - 3, 6, 1, strawD);
  b.rect(X + 1, Y, 8, 1, c.accent);
  if (tier >= 1) { b.set(X + 5, Y + 4, c.eye, true); b.set(X + 8, Y + 4, c.eye, true); }
  if (tier >= 2) { b.set(X + 3, Y - 4, '#141018'); b.set(X + 4, Y - 4, '#141018'); b.set(X + 4, Y - 5, '#141018'); } // un cuervo posado
  if (tier >= 3) for (const [x, y] of [[5, 12], [18, 15], [6, 22]]) b.set(x, y + by, c.eye, true); // ascuas en la paja
  // guadaña en la mano delantera
  arm(b, 13, 13 + by, p.ra, 7, c.cloth, straw);
  const hx = 13 + Math.sin(p.ra) * 8, hy = 13 + by + Math.cos(p.ra) * 8;
  const ux = Math.sin(p.ra + 0.4), uy = Math.cos(p.ra + 0.4);
  b.line(hx - ux * 6, hy - uy * 6, hx + ux * 7, hy + uy * 7, '#5a3a1a'); // mango
  const tx = hx - ux * 6, ty = hy - uy * 6;
  for (let i = 0; i < 7; i++) b.set(tx + 1 + i, ty - 1 + Math.round(i * i * 0.08), i < 5 ? '#c8c8d0' : '#e8e8f0', tier >= 2 && i === 6); // hoja curva
  void sw; void anim;
};

const demonForm: FormFn = (b, p, c, anim, tier) => {
  // Azufre: demonio de piel roja con grietas de lava, cuernos curvos, melena de fuego, pezuñas y cola en punta
  const by = p.by, sw = p.sway ?? 0;
  const lava = c.accent, flame = c.hair;
  // cola
  b.line(8, 20, 4 - sw, 23, c.skin); b.line(4 - sw, 23, 2 - sw, 20, c.skin);
  b.set(1 - sw, 19, c.cloth2); b.set(2 - sw, 18, c.cloth2); b.set(3 - sw, 19, c.cloth2); // punta
  arm(b, 10, 13 + by, p.la, 7, shade(c.skin, -0.2), shade(c.skin, -0.2), 3);
  legs(b, p, shade(c.cloth, -0.2), c.cloth, '#1a0a08', { boots: shade(c.skin, -0.35) }); // pezuñas
  torso(b, by, c.skin, { x: 7, w: 10 });
  b.rect(8, 17 + by, 8, 1, c.cloth); b.rect(8, 19 + by, 8, 3, c.cloth); // taparrabos
  // grietas de lava que brillan
  b.line(9, 12 + by, 11, 16 + by, lava); b.line(14, 13 + by, 13, 16 + by, lava); b.set(12, 14 + by, shade(lava, 0.3));
  for (const [x, y] of [[9, 12], [11, 16], [14, 13], [13, 16]]) b.set(x, y + by, lava, true);
  // cabeza
  const X = 7 + (p.lean ?? 0), Y = 2 + by;
  b.rect(X + 1, Y + 1, 8, 9, c.skin); b.rect(X, Y + 2, 10, 6, c.skin); b.rect(X + 2, Y + 10, 6, 1, c.skin);
  b.rect(X + 9, Y + 4, 2, 3, c.skin); // morro
  if (!p.blink) { b.rect(X + 6, Y + 4, 3, 1, c.eye, true); b.set(X + 8, Y + 5, c.eye, true); }
  b.rect(X + 6, Y + 3, 4, 1, shade(c.skin, -0.45)); // ceño
  b.rect(X + 6, Y + 8, 4, 1, '#1a0404'); b.set(X + 7, Y + 7, '#f0e0c0'); b.set(X + 9, Y + 7, '#f0e0c0'); if (p.mouth) { b.rect(X + 6, Y + 8, 4, 2, lava, true); }
  // melena de fuego (por detrás de los cuernos)
  const fl = (sw + Math.floor((p.by + 3) * 7)) % 3;
  for (let i = 0; i < 4; i++) { const fx = X + i * 2, h = 2 + ((i + fl) % 3); for (let k = 0; k < h; k++) b.set(fx, Y + 1 - k, k === h - 1 ? lava : flame, true); }
  b.rect(X - 1, Y + 2, 2, 5, flame, true); b.set(X - 2, Y + 3 + (fl % 2), lava, true);
  // cuernos curvos, grandes y oscuros
  const hornC = '#1a1010', hornL = '#4a3a34';
  b.rect(X + 1, Y, 2, 2, hornC); b.set(X, Y - 1, hornC); b.set(X - 1, Y - 2, hornC); b.set(X - 1, Y - 3, hornL); b.set(X, Y - 4, hornL);
  b.rect(X + 7, Y, 2, 2, hornC); b.set(X + 9, Y - 1, hornC); b.set(X + 10, Y - 2, hornC); b.set(X + 10, Y - 3, hornL); b.set(X + 9, Y - 4, hornL);
  if (tier >= 1) b.set(X + 9, Y + 4, c.eye, true);
  if (tier >= 2) { b.set(X, Y - 4, lava, true); b.set(X + 9, Y - 4, lava, true); } // cuernos al rojo
  if (tier >= 3) for (const [x, y] of [[5, 9], [18, 12], [4, 17], [19, 20]]) b.set(x, y + by, flame, true); // ascuas flotando
  arm(b, 14, 13 + by, p.ra, 7, c.skin, c.skin, 3);
  const hx = 14 + Math.sin(p.ra) * 8, hy = 13 + by + Math.cos(p.ra) * 8;
  b.set(hx, hy, lava, true); b.set(hx + 1, hy - 1, flame, true); // puño en llamas
  void anim;
};

const slimeForm: FormFn = (b, p, c, anim, tier) => {
  // Baba: gota gelatinosa que rebota; se aplasta al caer y se estira al saltar
  const sw = p.sway ?? 0;
  const squash = anim === Anim.Walk ? (p.by < 0 ? -2 : 1) : anim === Anim.Attack ? 1 : 0;
  const top = 10 - squash * 2 + Math.max(0, -p.by), hw = 8 + squash;
  for (let y = top; y <= FLOOR; y++) {
    const t = (y - top) / (FLOOR - top);
    const half = Math.round(hw * Math.sqrt(Math.min(1, 0.25 + t * 1.6)) * (t > 0.85 ? 1 - (t - 0.85) * 1.2 : 1));
    b.rect(12 - half, y, half * 2, 1, t < 0.25 ? c.hair : t > 0.75 ? c.cloth : c.skin);
  }
  // brillos y burbujas dentro
  b.rect(8, top + 2, 2, 2, '#ffffff', false); b.set(10, top + 1, c.accent, false, true);
  for (const [x, y] of [[14, 22], [9, 25], [16, 27], [11, 19]]) b.set(x, y, c.accent, false, true);
  // goterones en la base
  b.set(4 - sw % 2, FLOOR, c.cloth); b.set(20 + sw % 2, FLOOR, c.cloth);
  // cara
  const ex = 13 + (p.lean ?? 0), ey = top + 7;
  if (!p.blink) { b.rect(ex, ey, 2, 3, c.eye); b.rect(ex + 4, ey, 2, 3, c.eye); b.set(ex, ey, '#ffffff', false, true); b.set(ex + 4, ey, '#ffffff', false, true); }
  else { b.rect(ex, ey + 1, 2, 1, c.eye); b.rect(ex + 4, ey + 1, 2, 1, c.eye); }
  if (p.mouth) b.rect(ex + 1, ey + 5, 4, 2, c.eye); else b.rect(ex + 1, ey + 5, 4, 1, c.eye);
  if (tier >= 1) b.set(ex + 5, ey, c.accent, true);
  if (tier >= 2) for (const [x, y] of [[9, 25], [16, 27]]) b.set(x, y, c.accent, true); // núcleo que brilla
  if (tier >= 3) { b.rect(10, top - 2, 1, 2, c.hair); b.set(10, top - 3, c.accent, true); b.rect(14, top - 1, 1, 1, c.hair); } // antenitas de baba
};

/** Plantas del Árbol maldito: muro de raíces, torreta de espinas (despertada de un árbol del mapa: más grande) y flor curativa. */
const plantCache = new Map<string, Baked>();
export function getPlant(kind: string, frame: number, awake = false): Baked {
  const f = frame % 2;
  const key = `${kind}|${f}|${awake}`;
  let out = plantCache.get(key);
  if (out) return out;
  const b = new PB(SW, SH);
  const bark = '#5a4632', barkD = '#3a2c20', leaf = '#2e4a24', leafL = '#4a7a34', glow = '#a0e040';
  if (kind === 'wall') {
    // maraña de raíces y troncos retorcidos con espinas
    for (let i = 0; i < 6; i++) {
      const x0 = 2 + i * 4, h = 14 + ((i * 7) % 5) * 2;
      b.line(x0, FLOOR, x0 + (i % 2 ? 2 : -1), FLOOR - h, i % 2 ? bark : barkD);
      b.line(x0 + 1, FLOOR, x0 + 1 + (i % 2 ? 2 : -1), FLOOR - h + 1, bark);
      b.set(x0 + (i % 2 ? 3 : -2), FLOOR - h + 4, '#d8c8a0'); // espina
    }
    b.line(1, FLOOR - 6, 23, FLOOR - 10, barkD); b.line(1, FLOOR - 13, 23, FLOOR - 9, bark); // raíces cruzadas
    for (const [x, y] of [[5, 13], [12, 11], [19, 14], [9, 17]]) { b.set(x, y, leaf); b.set(x + 1, y, leafL); }
    if (f) b.set(14, 15, glow, true);
  } else if (kind === 'turret') {
    // planta carnívora: tallo, hojas y una boca con dientes que escupe espinas
    const s = awake ? 1 : 0;
    b.line(12, FLOOR, 12, 14 - s * 2, leaf); b.line(13, FLOOR, 13, 14 - s * 2, leafL);
    b.ellipse(8, 25, 4, 1, leaf); b.ellipse(17, 23, 4, 1, leafL); // hojas
    const hy = 9 - s * 3 + (f ? 1 : 0);
    b.ellipse(13, hy, 5 + s, 4 + s, '#8a1a2a'); b.ellipse(13, hy - 1, 4 + s, 2, '#c03040');
    b.rect(15, hy - 1, 4 + s, 2 + f, '#2a0a10'); // boca
    for (const x of [15, 17, 19]) { b.set(x, hy - 1, '#f0e0c0'); b.set(x, hy + 1 + f, '#f0e0c0'); }
    b.set(11, hy - 2, glow, true); b.set(12, hy - 3, glow, true);
    if (awake) { b.line(4, FLOOR, 9, FLOOR - 4, barkD); b.line(21, FLOOR, 16, FLOOR - 4, barkD); b.set(10, hy + 2, '#ffb020', true); } // raíces del árbol despertado
  } else {
    // flor curativa: pétalos claros con un corazón brillante que late
    b.line(12, FLOOR, 12, 18, leaf); b.ellipse(9, 25, 3, 1, leafL); b.ellipse(15, 27, 3, 1, leaf);
    const r = f ? 4 : 3;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.ellipse(12 + Math.cos(a) * r, 14 + Math.sin(a) * r * 0.8, 2, 2, i % 2 ? '#f0d0f0' : '#e0a8e0'); }
    b.ellipse(12, 14, 2, 2, '#ffe060'); b.set(12, 14, '#ffffff', true); b.set(11, 13, glow, true); b.set(13, 15, glow, true);
  }
  out = b.finish({ outline: 'selout' });
  plantCache.set(key, out);
  return out;
}

/** Animalillo (maleficio de la bruja): un sapo que da saltitos. */
const critterCache: Baked[] = [];
export function getCritter(frame: number): Baked {
  const f = frame % 2;
  if (critterCache[f]) return critterCache[f];
  const b = new PB(SW, SH);
  const y0 = f ? 22 : 25; // en el salto se eleva
  b.ellipse(12, y0 + 3, 5, 3, '#4a8a3a');
  b.ellipse(12, y0 + 4, 4, 2, '#a0c070'); // barriga
  b.rect(8, y0, 3, 2, '#4a8a3a'); b.rect(14, y0, 3, 2, '#4a8a3a'); // ojos saltones
  b.set(9, y0, '#ffe060', true); b.set(15, y0, '#ffe060', true);
  b.set(9, y0 + 1, '#101010', false, true); b.set(15, y0 + 1, '#101010', false, true);
  b.rect(10, y0 + 4, 5, 1, '#2a4a20'); // boca
  b.rect(6, y0 + 6 - f, 3, 1, '#3a7a2a'); b.rect(16, y0 + 6 - f, 3, 1, '#3a7a2a'); // patas
  if (f) { b.rect(7, y0 + 7, 2, 2, '#3a7a2a'); b.rect(16, y0 + 7, 2, 2, '#3a7a2a'); } // patas estiradas en el salto
  b.set(13, y0 - 2, '#c060ff', true); // chispa del maleficio
  critterCache[f] = b.finish({ outline: 'selout' });
  return critterCache[f];
}

export const FORMS: Record<CharacterId, FormFn> = {
  vampire, werewolf, mummy, invisible, zombie: zombieForm, kthula: kthulaForm,
  nightmare: nightmareForm, mary: maryForm, reanimated: reanimatedForm, doppy: doppyForm, witch: witchForm,
  succubus: succubusForm, poltergeist: poltergeistForm, tree: treeForm, pirate: pirateForm, spider: spiderForm, scarecrow: scarecrowForm, demon: demonForm, slime: slimeForm,
};

// ---------------------------------------------------------------------------
// Humanos y Hunter
// ---------------------------------------------------------------------------
const SKIN_TONES = ['#f2c8a0', '#e0a882', '#c08560', '#8d5a3c', '#5e3a26', '#f5d5b8'];
const HAIR = ['#2a1a10', '#5a3418', '#d8b050', '#141414', '#9a3a1a', '#8a8a8a', '#e8d8a0', '#3a2a50'];

export type Held = 'none' | 'flashlight' | 'torch' | 'cross' | 'candle' | 'pitchfork' | 'lantern' | 'shovel';

interface NpcLook {
  top: string; top2: string; legs: string; shoe: string;
  styles: HairStyle[];
  kind: 'tshirt' | 'jacket' | 'sweater' | 'dress' | 'robe' | 'apron' | 'overalls' | 'uniform' | 'tunic';
  held: Held[];
  glasses?: number; // probabilidad
  cap?: string;
}

const NPC_LOOKS: Record<string, NpcLook[]> = {
  teen: [
    { top: '#c03040', top2: '#f0f0f0', legs: '#3050a0', shoe: '#f0f0f0', styles: ['long', 'ponytail', 'short'], kind: 'jacket', held: ['flashlight', 'none', 'none'] },
    { top: '#e0a020', top2: '#804010', legs: '#3a3a50', shoe: '#202020', styles: ['spiky', 'mohawk', 'short'], kind: 'tshirt', held: ['none', 'none', 'flashlight'] },
    { top: '#8040a0', top2: '#f0d0f0', legs: '#202030', shoe: '#e04080', styles: ['pigtails', 'bun', 'long'], kind: 'dress', held: ['none'] },
  ],
  neighbor: [
    { top: '#a0c0e0', top2: '#7090b0', legs: '#a0c0e0', shoe: '#c08080', styles: ['bun', 'short'], kind: 'robe', held: ['none', 'candle'] },
    { top: '#8a6a4a', top2: '#5a4a3a', legs: '#404040', shoe: '#202020', styles: ['bald', 'short'], kind: 'sweater', held: ['none', 'flashlight', 'none'] },
  ],
  jock: [
    { top: '#20a040', top2: '#f0f0f0', legs: '#e0e0e0', shoe: '#f0f0f0', styles: ['short', 'spiky'], kind: 'uniform', held: ['none'] },
    { top: '#3040c0', top2: '#e0c020', legs: '#303030', shoe: '#e0e0e0', styles: ['cap'], kind: 'jacket', held: ['none', 'none', 'flashlight'], cap: '#3040c0' },
  ],
  nerd: [
    { top: '#6a8a3a', top2: '#f0e8d0', legs: '#6a5a40', shoe: '#3a2a1a', styles: ['short', 'afro'], kind: 'sweater', held: ['flashlight', 'none'], glasses: 1 },
    { top: '#d0d0e0', top2: '#3050a0', legs: '#3a3a50', shoe: '#3a2a1a', styles: ['bun', 'ponytail'], kind: 'tshirt', held: ['none', 'none', 'flashlight'], glasses: 0.7 },
  ],
  villager: [
    { top: '#7a5a3a', top2: '#c0a070', legs: '#4a3a2a', shoe: '#2a1a10', styles: ['short', 'bald'], kind: 'tunic', held: ['torch', 'pitchfork', 'none'] },
    { top: '#8a3030', top2: '#e0d0b0', legs: '#4a3a2a', shoe: '#2a1a10', styles: ['long', 'bun'], kind: 'dress', held: ['torch', 'none'] },
    { top: '#4a5a3a', top2: '#c0a070', legs: '#3a2a20', shoe: '#2a1a10', styles: ['beanie', 'short'], kind: 'tunic', held: ['pitchfork', 'torch'], cap: '#6a3a2a' },
  ],
  priest: [{ top: '#18181e', top2: '#ffffff', legs: '#18181e', shoe: '#101010', styles: ['bald', 'short'], kind: 'robe', held: ['cross'] }],
  maid: [{ top: '#202030', top2: '#f0f0f0', legs: '#202030', shoe: '#101010', styles: ['bun', 'ponytail'], kind: 'apron', held: ['candle'] }],
  camper: [
    { top: '#e07020', top2: '#ffffff', legs: '#5a7a3a', shoe: '#6a4a2a', styles: ['cap', 'short'], kind: 'tshirt', held: ['flashlight', 'lantern', 'none'], cap: '#2a5a2a' },
    { top: '#e07020', top2: '#ffffff', legs: '#3a5a8a', shoe: '#f0f0f0', styles: ['long', 'ponytail', 'pigtails'], kind: 'tshirt', held: ['none', 'none', 'flashlight'] },
    { top: '#3a6a9a', top2: '#c0d0e0', legs: '#6a5a3a', shoe: '#4a3020', styles: ['beanie', 'afro'], kind: 'overalls', held: ['lantern', 'flashlight'], cap: '#a03030' },
  ],
  // Engatusar de Doppy: humanos irresistibles
  hunk: [{ top: '#f0f0f0', top2: '#e0c060', legs: '#2a3a6a', shoe: '#e0e0e0', styles: ['slick', 'spiky'], kind: 'tshirt', held: ['none'] }],
  gravedigger: [{ top: '#3a3430', top2: '#6a5a48', legs: '#2a2420', shoe: '#1a1410', styles: ['cap', 'bald'], kind: 'overalls', held: ['shovel'], cap: '#2a2420' }], // el enterrador de la pala
  belle: [{ top: '#e02060', top2: '#ffd0e0', legs: '#e02060', shoe: '#e02060', styles: ['long', 'ponytail'], kind: 'dress', held: ['none'] }],
  counselor: [{ top: '#c02020', top2: '#ffffff', legs: '#e0d0a0', shoe: '#f0f0f0', styles: ['short', 'ponytail', 'cap'], kind: 'uniform', held: ['flashlight', 'none'], cap: '#c02020' }],
};

/** Aspecto determinista de un NPC (lo usa también el juego para saber qué luz lleva). */
export function npcLook(variant: string, seed: number) {
  const looks = NPC_LOOKS[variant] ?? NPC_LOOKS.teen;
  const r = (k: number) => { const n = Math.sin(seed * 9.13 + k * 47.7) * 43758.5453; return n - Math.floor(n); };
  const L = looks[Math.floor(r(1) * looks.length)];
  return {
    L,
    skin: SKIN_TONES[Math.floor(r(2) * SKIN_TONES.length)],
    hair: HAIR[Math.floor(r(3) * HAIR.length)],
    style: L.styles[Math.floor(r(4) * L.styles.length)],
    held: L.held[Math.floor(r(5) * L.held.length)],
    glasses: r(6) < (L.glasses ?? 0.1),
    stout: r(7) < 0.3,
  };
}

function heldItem(b: PB, held: Held, hx: number, hy: number) {
  switch (held) {
    case 'flashlight': b.rect(hx, hy, 3, 2, '#3a3a44'); b.set(hx + 3, hy, '#fff6c0', true); b.set(hx + 3, hy + 1, '#fff6c0', true); break;
    case 'torch': b.line(hx, hy + 3, hx + 1, hy - 3, '#6a4020'); b.rect(hx, hy - 6, 2, 3, '#ff9020', true); b.set(hx + 1, hy - 7, '#ffe060', true); b.set(hx, hy - 4, '#ff5010', true); break;
    case 'pitchfork': b.line(hx - 1, hy + 4, hx + 2, hy - 7, '#7a5030'); b.rect(hx, hy - 9, 5, 1, '#9090a0'); for (const dx of [0, 2, 4]) b.set(hx + dx, hy - 10, '#b0b0c0'); break;
    case 'cross': b.rect(hx + 1, hy - 4, 1, 6, '#e0c040', true); b.rect(hx, hy - 3, 3, 1, '#e0c040', true); break;
    case 'candle': b.rect(hx, hy - 3, 2, 3, '#f0e8d0'); b.set(hx, hy - 4, '#ffd040', true); b.set(hx, hy - 5, '#fff0a0', true); break;
    case 'shovel': b.line(hx - 1, hy + 4, hx + 2, hy - 8, '#6a4a28'); b.rect(hx + 1, hy - 12, 3, 4, '#8a8a94'); b.set(hx + 2, hy - 12, '#c0c0c8'); break;
    case 'lantern': b.rect(hx, hy + 1, 3, 4, '#3a3020'); b.set(hx + 1, hy + 2, '#ffc040', true); b.set(hx + 1, hy + 3, '#ffe080', true); b.set(hx + 1, hy, '#3a3020'); break;
  }
}

type ZombieKind = 'normal' | 'fast' | 'tough' | 'fat';
const ZOMBIE_SKIN: Record<ZombieKind, string> = { normal: '#6a9a50', fast: '#9aaab0', tough: '#4a6a3a', fat: '#7a9a48' };

function drawNpc(b: PB, p: Pose, variant: string, seed: number, zombie?: ZombieKind, anim: Anim = Anim.Idle) {
  const n = npcLook(variant, seed);
  if (zombie && (anim === Anim.Idle || anim === Anim.Walk)) p = { ...p, la: 1.35 + p.la * 0.2, ra: 1.5 + p.ra * 0.2, mouth: true };
  const L = n.L, by = p.by;
  const skin = zombie ? mix(n.skin, ZOMBIE_SKIN[zombie], 0.65) : n.skin;
  const tw = zombie === 'fat' ? 11 : n.stout ? 9 : 8;
  arm(b, 10, 13 + by, p.la, 7, shade(L.top, -0.25), skin);
  const longSkirt = L.kind === 'dress' || L.kind === 'robe' || L.kind === 'apron';
  legs(b, p, shade(L.legs, -0.2), L.legs, L.shoe, { top: longSkirt ? 24 : HIP });
  torso(b, by, L.top, { w: tw, bottom: longSkirt ? 26 : HIP });
  if (longSkirt) { b.rect(7, 22, tw + 2, 4, L.top); b.rect(7, 25, tw + 2, 1, shade(L.top, -0.2)); }
  switch (L.kind) {
    case 'tshirt': b.rect(11, 15 + by, 3, 2, L.top2); b.rect(8, HIP - 1, tw, 1, L.legs); break;
    case 'jacket': b.rect(12, 12 + by, 3, 8, L.top2); b.line(11, 12 + by, 11, 20 + by, shade(L.top, -0.3)); break;
    case 'sweater': for (let y = 14; y < HIP; y += 3) b.rect(8, y + by, tw, 1, L.top2); break;
    case 'dress': b.rect(8, 18 + by, tw, 1, L.top2); break;
    case 'robe': b.set(13, 12 + by, L.top2); b.set(12, 12 + by, L.top2); b.line(12, 13 + by, 12, 25, shade(L.top, -0.25)); break;
    case 'apron': b.rect(10, 15 + by, 5, 11, L.top2); b.rect(11, 12 + by, 3, 1, L.top2); break;
    case 'overalls': b.rect(9, 16 + by, tw - 2, 5, L.legs); b.set(10, 13 + by, L.legs); b.set(14, 13 + by, L.legs); b.set(12, 17 + by, '#e0c040', false, true); break;
    case 'uniform': b.rect(13, 12 + by, 1, 6, L.top2); b.set(13, 14 + by, '#c0c0c0', false, true); b.line(13, 12 + by, 15, 15 + by, '#e0e0e0'); break;
    case 'tunic': b.rect(8, 18 + by, tw, 1, '#4a2a1a'); b.set(13, 18 + by, '#c0a040'); break;
  }
  if (zombie) {
    // ropa rasgada, manchas de sangre y barriga del zombi gordo
    for (const [x, y] of [[8, HIP - 1], [11, HIP - 1], [14, 17], [9, 15]]) b.clear(x, y + (y < HIP - 1 ? by : 0));
    b.set(12, 14 + by, '#7a1010'); b.set(13, 15 + by, '#5a0a0a'); b.set(10, 18 + by, '#7a1010');
    if (zombie === 'fat') { b.ellipse(13, 18 + by, 4, 3, shade(skin, -0.05)); b.set(14, 17 + by, '#a0c060', true); b.set(12, 19 + by, '#a0c060', true); }
  }
  humanHead(b, p, { skin, hair: n.hair, eye: zombie ? '#e8ff60' : '#1a1a24', style: n.style, glasses: n.glasses ? '#202024' : undefined, cap: L.cap, eyeGlow: !!zombie });
  if (zombie) { const X = 7 + (p.lean ?? 0), Y = 2 + by; b.set(X + 8, Y + 9, '#8a1010'); b.set(X + 4, Y + 7, shade(skin, -0.3)); }
  arm(b, 13, 13 + by, p.ra, 7, L.top, skin);
  const hx = 13 + Math.sin(p.ra) * 7, hy = 13 + by + Math.cos(p.ra) * 7;
  if (!zombie) heldItem(b, n.held, hx, hy);
  if (variant === 'hunk' || variant === 'belle') {
    // irresistible: brillo de estrella y (el chico) brazos de culturista
    if (variant === 'hunk') { b.rect(7, 12 + p.by, 2, 5, skin); b.rect(15, 12 + p.by, 2, 4, skin); b.set(8, 13 + p.by, shade(skin, 0.2)); }
    b.set(17, 2 + p.by, '#fff8c0', true); b.set(18, 1 + p.by, '#ffffff', true); b.set(16, 1 + p.by, '#fff8c0', true); b.set(17, 0 + p.by, '#fff8c0', true);
    b.set(5, 15 + p.by, '#ffd0f0', true);
  }
}

/** Cazador clásico y el resto de la orden (inquisidor, exorcista, sectario, heraldo de la luz). */
function drawHunterType(b: PB, p: Pose, type: string) {
  switch (type) {
    case 'inquisidor': return drawInquisitor(b, p);
    case 'exorcista': return drawExorcist(b, p);
    case 'sectario': return drawCultist(b, p);
    case 'heraldo': return drawHerald(b, p);
    default: return drawHunter(b, p);
  }
}

/** Capucha que tapa la cabeza dejando la cara en sombra. */
function hood(b: PB, p: Pose, c: string, face: string, eye: string, eyeGlow: boolean, peak = 0) {
  const X = 7 + (p.lean ?? 0), Y = 2 + p.by;
  b.rect(X, Y + 1, 10, 10, c); b.rect(X + 1, Y, 8, 1, c);
  for (let k = 1; k <= peak; k++) b.rect(X + 3 + Math.floor(k / 2), Y - k, 4 - Math.floor(k / 2), 1, c);
  b.rect(X + 5, Y + 3, 5, 6, face); // hueco de la cara
  b.set(X + 7, Y + 5, eye, eyeGlow); b.set(X + 9, Y + 5, eye, eyeGlow);
  b.line(X + 1, Y + 2, X + 1, Y + 10, shade(c, -0.25));
}

function drawInquisitor(b: PB, p: Pose) {
  const by = p.by, robe = '#5a0e14', robe2 = '#3a080c', black = '#16121a';
  arm(b, 10, 13 + by, p.la, 7, shade(robe, -0.3), '#1a1418');
  legs(b, p, '#1a1418', '#221c22', '#0e0c10', { top: 24 });
  torso(b, by, robe, { x: 7, w: 10, bottom: 28 });
  b.rect(7, 22, 10, 6, robe); b.line(12, 13 + by, 12, 27, robe2);
  b.rect(8, 12 + by, 8, 3, black); // esclavina negra
  b.rect(11, 15 + by, 2, 6, '#c8a040'); b.rect(10, 17 + by, 4, 1, '#c8a040'); // cruz bordada
  b.rect(7, 21 + by, 10, 1, '#2a1a10');
  hood(b, p, black, '#2a1a1e', '#ff5030', true, 3);
  // espada envuelta en llamas
  const dx = Math.sin(p.ra), dy = Math.cos(p.ra);
  const hx = 13 + dx * 6, hy = 13 + by + dy * 6;
  arm(b, 13, 13 + by, p.ra, 6, robe, '#1a1418');
  const ux = Math.sin(p.ra - 1.2), uy = Math.cos(p.ra - 1.2);
  b.line(hx - ux, hy - uy, hx + ux, hy + uy, '#6a5030');
  for (let i = 1; i <= 8; i++) { b.set(hx + dx * 0 + Math.sin(p.ra - 2.4) * i, hy + Math.cos(p.ra - 2.4) * i, i > 2 ? '#d0d0e0' : '#808090', i > 5); if (i > 3 && i % 2) b.set(hx + Math.sin(p.ra - 2.4) * i + 1, hy + Math.cos(p.ra - 2.4) * i - 1, '#ff9020', true); }
}

function drawExorcist(b: PB, p: Pose) {
  const by = p.by, cass = '#141218', stole = '#6a2a8a', skin = '#d8b090';
  arm(b, 10, 13 + by, p.la, 7, shade(cass, -0.2), skin);
  // libro en la mano de atrás
  const bx = 10 + Math.sin(p.la) * 6, byy = 13 + by + Math.cos(p.la) * 6;
  b.rect(bx - 2, byy - 1, 4, 3, '#5a1a1a'); b.rect(bx - 1, byy - 1, 2, 3, '#e8e0c8');
  legs(b, p, '#141218', '#1a181e', '#0a0a0a', { top: 25 });
  torso(b, by, cass, { x: 7, w: 9, bottom: 28 });
  b.rect(7, 22, 9, 6, cass);
  for (let y = 14; y < 26; y += 2) b.set(12, y + (y < 22 ? by : 0), '#3a3640'); // botones
  b.rect(10, 12 + by, 1, 12, stole); b.rect(14, 12 + by, 1, 12, stole); b.set(10, 23 + by, '#e0c040'); b.set(14, 23 + by, '#e0c040');
  humanHead(b, p, { skin, hair: '#c8c8c8', eye: '#1a1a24', style: 'short', glasses: '#202024' });
  const X = 7 + (p.lean ?? 0), Y = 2 + by;
  b.rect(X + 3, Y + 11, 4, 1, '#f0f0f0'); // alzacuellos
  // frasco de agua bendita
  const dx = Math.sin(p.ra), dy = Math.cos(p.ra);
  const hx = 13 + dx * 7, hy = 13 + by + dy * 7;
  arm(b, 13, 13 + by, p.ra, 6, cass, skin);
  b.rect(hx, hy - 3, 3, 3, '#80c8ff', true); b.set(hx + 1, hy - 4, '#d0e8f0'); b.set(hx + 1, hy - 5, '#8a6a40'); b.set(hx + 1, hy - 2, '#e0f8ff', true);
}

function drawCultist(b: PB, p: Pose) {
  const by = p.by, sw = p.sway ?? 0, robe = '#2e1a3a', robe2 = '#1e1026';
  arm(b, 10, 13 + by, p.la, 7, shade(robe, -0.25), '#b8a090');
  legs(b, p, '#1a1020', '#22142a', '#0e0a10', { top: 24 });
  torso(b, by, robe, { x: 8, w: 8, bottom: 28 });
  b.rect(7 - sw, 22, 10, 6, robe);
  for (const x of [8, 11, 14]) b.clear(x - sw, 27); // bajo raído
  b.line(12, 13 + by, 12, 27, robe2);
  b.set(11, 16 + by, '#c03050', true); b.set(12, 17 + by, '#c03050', true); b.set(13, 16 + by, '#c03050', true); // símbolo
  b.rect(8, 20 + by, 8, 1, '#5a3a20');
  hood(b, p, robe, '#120a14', '#ff2040', true, 1);
  // daga y vela
  const dx = Math.sin(p.ra), dy = Math.cos(p.ra);
  const hx = 13 + dx * 7, hy = 13 + by + dy * 7;
  arm(b, 13, 13 + by, p.ra, 6, robe, '#b8a090');
  b.line(hx, hy, hx + 3, hy - 2, '#c0c0d0'); b.set(hx - 1, hy + 1, '#5a3a20');
  b.rect(8, 22 + by, 2, 2, '#e8e0c8'); b.set(8, 21 + by, '#ffb040', true);
}

function drawHerald(b: PB, p: Pose) {
  const by = p.by, white = '#e8e4f0', gold = '#e0b040', skin = '#f0e0d0';
  // alas detrás (batiendo despacio con el balanceo)
  const flap = Math.round((p.sway ?? 0) * 0.7);
  for (let i = 0; i < 12; i++) {
    const y = 6 + i + by - flap;
    const w = i < 3 ? 4 + i : 7 - Math.floor((i - 3) / 1.6);
    if (w <= 0) continue;
    const col = i % 3 === 2 ? '#9aa4d0' : i % 3 === 1 ? '#c8d0f0' : '#f4f6ff';
    b.rect(7 - w, y, w, 1, col);
    b.rect(17, y, w, 1, col);
    b.set(7 - w, y, '#8a94c8'); b.set(16 + w, y, '#8a94c8'); // puntas de las plumas
  }
  b.set(1, 9 + by - flap, '#fff8d0', true); b.set(22, 9 + by - flap, '#fff8d0', true);
  arm(b, 10, 13 + by, p.la, 7, shade(white, -0.2), gold, 2, true);
  legs(b, p, '#a8a0b8', '#c8c0d8', gold, { top: 25, boots: gold });
  torso(b, by, white, { x: 7, w: 10, bottom: 28 });
  b.rect(7, 22, 10, 6, white); b.rect(7, 27, 10, 1, gold);
  b.rect(8, 12 + by, 8, 5, '#d0c8a0'); b.rect(8, 12 + by, 8, 1, gold); b.rect(11, 13 + by, 2, 4, gold, true); // peto con sol
  b.rect(7, 20 + by, 10, 1, gold);
  humanHead(b, p, { skin, hair: '#f0e0a0', eye: '#fff8c0', style: 'long', eyeGlow: true });
  const X = 7 + (p.lean ?? 0), Y = 2 + by;
  b.rect(X + 2, Y - 3, 6, 1, '#fff0a0', true); b.set(X + 1, Y - 2, '#fff0a0', true); b.set(X + 8, Y - 2, '#fff0a0', true); // aureola
  // maza
  const dx = Math.sin(p.ra), dy = Math.cos(p.ra);
  const hx = 13 + dx * 6, hy = 13 + by + dy * 6;
  arm(b, 13, 13 + by, p.ra, 6, white, gold, 2, true);
  const ux = Math.sin(p.ra + 2.6), uy = Math.cos(p.ra + 2.6);
  for (let i = 0; i < 7; i++) b.set(hx + ux * i, hy + uy * i, '#8a6a30');
  const mx = hx + ux * 8, my = hy + uy * 8;
  b.rect(mx - 1, my - 1, 4, 4, gold); b.set(mx, my, '#fff8d0', true); b.set(mx - 2, my + 1, gold); b.set(mx + 3, my + 1, gold); b.set(mx + 1, my - 2, gold); b.set(mx + 1, my + 3, gold);
}

function drawHunter(b: PB, p: Pose) {
  const by = p.by, sw = p.sway ?? 0;
  const coat = '#5a3e2c', coat2 = '#3a281c', skin = '#d8a880', hat = '#26201e';
  // faldones del abrigo y bufanda
  b.rect(6 - sw, 20, 3, 8, coat2); b.line(9, 12 + by, 5 - sw, 15 + by, '#8a1a1a'); b.line(9, 13 + by, 6 - sw, 16 + by, '#6a1010');
  arm(b, 10, 13 + by, p.la, 7, shade(coat, -0.25), '#3a2a20');
  legs(b, p, '#26262e', '#30303a', '#141414', { boots: '#2a1e18' });
  // farol al cinto (brilla)
  b.rect(7, 18 + by, 2, 3, '#3a3020'); b.set(7, 19 + by, '#ffc040', true); b.set(7, 20 + by, '#ffe080', true);
  // abrigo largo
  torso(b, by, coat, { x: 7, w: 9, bottom: 27 });
  b.rect(7, HIP, 9, 6, coat); b.line(12, 18 + by, 12, 26, coat2);
  b.rect(11, 12 + by, 3, 6, '#c8b8a0'); // camisa
  b.line(9, 12 + by, 15, 19 + by, '#4a2a18'); // bandolera
  for (const k of [0, 2, 4]) b.set(10 + k, 13 + by + k, '#d8c8a0', false, true); // estacas
  b.rect(7, 18 + by, 9, 1, '#2a1a10'); b.set(13, 18 + by, '#c0c0d0', false, true);
  b.set(9, 14 + by, '#e0e0e8', false, true); // cruz de plata
  humanHead(b, p, { skin, hair: '#4a3020', eye: '#1a1a1a', style: 'short', beard: '#4a3020' });
  const X = 7 + (p.lean ?? 0), Y = 2 + by;
  b.rect(X - 3, Y + 2, 16, 1, hat); b.rect(X - 2, Y + 3, 14, 1, shade(hat, -0.3));
  b.rect(X + 1, Y - 2, 8, 4, hat); b.rect(X + 1, Y + 1, 8, 1, '#6a1a1a');
  // ballesta
  const dx = Math.sin(p.ra), dy = Math.cos(p.ra);
  const hx = 13 + dx * 6, hy = 13 + by + dy * 6;
  arm(b, 13, 13 + by, p.ra, 6, coat, '#3a2a20');
  b.rect(hx, hy - 1, 7, 2, '#6a4020'); b.set(hx + 7, hy - 1, '#d0d0e0', false, true);
  b.line(hx + 4, hy - 5, hx + 4, hy + 3, '#3a2a1a'); b.line(hx + 4, hy - 5, hx + 1, hy - 1, '#c0b090'); b.line(hx + 4, hy + 3, hx + 1, hy, '#c0b090');
}

// ---------------------------------------------------------------------------
// Caché de frames
// ---------------------------------------------------------------------------
const cache = new Map<string, Baked>();

export function frameCount(a: Anim) { return ANIMS[a].frames.length; }

export function getFrame(kind: 'monster' | 'npc' | 'hunter' | 'zombie', variant: string, skin: string, anim: Anim, frame: number, seed = 0, tier = 0): Baked {
  const sd = kind === 'npc' || kind === 'zombie' ? seed % 97 : 0;
  const key = `${kind}|${variant}|${skin}|${anim}|${frame}|${sd}|${tier}`;
  let f = cache.get(key);
  if (f) return f;
  const def = ANIMS[anim] ?? ANIMS[Anim.Idle];
  const pose = def.frames[frame % def.frames.length];
  const b = new PB(SW, SH);
  if (kind === 'monster') {
    const ch = variant as CharacterId;
    (FORMS[ch] ?? FORMS.vampire)(b, pose, getSkin(ch, skin).palette, anim, tier);
  } else if (kind === 'hunter') drawHunterType(b, pose, variant);
  else if (kind === 'zombie') drawNpc(b, pose, variant, sd, (skin as ZombieKind) || 'normal', anim);
  else drawNpc(b, pose, variant, sd);
  f = b.finish({ outline: kind === 'monster' && variant === 'invisible' ? 'faint' : 'selout' });
  cache.set(key, f);
  return f;
}

// ---------------------------------------------------------------------------
// Objetos pequeños: power-ups, proyectiles
// ---------------------------------------------------------------------------
type Art = string[];
const ITEM_ART: Record<string, { art: Art; pal: Record<string, string>; glow?: string }> = {
  blood: { art: ['....dd....', '....ww....', '....ww....', '...wrrw...', '..wrRrrw..', '.wrRRrrrw.', '.wrRrrrrw.', '.wrrrrrrw.', '..wrrrrw..', '...wwww...'], pal: { d: '#6a4020', w: '#c8c8e0', r: '#b01020', R: '#ff5060' }, glow: 'R' },
  speed: { art: ['......yy..', '.....yYy..', '....yYy...', '...yYyyyy.', '..yYYYYYy.', '.yyyyYYy..', '....yYy...', '...yYy....', '..yYy.....', '..yy......'], pal: { y: '#e0a020', Y: '#fff080' }, glow: 'Y' },
  fury: { art: ['..r..r..r.', '.rRr.rRrr.', '.rRRrRRRr.', 'rRRRRRRRRr', 'rRkkRRkkRr', 'rRkkRRkkRr', 'rRRRkkRRRr', '.rRRRRRRr.', '..rwRwRw..', '...wwww...'], pal: { r: '#a01810', R: '#ff5020', k: '#200808', w: '#f0f0f0' }, glow: 'R' },
  shield: { art: ['.bbbbbbbb.', 'bBBBwwBBBb', 'bBBBwwBBBb', 'bBwwwwwwBb', 'bBwwwwwwBb', 'bBBBwwBBBb', '.bBBwwBBb.', '.bBBBBBBb.', '..bBBBBb..', '...bbbb...'], pal: { b: '#203a90', B: '#4070e0', w: '#f0f0ff' }, glow: 'w' },
  coin: { art: ['...yyyy...', '..yYYYYy..', '.yYWyyyYy.', '.yYWyooYy.', '.yYyyyyYy.', '.yYyooyYy.', '.yYyyyyYy.', '..yYYYYy..', '...yyyy...'], pal: { y: '#a06010', Y: '#f0b020', W: '#fff8c0', o: '#a06010' }, glow: 'W' },
  xp: { art: ['....pp....', '...pPPp...', '..pPWWPp..', '.pPWWWWPp.', '.pPWWWWPp.', '.pPPWWPPp.', '..pPPPPp..', '...pPPp...', '....pp....'], pal: { p: '#5020a0', P: '#a060ff', W: '#f0e0ff' }, glow: 'W' },
  bat0: { art: ['k.........k', 'kk..kkk..kk', 'kkkkkkkkkkk', '.kkkkrkkkk.', '..k..k..k..'], pal: { k: '#2a1a3a', r: '#ff2040' }, glow: 'r' },
  bat1: { art: ['....kkk....', '...kkkkk...', '.kkkkrkkkk.', 'kkk..k..kkk', 'k.........k'], pal: { k: '#2a1a3a', r: '#ff2040' }, glow: 'r' },
  bandage: { art: ['.wwwwwwww.', 'wwcwwcwwcw', 'wcwwcwwcww', '.wwwwwwww.'], pal: { w: '#e8dcb0', c: '#b0a070' } },
  scarab0: { art: ['.l.l.l..', '..gGGg..', '.gGYGGgh', '..gGGg..', '.l.l.l..'], pal: { g: '#1a4a3a', G: '#2a8a6a', Y: '#e0c040', h: '#0a1a14', l: '#0a1a14' }, glow: 'Y' },
  scarab1: { art: ['l.l.l...', '..gGGg..', '.gGYGGgh', '..gGGg..', 'l.l.l...'], pal: { g: '#1a4a3a', G: '#2a8a6a', Y: '#e0c040', h: '#0a1a14', l: '#0a1a14' }, glow: 'Y' },
  footprint: { art: ['.oo..', 'oooo.', '.oo..', '.....', '..oo.', '.oooo', '..oo.'], pal: { o: '#2a2230' } },
  nail: { art: ['hh......', 'hhsssssp', 'hh......'], pal: { h: '#6a6a74', s: '#a8a8b4', p: '#e0e0f0' } },
  nailback: { art: ['hh......', 'hhsssssp', 'hh......'], pal: { h: '#6a6a74', s: '#c8e8ff', p: '#ffffff' }, glow: 's' },
  boulder0: { art: ['..rrrr..', '.rRRrrr.', 'rRRrrrrr', 'rrrrrrkr', '.rrrrkk.', '..rrkk..'], pal: { r: '#6a6a72', R: '#9a9aa4', k: '#3a3a42' } },
  boulder1: { art: ['..ssss..', '.sSSSSs.', '.sSkSSs.', '.skkkSs.', '.sSkSSs.', '.sSSSSs.', '.ssssss.'], pal: { s: '#5a5a62', S: '#8a8a94', k: '#3a3a42' } },
  boulder2: { art: ['.bbbbbbbbbb.', 'bBBbbbbbbbbo', 'bbbbbbBbbbbO', '.bbbbbbbbbb.'], pal: { b: '#4a3020', B: '#6a4a30', o: '#8a6a40', O: '#a08050' } },
  potion0: { art: ['..cc..', '..ww..', '.wFFw.', 'wFYFFw', 'wFFFFw', '.wwww.'], pal: { c: '#8a6a40', w: '#d0e0d8', F: '#ff6020', Y: '#ffe060' }, glow: 'Y' },
  potion1: { art: ['..cc..', '..ww..', '.wAAw.', 'wAYAAw', 'wAAAAw', '.wwww.'], pal: { c: '#8a6a40', w: '#d0e0d8', A: '#80e020', Y: '#e0ff80' }, glow: 'Y' },
  potion2: { art: ['..cc..', '..ww..', '.wHHw.', 'wHYHHw', 'wHHHHw', '.wwww.'], pal: { c: '#8a6a40', w: '#d0e0d8', H: '#e02010', Y: '#ffb060' }, glow: 'Y' }, // rabia
  heart: { art: ['.RR.RR.', 'RWRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'], pal: { R: '#ff3a7a', W: '#ffd0e0' }, glow: 'R' },
  obj0: { art: ['b......', 'b......', 'b......', 'bsssss.', 'b.....b', 'b.....b'], pal: { b: '#6a4428', s: '#8a5a34' } }, // silla
  obj1: { art: ['rrrrrr', 'rwwwwr', 'rwwwwr', 'rrrrrr'], pal: { r: '#7a1a20', w: '#e8e0c8' } }, // libro
  obj2: { art: ['.wwwww.', 'wbbbbbw', '.wwwww.'], pal: { w: '#e8ecf0', b: '#5a7aa8' } }, // plato
  obj3: { art: ['..f..', '..y..', '..c..', '..c..', '.ccc.', 'ccccc'], pal: { f: '#ffe060', y: '#ff9020', c: '#c8a040' }, glow: 'f' }, // candelabro
  thorn: { art: ['ss.....', '.ssssgp', 'ss.....'], pal: { s: '#3a6a20', g: '#a0e040', p: '#e8e0b0' }, glow: 'g' },
  skull: { art: ['.wwww.', 'wwwwww', 'wkwwkw', 'wwwwww', '.wkkw.', '.w..w.'], pal: { w: '#e8f0e0', k: '#7a30c0' }, glow: 'k' },
  spirits: { art: ['...pp.....', '..pwwwp...', '.pwwwwwp..', '.pwkwwkwp.', '.pwwwwwwp.', '..pwkkwp..', '...pwwp...', '..p.p.p...', '.p..p..p..', '....p.....'], pal: { p: '#7a30c0', w: '#e8f0e0', k: '#a050ff' }, glow: 'k' },
  boots: { art: ['..bbb.....', '..bBb.....', '..bBb.....', '..bBb.....', '..bBbb....', '..bBBBbb..', '.bBBBBBBb.', '.ssssssss.', '.y.y.y.y..'], pal: { b: '#4a2a18', B: '#7a4a28', s: '#2a1a10', y: '#ffd040' }, glow: 'y' },
  shovel: { art: ['....h.....', '....h.....', '....h.....', '....h.....', '....h.....', '...mmm....', '..mMMMm...', '..mMMMm...', '..mMMMm...', '...mmm....'], pal: { h: '#7a5030', m: '#6a6a74', M: '#a8a8b4' } },
  hook: { art: ['..ss..', '.s..s.', 's....s', '.....s', '....s.', 'cccs..'], pal: { s: '#c0c0c8', c: '#6a6a74' } },
  cannon: { art: ['.kkk.', 'kKkkk', 'kkkkk', 'kkkkk', '.kkk.'], pal: { k: '#2a2a30', K: '#8a8a94' } },
  barrel: { art: ['.bbbbbb.', 'bmmmmmmb', 'bBBBBBBb', 'bBBkBBBb', 'bmmmmmmb', 'bBBBBBBb', 'bBBBBBBb', 'bmmmmmmb', '.bbbbbb.', '....f...', '....F...'], pal: { b: '#3a2414', B: '#7a4a28', m: '#5a5a62', k: '#1a1010', f: '#d8c8a0', F: '#ffb020' }, glow: 'F' },
  web: { art: ['w..w..w', '.w.w.w.', '..www..', 'wwwWwww', '..www..', '.w.w.w.', 'w..w..w'], pal: { w: '#e8e8f0', W: '#ffffff' } },
  crow0: { art: ['k.....k', 'kk...kk', '.kkkkk.', '..kRk..', '...k...'], pal: { k: '#141018', R: '#ff3020' }, glow: 'R' },
  crow1: { art: ['.......', '.kkkkk.', 'kkkkkkk', 'k.kRk.k', '...k...'], pal: { k: '#141018', R: '#ff3020' }, glow: 'R' },
  fireball: { art: ['..ooo..', '.oyyyo.', 'oyWWWyo', 'oyWWWyo', 'oyWWWyo', '.oyyyo.', '..ooo..'], pal: { o: '#c02010', y: '#ff8020', W: '#ffe060' }, glow: 'W' },
  ember: { art: ['.o.', 'oyo', '.o.'], pal: { o: '#ff6020', y: '#ffe060' }, glow: 'y' },
  bubble: { art: ['..www..', '.wGGGw.', 'wGWGGGw', 'wGGGGGw', 'wGGGGGw', '.wGGGw.', '..www..'], pal: { w: '#c0ff90', G: '#60d040', W: '#ffffff' }, glow: 'W' },
  holy: { art: ['..cc..', '..ww..', '.wBBw.', 'wBWBBw', 'wBBBBw', '.wwww.'], pal: { c: '#8a6a40', w: '#d0e8f0', B: '#60b0f0', W: '#f0ffff' }, glow: 'W' },
  bolt: { art: ['.......s.', 'bbbbbbbss', 'fbbbbbbss', '.......s.'], pal: { b: '#8a5a2a', s: '#e0e0f0', f: '#c03030' } },
};

const itemCache = new Map<string, Baked>();
export function getItem(id: string): Baked {
  let f = itemCache.get(id);
  if (f) return f;
  const def = ITEM_ART[id] ?? ITEM_ART.xp;
  const w = def.art[0].length, h = def.art.length;
  const b = new PB(w + 2, h + 2);
  def.art.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    b.set(x, y, def.pal[ch] ?? '#ff00ff', ch === def.glow, true);
  }));
  f = b.finish({ outline: 'selout', autoShade: false });
  itemCache.set(id, f);
  return f;
}

export { mix };

// ---------------------------------------------------------------------------
// Sarcófago (Tormenta del Faraón) y montón de ropa (Desvestirse)
// ---------------------------------------------------------------------------
let sarcoCache: Baked | null = null;
export function getSarcophagus(): Baked {
  if (sarcoCache) return sarcoCache;
  const b = new PB(SW, SH);
  const gold = '#c89a30', teal = '#2a7a8a', dark = '#3a2a1a';
  // silueta del sarcófago (más ancho en hombros)
  for (let y = 2; y <= 31; y++) {
    const w = y < 6 ? 6 + (y - 2) : y < 14 ? 10 : 10 - Math.floor((y - 14) / 4);
    b.rect(12 - Math.ceil(w / 2), y, w, 1, y % 5 === 0 ? teal : gold);
  }
  // cara dorada con ojos pintados
  b.rect(9, 4, 6, 7, '#e0b850'); b.set(10, 6, '#101018'); b.set(13, 6, '#101018'); b.set(11, 9, dark); b.set(12, 9, dark);
  b.rect(8, 3, 8, 1, teal); b.rect(7, 4, 2, 8, teal); b.rect(15, 4, 2, 8, teal); // nemes
  // brazos cruzados y jeroglíficos
  b.line(8, 13, 15, 16, '#e0b850'); b.line(15, 13, 8, 16, '#e0b850');
  for (const [x, y] of [[10, 19], [13, 20], [11, 23], [13, 25], [10, 27]]) b.set(x, y, '#5ae0e0', true);
  b.set(11, 21, '#5ae0e0', true); b.set(12, 24, '#5ae0e0', true);
  sarcoCache = b.finish({ outline: 'selout' });
  return sarcoCache;
}

const clothesCache = new Map<string, Baked>();
/** Ropa de la Dama tirada en el suelo (sombrero, abrigo, zapatos, gafas). */
export function getClothesPile(skin: string): Baked {
  let c = clothesCache.get(skin);
  if (c) return c;
  const pal = getSkin('invisible', skin).palette;
  const b = new PB(24, 12);
  b.ellipse(10, 7, 8, 3, pal.cloth); b.line(4, 6, 15, 8, shade(pal.cloth, -0.25)); // abrigo arrugado
  b.set(9, 6, '#c0a040'); // hebilla
  b.line(2, 9, 8, 8, pal.hair); b.line(2, 10, 6, 10, pal.hair); // bufanda
  b.rect(15, 2, 7, 1, pal.cloth2); b.rect(16, 1, 5, 1, pal.cloth2); b.rect(16, 0, 5, 1, pal.cloth2); // sombrero
  const shoe = pal.accent === '#202020' ? '#2a1a1a' : shade(pal.accent, -0.4);
  b.rect(1, 3, 3, 2, shoe); b.rect(19, 9, 3, 2, shoe);
  b.rect(12, 3, 2, 1, '#0e0e18'); b.rect(15, 4, 2, 1, '#0e0e18'); b.set(14, 3, '#707080'); // gafas
  b.set(3, 6, pal.skin); b.set(17, 7, pal.skin); // guantes
  c = b.finish({ outline: 'selout' });
  clothesCache.set(skin, c);
  return c;
}
