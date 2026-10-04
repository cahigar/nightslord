// Estado de partida en el cliente: predicción del jugador local, interpolación del resto, efectos y render.
import { CHARACTERS, type CharacterId } from '../shared/characters';
import { MAP_SIZE, PIXEL, TICK_DT } from '../shared/constants';
import { generateMap, THEMES, type GameMap, type MapThemeId, type Obstacle } from '../shared/maps';
import { Ambient } from './ambient';
import { Terrain } from './terrain';
import { ObstacleGrid } from '../shared/physics';
import { Anim, Flag, Kind, type EntSnap, type GameEvent, type ServerMsg, type YouState } from '../shared/protocol';
import { playSfx, spatialVol } from './audio';
import { input, readButtons, readMove } from './input';
import { net } from './net';
import { ANIMS, getFrame, getItem, npcLook, SH, SW } from './sprites';
import { LIGHT_COLORS, lightsFor, renderDecor, renderObstacle, type Light, type Prerendered } from './tiles';

const INTERP_MS = 120;

interface Sample { t: number; x: number; y: number }
interface CEnt {
  id: number; k: Kind; c: string; s?: string; n?: string; l?: number; h?: number; fl: number; f: 1 | -1; a: Anim; q: number; r?: number;
  animStart: number; samples: Sample[]; seen: number; flash: number; rx: number; ry: number;
}
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; grav: number }
interface Floater { x: number; y: number; text: string; color: string; life: number; big?: boolean }
interface Ring { x: number; y: number; r: number; life: number; max: number; color: string; width: number }
interface Swing { x: number; y: number; a: number; life: number; color: string }
interface Corpse { x: number; y: number; k: Kind; c: string; s?: string; f: 1 | -1; life: number; seed: number }

const PU_LABEL: Record<string, string> = { blood: '+Sangre', speed: '¡Rapidez!', fury: '¡Furia!', shield: '+Escudo', coin: '+5 monedas', xp: '+XP' };

export class Game {
  map!: GameMap;
  grid!: ObstacleGrid;
  theme!: MapThemeId;
  roomCode = '';
  priv = false;
  youId = -1;
  you: YouState | null = null;
  alive = false;
  ents = new Map<number, CEnt>();

  // predicción
  private seq = 0;
  private pending: { q: number; mx: number; my: number }[] = [];
  private pred = { x: 0, y: 0, px: 0, py: 0, t: 0 };
  private corr = { x: 0, y: 0 };
  private aim = 0;
  private sendTimer: number | null = null;
  private lastSnapAt = 0;

  // arte
  private art = new Map<Obstacle, Prerendered>();
  private terrain!: Terrain;
  private ambient!: Ambient;
  private chunkBudget = 3;
  private time = 0;
  private decals: { x: number; y: number; c: string; life: number; pts: [number, number, number][] }[] = [];
  private lights: Light[] = [];
  private dark = document.createElement('canvas');

  // efectos
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private rings: Ring[] = [];
  private swings: Swing[] = [];
  private corpses: Corpse[] = [];
  private shake = 0;
  cam = { x: MAP_SIZE / 2, y: MAP_SIZE / 2, zoom: 1 };

  onEvent: ((ev: GameEvent) => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {}

  // ------------------------------------------------------------------ ciclo de vida
  start(msg: Extract<ServerMsg, { t: 'joined' }>) {
    const sameMap = this.map && this.map.seed === msg.seed && this.theme === msg.theme;
    this.roomCode = msg.code;
    this.priv = msg.priv;
    this.youId = msg.you;
    this.alive = true;
    this.you = null;
    this.pending = [];
    this.corr = { x: 0, y: 0 };
    if (!sameMap) {
      this.theme = msg.theme;
      this.map = generateMap(msg.theme, msg.seed);
      this.grid = new ObstacleGrid(this.map);
      this.art.clear();
      this.terrain = new Terrain(this.map);
      this.lights = lightsFor(this.map);
      this.ambient = new Ambient(this.map, this.lights);
      this.ents.clear();
      this.corpses = [];
      this.decals = [];
    }
    if (this.sendTimer === null) this.sendTimer = window.setInterval(() => this.sendInput(), TICK_DT * 1000);
  }

  stop() {
    if (this.sendTimer !== null) { clearInterval(this.sendTimer); this.sendTimer = null; }
    this.ents.clear();
    this.you = null;
    this.alive = false;
  }

  // ------------------------------------------------------------------ red
  onSnapshot(m: Extract<ServerMsg, { t: 'snap' }>) {
    const now = performance.now();
    this.lastSnapAt = now;
    const first = !this.you;
    this.you = m.you;
    this.alive = m.you.alive;

    // reconciliación del jugador local
    const oldX = this.pred.x, oldY = this.pred.y;
    this.pending = this.pending.filter((p) => p.q > m.you.ack);
    let x = m.you.x, y = m.you.y;
    if (!m.you.st) {
      for (const p of this.pending) {
        const r = this.grid.move(x, y, p.mx * m.you.spd * TICK_DT, p.my * m.you.spd * TICK_DT, 18);
        x = r.x; y = r.y;
      }
    }
    if (first) { this.pred = { x, y, px: x, py: y, t: now }; this.cam.x = x; this.cam.y = y; this.terrain.warm(x, y, 900); }
    else {
      this.corr.x += oldX - x; this.corr.y += oldY - y;
      if (Math.hypot(this.corr.x, this.corr.y) > 160) this.corr = { x: 0, y: 0 };
      this.pred.px += x - oldX; this.pred.py += y - oldY;
      this.pred.x = x; this.pred.y = y;
    }

    const seenIds = new Set<number>();
    for (const s of m.ents) {
      seenIds.add(s.i);
      let e = this.ents.get(s.i);
      if (!e) {
        e = { id: s.i, k: s.k, c: s.c, fl: 0, f: s.f, a: s.a, q: s.q, animStart: now, samples: [], seen: now, flash: 0, rx: s.x, ry: s.y };
        this.ents.set(s.i, e);
      }
      if (e.a !== s.a || e.q !== s.q) { e.animStart = now; e.a = s.a; e.q = s.q; }
      e.c = s.c; e.s = s.s; e.n = s.n; e.l = s.l; e.h = s.h; e.fl = s.fl ?? 0; e.f = s.f; e.r = s.r; e.seen = now;
      e.samples.push({ t: now, x: s.x, y: s.y });
      if (e.samples.length > 6) e.samples.shift();
    }
    for (const [id, e] of this.ents) if (!seenIds.has(id) && now - e.seen > 250) this.ents.delete(id);
    for (const ev of m.ev) this.handleEvent(ev);
  }

  private sendInput() {
    if (!this.you && this.youId < 0) return;
    const { mx, my } = this.alive ? readMove() : { mx: 0, my: 0 };
    const b = this.alive ? readButtons() : 0;
    // ángulo de apuntado
    if (input.touch.active) {
      if (input.touch.aim !== null) this.aim = input.touch.aim;
    } else {
      const sx = this.canvas.width / 2 + (this.renderPos().x - this.cam.x) * this.cam.zoom;
      const sy = this.canvas.height / 2 + (this.renderPos().y - this.cam.y - 45) * this.cam.zoom;
      this.aim = Math.atan2(input.mouseY * devicePixelRatio - sy, input.mouseX * devicePixelRatio - sx);
    }
    const q = ++this.seq;
    net.send({ t: 'input', q, mx: +mx.toFixed(3), my: +my.toFixed(3), a: +this.aim.toFixed(3), b });
    if (!this.alive || !this.you) return;
    this.pending.push({ q, mx, my });
    if (this.pending.length > 40) this.pending.shift();
    this.pred.px = this.pred.x; this.pred.py = this.pred.y; this.pred.t = performance.now();
    if (!this.you.st && (mx || my)) {
      const r = this.grid.move(this.pred.x, this.pred.y, mx * this.you.spd * TICK_DT, my * this.you.spd * TICK_DT, 18);
      this.pred.x = r.x; this.pred.y = r.y;
    }
  }

  renderPos() {
    const t = Math.min(1, (performance.now() - this.pred.t) / (TICK_DT * 1000));
    return { x: this.pred.px + (this.pred.x - this.pred.px) * t + this.corr.x, y: this.pred.py + (this.pred.y - this.pred.py) * t + this.corr.y };
  }

  // ------------------------------------------------------------------ eventos
  private handleEvent(ev: GameEvent) {
    const me = this.renderPos();
    switch (ev.e) {
      case 'sfx': playSfx(ev.s, spatialVol(ev.x - me.x, ev.y - me.y)); break;
      case 'hit': {
        const target = this.ents.get(ev.t);
        if (target) target.flash = performance.now();
        const mine = ev.t === this.youId;
        if (ev.d > 0) {
          this.floaters.push({ x: ev.x + (Math.random() - 0.5) * 20, y: ev.y - 50, text: String(ev.d), color: mine ? '#ff4050' : ev.crit ? '#ffd040' : '#ffffff', life: 0.9, big: ev.crit });
          const col = target?.c === 'mummy' ? '#c8b888' : target?.c === 'invisible' ? '#a0d0ff' : '#b0101a';
          this.burst(ev.x, ev.y - 40, 6, col, 140, 2);
          if (col === '#b0101a') this.splat(ev.x, ev.y, 3 + Math.min(6, ev.d / 6));
        }
        if (mine) this.shake = Math.min(14, this.shake + 6);
        break;
      }
      case 'die': {
        if (ev.k !== Kind.Player || ev.c) {
          const e = [...this.ents.values()].find((x) => Math.abs(x.rx - ev.x) < 30 && Math.abs(x.ry - ev.y) < 30 && x.k === ev.k);
          this.corpses.push({ x: ev.x, y: ev.y, k: ev.k, c: ev.c, s: e?.s, f: e?.f ?? 1, life: 6, seed: e?.id ?? 0 });
          if (this.corpses.length > 60) this.corpses.shift();
        }
        this.burst(ev.x, ev.y - 40, 18, ev.k === Kind.Player ? '#8040ff' : '#b0101a', 220, 3);
        this.splat(ev.x, ev.y, 14);
        if (ev.k === Kind.Player) for (let i = 0; i < 10; i++) this.particles.push({ x: ev.x, y: ev.y - 20, vx: (Math.random() - 0.5) * 40, vy: -60 - Math.random() * 60, life: 1.6, max: 1.6, color: '#c0a0ff', size: 4, grav: -10 });
        break;
      }
      case 'fx': this.fx(ev); break;
      case 'pick':
        this.burst(ev.x, ev.y, 10, ev.p === 'coin' ? '#ffd040' : '#ffffff', 120, 2);
        this.floaters.push({ x: ev.x, y: ev.y - 30, text: PU_LABEL[ev.p] ?? '+', color: '#a0ffa0', life: 1 });
        break;
    }
    this.onEvent?.(ev);
  }

  private fx(ev: Extract<GameEvent, { e: 'fx' }>) {
    switch (ev.f) {
      case 'swing': this.swings.push({ x: ev.x, y: ev.y - 42, a: ev.r ?? 0, life: 0.15, color: '#ffffff' }); break;
      case 'mist': for (let i = 0; i < 24; i++) this.particles.push({ x: ev.x + (Math.random() - 0.5) * 40, y: ev.y - 20 + (Math.random() - 0.5) * 40, vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 30, life: 0.9, max: 0.9, color: Math.random() < 0.5 ? '#8060c0' : '#c0b0e0', size: 6, grav: 0 }); break;
      case 'howl': this.rings.push({ x: ev.x, y: ev.y, r: ev.r ?? 400, life: 0.7, max: 0.7, color: '#ffb040', width: 6 }); this.shake = 8; break;
      case 'curse':
        this.rings.push({ x: ev.x, y: ev.y, r: ev.r ?? 170, life: 0.6, max: 0.6, color: '#60ff80', width: 10 });
        for (let i = 0; i < 30; i++) { const a = Math.random() * Math.PI * 2, d = Math.random() * (ev.r ?? 170); this.particles.push({ x: ev.x + Math.cos(a) * d, y: ev.y + Math.sin(a) * d, vx: 0, vy: -40, life: 1, max: 1, color: '#40c060', size: 4, grav: 0 }); }
        break;
      case 'push': this.rings.push({ x: ev.x, y: ev.y, r: ev.r ?? 150, life: 0.35, max: 0.35, color: '#c0e0ff', width: 8 }); this.shake = 6; break;
      case 'lvl':
        for (let i = 0; i < 26; i++) this.particles.push({ x: ev.x + (Math.random() - 0.5) * 40, y: ev.y, vx: 0, vy: -120 - Math.random() * 120, life: 0.9, max: 0.9, color: '#ffd040', size: 4, grav: 0 });
        if (ev.o === this.youId) this.floaters.push({ x: ev.x, y: ev.y - 90, text: '¡NIVEL!', color: '#ffd040', life: 1.4, big: true });
        break;
      case 'dash': for (let i = 0; i < 14; i++) this.particles.push({ x: ev.x, y: ev.y, vx: -Math.cos(ev.r ?? 0) * 100 + (Math.random() - 0.5) * 80, vy: -Math.sin(ev.r ?? 0) * 100 + (Math.random() - 0.5) * 80, life: 0.5, max: 0.5, color: '#806040', size: 5, grav: 0 }); break;
      case 'vanish': for (let i = 0; i < 20; i++) this.particles.push({ x: ev.x + (Math.random() - 0.5) * 30, y: ev.y - 20 - Math.random() * 40, vx: (Math.random() - 0.5) * 30, vy: -30, life: 0.8, max: 0.8, color: '#a0d0ff', size: 3, grav: 0 }); break;
    }
  }

  /** Mancha de sangre persistente en el suelo (pixelada). */
  private splat(x: number, y: number, size: number) {
    const pts: [number, number, number][] = [];
    const n = Math.round(size * 1.6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * size * 3;
      pts.push([Math.cos(a) * d, Math.sin(a) * d * 0.5, Math.random() < 0.3 ? 6 : 3]);
    }
    this.decals.push({ x, y: y + 2, c: Math.random() < 0.5 ? '#5a0610' : '#3e040a', life: 40, pts });
    if (this.decals.length > 160) this.decals.shift();
  }

  private burst(x: number, y: number, n: number, color: string, speed: number, size: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0.6, max: 0.6, color, size: size + Math.random() * 2, grav: 400 });
    }
  }

  // ------------------------------------------------------------------ render
  render(dt: number) {
    const cv = this.canvas;
    const ctx = cv.getContext('2d')!;
    const W = cv.width, H = cv.height;
    if (!this.map) { ctx.fillStyle = '#05030a'; ctx.fillRect(0, 0, W, H); return; }
    const now = performance.now();
    this.time += dt;
    this.corr.x *= Math.pow(0.002, dt); this.corr.y *= Math.pow(0.002, dt);

    // interpolación del resto de entidades
    const rt = now - INTERP_MS;
    for (const e of this.ents.values()) {
      if (e.id === this.youId) continue;
      const s = e.samples;
      if (s.length === 1 || rt <= s[0].t) { e.rx = s[0].x; e.ry = s[0].y; continue; }
      let done = false;
      for (let i = s.length - 1; i > 0; i--) {
        if (s[i - 1].t <= rt) {
          const a = s[i - 1], b = s[i];
          const t = Math.min(1.5, (rt - a.t) / Math.max(1, b.t - a.t));
          e.rx = a.x + (b.x - a.x) * t; e.ry = a.y + (b.y - a.y) * t;
          done = true; break;
        }
      }
      if (!done) { e.rx = s[s.length - 1].x; e.ry = s[s.length - 1].y; }
    }
    const me = this.renderPos();
    const meEnt = this.ents.get(this.youId);
    if (meEnt && this.alive) { meEnt.rx = me.x; meEnt.ry = me.y; }

    // cámara
    const target = this.alive || !meEnt ? me : { x: meEnt.rx, y: meEnt.ry };
    this.cam.x += (target.x - this.cam.x) * Math.min(1, dt * 12);
    this.cam.y += (target.y - 40 - this.cam.y) * Math.min(1, dt * 12);
    this.cam.zoom = Math.max(0.55, Math.min(1.6, Math.max(W / 1500, H / 950)));
    const z = this.cam.zoom;
    this.shake = Math.max(0, this.shake - dt * 40);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    const camX = this.cam.x - W / 2 / z + sx, camY = this.cam.y - H / 2 / z + sy;
    const vx0 = camX - 100, vy0 = camY - 200, vx1 = camX + W / z + 100, vy1 = camY + H / z + 150;
    const inView = (x: number, y: number) => x > vx0 && x < vx1 && y > vy0 && y < vy1;
    const world = () => ctx.setTransform(z, 0, 0, z, Math.round(-camX * z), Math.round(-camY * z));
    const glows: { img: HTMLCanvasElement; x: number; y: number; w: number; h: number; flip: boolean; a: number }[] = [];
    const dyn: Light[] = []; // luces dinámicas (antorchas de NPC, farol de Helsing)
    const cones: { x: number; y: number; a: number }[] = []; // linternas

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#020104'; // fuera del mapa
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    world();

    // suelo procedural (por chunks) + bordes del mapa
    this.terrain.draw(ctx, vx0, vy0, vx1, vy1, this.chunkBudget);
    this.chunkBudget = 3;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 12; ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);
    // brillos del agua
    ctx.fillStyle = '#7aa6d0';
    for (const g of this.terrain.waterGlints) {
      if (!inView(g.x, g.y)) continue;
      const a = Math.pow(Math.max(0, Math.sin(this.time * 1.6 + g.ph)), 6);
      if (a < 0.05) continue;
      ctx.globalAlpha = a * 0.8;
      ctx.fillRect(Math.round(g.x / 3) * 3, Math.round(g.y / 3) * 3, 9 + Math.round(a * 6), 3);
    }
    ctx.globalAlpha = 1;

    // manchas de sangre persistentes
    for (const d of this.decals) {
      d.life -= dt;
      if (!inView(d.x, d.y)) continue;
      ctx.globalAlpha = Math.min(0.85, d.life / 10);
      ctx.fillStyle = d.c;
      for (const [ox, oy, s] of d.pts) ctx.fillRect(Math.round((d.x + ox) / 3) * 3, Math.round((d.y + oy) / 3) * 3, s, s);
    }
    ctx.globalAlpha = 1;
    this.decals = this.decals.filter((d) => d.life > 0);

    // decoración del suelo
    for (const d of this.map.decor) {
      if (!inView(d.x, d.y)) continue;
      const art = renderDecor(d);
      const w = art.base.width * PIXEL, h = art.base.height * PIXEL;
      ctx.drawImage(art.base, d.x, d.y, w, h);
      if (art.glow) glows.push({ img: art.glow, x: d.x, y: d.y, w, h, flip: false, a: 1 });
    }

    // cadáveres
    for (const c of this.corpses) {
      c.life -= dt;
      if (!inView(c.x, c.y)) continue;
      ctx.globalAlpha = Math.min(1, c.life / 1.5);
      const kind = c.k === Kind.Player ? 'monster' : c.k === Kind.Helsing ? 'helsing' : 'npc';
      if (c.c) {
        const fr = getFrame(kind, c.c, c.s ?? 'classic', Anim.Dead, 0, c.seed % 97).base;
        ctx.save(); ctx.translate(c.x, c.y - 8); ctx.rotate((Math.PI / 2) * c.f); ctx.scale(c.f, 1);
        ctx.drawImage(fr, (-SW * PIXEL) / 2, (-SH * PIXEL) / 2 - 12, SW * PIXEL, SH * PIXEL);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    this.corpses = this.corpses.filter((c) => c.life > 0);

    // objetos ordenados por profundidad
    const artOf = (o: Obstacle) => {
      let a = this.art.get(o);
      if (!a) { a = renderObstacle(o, this.theme); this.art.set(o, a); }
      return a;
    };
    const draws: { y: number; fn: () => void }[] = [];
    for (const o of this.map.obstacles) {
      if (o.type === 'water') continue;
      if (!(o.x - 60 < vx1 && o.x + o.w + 60 > vx0 && o.y - 160 < vy1 && o.y + o.h > vy0)) continue;
      draws.push({
        y: o.y + o.h, fn: () => {
          const a = artOf(o);
          const w = a.base.width * PIXEL, h = a.base.height * PIXEL;
          ctx.drawImage(a.base, o.x + a.ox, o.y + a.oy, w, h);
          if (a.glow) glows.push({ img: a.glow, x: o.x + a.ox, y: o.y + a.oy, w, h, flip: false, a: 1 });
        },
      });
    }
    for (const e of this.ents.values()) {
      if (!inView(e.rx, e.ry) || e.k === Kind.Projectile) continue;
      draws.push({ y: e.ry, fn: () => this.drawEnt(ctx, e, now, glows) });
      if (e.k === Kind.Npc) {
        const held = npcLook(e.c, e.id % 97).held;
        if (held === 'flashlight') cones.push({ x: e.rx + e.f * 20, y: e.ry - 40, a: e.f === 1 ? 0 : Math.PI });
        else if (held === 'torch') dyn.push({ x: e.rx + e.f * 14, y: e.ry - 60, r: 200, c: 'warm', flicker: true });
        else if (held === 'lantern' || held === 'candle') dyn.push({ x: e.rx + e.f * 14, y: e.ry - 40, r: 130, c: 'warm', flicker: true });
      } else if (e.k === Kind.Helsing) dyn.push({ x: e.rx - e.f * 12, y: e.ry - 40, r: 150, c: 'warm', flicker: true });
    }
    draws.sort((a, b) => a.y - b.y);
    for (const d of draws) d.fn();
    cones.sort((a, b) => (a.x - me.x) ** 2 + (a.y - me.y) ** 2 - ((b.x - me.x) ** 2 + (b.y - me.y) ** 2));
    cones.length = Math.min(cones.length, 5);

    // proyectiles y efectos
    for (const e of this.ents.values()) if (e.k === Kind.Projectile && inView(e.rx, e.ry)) this.drawProjectile(ctx, e, now, glows);
    for (const s of this.swings) {
      s.life -= dt;
      const k = Math.max(0, s.life / 0.15);
      ctx.strokeStyle = `rgba(255,255,255,${k})`;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(s.x, s.y, 40, s.a - 0.9 * (1.4 - k), s.a + 0.9 * (1.4 - k)); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${k * 0.4})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.x, s.y, 50, s.a - 0.7, s.a + 0.7); ctx.stroke();
    }
    this.swings = this.swings.filter((s) => s.life > 0);
    for (const r of this.rings) {
      r.life -= dt;
      const k = 1 - r.life / r.max;
      ctx.strokeStyle = r.color; ctx.globalAlpha = Math.max(0, r.life / r.max); ctx.lineWidth = r.width;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r * k, r.r * k * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const p of this.particles) {
      p.life -= dt; p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x / 3) * 3, Math.round(p.y / 3) * 3, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);

    // niebla (antes de oscurecer: solo se ve iluminada)
    this.ambient.update(dt, camX, camY, W / z, H / z);
    this.ambient.drawFog(ctx, vx0, vy0, vx1, vy1);

    // iluminación
    this.drawLighting(ctx, W, H, camX, camY, z, now, me, dyn, cones);

    // capa emisiva (ojos, ventanas, fuego...) por encima de la oscuridad
    world();
    ctx.globalCompositeOperation = 'lighter';
    for (const g of glows) {
      ctx.globalAlpha = g.a;
      if (g.flip) { ctx.save(); ctx.translate(g.x * 2 + g.w, 0); ctx.scale(-1, 1); ctx.drawImage(g.img, g.x, g.y, g.w, g.h); ctx.restore(); }
      else ctx.drawImage(g.img, g.x, g.y, g.w, g.h);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.ambient.drawMotes(ctx);

    // UI en coordenadas de mundo (nombres, vida, números)
    for (const e of this.ents.values()) if (inView(e.rx, e.ry)) this.drawOverlay(ctx, e, now);
    ctx.textAlign = 'center';
    for (const f of this.floaters) {
      f.life -= dt; f.y -= 40 * dt;
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.font = `${f.big ? 22 : 15}px "Press Start 2P", monospace`;
      ctx.fillStyle = '#000'; ctx.fillText(f.text, f.x + 2, f.y + 2);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    this.floaters = this.floaters.filter((f) => f.life > 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ambient.drawVignette(ctx, W, H);
  }

  private drawLighting(ctx: CanvasRenderingContext2D, W: number, H: number, camX: number, camY: number, z: number, now: number, me: { x: number; y: number }, dyn: Light[], cones: { x: number; y: number; a: number }[]) {
    const d = this.dark;
    if (d.width !== W || d.height !== H) { d.width = W; d.height = H; }
    const dc = d.getContext('2d')!;
    dc.globalCompositeOperation = 'source-over';
    dc.clearRect(0, 0, W, H);
    const amb = parseInt(THEMES[this.theme].ambient.slice(1), 16);
    dc.fillStyle = `rgba(${(amb >> 16) & 255},${(amb >> 8) & 255},${amb & 255},0.84)`;
    dc.fillRect(0, 0, W, H);
    dc.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number, strength = 1) => {
      const px = (x - camX) * z, py = (y - camY) * z, pr = r * z;
      if (px < -pr || py < -pr || px > W + pr || py > H + pr) return;
      const g = dc.createRadialGradient(px, py, 0, px, py, pr);
      g.addColorStop(0, `rgba(0,0,0,${strength})`);
      g.addColorStop(0.55, `rgba(0,0,0,${strength * 0.65})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      dc.fillStyle = g;
      dc.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    };
    const flick = (l: Light) => (l.flicker ? 1 + Math.sin(now / 90 + l.x) * 0.05 + Math.random() * 0.04 : 1);
    hole(me.x, me.y - 30, this.alive ? 330 : 260, 0.92);
    const all = this.lights.concat(dyn);
    for (const l of all) hole(l.x, l.y, l.r * flick(l), 0.85);
    for (const e of this.ents.values()) {
      if (e.k === Kind.PowerUp) hole(e.rx, e.ry - 20, 70, 0.6);
      else if (e.k === Kind.Player && e.id !== this.youId && !(e.fl & Flag.Invisible)) hole(e.rx, e.ry - 30, 80, 0.45);
    }
    // conos de linterna
    for (const c of cones) {
      const px = (c.x - camX) * z, py = (c.y - camY) * z, pr = 240 * z;
      if (px < -pr || py < -pr || px > W + pr || py > H + pr) continue;
      const g = dc.createRadialGradient(px, py, 0, px, py, pr);
      g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.6, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      dc.fillStyle = g;
      dc.beginPath(); dc.moveTo(px, py); dc.arc(px, py, pr, c.a - 0.3, c.a + 0.3); dc.closePath(); dc.fill();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(d, 0, 0);
    // brillo de color aditivo
    ctx.globalCompositeOperation = 'lighter';
    for (const l of all) {
      const px = (l.x - camX) * z, py = (l.y - camY) * z, pr = l.r * z * 0.8 * flick(l);
      if (px < -pr || py < -pr || px > W + pr || py > H + pr) continue;
      const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
      g.addColorStop(0, LIGHT_COLORS[l.c] + (l.c === 'cold' ? '0.08)' : '0.2)'));
      g.addColorStop(1, LIGHT_COLORS[l.c] + '0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
    for (const c of cones) {
      const px = (c.x - camX) * z, py = (c.y - camY) * z, pr = 240 * z;
      if (px < -pr || py < -pr || px > W + pr || py > H + pr) continue;
      const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
      g.addColorStop(0, 'rgba(255,250,200,0.12)'); g.addColorStop(1, 'rgba(255,250,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, pr, c.a - 0.3, c.a + 0.3); ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private frameFor(e: CEnt, now: number) {
    const def = ANIMS[e.a] ?? ANIMS[Anim.Idle];
    const t = (now - e.animStart) / 1000 + (e.a === Anim.Idle ? (e.id % 7) * 0.31 : 0);
    let f = Math.floor(t / def.dur);
    f = def.loop ? f % def.frames.length : Math.min(def.frames.length - 1, f);
    return f;
  }

  private drawEnt(ctx: CanvasRenderingContext2D, e: CEnt, now: number, glows: { img: HTMLCanvasElement; x: number; y: number; w: number; h: number; flip: boolean; a: number }[]) {
    const x = e.rx, y = e.ry;
    if (e.k === Kind.PowerUp) {
      const img = getItem(e.c);
      const bob = Math.sin(now / 250 + e.id) * 4;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(x, y + 8, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
      const w = img.base.width * PIXEL, h = img.base.height * PIXEL;
      ctx.drawImage(img.base, x - w / 2, y - h - 2 + bob, w, h);
      if (img.glow) glows.push({ img: img.glow, x: x - w / 2, y: y - h - 2 + bob, w, h, flip: false, a: 0.6 + Math.sin(now / 200 + e.id) * 0.3 });
      return;
    }
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(x + 3, y + 3, 20, 7, 0, 0, Math.PI * 2); ctx.fill();

    const kind = e.k === Kind.Player ? 'monster' : e.k === Kind.Helsing ? 'helsing' : 'npc';
    const fr = getFrame(kind, e.c, e.s ?? 'classic', e.a, this.frameFor(e, now), e.id % 97);
    let alpha = 1;
    if (e.k === Kind.Player && e.c === 'invisible') alpha = 0.92;
    if (e.fl & Flag.Invisible) alpha = e.id === this.youId ? 0.35 : 0.18 + Math.sin(now / 80) * 0.08;
    if (e.fl & Flag.Mist) alpha = 0.35;
    if (e.fl & Flag.Protected) alpha *= Math.floor(now / 120) % 2 ? 0.5 : 1;
    ctx.globalAlpha = alpha;
    const w = SW * PIXEL, h = SH * PIXEL;
    const dx = x - w / 2, dy = y - h + 9;
    const flip = e.f === -1;
    const blit = (img: HTMLCanvasElement) => {
      if (flip) { ctx.save(); ctx.translate(x * 2, 0); ctx.scale(-1, 1); ctx.drawImage(img, dx, dy, w, h); ctx.restore(); }
      else ctx.drawImage(img, dx, dy, w, h);
    };
    blit(fr.base);
    if (now - e.flash < 90) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.75;
      blit(fr.base);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    if (fr.glow && alpha > 0.3) glows.push({ img: fr.glow, x: dx, y: dy, w, h, flip, a: alpha });
    if (e.fl & Flag.Shield) {
      ctx.strokeStyle = `rgba(100,160,255,${0.5 + Math.sin(now / 150) * 0.2})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, y - 45, 36, 54, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (e.fl & Flag.Buffed && Math.random() < 0.3) this.particles.push({ x: x + (Math.random() - 0.5) * 34, y: y - Math.random() * 80, vx: 0, vy: -50, life: 0.5, max: 0.5, color: '#ff4020', size: 3, grav: 0 });
    if (e.fl & Flag.Slowed && Math.random() < 0.15) this.particles.push({ x: x + (Math.random() - 0.5) * 20, y: y - 50, vx: 0, vy: 30, life: 0.5, max: 0.5, color: '#40c060', size: 3, grav: 100 });
    // polvo al andar
    if (e.a === Anim.Walk && Math.random() < 0.08) this.particles.push({ x: x + (Math.random() - 0.5) * 16, y: y + 2, vx: -e.f * 20, vy: -10, life: 0.4, max: 0.4, color: '#5a5048', size: 3, grav: 0 });
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, e: CEnt, now: number, glows: { img: HTMLCanvasElement; x: number; y: number; w: number; h: number; flip: boolean; a: number }[]) {
    const id = e.c === 'bat' ? `bat${Math.floor(now / 90) % 2}` : e.c;
    const img = getItem(id);
    const w = img.base.width * PIXEL, h = img.base.height * PIXEL;
    ctx.save();
    ctx.translate(e.rx, e.ry - 40);
    if (e.c === 'bat') { if ((e.r ?? 0) > Math.PI / 2 || (e.r ?? 0) < -Math.PI / 2) ctx.scale(-1, 1); }
    else ctx.rotate(e.c === 'bandage' ? now / 60 : e.r ?? 0);
    ctx.drawImage(img.base, -w / 2, -h / 2, w, h);
    ctx.restore();
    if (img.glow && e.c === 'bat') glows.push({ img: img.glow, x: e.rx - w / 2, y: e.ry - 40 - h / 2, w, h, flip: false, a: 1 });
    if (Math.random() < 0.5) this.particles.push({ x: e.rx, y: e.ry - 40, vx: 0, vy: 0, life: 0.25, max: 0.25, color: e.c === 'bolt' ? '#c0c0d0' : e.c === 'bat' ? '#402050' : '#d0c090', size: 3, grav: 0 });
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, e: CEnt, now: number) {
    if (e.k === Kind.PowerUp || e.k === Kind.Projectile) return;
    if (e.fl & Flag.Invisible && e.id !== this.youId) return;
    const x = e.rx, top = e.ry - SH * PIXEL + 8;
    ctx.textAlign = 'center';
    if (e.k === Kind.Player) {
      const me = e.id === this.youId;
      const label = `${e.n ?? ''} ·${e.l ?? 1}`;
      ctx.font = '11px "Press Start 2P", monospace';
      ctx.fillStyle = '#000'; ctx.fillText(label, x + 1, top - 7);
      ctx.fillStyle = me ? '#ffe080' : '#ffffff'; ctx.fillText(label, x, top - 8);
      if (e.fl & Flag.Bounty) { ctx.font = '16px serif'; ctx.fillText('👑', x, top - 26); }
      this.bar(ctx, x, top - 3, 46, e.h ?? 100, me ? '#40e060' : '#e03040');
    } else if (e.k === Kind.Helsing) {
      ctx.font = '9px "Press Start 2P", monospace';
      ctx.fillStyle = '#000'; ctx.fillText('HELSING', x + 1, top - 1);
      ctx.fillStyle = '#ff9070'; ctx.fillText('HELSING', x, top - 2);
      if (e.h !== undefined) this.bar(ctx, x, top + 2, 40, e.h, '#ff8030');
    } else if (e.h !== undefined) {
      this.bar(ctx, x, top + 8, 30, e.h, '#e0e0e0');
    }
    if (e.fl & Flag.Feared) {
      ctx.font = '18px "Press Start 2P", monospace';
      ctx.fillStyle = '#ffe040'; ctx.fillText('!', x, top + (Math.floor(now / 150) % 2 ? 0 : -3));
    }
    if (e.fl & Flag.Stunned) {
      for (let i = 0; i < 3; i++) {
        const a = now / 200 + (i * Math.PI * 2) / 3;
        ctx.fillStyle = '#ffe040';
        ctx.fillRect(x + Math.cos(a) * 16 - 2, top + 10 + Math.sin(a) * 5 - 2, 5, 5);
      }
    }
    // bocadillos para emotes
    if (e.k === Kind.Player && (e.a === Anim.Wave || e.a === Anim.Taunt)) {
      const txt = e.a === Anim.Wave ? '¡Buenas noches!' : TAUNTS[e.c as CharacterId] ?? '¡Buu!';
      ctx.font = '10px "Press Start 2P", monospace';
      const w = ctx.measureText(txt).width + 14;
      const by = top - 46;
      ctx.fillStyle = '#f0e8d8'; ctx.fillRect(x - w / 2, by - 14, w, 22);
      ctx.fillRect(x - 3, by + 8, 6, 5);
      ctx.strokeStyle = '#0b0710'; ctx.lineWidth = 2; ctx.strokeRect(x - w / 2, by - 14, w, 22);
      ctx.fillStyle = '#20101a'; ctx.fillText(txt, x, by + 2);
    }
  }

  private bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, pct: number, color: string) {
    ctx.fillStyle = '#000'; ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, 8);
    ctx.fillStyle = '#3a0a10'; ctx.fillRect(x - w / 2, y, w, 4);
    ctx.fillStyle = color; ctx.fillRect(x - w / 2, y, (w * pct) / 100, 4);
  }

  /** Datos para el minimapa. */
  minimap(mm: HTMLCanvasElement) {
    if (!this.map) return;
    const c = mm.getContext('2d')!;
    const s = mm.width / MAP_SIZE;
    c.fillStyle = '#120c18'; c.fillRect(0, 0, mm.width, mm.height);
    for (const o of this.map.obstacles) {
      c.fillStyle = o.type === 'water' ? '#1a3a5a' : '#3a3044';
      c.fillRect(o.x * s, o.y * s, Math.max(1, o.w * s), Math.max(1, o.h * s));
    }
    for (const e of this.ents.values()) {
      if (e.k === Kind.Helsing) { c.fillStyle = '#ff8030'; c.fillRect(e.rx * s - 2, e.ry * s - 2, 4, 4); }
      else if (e.k === Kind.Player && e.id !== this.youId) { c.fillStyle = '#ff3050'; c.fillRect(e.rx * s - 2, e.ry * s - 2, 4, 4); }
    }
    const me = this.renderPos();
    c.fillStyle = '#ffe080'; c.fillRect(me.x * s - 3, me.y * s - 3, 6, 6);
    c.strokeStyle = 'rgba(255,255,255,0.3)';
    c.strokeRect((this.cam.x - this.canvas.width / 2 / this.cam.zoom) * s, (this.cam.y - this.canvas.height / 2 / this.cam.zoom) * s, (this.canvas.width / this.cam.zoom) * s, (this.canvas.height / this.cam.zoom) * s);
  }

  get lastSnap() { return this.lastSnapAt; }
}

const TAUNTS: Record<CharacterId, string> = {
  vampire: '¡Bleh, bleh!',
  werewolf: '¡AUUUUU!',
  mummy: '¡Te envuelvo!',
  invisible: '¿Me buscabas?',
};

export const charName = (c: CharacterId) => CHARACTERS[c]?.name ?? c;
