// Estado de partida en el cliente: predicción del jugador local, interpolación del resto, efectos y render.
import { CHARACTERS, type CharacterId } from '../shared/characters';
import { MAP_SIZE, PIXEL, TICK_DT } from '../shared/constants';
import { BORDER_DEPTH, generateMap, THEMES, type GameMap, type MapThemeId, type Obstacle } from '../shared/maps';
import { BAL, tierOf } from '../shared/balance';
import { Ambient } from './ambient';
import { Effects, pixelEllipse } from './effects';
import { Terrain } from './terrain';
import { ObstacleGrid } from '../shared/physics';
import { Anim, Flag, Kind, type EntSnap, type GameEvent, type ServerMsg, type YouState } from '../shared/protocol';
import { playSfx, spatialVol } from './audio';
import { input, readButtons, readMove } from './input';
import { net } from './net';
import { ANIMS, getFrame, getItem, getSarcophagus, npcLook, SH, SW } from './sprites';
import { LIGHT_COLORS, lightsFor, renderDecor, renderObstacle, renderTV, type Light, type Prerendered } from './tiles';

const INTERP_MS = 120;

interface Sample { t: number; x: number; y: number }
interface CEnt {
  id: number; k: Kind; c: string; s?: string; n?: string; l?: number; h?: number; fl: number; f: 1 | -1; a: Anim; q: number; r?: number;
  animStart: number; samples: Sample[]; seen: number; flash: number; rx: number; ry: number;
  o?: number; rr?: number; trail: { x: number; y: number; t: number }[]; tombAt: number;
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
  effects!: Effects;
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
      this.effects = new Effects(this.map, (id) => { const e = this.ents.get(id); return e ? { x: e.rx, y: e.ry } : null; });
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
    const aqua = this.aquatic();
    if (!m.you.st) {
      for (const p of this.pending) {
        const r = this.grid.move(x, y, p.mx * m.you.spd * TICK_DT, p.my * m.you.spd * TICK_DT, 18, aqua);
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
        e = { id: s.i, k: s.k, c: s.c, fl: 0, f: s.f, a: s.a, q: s.q, animStart: now, samples: [], seen: now, flash: 0, rx: s.x, ry: s.y, trail: [], tombAt: 0 };
        this.ents.set(s.i, e);
      }
      if (e.a !== s.a || e.q !== s.q) { e.animStart = now; e.a = s.a; e.q = s.q; }
      const fl = s.fl ?? 0;
      if (fl & Flag.Entombed && !(e.fl & Flag.Entombed)) e.tombAt = now;
      e.k = s.k; e.c = s.c; e.s = s.s; e.n = s.n; e.l = s.l; e.h = s.h; e.fl = fl; e.f = s.f; e.r = s.r; e.o = s.o; e.rr = s.rr; e.seen = now;
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
    // distancia al cursor (habilidades que se lanzan en un punto: carne, tentáculo...)
    let d = 200;
    if (!input.touch.active) {
      const rp = this.renderPos();
      const wx = this.cam.x + (input.mouseX * devicePixelRatio - this.canvas.width / 2) / this.cam.zoom;
      const wy = this.cam.y + (input.mouseY * devicePixelRatio - this.canvas.height / 2) / this.cam.zoom;
      d = Math.hypot(wx - rp.x, wy - (rp.y - 45));
    }
    const q = ++this.seq;
    net.send({ t: 'input', q, mx: +mx.toFixed(3), my: +my.toFixed(3), a: +this.aim.toFixed(3), b, d: Math.round(d) });
    if (!this.alive || !this.you) return;
    this.pending.push({ q, mx, my });
    if (this.pending.length > 40) this.pending.shift();
    this.pred.px = this.pred.x; this.pred.py = this.pred.y; this.pred.t = performance.now();
    if (!this.you.st && (mx || my)) {
      const r = this.grid.move(this.pred.x, this.pred.y, mx * this.you.spd * TICK_DT, my * this.you.spd * TICK_DT, 18, this.aquatic());
      this.pred.x = r.x; this.pred.y = r.y;
    }
  }

  /** ¿Hay agua (profunda o charca) bajo este punto? */
  private waterUnder(x: number, y: number) {
    if (this.grid.deepWater(x, y)) return true;
    for (const z of this.ents.values()) if (z.k === Kind.Zone && z.c === 'puddle' && (z.rx - x) ** 2 + ((z.ry - y) / 0.62) ** 2 < (z.rr ?? 0) ** 2) return true;
    return false;
  }

  /** ¿Mi personaje cruza el agua profunda? (cualquier criatura acuática). */
  private aquatic() {
    const c = this.ents.get(this.youId)?.c as CharacterId | undefined;
    return !!(c && CHARACTERS[c]?.aquatic);
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
          if (ev.k === Kind.Minion) this.corpses.push({ x: ev.x, y: ev.y, k: ev.k, c: e?.s ?? ev.c, s: e?.c ?? 'normal', f: e?.f ?? 1, life: 4, seed: e?.l ?? 0 });
          else this.corpses.push({ x: ev.x, y: ev.y, k: ev.k, c: ev.c, s: e?.s, f: e?.f ?? 1, life: 6, seed: e?.id ?? 0 });
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
      case 'lvl':
        for (let i = 0; i < 26; i++) this.particles.push({ x: ev.x + (Math.random() - 0.5) * 40, y: ev.y, vx: 0, vy: -120 - Math.random() * 120, life: 0.9, max: 0.9, color: '#ffd040', size: 4, grav: 0 });
        if (ev.o === this.youId) this.floaters.push({ x: ev.x, y: ev.y - 90, text: '¡NIVEL!', color: '#ffd040', life: 1.4, big: true });
        return;
      case 'howl': this.shake = Math.max(this.shake, 8); break;
      case 'crimson': case 'moon': if (ev.o === this.youId && ev.d) this.shake = Math.max(this.shake, 10); break;
      case 'evolve': if (ev.o === this.youId && (ev.n ?? 0) > 0) { this.shake = 6; this.floaters.push({ x: ev.x, y: ev.y - 120, text: '¡EVOLUCIÓN!', color: '#ff90ff', life: 1.8, big: true }); } break;
      case 'entomb': if (ev.o === this.youId && ev.d) this.shake = 8; break;
    }
    this.effects.spawn(ev, this.youId);
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
    const dyn: Light[] = []; // luces dinámicas (antorchas de NPC, farol de Hunter)
    const cones: { x: number; y: number; a: number }[] = []; // linternas

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#020104'; // fuera del mapa
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    world();

    // suelo procedural (por chunks) + bordes del mapa
    this.terrain.draw(ctx, vx0, vy0, vx1, vy1, this.chunkBudget);
    this.chunkBudget = 3;
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
    this.effects.update(dt);
    this.effects.draw(ctx, 'ground', now);
    for (const e of this.ents.values()) if (e.k === Kind.Zone && inView(e.rx, e.ry)) this.effects.drawZone(ctx, e.c, e.rx, e.ry, e.rr ?? 60, (e.h ?? 100) / 100, now, e.id % 97);
    this.drawScentTrails(ctx, now);

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
      const kind = c.k === Kind.Player ? 'monster' : c.k === Kind.Hunter ? 'hunter' : c.k === Kind.Minion ? 'zombie' : 'npc';
      if (c.c && !(c.k === Kind.Minion && c.s === 'fat')) {
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
    for (const list of [this.map.obstacles, this.map.border]) for (const o of list) {
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
    // televisiones (entidades del mapa): encima de su edificio o en el suelo
    const tvFrame = Math.floor(now / 140);
    for (const tv of this.map.tvs) {
      if (!inView(tv.x, tv.y)) continue;
      const host = tv.host >= 0 ? this.map.obstacles[tv.host] : null;
      draws.push({
        y: host ? host.y + host.h + 0.5 : tv.y + tv.h, fn: () => {
          const a = renderTV(tv, (tvFrame + tv.id) % 4);
          const w = a.base.width * PIXEL, h = a.base.height * PIXEL;
          const ox = tv.x - PIXEL, oy = tv.y - PIXEL - (tv.kind === 'outdoor' ? 4 * PIXEL : 0);
          ctx.drawImage(a.base, ox, oy, w, h);
          if (a.glow) glows.push({ img: a.glow, x: ox, y: oy, w, h, flip: false, a: 0.8 });
        },
      });
    }
    for (const e of this.ents.values()) {
      if (!inView(e.rx, e.ry) || e.k === Kind.Projectile || e.k === Kind.Zone) continue;
      draws.push({ y: e.ry, fn: () => this.drawEnt(ctx, e, now, glows) });
      if (e.k === Kind.Npc) {
        const held = npcLook(e.c, e.id % 97).held;
        if (held === 'flashlight') cones.push({ x: e.rx + e.f * 20, y: e.ry - 40, a: e.f === 1 ? 0 : Math.PI });
        else if (held === 'torch') dyn.push({ x: e.rx + e.f * 14, y: e.ry - 60, r: 200, c: 'warm', flicker: true });
        else if (held === 'lantern' || held === 'candle') dyn.push({ x: e.rx + e.f * 14, y: e.ry - 40, r: 130, c: 'warm', flicker: true });
      } else if (e.k === Kind.Player && e.fl & Flag.Jet) {
        const a = e.id === this.youId ? this.aim : e.r ?? 0;
        dyn.push({ x: e.rx + Math.cos(a) * 130, y: e.ry - 34 + Math.sin(a) * 110, r: 170, c: 'cold' });
      } else if (e.k === Kind.Hunter) {
        if (e.c === 'heraldo') dyn.push({ x: e.rx, y: e.ry - 60, r: 260, c: 'white', flicker: true });
        else if (e.c === 'exorcista') dyn.push({ x: e.rx + e.f * 14, y: e.ry - 40, r: 110, c: 'cold' });
        else if (e.c === 'sectario') dyn.push({ x: e.rx, y: e.ry - 30, r: e.fl & Flag.Ritual ? 220 : 90, c: e.fl & Flag.Ritual ? 'warm' : 'warm', flicker: true });
        else dyn.push({ x: e.rx - e.f * 12, y: e.ry - 40, r: 150, c: 'warm', flicker: true });
      }
    }
    draws.sort((a, b) => a.y - b.y);
    for (const d of draws) d.fn();
    cones.sort((a, b) => (a.x - me.x) ** 2 + (a.y - me.y) ** 2 - ((b.x - me.x) ** 2 + (b.y - me.y) ** 2));
    cones.length = Math.min(cones.length, 5);

    // proyectiles y efectos
    this.effects.draw(ctx, 'top', now);
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
    this.drawEdgeFog(ctx, vx0, vy0, vx1, vy1);

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
    this.effects.draw(ctx, 'glow', now);
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
    // ---- sumergido: solo ondas y burbujas
    if (e.fl & Flag.Submerged) {
      const t = now / 1000;
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#0c2228';
      for (let j = -2; j <= 2; j++) { const hw = Math.round(Math.sqrt(1 - (j / 2.6) ** 2) * 7) * 3; ctx.fillRect(Math.round((x - hw) / 3) * 3, Math.round((y + j * 3) / 3) * 3, hw * 2, 3); }
      for (let i = 0; i < 2; i++) {
        const k = (t * 1.2 + i * 0.5) % 1;
        ctx.globalAlpha = (1 - k) * (e.id === this.youId ? 0.9 : 0.5);
        pixelEllipse(ctx, x, y, 10 + k * 26, 4 + k * 9, i ? '#a0e0d0' : '#60c0b0');
      }
      ctx.globalAlpha = 1;
      if (Math.random() < 0.25) this.particles.push({ x: x + (Math.random() - 0.5) * 24, y: y - 2, vx: 0, vy: -30, life: 0.4, max: 0.4, color: '#a0e0d0', size: 3, grav: 0 });
      return;
    }
    if (e.k === Kind.Minion) { this.drawMinion(ctx, e, now, glows); return; }
    const isMonster = e.k === Kind.Player;
    const tier = isMonster ? tierOf(e.l ?? 1) : 0;
    const ult = isMonster && !!(e.fl & Flag.Ult);
    const invis = !!(e.fl & Flag.Invisible);

    // ---- encerrado en sarcófago: el sarcófago sustituye al sprite
    if (e.fl & Flag.Entombed) {
      const s = getSarcophagus();
      const w = SW * PIXEL, h = SH * PIXEL;
      const k = Math.min(1, (now - e.tombAt) / 300); // la tapa se cierra
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.ellipse(x + 3, y + 3, 22, 8, 0, 0, Math.PI * 2); ctx.fill();
      const rise = (1 - k) * 30;
      ctx.drawImage(s.base, 0, 0, s.base.width, s.base.height * k, x - w / 2, y - h + 9 + rise, w, h * k);
      if (s.glow) glows.push({ img: s.glow, x: x - w / 2, y: y - h + 9 + rise, w, h, flip: false, a: 0.5 + Math.sin(now / 150) * 0.3 });
      if (now - e.flash < 90) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6; ctx.drawImage(s.base, x - w / 2, y - h + 9, w, h); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
      if (Math.random() < 0.1) this.effects.particles.push({ x: x + (Math.random() - 0.5) * 40, y: y - Math.random() * 80, vx: 0, vy: 20, life: 0.6, max: 0.6, color: '#d8b870', size: 3, grav: 60 });
      return;
    }

    // ---- elementos detrás del personaje (definitivas)
    let scale = e.k === Kind.Hunter && e.c === 'heraldo' ? 1.35 : 1;
    let lift = 0;
    if (e.k === Kind.Hunter && e.c === 'heraldo') {
      lift = 6 + Math.sin(now / 400 + e.id) * 3 + (e.fl & Flag.Flying ? 34 : 0); // flota (y vuela por encima de obstáculos)
      if (Math.random() < 0.3) this.effects.particles.push({ x: x + (Math.random() - 0.5) * 50, y: y - 20 - Math.random() * 80, vx: 0, vy: -20, life: 0.9, max: 0.9, color: Math.random() < 0.5 ? '#fff0a0' : '#ffffff', size: 3, grav: 0, glow: true });
    }
    if (ult && e.c === 'werewolf') {
      scale = 1.25;
      this.drawMoon(ctx, x - e.f * 8, y - 112, now);
    }
    if (ult && e.c === 'vampire') {
      ctx.fillStyle = 'rgba(30,0,10,0.45)';
      ctx.beginPath(); ctx.ellipse(x, y + 2, 60 + Math.sin(now / 200) * 6, 22, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (ult && e.c === 'mummy' && Math.random() < 0.5) this.effects.particles.push({ x: x + (Math.random() - 0.5) * 60, y: y - Math.random() * 30, vx: 120 * (Math.random() < 0.5 ? -1 : 1), vy: -20, life: 0.5, max: 0.5, color: '#d8b870', size: 3, grav: 0 });
    // evolución: los niveles altos flotan y llevan aura
    if (tier >= 3 && !invis && (e.c === 'vampire' || e.c === 'invisible')) lift = 5 + Math.sin(now / 320 + e.id) * 3;
    if (tier >= 2 && !invis && Math.random() < (tier >= 3 ? 0.35 : 0.15)) {
      const col = AURA[e.c as CharacterId] ?? '#ffffff';
      this.effects.particles.push({ x: x + (Math.random() - 0.5) * 30, y: y - 10 - Math.random() * 70, vx: (Math.random() - 0.5) * 10, vy: -30 - Math.random() * 30, life: 0.8, max: 0.8, color: col, size: 3, grav: 0, glow: true });
    }

    // sombra
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(x + 3, y + 3, 20 * scale - lift * 0.8, 7 * scale, 0, 0, Math.PI * 2); ctx.fill();
    if (tier >= 3 && !invis && (e.c === 'werewolf' || e.c === 'mummy')) {
      ctx.fillStyle = e.c === 'werewolf' ? 'rgba(180,210,255,0.18)' : 'rgba(255,210,90,0.18)';
      ctx.beginPath(); ctx.ellipse(x, y + 2, 30, 10, 0, 0, Math.PI * 2); ctx.fill();
    }

    const kind = isMonster ? 'monster' : e.k === Kind.Hunter ? 'hunter' : 'npc';
    const fr = getFrame(kind, e.c, e.s ?? 'classic', e.a, this.frameFor(e, now), e.id % 97, tier);
    let alpha = 1;
    if (isMonster && e.c === 'invisible') alpha = 0.92;
    if (invis) alpha = e.id === this.youId ? 0.3 : 0.14 + Math.sin(now / 80) * 0.06;
    if (e.fl & Flag.Mist) alpha = 0.35;
    if (e.fl & Flag.Protected) alpha *= Math.floor(now / 120) % 2 ? 0.5 : 1;
    ctx.globalAlpha = alpha;
    const w = SW * PIXEL * scale, h = SH * PIXEL * scale;
    const dx = x - w / 2, dy = y - h + 9 * scale - lift;
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
    // vulnerable: parpadeo rojizo
    if (e.fl & Flag.Vulnerable && Math.floor(now / 160) % 2) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35;
      ctx.filter = 'sepia(1) saturate(6) hue-rotate(-50deg)';
      blit(fr.base);
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'source-over';
    }
    // humano infectado: se va poniendo verde a medida que pierde la vida
    if (e.fl & Flag.Infected) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = 0.25 + (1 - (e.h ?? 100) / 100) * 0.5;
      ctx.filter = 'sepia(1) saturate(5) hue-rotate(50deg) brightness(0.8)';
      blit(fr.base);
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'source-over';
      if (Math.random() < 0.25) this.particles.push({ x: x + (Math.random() - 0.5) * 22, y: y - 20 - Math.random() * 50, vx: 0, vy: -25, life: 0.6, max: 0.6, color: Math.random() < 0.5 ? '#a0ff60' : '#5a8a30', size: 3, grav: 0 });
    }
    ctx.globalAlpha = 1;
    // criaturas acuáticas: salpicaduras en los pies al andar por el agua
    if (isMonster && CHARACTERS[e.c as CharacterId]?.aquatic && this.waterUnder(x, y)) {
      if (e.a === Anim.Walk && Math.random() < 0.55) {
        for (let i = 0; i < 2; i++) this.particles.push({ x: x + (Math.random() - 0.5) * 26, y: y + 2, vx: (Math.random() - 0.5) * 90 - e.f * 30, vy: -80 - Math.random() * 80, life: 0.45, max: 0.45, color: ['#c8e8f8', '#7aa6d0', '#3a6a90'][Math.floor(Math.random() * 3)], size: 3, grav: 520 });
      }
      const k = (now / 700 + e.id * 0.3) % 1;
      ctx.globalAlpha = 0.55 * (1 - k);
      pixelEllipse(ctx, x, y + 3, 12 + k * 18, 4 + k * 6, '#a0c8e8');
      ctx.globalAlpha = 1;
    }
    // chorro de agua a presión
    if (e.fl & Flag.Jet) {
      const a = e.id === this.youId ? this.aim : e.r ?? (e.f === 1 ? 0 : Math.PI);
      let len: number = BAL.kthula.jetRange;
      for (let k = 30; k <= len; k += 30) if (this.grid.blocked(x + Math.cos(a) * k, y + Math.sin(a) * k, 3, true)) { len = k; break; }
      this.effects.drawJet(ctx, x + Math.cos(a) * 30, y - 58 + Math.sin(a) * 10, a, len, now); // sale de delante de la cabeza, como invocado
    }
    if (fr.glow && alpha > 0.3) glows.push({ img: fr.glow, x: dx, y: dy, w, h, flip, a: Math.min(1, alpha + tier * 0.1) });

    // ---- delante del personaje
    if (ult && e.c === 'vampire') this.drawBatRing(ctx, x, y, now, 6, 46, 1, glows);
    if (e.o !== undefined && tier >= 3 && e.c === 'vampire') this.drawBatRing(ctx, x, y, now, 2, 40, e.o, glows, true);
    if (ult && e.c === 'vampire' && Math.random() < 0.6) this.effects.particles.push({ x: x + (Math.random() - 0.5) * 70, y: y - Math.random() * 90, vx: 0, vy: -40, life: 0.6, max: 0.6, color: Math.random() < 0.5 ? '#ff2040' : '#80101c', size: 3, grav: 0, glow: true });
    if (e.fl & Flag.Shield) {
      ctx.strokeStyle = `rgba(100,160,255,${0.5 + Math.sin(now / 150) * 0.2})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, y - 45, 36, 54, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (e.fl & Flag.Buffed && Math.random() < 0.3) this.particles.push({ x: x + (Math.random() - 0.5) * 34, y: y - Math.random() * 80, vx: 0, vy: -50, life: 0.5, max: 0.5, color: '#ff4020', size: 3, grav: 0 });
    if (e.fl & Flag.Haste && !invis && Math.random() < 0.4) this.particles.push({ x: x - e.f * (16 + Math.random() * 20), y: y - 20 - Math.random() * 60, vx: -e.f * 120, vy: 0, life: 0.2, max: 0.2, color: '#d0e0ff', size: 3, grav: 0 });
    if (e.fl & Flag.Slowed && Math.random() < 0.15) this.particles.push({ x: x + (Math.random() - 0.5) * 20, y: y - 50, vx: 0, vy: 30, life: 0.5, max: 0.5, color: '#40c060', size: 3, grav: 100 });
    // polvo al andar (del color del terreno)
    if (e.a === Anim.Walk && !invis && Math.random() < 0.08) {
      const cols = this.effects.terrainColors(x, y);
      this.particles.push({ x: x + (Math.random() - 0.5) * 16, y: y + 2, vx: -e.f * 20, vy: -10, life: 0.4, max: 0.4, color: cols[0], size: 3, grav: 0 });
    }
  }

  /** Zombi esbirro: sprite de humano zombificado + aro del color de su dueño. */
  private drawMinion(ctx: CanvasRenderingContext2D, e: CEnt, now: number, glows: { img: HTMLCanvasElement; x: number; y: number; w: number; h: number; flip: boolean; a: number }[]) {
    const x = e.rx, y = e.ry;
    const variant = e.c;
    const swollen = !!(e.fl & Flag.Swollen);
    let scale = variant === 'fat' ? 1.2 : variant === 'tough' ? 1.1 : 1;
    if (swollen) scale *= 1 + Math.abs(Math.sin(now / 60)) * 0.15;
    const mine = e.o === this.youId;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(x + 3, y + 3, 18 * scale, 6 * scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = mine ? 'rgba(128,255,96,0.75)' : 'rgba(255,110,70,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y + 2, 20 * scale, 7 * scale, 0, 0, Math.PI * 2); ctx.stroke();
    const fr = getFrame('zombie', e.s ?? 'villager', variant, e.a, this.frameFor(e, now), e.l ?? e.id);
    const w = SW * PIXEL * scale, h = SH * PIXEL * scale;
    const dx = x - w / 2, dy = y - h + 9 * scale;
    const flip = e.f === -1;
    const blit = (img: HTMLCanvasElement) => {
      if (flip) { ctx.save(); ctx.translate(x * 2, 0); ctx.scale(-1, 1); ctx.drawImage(img, dx, dy, w, h); ctx.restore(); }
      else ctx.drawImage(img, dx, dy, w, h);
    };
    blit(fr.base);
    if (now - e.flash < 90 || (swollen && Math.floor(now / 80) % 2)) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = swollen ? 0.5 : 0.75;
      if (swollen) ctx.filter = 'sepia(1) saturate(8) hue-rotate(-40deg)';
      blit(fr.base);
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    if (fr.glow) glows.push({ img: fr.glow, x: dx, y: dy, w, h, flip, a: 0.9 });
    if (e.fl & Flag.Slowed && Math.random() < 0.1) this.particles.push({ x: x + (Math.random() - 0.5) * 20, y: y - 50, vx: 0, vy: 30, life: 0.5, max: 0.5, color: '#40c060', size: 3, grav: 100 });
  }

  /** Niebla espesa más allá del borde jugable: el mundo sigue, pero se pierde en la bruma. */
  private drawEdgeFog(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
    const S = MAP_SIZE, D = BORDER_DEPTH;
    const amb = parseInt(THEMES[this.theme].ambient.slice(1), 16);
    const rgb = `${(amb >> 16) & 255},${(amb >> 8) & 255},${amb & 255}`;
    const band = (gx0: number, gy0: number, gx1: number, gy1: number, rx: number, ry: number, rw: number, rh: number) => {
      if (rx > x1 || ry > y1 || rx + rw < x0 || ry + rh < y0) return;
      const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(0.45, `rgba(${rgb},0.55)`); g.addColorStop(1, `rgba(${rgb},1)`);
      ctx.fillStyle = g;
      ctx.fillRect(rx, ry, rw, rh);
    };
    const F = 140; // la bruma empieza un poco antes del límite
    band(0, F, 0, -D, -D, -D, S + 2 * D, D + F); // norte
    band(0, S - F, 0, S + D, -D, S - F, S + 2 * D, D + F); // sur
    band(F, 0, -D, 0, -D, -D, D + F, S + 2 * D); // oeste
    band(S - F, 0, S + D, 0, S - F, -D, D + F, S + 2 * D); // este
    // más allá de la franja: oscuridad total
    ctx.fillStyle = `rgb(${rgb})`;
    if (x0 < -D) ctx.fillRect(x0, y0, -D - x0, y1 - y0);
    if (x1 > S + D) ctx.fillRect(S + D, y0, x1 - S - D, y1 - y0);
    if (y0 < -D) ctx.fillRect(x0, y0, x1 - x0, -D - y0);
    if (y1 > S + D) ctx.fillRect(x0, S + D, x1 - x0, y1 - S - D);
  }

  /** Luna llena detrás del Lobo durante su definitiva. */
  private drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number, now: number) {
    const r = 40 + Math.sin(now / 400) * 2;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = `rgba(190,215,255,${0.07 - i * 0.02})`;
      ctx.beginPath(); ctx.arc(x, y, r + 14 + i * 14, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(236,238,214,0.8)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(180,186,170,0.5)';
    for (const [cx, cy, cr] of [[-14, -8, 8], [11, 9, 6], [8, -17, 4], [-6, 17, 5]]) ctx.fillRect(Math.round((x + cx - cr) / 3) * 3, Math.round((y + cy - cr / 2) / 3) * 3, cr * 2, cr);
  }

  /** Murciélagos girando alrededor (definitiva o murciélagos orbitales del nivel 15). */
  private drawBatRing(ctx: CanvasRenderingContext2D, x: number, y: number, now: number, n: number, R: number, ready: number, glows: { img: HTMLCanvasElement; x: number; y: number; w: number; h: number; flip: boolean; a: number }[], orbit = false) {
    for (let i = 0; i < n; i++) {
      const a = now / (orbit ? 500 : 260) + (i * Math.PI * 2) / n;
      const bx = x + Math.cos(a) * R, by = y - 45 + Math.sin(a) * R * 0.5;
      const img = getItem(`bat${Math.floor(now / 90 + i) % 2}`);
      const w = img.base.width * PIXEL * 0.8, h = img.base.height * PIXEL * 0.8;
      ctx.globalAlpha = i < ready ? 1 : 0.25;
      ctx.drawImage(img.base, bx - w / 2, by - h / 2, w, h);
      if (img.glow && i < ready) glows.push({ img: img.glow, x: bx - w / 2, y: by - h / 2, w, h, flip: false, a: 1 });
    }
    ctx.globalAlpha = 1;
  }

  /** Instinto depredador: el Lobo (nv. 5+) ve el rastro de las presas heridas a intervalos. */
  private drawScentTrails(ctx: CanvasRenderingContext2D, now: number) {
    const me = this.ents.get(this.youId);
    if (!me || me.c !== 'werewolf' || tierOf(this.you?.lvl ?? 1) < 1) return;
    for (const e of this.ents.values()) {
      if (e.id === this.youId || e.k === Kind.PowerUp || e.k === Kind.Projectile || e.k === Kind.Zone) continue;
      if ((e.h ?? 100) >= 35) { e.trail.length = 0; continue; }
      const last = e.trail[e.trail.length - 1];
      if (!last || now - last.t > 90) { e.trail.push({ x: e.rx, y: e.ry, t: now }); if (e.trail.length > 18) e.trail.shift(); }
      if ((now / 1000) % 1.6 > 1.0) continue; // a intervalos
      for (let i = 0; i < e.trail.length; i++) {
        const p = e.trail[i];
        ctx.globalAlpha = (i / e.trail.length) * 0.8;
        ctx.fillStyle = i % 2 ? '#ff3040' : '#a01020';
        ctx.fillRect(Math.round(p.x / 3) * 3 + (i % 2 ? 6 : -6), Math.round(p.y / 3) * 3, 6, 3);
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, e: CEnt, now: number, glows: { img: HTMLCanvasElement; x: number; y: number; w: number; h: number; flip: boolean; a: number }[]) {
    if (e.c === 'sandstorm') { this.effects.drawStorm(ctx, e.rx, e.ry, e.r ?? 0, now); return; }
    if (e.c === 'wave') { this.effects.drawWave(ctx, e.rx, e.ry, e.r ?? 0, now); return; }
    const id = e.c === 'bat' ? `bat${Math.floor(now / 90) % 2}` : e.c === 'scarab' ? `scarab${Math.floor(now / 60) % 2}` : e.c;
    const img = getItem(id);
    const w = img.base.width * PIXEL, h = img.base.height * PIXEL;
    const py = e.ry - 40; // a la altura de las manos (también los escarabajos de Ramsés)
    ctx.save();
    ctx.translate(e.rx, py);
    if (e.c === 'bat') { if ((e.r ?? 0) > Math.PI / 2 || (e.r ?? 0) < -Math.PI / 2) ctx.scale(-1, 1); }
    else ctx.rotate(e.c === 'bandage' || e.c === 'holy' ? now / 60 : e.r ?? 0);
    ctx.drawImage(img.base, -w / 2, -h / 2, w, h);
    ctx.restore();
    if (img.glow && (e.c === 'bat' || e.c === 'scarab' || e.c === 'holy')) glows.push({ img: img.glow, x: e.rx - w / 2, y: py - h / 2, w, h, flip: false, a: 1 });
    if (Math.random() < 0.5) this.particles.push({ x: e.rx, y: py, vx: 0, vy: 0, life: 0.25, max: 0.25, color: e.c === 'bolt' ? '#c0c0d0' : e.c === 'bat' ? '#402050' : e.c === 'holy' ? '#a0d8ff' : '#d8b870', size: 3, grav: 0 });
  }

  /** Iconos pixelados sobre la cabeza (estados). */
  private icon(ctx: CanvasRenderingContext2D, kind: 'prey' | 'curse' | 'vuln' | 'panic', x: number, y: number, now: number) {
    const S = 3;
    const px = (i: number, j: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x / 3) * 3 + i * S, Math.round(y / 3) * 3 + j * S, S, S); };
    if (kind === 'prey') {
      if (Math.floor(now / 250) % 2) return;
      for (let k = 0; k < 3; k++) for (let j = 0; j < 5; j++) px(-3 + k * 2 + Math.floor(j / 2), j - 2, '#ff3040');
    } else if (kind === 'curse') {
      const g = ['.xxxxx.', 'x..x..x', '.xxxxx.', '...x...', '..x.x..'];
      g.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'x') px(i - 3, j - 2, Math.floor(now / 300) % 2 ? '#60ffa0' : '#e0c040'); }));
    } else if (kind === 'vuln') {
      const g = ['.x.x.', 'xxxxx', 'xx.xx', '.xxx.', '..x..'];
      g.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'x') px(i - 2, j - 2, i === 2 && j === 2 ? '#000' : '#ff6070'); }));
    } else {
      for (const ox of [-2, 2]) { for (let j = -2; j < 1; j++) px(ox, j, '#ffe040'); px(ox, 2, '#ffe040'); }
    }
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, e: CEnt, now: number) {
    if (e.k === Kind.PowerUp || e.k === Kind.Projectile || e.k === Kind.Zone) return;
    if (e.fl & Flag.Invisible && e.id !== this.youId) return;
    if (e.fl & Flag.Submerged && e.id !== this.youId) return;
    const tierLift = e.k === Kind.Player && tierOf(e.l ?? 1) >= 3 && (e.c === 'vampire' || e.c === 'invisible') ? 6 : 0;
    const x = e.rx, top = e.ry - SH * PIXEL + 8 - tierLift - (e.k === Kind.Player && e.fl & Flag.Ult && e.c === 'werewolf' ? 24 : 0);
    ctx.textAlign = 'center';
    if (e.k === Kind.Player) {
      const me = e.id === this.youId;
      const label = `${e.n ?? ''} ·${e.l ?? 1}`;
      ctx.font = '11px "Press Start 2P", monospace';
      ctx.fillStyle = '#000'; ctx.fillText(label, x + 1, top - 7);
      ctx.fillStyle = me ? '#ffe080' : '#ffffff'; ctx.fillText(label, x, top - 8);
      if (e.fl & Flag.Bounty) { ctx.font = '16px serif'; ctx.fillText('👑', x, top - 26); }
      this.bar(ctx, x, top - 3, 46, e.h ?? 100, me ? '#40e060' : '#e03040');
    } else if (e.k === Kind.Hunter) {
      const info = HUNTER_LABEL[e.c] ?? HUNTER_LABEL.cazador;
      const ty = top - (e.c === 'heraldo' ? 28 : 0);
      ctx.font = '9px "Press Start 2P", monospace';
      ctx.fillStyle = '#000'; ctx.fillText(info.name, x + 1, ty - 1);
      ctx.fillStyle = info.color; ctx.fillText(info.name, x, ty - 2);
      if (e.h !== undefined) this.bar(ctx, x, ty + 2, e.c === 'heraldo' ? 60 : 40, e.h, info.color);
      if (e.fl & Flag.Ritual) { ctx.font = '8px "Press Start 2P", monospace'; ctx.fillStyle = '#ff4060'; ctx.fillText('¡RITUAL!', x, ty - 14 + (Math.floor(now / 200) % 2) * 2); }
    } else if (e.k === Kind.Minion) {
      if (e.h !== undefined && e.h < 100) this.bar(ctx, x, top + 8, 26, e.h, e.o === this.youId ? '#80ff60' : '#c06040');
    } else if (e.h !== undefined) {
      this.bar(ctx, x, top + 8, 30, e.h, '#e0e0e0');
    }
    // iconos de estado
    let iy = top - (e.k === Kind.Player ? 34 : 14);
    if (e.fl & Flag.Prey) { this.icon(ctx, 'prey', x, iy, now); iy -= 18; }
    if (e.fl & Flag.Cursed) { this.icon(ctx, 'curse', x, iy, now); iy -= 18; }
    if (e.fl & Flag.Vulnerable) { this.icon(ctx, 'vuln', x, iy, now); iy -= 18; }
    if (e.fl & Flag.Panic) this.icon(ctx, 'panic', x, top + (Math.floor(now / 100) % 2 ? 0 : -3), now);
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
      if (e.k === Kind.Hunter) { const big = e.c === 'heraldo'; c.fillStyle = (HUNTER_LABEL[e.c] ?? HUNTER_LABEL.cazador).color; c.fillRect(e.rx * s - (big ? 3 : 2), e.ry * s - (big ? 3 : 2), big ? 6 : 4, big ? 6 : 4); }
      else if (e.k === Kind.Player && e.id !== this.youId) { c.fillStyle = '#ff3050'; c.fillRect(e.rx * s - 2, e.ry * s - 2, 4, 4); }
      else if (e.k === Kind.Minion && e.o === this.youId) { c.fillStyle = '#80ff60'; c.fillRect(e.rx * s - 1, e.ry * s - 1, 2, 2); }
    }
    const me = this.renderPos();
    c.fillStyle = '#ffe080'; c.fillRect(me.x * s - 3, me.y * s - 3, 6, 6);
    c.strokeStyle = 'rgba(255,255,255,0.3)';
    c.strokeRect((this.cam.x - this.canvas.width / 2 / this.cam.zoom) * s, (this.cam.y - this.canvas.height / 2 / this.cam.zoom) * s, (this.canvas.width / this.cam.zoom) * s, (this.canvas.height / this.cam.zoom) * s);
  }

  get lastSnap() { return this.lastSnapAt; }
}

const AURA: Record<CharacterId, string> = { vampire: '#ff3050', werewolf: '#c8e0ff', mummy: '#ffd860', invisible: '#c0e0ff', zombie: '#80ff60', kthula: '#40e0c0' };

const HUNTER_LABEL: Record<string, { name: string; color: string }> = {
  cazador: { name: 'CAZADOR', color: '#ff9070' },
  inquisidor: { name: 'INQUISIDOR', color: '#ff4040' },
  exorcista: { name: 'EXORCISTA', color: '#80c8ff' },
  sectario: { name: 'SECTARIO', color: '#c060ff' },
  heraldo: { name: 'HERALDO', color: '#fff0a0' },
};

const TAUNTS: Record<CharacterId, string> = {
  vampire: '¡Bleh, bleh!',
  werewolf: '¡AUUUUU!',
  mummy: '¡Te envuelvo!',
  invisible: '¿Me buscabas?',
  zombie: '¡Cereeebros!',
  kthula: "Ph'nglui... ¡glub!",
};

export const charName = (c: CharacterId) => CHARACTERS[c]?.name ?? c;
