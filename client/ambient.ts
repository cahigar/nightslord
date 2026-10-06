// Ambiente: niebla que se desplaza, luciérnagas, ascuas, hojas, murciélagos cruzando el cielo y viñeta.
import { MAP_SIZE, PIXEL } from '../shared/constants';
import type { GameMap } from '../shared/maps';
import { fbm } from '../shared/noise';
import type { Light } from './tiles';

interface Mote { x: number; y: number; vx: number; vy: number; ph: number; kind: 'firefly' | 'ember' | 'leaf' | 'spore'; life: number; color: string }
interface SkyBat { x: number; y: number; vx: number; vy: number; ph: number; s: number }

export class Ambient {
  private fog: HTMLCanvasElement;
  private motes: Mote[] = [];
  private bats: SkyBat[] = [];
  private vignette: HTMLCanvasElement | null = null;
  private t = 0;

  constructor(private map: GameMap, private lights: Light[]) {
    // textura de niebla repetible generada con ruido (en píxeles gordos)
    const N = 128;
    this.fog = document.createElement('canvas');
    this.fog.width = N; this.fog.height = N;
    const c = this.fog.getContext('2d')!;
    const img = c.createImageData(N, N);
    const tint = map.theme === 'camp' ? [150, 175, 200] : map.theme === 'transylvania' ? [170, 150, 170] : map.theme === 'swamp' ? [130, 180, 120] : map.theme === 'nile' ? [190, 170, 130] : map.theme === 'jungle' ? [120, 180, 140] : [160, 160, 190];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      // ruido periódico: mezcla de las 4 esquinas para que el patrón encaje al repetir
      const u = x / N, v = y / N;
      const s = (xx: number, yy: number) => fbm(xx * 8, yy * 8, map.seed + 3, 40, 4);
      const n = s(x, y) * (1 - u) * (1 - v) + s(x - N, y) * u * (1 - v) + s(x, y - N) * (1 - u) * v + s(x - N, y - N) * u * v;
      const a = Math.max(0, n - 0.48) * 2.2;
      const q = Math.round(a * 4) / 4; // cuantizado = look pixel art
      const o = (y * N + x) * 4;
      img.data.set([tint[0], tint[1], tint[2], Math.round(q * 70)], o);
    }
    c.putImageData(img, 0, 0);
  }

  update(dt: number, camX: number, camY: number, vw: number, vh: number) {
    this.t += dt;
    // generar motas cerca de la cámara
    const want = this.map.theme === 'camp' || this.map.theme === 'swamp' || this.map.theme === 'jungle' ? 70 : 50;
    while (this.motes.length < want) {
      const x = camX + Math.random() * vw, y = camY + Math.random() * vh;
      let kind: Mote['kind'];
      let color: string;
      const rnd = Math.random();
      if (this.map.theme === 'swamp') { kind = rnd < 0.5 ? 'firefly' : 'spore'; color = kind === 'firefly' ? '#a0ff60' : '#80a070'; }
      else if (this.map.theme === 'nile') { kind = rnd < 0.65 ? 'leaf' : 'spore'; color = kind === 'leaf' ? ['#c8a868', '#a08050', '#e0c888'][Math.floor(Math.random() * 3)] : '#d8c8a0'; } // arena que vuela
      else if (this.map.theme === 'jungle') { kind = rnd < 0.45 ? 'firefly' : rnd < 0.75 ? 'leaf' : 'spore'; color = kind === 'firefly' ? ['#a0ff80', '#ffe060', '#80e0ff'][Math.floor(Math.random() * 3)] : kind === 'leaf' ? ['#2e6a28', '#4a8a34', '#6a9a30'][Math.floor(Math.random() * 3)] : '#a0c0a0'; }
      else if (this.map.theme === 'camp') { kind = rnd < 0.7 ? 'firefly' : 'spore'; color = kind === 'firefly' ? '#d8ff60' : '#a0b0c0'; }
      else if (this.map.theme === 'elm') { kind = rnd < 0.55 ? 'leaf' : rnd < 0.8 ? 'firefly' : 'spore'; color = kind === 'leaf' ? ['#a0501a', '#c07020', '#8a2a14'][Math.floor(Math.random() * 3)] : kind === 'firefly' ? '#e0ff80' : '#9090b0'; }
      else { kind = rnd < 0.6 ? 'spore' : 'ember'; color = kind === 'ember' ? '#ff7020' : '#c0a0c0'; }
      this.motes.push({ x, y, vx: 0, vy: 0, ph: Math.random() * 6.28, kind, life: 4 + Math.random() * 6, color });
    }
    // ascuas sobre fuegos cercanos
    for (const l of this.lights) {
      if (!l.flicker || l.r < 200) continue;
      if (l.x < camX - 100 || l.x > camX + vw + 100 || l.y < camY - 100 || l.y > camY + vh + 100) continue;
      if (Math.random() < dt * 6) this.motes.push({ x: l.x + (Math.random() - 0.5) * 20, y: l.y - 10, vx: (Math.random() - 0.5) * 20, vy: -40 - Math.random() * 40, ph: 0, kind: 'ember', life: 1.5 + Math.random(), color: Math.random() < 0.5 ? '#ffb030' : '#ff6010' });
    }
    for (const m of this.motes) {
      m.life -= dt;
      m.ph += dt;
      switch (m.kind) {
        case 'firefly': m.vx = Math.cos(m.ph * 0.9) * 18; m.vy = Math.sin(m.ph * 1.3) * 12; break;
        case 'leaf': m.vx = 25 + Math.sin(m.ph * 2) * 20; m.vy = 18 + Math.cos(m.ph * 3) * 10; break;
        case 'spore': m.vx = 6 + Math.sin(m.ph) * 4; m.vy = -4 + Math.cos(m.ph * 0.7) * 3; break;
        case 'ember': m.vx += (Math.random() - 0.5) * 30 * dt; m.vy -= 10 * dt; break;
      }
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.x < camX - 200 || m.x > camX + vw + 200 || m.y < camY - 200 || m.y > camY + vh + 200) m.life = 0;
    }
    this.motes = this.motes.filter((m) => m.life > 0);
    // murciélagos cruzando
    if (Math.random() < dt * 0.12 && this.bats.length < 8) {
      const n = 3 + Math.floor(Math.random() * 5);
      const fromLeft = Math.random() < 0.5;
      const by = camY + Math.random() * vh * 0.6;
      for (let i = 0; i < n; i++) this.bats.push({ x: (fromLeft ? camX - 60 : camX + vw + 60) - (fromLeft ? i * 40 : -i * 40), y: by + (Math.random() - 0.5) * 120, vx: (fromLeft ? 1 : -1) * (260 + Math.random() * 80), vy: (Math.random() - 0.5) * 40, ph: Math.random() * 6, s: 0.8 + Math.random() * 0.5 });
    }
    for (const b of this.bats) { b.x += b.vx * dt; b.y += b.vy * dt + Math.sin(b.ph + this.t * 6) * 0.6; }
    this.bats = this.bats.filter((b) => b.x > camX - 400 && b.x < camX + vw + 400);
  }

  /** Niebla: se dibuja ANTES de la oscuridad (solo se ve cerca de las luces). Coordenadas de mundo. */
  drawFog(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
    const S = 128 * PIXEL * 4; // tamaño en mundo de una baldosa de niebla
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const [speed, alpha, scale] of [[14, 0.7, 1], [-9, 0.5, 1.5]] as const) {
      const sz = S * scale;
      const ox = (this.t * speed) % sz, oy = (this.t * speed * 0.3) % sz;
      ctx.globalAlpha = alpha;
      const sx = Math.floor((x0 - ox) / sz) * sz + ox, sy = Math.floor((y0 - oy) / sz) * sz + oy;
      for (let y = sy; y < y1; y += sz) for (let x = sx; x < x1; x += sz) ctx.drawImage(this.fog, x, y, sz, sz);
    }
    ctx.restore();
  }

  /** Motas y murciélagos: DESPUÉS de la oscuridad (brillan). Coordenadas de mundo. */
  drawMotes(ctx: CanvasRenderingContext2D) {
    for (const m of this.motes) {
      const a = Math.min(1, m.life);
      if (m.kind === 'firefly') {
        const on = 0.5 + Math.sin(m.ph * 3) * 0.5;
        ctx.globalAlpha = a * on;
        ctx.fillStyle = 'rgba(200,255,90,0.25)';
        ctx.fillRect(Math.round(m.x) - 4, Math.round(m.y) - 4, 9, 9);
        ctx.fillStyle = m.color;
        ctx.fillRect(Math.round(m.x) - 1, Math.round(m.y) - 1, 3, 3);
      } else if (m.kind === 'ember') {
        ctx.globalAlpha = a;
        ctx.fillStyle = m.color;
        ctx.fillRect(Math.round(m.x / 3) * 3, Math.round(m.y / 3) * 3, 3, 3);
      } else {
        ctx.globalAlpha = a * (m.kind === 'spore' ? 0.35 : 0.55);
        ctx.fillStyle = m.color;
        ctx.fillRect(Math.round(m.x / 3) * 3, Math.round(m.y / 3) * 3, m.kind === 'leaf' ? 6 : 3, 3);
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#05030a';
    for (const b of this.bats) {
      const flap = Math.sin(this.t * 22 + b.ph) > 0;
      const s = 3 * b.s;
      const x = Math.round(b.x), y = Math.round(b.y);
      ctx.fillRect(x - s, y - s / 2, s * 2, s);
      if (flap) { ctx.fillRect(x - s * 3, y - s * 1.5, s * 2, s); ctx.fillRect(x + s, y - s * 1.5, s * 2, s); }
      else { ctx.fillRect(x - s * 3, y + s / 2, s * 2, s); ctx.fillRect(x + s, y + s / 2, s * 2, s); }
    }
  }

  /** Viñeta en coordenadas de pantalla. */
  drawVignette(ctx: CanvasRenderingContext2D, W: number, H: number) {
    if (!this.vignette || this.vignette.width !== W || this.vignette.height !== H) {
      const v = document.createElement('canvas');
      v.width = W; v.height = H;
      const c = v.getContext('2d')!;
      const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.6)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      this.vignette = v;
    }
    ctx.drawImage(this.vignette, 0, 0);
  }
}

export const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x <= MAP_SIZE && y <= MAP_SIZE;
