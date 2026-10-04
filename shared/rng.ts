// RNG determinista (mulberry32) para que servidor y cliente generen el mismo mapa.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export const rrange = (r: Rng, a: number, b: number) => a + r() * (b - a);
export const rint = (r: Rng, a: number, b: number) => Math.floor(rrange(r, a, b + 1));
export const rpick = <T>(r: Rng, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
