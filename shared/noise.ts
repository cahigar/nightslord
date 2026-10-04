// Ruido de valor 2D determinista + fBm. Lo usan los mapas (servidor y cliente) y el arte del terreno.
import { hashString } from './rng';

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Ruido de valor en [0,1]. */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** fBm: varias octavas de ruido. scale = tamaño del rasgo en unidades de mundo. */
export function fbm(x: number, y: number, seed: number, scale: number, octaves = 4): number {
  let amp = 1, freq = 1 / scale, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * freq, y * freq, seed + o * 1013) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Hash rápido 0..1 para un punto entero (variación por píxel). */
export function hashAt(x: number, y: number, seed: number): number {
  return hash2(x | 0, y | 0, seed);
}

export const seedOf = (s: string | number) => (typeof s === 'number' ? s : hashString(s));
