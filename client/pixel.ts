// Lienzo de píxeles con post-proceso de pixel art: sombreado automático, contorno coloreado (sel-out)
// y capa emisiva (píxeles que brillan en la oscuridad: ojos, antorchas, gemas...).

const shadeCache = new Map<string, string>();

/** Aclara (f>0) u oscurece (f<0) un color hex. */
export function shade(hex: string, f: number): string {
  const key = hex + f;
  const c = shadeCache.get(key);
  if (c) return c;
  const n = parseInt(hex.slice(1, 7), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  // desplazamiento de tono: sombras hacia el violeta, luces hacia el amarillo (look pixel art)
  if (f < 0) { b = Math.min(255, b + 10 * -f); r = r * (1 + f * 0.1); }
  else { r = Math.min(255, r + 6 * f); }
  const out = '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  shadeCache.set(key, out);
  return out;
}

export function mix(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1, 7), 16), nb = parseInt(b.slice(1, 7), 16);
  const ch = (s: number) => Math.round(((na >> s) & 255) * (1 - t) + ((nb >> s) & 255) * t);
  return '#' + [ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export interface Baked { base: HTMLCanvasElement; glow: HTMLCanvasElement | null }

export interface FinishOpts {
  outline?: 'selout' | 'dark' | 'faint' | 'none';
  autoShade?: boolean;
}

export class PB {
  px: (string | null)[];
  glow: Uint8Array;
  flat: Uint8Array; // píxeles que no reciben sombreado automático (ojos, brillos)
  offX = 0; // desplazamiento del origen de dibujo
  offY = 0;
  constructor(public w: number, public h: number, private margin = 1) {
    this.px = new Array(w * h).fill(null);
    this.glow = new Uint8Array(w * h);
    this.flat = new Uint8Array(w * h);
  }
  private idx(x: number, y: number) {
    x = Math.round(x) + this.margin + this.offX; y = Math.round(y) + this.margin + this.offY;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return y * this.w + x;
  }
  set(x: number, y: number, c: string | null | undefined, glow = false, flat = false) {
    if (!c) return;
    const i = this.idx(x, y);
    if (i < 0) return;
    this.px[i] = c;
    this.glow[i] = glow ? 1 : 0;
    this.flat[i] = glow || flat ? 1 : 0;
  }
  get(x: number, y: number) { const i = this.idx(x, y); return i < 0 ? null : this.px[i]; }
  clear(x: number, y: number) { const i = this.idx(x, y); if (i >= 0) { this.px[i] = null; this.glow[i] = 0; } }
  rect(x: number, y: number, w: number, h: number, c: string, glow = false) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, glow);
  }
  /** Rectángulo solo donde ya hay color (para estampar texturas sobre una forma). */
  paint(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (this.get(x + i, y + j)) this.set(x + i, y + j, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string, glow = false) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c, glow);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string) {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx + 0.3) + (y * y) / (ry * ry + 0.3) <= 1) this.set(cx + x, cy + y, c);
  }

  finish(o: FinishOpts = {}): Baked {
    const { w, h } = this;
    const src = this.px.slice();
    const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !!src[y * w + x];
    // 1) sombreado automático: luz desde arriba-izquierda
    if (o.autoShade !== false) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, c = src[i];
        if (!c || this.flat[i]) continue;
        const up = filled(x, y - 1) ? src[(y - 1) * w + x] : null;
        const left = filled(x - 1, y) ? src[y * w + x - 1] : null;
        const down = filled(x, y + 1) ? src[(y + 1) * w + x] : null;
        const right = filled(x + 1, y) ? src[y * w + x + 1] : null;
        if (!down || (!right && !filled(x + 1, y + 1))) this.px[i] = shade(c, -0.22);
        else if (!up || (!left && up !== c)) this.px[i] = shade(c, 0.16);
        else if (up && up !== c && this.lum(up) > this.lum(c) + 30) this.px[i] = shade(c, -0.12); // sombra proyectada bajo otra pieza
      }
    }
    // 2) contorno
    const mode = o.outline ?? 'selout';
    if (mode !== 'none') {
      const shaded = this.px.slice();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (shaded[i]) continue;
        let n: string | null = null;
        for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && src[yy * w + xx]) { n = src[yy * w + xx]; break; }
        }
        if (!n) continue;
        this.px[i] = mode === 'selout' ? mix(shade(n, -0.72), '#0b0710', 0.45) : mode === 'faint' ? 'FAINT' : '#0b0710';
      }
    }
    // 3) volcar a canvas
    const base = document.createElement('canvas');
    base.width = w; base.height = h;
    const ctx = base.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    let anyGlow = false;
    for (let i = 0; i < this.px.length; i++) {
      const c = this.px[i];
      if (!c) continue;
      if (c === 'FAINT') { img.data.set([20, 14, 30, 90], i * 4); continue; }
      const n = parseInt(c.slice(1, 7), 16);
      img.data.set([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255], i * 4);
      if (this.glow[i]) anyGlow = true;
    }
    ctx.putImageData(img, 0, 0);
    let glow: HTMLCanvasElement | null = null;
    if (anyGlow) {
      glow = document.createElement('canvas');
      glow.width = w; glow.height = h;
      const g = glow.getContext('2d')!;
      const gi = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!this.glow[i] || !src[i]) continue;
        const n = parseInt(src[i]!.slice(1, 7), 16);
        const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        gi.data.set([...rgb, 255], i * 4);
        // halo de 1 px
        for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = (yy * w + xx) * 4;
          if (gi.data[j + 3] < 110) gi.data.set([...rgb, 110], j);
        }
      }
      g.putImageData(gi, 0, 0);
    }
    return { base, glow };
  }

  private lum(c: string) {
    const n = parseInt(c.slice(1, 7), 16);
    return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11;
  }
}
