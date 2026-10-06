// Estado de partida en el cliente: predicción del jugador local, interpolación del resto, efectos y render.
import { CHARACTERS, type CharacterId } from '../shared/characters';
import { pixelizeShapes } from './pixelshapes';
import { MAP_SIZE, PIXEL, TICK_DT } from '../shared/constants';
import { BORDER_DEPTH, currentAt, generateMap, THEMES, tvLinks, tvSpot, type GameMap, type MapThemeId, type Obstacle } from '../shared/maps';
import { BAL, CURRENT, isBeast, tierOf } from '../shared/balance';
import { Ambient } from './ambient';
import { Effects, pixelEllipse } from './effects';
import { t as tr, tc, th as thunter, tpu } from './i18n';
import { Terrain } from './terrain';
import { ObstacleGrid } from '../shared/physics';
import { Anim, Flag, Flag2, Kind, type EntSnap, type GameEvent, type ServerMsg, type TvState, type YouState } from '../shared/protocol';
import { playSfx, spatialVol } from './audio';
import { input, readButtons, readMove } from './input';
import { net } from './net';
import { ANIMS, getBeacon, getBeast, getCritter, getFrame, getItem, getPlant, getSarcophagus, getSkeleton, getSpiderling, getVermin, npcLook, shade, SH, SW } from './sprites';
import { getSkin } from '../shared/characters';
import { LIGHT_COLORS, lightsFor, renderDecor, renderObstacle, renderTV, type Light, type Prerendered } from './tiles';

const INTERP_MS = 120;

interface Sample { t: number; x: number; y: number }
interface CEnt {
  id: number; k: Kind; c: string; s?: string; n?: string; l?: number; h?: number; fl: number; f: 1 | -1; a: Anim; q: number; r?: number;
  animStart: number; samples: Sample[]; seen: number; flash: number; rx: number; ry: number;
  f2: number; hy?: number; o?: number; rr?: number; bx?: number; by?: number; z?: number; wx?: number; g?: string; trail: { x: number; y: number; t: number }[]; tombAt: number;
}
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; grav: number }
interface Floater { x: number; y: number; text: string; color: string; life: number; big?: boolean }
interface Ring { x: number; y: number; r: number; life: number; max: number; color: string; width: number }
interface Swing { x: number; y: number; a: number; life: number; color: string }
interface Corpse { x: number; y: number; k: Kind; c: string; s?: string; f: 1 | -1; life: number; seed: number }


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
  /** Árboles del mapa quemados (índice → hasta cuándo arden y hasta cuándo siguen quemados, en ms). */
  private tvLinkCache: [number, number][] | null = null;
  burnt = new Map<number, { flame: number; until: number }>();
  /** Teles del mapa (solo si hay una Interferencia en la sala). */
  tv: TvState | null = null;

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
  /** Altura (fracción de la pantalla) donde se centra el personaje: en móvil, el centro de la zona que no tapan HUD y controles. */
  focusY = 0.5;

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
        const r = this.predMove(x, y, p.mx * m.you.spd * TICK_DT, p.my * m.you.spd * TICK_DT, aqua, !!m.you.fly);
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
        e = { id: s.i, k: s.k, c: s.c, fl: 0, f2: 0, f: s.f, a: s.a, q: s.q, animStart: now, samples: [], seen: now, flash: 0, rx: s.x, ry: s.y, trail: [], tombAt: 0 };
        this.ents.set(s.i, e);
      }
      if (e.a !== s.a || e.q !== s.q) { e.animStart = now; e.a = s.a; e.q = s.q; }
      const fl = s.fl ?? 0;
      if (fl & Flag.Entombed && !(e.fl & Flag.Entombed)) e.tombAt = now;
      e.k = s.k; e.c = s.c; e.s = s.s; e.n = s.n; e.l = s.l; e.h = s.h; e.fl = fl; e.f2 = s.f2 ?? 0; e.f = s.f; e.r = s.r; e.o = s.o; e.rr = s.rr; e.bx = s.bx; e.by = s.by; e.z = s.z; e.wx = s.wx; e.hy = s.hy; e.g = s.g; e.seen = now;
      e.samples.push({ t: now, x: s.x, y: s.y });
      if (e.samples.length > 6) e.samples.shift();
    }
    for (const [id, e] of this.ents) if (!seenIds.has(id) && now - e.seen > 250) this.ents.delete(id);
    this.tv = m.tv ?? null;
    this.burnt.clear();
    for (const [i, flame, left] of m.burn ?? []) this.burnt.set(i, { flame: now + flame * 1000, until: now + left * 1000 });
    for (const ev of m.ev) this.handleEvent(ev);
  }

  private sendInput() {
    if (!this.you && this.youId < 0) return;
    const { mx, my } = this.alive ? readMove() : { mx: 0, my: 0 };
    const b = this.alive ? readButtons() : 0;
    // ángulo de apuntado
    let d = 200;
    if (input.touch.active) {
      if (input.touch.dragging && input.touch.aim !== null) { this.aim = input.touch.aim; d = input.touch.aimDist; }
      else {
        // apuntado automático: el enemigo visible más cercano; si no hay, hacia donde caminas
        const t = this.autoTarget(520);
        if (t) { const rp = this.renderPos(); this.aim = Math.atan2(t.ry - rp.y, t.rx - rp.x); d = Math.hypot(t.rx - rp.x, t.ry - rp.y); }
        else if (input.touch.moveAim !== null) this.aim = input.touch.moveAim;
      }
    } else {
      const sx = this.canvas.width / 2 + (this.renderPos().x - this.cam.x) * this.cam.zoom;
      const sy = this.canvas.height * this.focusY + (this.renderPos().y - this.cam.y - 45) * this.cam.zoom;
      this.aim = Math.atan2(input.mouseY * devicePixelRatio - sy, input.mouseX * devicePixelRatio - sx);
    }
    // distancia al cursor (habilidades que se lanzan en un punto: carne, tentáculo...)
    if (!input.touch.active) {
      const rp = this.renderPos();
      const wx = this.cam.x + (input.mouseX * devicePixelRatio - this.canvas.width / 2) / this.cam.zoom;
      const wy = this.cam.y + (input.mouseY * devicePixelRatio - this.canvas.height * this.focusY) / this.cam.zoom;
      d = Math.hypot(wx - rp.x, wy - (rp.y - 45));
    }
    const q = ++this.seq;
    net.send({ t: 'input', q, mx: +mx.toFixed(3), my: +my.toFixed(3), a: +this.aim.toFixed(3), b, d: Math.round(d) });
    if (!this.alive || !this.you) return;
    this.pending.push({ q, mx, my });
    if (this.pending.length > 40) this.pending.shift();
    this.pred.px = this.pred.x; this.pred.py = this.pred.y; this.pred.t = performance.now();
    if (!this.you.st && (mx || my || currentAt(this.map, this.pred.x, this.pred.y))) {
      const r = this.predMove(this.pred.x, this.pred.y, mx * this.you.spd * TICK_DT, my * this.you.spd * TICK_DT, this.aquatic(), !!this.you.fly);
      this.pred.x = r.x; this.pred.y = r.y;
    }
  }

  /** Enemigo visible más cercano (apuntado automático en móvil). */
  private autoTarget(R: number): CEnt | null {
    const me = this.renderPos();
    let best: CEnt | null = null, bd = R * R;
    for (const e of this.ents.values()) {
      if (e.id === this.youId || (e.k !== Kind.Player && e.k !== Kind.Npc && e.k !== Kind.Hunter && e.k !== Kind.Minion)) continue;
      if (e.k === Kind.Minion && e.o === this.youId) continue;
      if (e.fl & (Flag.Invisible | Flag.Protected | Flag.Submerged)) continue;
      const dd = (e.rx - me.x) ** 2 + (e.ry - me.y) ** 2;
      if (dd < bd) { bd = dd; best = e; }
    }
    return best;
  }

  /** Movimiento predicho: con colisiones, o libre si vuela. */
  private predMove(x: number, y: number, dx: number, dy: number, aqua: boolean, fly: boolean) {
    if (fly) return { x: Math.max(18, Math.min(MAP_SIZE - 18, x + dx)), y: Math.max(18, Math.min(MAP_SIZE - 18, y + dy)) };
    const c = this.ents.get(this.youId)?.c as CharacterId | undefined;
    const rad = (c && CHARACTERS[c]?.radius) || 18;
    const r = this.grid.move(x, y, dx, dy, rad, aqua);
    // corriente del río poco profundo (jungla): también se predice
    const cur = aqua ? null : currentAt(this.map, r.x, r.y);
    return cur ? this.grid.move(r.x, r.y, cur.dx * CURRENT.push * TICK_DT, cur.dy * CURRENT.push * TICK_DT, rad, aqua) : r;
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
    return !!(c && (CHARACTERS[c]?.aquatic || CHARACTERS[c]?.hover || (c === 'pirate' && (this.you?.tier ?? 0) >= 1) || (c === 'necro' && this.you?.buffs.some((b) => b.t === 'march')))); // camina (o levita, o navega) sobre el agua
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
          const col = target?.c === 'mummy' ? '#c8b888' : target?.c === 'invisible' || target?.c === 'poltergeist' ? '#a0d0ff' : target && WOODY.has(target.c) ? '#6a5030' : '#b0101a';
          this.burst(ev.x, ev.y - 40, 6, col, 140, 2);
          if (col === '#b0101a') this.splat(ev.x, ev.y, 3 + Math.min(6, ev.d / 6));
        }
        if (mine) this.shake = Math.min(14, this.shake + 6);
        break;
      }
      case 'die': {
        if ((ev.k !== Kind.Player || ev.c) && !ev.c.startsWith('c_')) { // las alimañas no dejan cadáver
          const e = [...this.ents.values()].find((x) => Math.abs(x.rx - ev.x) < 30 && Math.abs(x.ry - ev.y) < 30 && x.k === ev.k);
          if (ev.k === Kind.Minion && (e?.c === 'thrall' || e?.c === 'digger' || e?.c === 'militia')) this.corpses.push({ x: ev.x, y: ev.y, k: Kind.Npc, c: e.s ?? ev.c, f: e.f ?? 1, life: 6, seed: e.l ?? 0 });
          else if (ev.k === Kind.Minion) { if (e && NO_CORPSE.has(e.c)) { /* sin cadáver */ } else if (e && ['wall', 'turret', 'flower'].includes(e.c)) this.effects.burst(ev.x, ev.y - 20, 18, ['#5a4632', '#2e4a24', '#a0e040'], 160, 3, 400, 0.6); else if (e?.c !== 'clone') this.corpses.push({ x: ev.x, y: ev.y, k: ev.k, c: e?.s ?? ev.c, s: e?.c ?? 'normal', f: e?.f ?? 1, life: 4, seed: e?.l ?? 0 }); }
          else this.corpses.push({ x: ev.x, y: ev.y, k: ev.k, c: ev.c, s: e?.s, f: e?.f ?? 1, life: 6, seed: e?.id ?? 0 });
          if (this.corpses.length > 60) this.corpses.shift();
        }
        const woody = ev.k === Kind.Minion && !ev.c; // las plantas no sangran
        if (!woody) { this.burst(ev.x, ev.y - 40, 18, ev.k === Kind.Player ? '#8040ff' : '#b0101a', 220, 3); this.splat(ev.x, ev.y, 14); }
        if (ev.k === Kind.Player) for (let i = 0; i < 10; i++) this.particles.push({ x: ev.x, y: ev.y - 20, vx: (Math.random() - 0.5) * 40, vy: -60 - Math.random() * 60, life: 1.6, max: 1.6, color: '#c0a0ff', size: 4, grav: -10 });
        break;
      }
      case 'fx': this.fx(ev); break;
      case 'pick':
        this.burst(ev.x, ev.y, 10, ev.p === 'coin' ? '#ffd040' : '#ffffff', 120, 2);
        this.floaters.push({ x: ev.x, y: ev.y - 30, text: tpu(ev.p), color: '#a0ffa0', life: 1 });
        break;
    }
    this.onEvent?.(ev);
  }

  private fx(ev: Extract<GameEvent, { e: 'fx' }>) {
    switch (ev.f) {
      case 'lvl':
        for (let i = 0; i < 26; i++) this.particles.push({ x: ev.x + (Math.random() - 0.5) * 40, y: ev.y, vx: 0, vy: -120 - Math.random() * 120, life: 0.9, max: 0.9, color: '#ffd040', size: 4, grav: 0 });
        if (ev.o === this.youId) this.floaters.push({ x: ev.x, y: ev.y - 90, text: tr('levelUp'), color: '#ffd040', life: 1.4, big: true });
        return;
      case 'howl': this.shake = Math.max(this.shake, 8); break;
      case 'crimson': case 'moon': if (ev.o === this.youId && ev.d) this.shake = Math.max(this.shake, 10); break;
      case 'evolve': if (ev.o === this.youId && (ev.n ?? 0) > 0) { this.shake = 6; this.floaters.push({ x: ev.x, y: ev.y - 120, text: tr('evolution'), color: '#ff90ff', life: 1.8, big: true }); } break;
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
    pixelizeShapes(ctx);
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
    const camX = this.cam.x - W / 2 / z + sx, camY = this.cam.y - (H * this.focusY) / z + sy;
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
    // corriente del río poco profundo: vetas de espuma que bajan con el agua
    if (this.terrain.streaks.length) {
      ctx.fillStyle = '#9ad8c8';
      for (const g of this.terrain.streaks) {
        const k = (this.time * 0.5 + g.ph) % 1, d = k * 90;
        const x = g.x + g.dx * d, y = g.y + g.dy * d;
        if (!inView(x, y)) continue;
        ctx.globalAlpha = Math.sin(k * Math.PI) * 0.55;
        ctx.fillRect(Math.round(x / 3) * 3, Math.round(y / 3) * 3, Math.abs(g.dx) > 0.5 ? 12 : 3, Math.abs(g.dx) > 0.5 ? 3 : 12);
      }
      ctx.globalAlpha = 1;
    }

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
    for (const e of this.ents.values()) if (e.k === Kind.Zone && inView(e.rx, e.ry)) this.effects.drawZone(ctx, e.c, e.rx, e.ry, e.rr ?? 60, (e.h ?? 100) / 100, now, e.id % 97, e.bx, e.by);
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
      if (c.k === Kind.Hunter && isBeast(c.c)) {
        // fiera abatida: panza arriba
        const im = getBeast(c.c, 'idle', 0).base, w = im.width * PIXEL, h = im.height * PIXEL;
        ctx.save(); ctx.translate(c.x, c.y - h / 2 + 6); ctx.scale(c.f, -1); ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore();
      } else if (c.c && !(c.k === Kind.Minion && c.s === 'fat')) {
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
    for (const list of [this.map.obstacles, this.map.border]) list.forEach((o, i) => {
      if (o.type === 'water') return;
      if (!(o.x - 60 < vx1 && o.x + o.w + 60 > vx0 && o.y - 160 < vy1 && o.y + o.h > vy0)) return;
      const burnt = list === this.map.obstacles ? this.burnt.get(i) : undefined;
      if (burnt && burnt.flame > now) dyn.push({ x: o.x + o.w / 2, y: o.y, r: Math.max(o.w, o.h) * 2.2, c: 'warm', flicker: true });
      draws.push({
        y: o.y + o.h, fn: () => {
          const a = artOf(o);
          const w = a.base.width * PIXEL, h = a.base.height * PIXEL;
          if (burnt) {
            // árbol quemado: tronco y copa calcinados; mientras arde, llamas y ascuas
            ctx.filter = 'grayscale(0.85) brightness(0.32) sepia(0.4)';
            ctx.drawImage(a.base, o.x + a.ox, o.y + a.oy, w, h);
            ctx.filter = 'none';
            if (burnt.flame > now) this.drawTreeFlames(ctx, o, a.oy, now);
            else if (Math.random() < 0.03) this.particles.push({ x: o.x + Math.random() * o.w, y: o.y + a.oy + Math.random() * h * 0.6, vx: 0, vy: -20, life: 1, max: 1, color: '#5a5550', size: 3, grav: -10 });
            return;
          }
          ctx.drawImage(a.base, o.x + a.ox, o.y + a.oy, w, h);
          if (a.glow) glows.push({ img: a.glow, x: o.x + a.ox, y: o.y + a.oy, w, h, flip: false, a: 1 });
        },
      });
    });
    // televisiones (entidades del mapa): encima de su edificio o en el suelo
    const tvFrame = Math.floor(now / 140);
    const channel = new Set(this.tv?.ch ?? []);
    for (const tv of this.tv ? this.map.tvs : []) {
      if (!inView(tv.x, tv.y)) continue;
      const spot = tvSpot(tv);
      dyn.push({ x: spot.x, y: spot.y, r: tv.kind === 'shop' ? 110 : 120, c: 'cold', flicker: true });
      if (channel.has(tv.id) || this.tv?.bc) {
        // señal perturbadora: espiral de colores frente a la tele
        const col = this.tv?.bc ?? '#40ff90';
        draws.push({ y: spot.y + 1, fn: () => {
          ctx.globalAlpha = 0.5;
          for (let k = 0; k < 3; k++) { const rr = ((now / 400 + k / 3) % 1) * (channel.has(tv.id) ? 160 : 60); pixelEllipse(ctx, spot.x, spot.y, rr, rr * 0.62, k % 2 ? col : '#ffffff'); }
          ctx.globalAlpha = 1;
        } });
      }
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
        const held = e.c.startsWith('c_') ? 'none' : npcLook(e.c, e.id % 97).held; // las alimañas no llevan luz
        if (held === 'flashlight') cones.push({ x: e.rx + e.f * 20, y: e.ry - 40, a: e.f === 1 ? 0 : Math.PI });
        else if (held === 'torch') dyn.push({ x: e.rx + e.f * 14, y: e.ry - 60, r: 200, c: 'warm', flicker: true });
        else if (held === 'lantern' || held === 'candle') dyn.push({ x: e.rx + e.f * 14, y: e.ry - 40, r: 130, c: 'warm', flicker: true });
      } else if (e.k === Kind.Prop && e.c === 'lamp') {
        dyn.push({ x: e.rx, y: e.ry - 66, r: 210, c: 'white' }); // una farola falsa también alumbra
      } else if (e.k === Kind.Player && e.c === 'candle' && !(e.f2 & Flag2.Dim) && !(e.fl & Flag.Invisible)) {
        dyn.push({ x: e.rx, y: e.ry - 76, r: 180, c: 'warm', flicker: true }); // su llama alumbra
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
    for (const e of this.ents.values()) if (e.k === Kind.Zone && inView(e.rx, e.ry)) {
      if (e.c === 'waxfire') dyn.push({ x: e.rx, y: e.ry - 10, r: (e.rr ?? 40) * 2.2, c: 'warm', flicker: true });
      else if (e.c === 'candle') dyn.push({ x: e.rx, y: e.ry - 20, r: 60, c: 'warm', flicker: true });
      else if (e.c === 'fire') dyn.push({ x: e.rx, y: e.ry - 10, r: (e.rr ?? 60) * 2, c: 'warm', flicker: true });
      else if (e.c === 'holy') dyn.push({ x: e.rx, y: e.ry, r: (e.rr ?? 60) * 1.5, c: 'cold' });
      else if (e.c === 'hex') dyn.push({ x: e.rx, y: e.ry, r: (e.rr ?? 60) * 1.3, c: 'cold' });
      else if (e.c === 'ritual') dyn.push({ x: e.rx, y: e.ry, r: (e.rr ?? 60) * 1.8, c: 'warm', flicker: true });
    }
    draws.sort((a, b) => a.y - b.y);
    for (const d of draws) d.fn();

    cones.sort((a, b) => (a.x - me.x) ** 2 + (a.y - me.y) ** 2 - ((b.x - me.x) ** 2 + (b.y - me.y) ** 2));
    cones.length = Math.min(cones.length, 5);

    // trigo alto de la Cosecha: tapa a quien esté dentro
    for (const e of this.ents.values()) if (e.k === Kind.Zone && e.c === 'wheat' && inView(e.rx, e.ry)) this.effects.drawWheat(ctx, e.rx, e.ry, e.rr ?? 300, (e.h ?? 100) / 100, now, e.id % 97);
    // móvil: guía de apuntado mientras arrastras un botón
    if (input.touch.active && input.touch.dragging && this.alive) {
      const a = this.aim, L = Math.min(input.touch.aimDist, 700);
      ctx.fillStyle = '#ffffff';
      for (let k = 30; k < L; k += 18) { ctx.globalAlpha = 0.55 * (1 - k / (L + 60)); ctx.fillRect(Math.round((me.x + Math.cos(a) * k) / PIXEL) * PIXEL, Math.round((me.y - 30 + Math.sin(a) * k) / PIXEL) * PIXEL, PIXEL * 2, PIXEL * 2); }
      ctx.globalAlpha = 0.6;
      pixelEllipse(ctx, me.x + Math.cos(a) * L, me.y - 30 + Math.sin(a) * L, 26, 16, '#ffe080', 2);
      ctx.globalAlpha = 1;
    }
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
    // Gusarena bajo tierra: no ve el mapa, solo las pisadas de quien se mueve cerca
    if (meEnt && meEnt.c === 'worm' && meEnt.fl & Flag.Submerged && this.alive) this.drawUnderground(ctx, W, H, z, camX, camY, now, me);
    // cegado por los cuervos (o en la oscuridad de Candle Man): casi no ves más allá de ti
    if (this.you?.buffs.some((b) => b.t === 'blind') || [...this.ents.values()].some((z) => z.k === Kind.Zone && z.c === 'lightsout' && z.o !== this.youId && (me.x - z.rx) ** 2 + (me.y - z.ry) ** 2 < (z.rr ?? 500) ** 2)) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const sx = W / 2 + (me.x - this.cam.x) * z, sy = H * this.focusY + (me.y - 40 - this.cam.y) * z;
      const g = ctx.createRadialGradient(sx, sy, 60 * z, sx, sy, 260 * z);
      g.addColorStop(0, 'rgba(6,4,10,0)'); g.addColorStop(1, 'rgba(6,4,10,0.94)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

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
    // nubes de tormenta del Reanimado, por encima de todo y de la oscuridad (su dueño ve a través)
    for (const e of this.ents.values()) if (e.k === Kind.Zone && e.c === 'storm') this.effects.drawStormClouds(ctx, e.rx, e.ry, e.rr ?? 400, (e.h ?? 100) / 100, now, e.o === this.youId);

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
    // Se apagaron las luces (Candle Man): dentro de la zona de otro no hay luces y apenas se ve
    const outs = [...this.ents.values()].filter((z) => z.k === Kind.Zone && z.c === 'lightsout' && z.o !== this.youId);
    const dimmed = (x: number, y: number) => outs.some((z) => (x - z.rx) ** 2 + (y - z.ry) ** 2 < (z.rr ?? 500) ** 2);
    const blind = dimmed(me.x, me.y);
    hole(me.x, me.y - 30, blind ? 120 : this.alive ? 330 : 260, 0.92);
    const all = this.lights.concat(dyn).filter((l) => !outs.length || !dimmed(l.x, l.y));
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
    if (e.k === Kind.Prop) { this.drawProp(ctx, e.c, x, y, 1, glows); return; }
    // tu propio disfraz: ves en qué te has convertido (y tu silueta, tenue)
    if (e.id === this.youId && e.fl & Flag.Disguised && e.g) {
      const [gk, ga, gb] = e.g.split(':');
      if (gk === 'prop') { this.drawProp(ctx, ga, x, y, 0.8, glows); ctx.globalAlpha = 0.28; }
      else if (gk === 'npc') {
        const fr = getFrame('npc', ga, '', e.a, this.frameFor(e, now), +(gb ?? e.id) % 97);
        this.blitFrame(ctx, fr.base, x, y, e.f === -1, 1, 0.85);
        ctx.globalAlpha = 0.25;
      } else if (gk === 'char') {
        const fr = getFrame('monster', ga, gb || 'classic', e.a, this.frameFor(e, now), 0, 0);
        this.blitFrame(ctx, fr.base, x, y, e.f === -1, 1, 0.85);
        ctx.globalAlpha = 0.25;
      }
      const fr = getFrame('monster', e.c, e.s ?? 'classic', e.a, this.frameFor(e, now), 0, tierOf(e.l ?? 1));
      if (gk === 'prop') ctx.globalAlpha = 0.22;
      this.blitFrame(ctx, fr.base, x, y, e.f === -1, 1, ctx.globalAlpha);
      ctx.globalAlpha = 1;
      return;
    }
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
    // ---- alimañas del mapa
    if (e.k === Kind.Npc && e.c.startsWith('c_')) {
      const fly = e.c === 'c_bat' || e.c === 'c_crow' || e.c === 'c_parrot';
      const moving = e.a === Anim.Walk;
      const img = getVermin(e.c, fly ? Math.floor(now / (moving ? 70 : 220) + e.id) % 2 : moving ? Math.floor(now / 90 + e.id) % 2 : 0);
      const lift = fly ? (moving || e.c === 'c_bat' ? 26 + Math.sin(now / 150 + e.id) * 6 : 0) : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(x, y + 2, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
      const w = img.base.width * PIXEL, h = img.base.height * PIXEL;
      const dx = Math.round((x - w / 2) / PIXEL) * PIXEL, dy = Math.round((y - h + 6 - lift) / PIXEL) * PIXEL;
      if (e.f === -1) { ctx.save(); ctx.translate(dx * 2 + w, 0); ctx.scale(-1, 1); }
      ctx.drawImage(img.base, dx, dy, w, h);
      if (now - e.flash < 90) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; ctx.drawImage(img.base, dx, dy, w, h); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
      if (e.f === -1) ctx.restore();
      if (img.glow) glows.push({ img: img.glow, x: dx, y: dy, w, h, flip: e.f === -1, a: 1 });
      // destello: siempre sueltan algo
      if (Math.random() < 0.06) this.particles.push({ x: x + (Math.random() - 0.5) * 16, y: y - lift - 16, vx: 0, vy: -20, life: 0.5, max: 0.5, color: '#ffe080', size: 3, grav: 0 });
      return;
    }
    // ---- Gusarena bajo tierra: un montículo de arena que avanza
    if (e.fl & Flag.Submerged && e.c === 'worm') {
      const t = now / 1000;
      ctx.globalAlpha = e.id === this.youId ? 0.95 : 0.8;
      for (let j = -2; j <= 2; j++) { const hw = Math.round(Math.sqrt(1 - (j / 2.6) ** 2) * 9) * PIXEL; ctx.fillStyle = j < 0 ? '#c8a060' : j === 0 ? '#a8844a' : '#7a5e34'; ctx.fillRect(Math.round((x - hw) / PIXEL) * PIXEL, Math.round((y - 4 + j * PIXEL) / PIXEL) * PIXEL, hw * 2, PIXEL); }
      ctx.fillStyle = '#5a4428';
      for (let i = 0; i < 5; i++) { const a = i * 1.3 + t * 2; ctx.fillRect(Math.round((x + Math.cos(a) * 20) / PIXEL) * PIXEL, Math.round((y + Math.sin(a) * 7) / PIXEL) * PIXEL, PIXEL, PIXEL); } // grietas
      ctx.globalAlpha = 1;
      if (e.a === Anim.Walk && Math.random() < 0.5) this.particles.push({ x: x + (Math.random() - 0.5) * 30, y: y - 4, vx: (Math.random() - 0.5) * 60, vy: -60, life: 0.4, max: 0.4, color: Math.random() < 0.5 ? '#c8a060' : '#7a5e34', size: PIXEL, grav: 300 });
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
    // ---- maleficio: cualquiera convertido en animalillo
    if (e.fl & Flag.Hexed) {
      const cr = getCritter(Math.floor(now / 220 + e.id) % 2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(x + 2, y + 2, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
      this.blitFrame(ctx, cr.base, x, y, e.f === -1, 1, 1);
      if (cr.glow) glows.push({ img: cr.glow, x: x - (SW * PIXEL) / 2, y: y - SH * PIXEL + 9, w: SW * PIXEL, h: SH * PIXEL, flip: e.f === -1, a: 1 });
      if (Math.random() < 0.15) this.particles.push({ x: x + (Math.random() - 0.5) * 20, y: y - 20, vx: 0, vy: -30, life: 0.5, max: 0.5, color: '#c060ff', size: 3, grav: 0 });
      return;
    }
    if (e.k === Kind.Minion) { this.drawMinion(ctx, e, now, glows); return; }
    // ---- fieras del mapa: cocodrilo del Nilo, raptores y tiranosaurio
    if (e.k === Kind.Hunter && isBeast(e.c)) { this.drawBeast(ctx, e, now, glows); return; }
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
    let scale = e.k === Kind.Hunter && e.c === 'heraldo' ? 1.35 : isMonster && e.c === 'reanimated' ? 1.18 : isMonster && e.c === 'tree' ? 1.22 : isMonster && e.c === 'worm' ? BAL.worm.scale : isMonster && e.c === 'dino' ? DINO_SCALE[e.o ?? 0] ?? 1.3 : 1;
    if (ult && e.c === 'slime') scale = 1.9 + Math.sin(now / 160) * 0.05; // Masa crítica
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

    if (e.f2 & Flag2.Lifted) {
      // abducido: flota dentro de un haz verde
      lift += 34 + Math.sin(now / 120) * 4;
      ctx.globalAlpha = 0.25; ctx.fillStyle = '#80ff90'; ctx.fillRect(Math.round((x - 24) / 3) * 3, y - 260, 48, 262); ctx.globalAlpha = 1;
    }
    if (e.f2 & Flag2.Leaping) lift += 30;
    const flying = isMonster && !!(e.fl & Flag.Flying);
    const flyingBroom = flying && e.c !== 'succubus' && e.c !== 'dino' && !(e.fl & Flag.Phased); // la súcubo vuela con sus alas; el fantasma no necesita escoba
    if (flying) lift += 26 + Math.sin(now / 200 + e.id) * 3;
    if (isMonster && e.c === 'pirate' && tier >= 1 && this.waterUnder(x, y)) { this.drawGhostShip(ctx, x, y, e.f, now, glows); lift += 10; }
    if (isMonster && e.c === 'poltergeist') lift += 8 + Math.sin(now / 300 + e.id) * 4; // levita
    if (isMonster && e.c === 'necro' && e.fl & Flag.Haste) { lift += 12 + Math.sin(now / 250 + e.id) * 3; if (Math.random() < 0.4) this.effects.particles.push({ x: x + (Math.random() - 0.5) * 30, y: y - 4, vx: 0, vy: -20, life: 0.6, max: 0.6, color: Math.random() < 0.5 ? '#80ff60' : '#2a1e3a', size: 3, grav: 0, glow: true }); }
    // drenaje del Poltergeist: aura que tira de la vida de alrededor
    if (ult && e.c === 'poltergeist') {
      const R = BAL.poltergeist.ult.r, k = (now / 900) % 1;
      ctx.globalAlpha = 0.45;
      pixelEllipse(ctx, x, y, R, R * 0.62, '#80c8ff');
      ctx.globalAlpha = 0.6 * (1 - k);
      pixelEllipse(ctx, x, y, R * (1 - k), R * (1 - k) * 0.62, '#c0e8ff');
      ctx.globalAlpha = 1;
    }
    if (flying && !flyingBroom && Math.random() < 0.35) this.effects.particles.push({ x: x - e.f * 20, y: y - lift - 30, vx: -e.f * 40, vy: -10, life: 0.6, max: 0.6, color: Math.random() < 0.5 ? '#ff4a8a' : '#ffd0e0', size: 3, grav: 0, glow: true });
    // Gusarena: jorobas del cuerpo que asoman de la arena detrás de la cabeza
    if (isMonster && e.c === 'worm' && !invis) this.drawWormTrail(ctx, e, now);
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(x + 3, y + 3, Math.max(8, 20 * scale - lift * 0.4), 7 * scale, 0, 0, Math.PI * 2); ctx.fill();
    if (tier >= 3 && !invis && (e.c === 'werewolf' || e.c === 'mummy')) {
      ctx.fillStyle = e.c === 'werewolf' ? 'rgba(180,210,255,0.18)' : 'rgba(255,210,90,0.18)';
      ctx.beginPath(); ctx.ellipse(x, y + 2, 30, 10, 0, 0, Math.PI * 2); ctx.fill();
    }

    const kind = isMonster ? 'monster' : e.k === Kind.Hunter ? 'hunter' : 'npc';
    const fr = getFrame(kind, isMonster && e.c === 'dino' ? `dino${Math.min(3, e.o ?? 0)}` : isMonster && e.c === 'candle' && e.f2 & Flag2.Dim ? 'candleoff' : e.c, e.s ?? 'classic', e.a, this.frameFor(e, now), e.id % 97, tier); // Dinozombie: forma según el servidor
    let alpha = 1;
    if (isMonster && e.c === 'invisible') alpha = 0.92;
    if (invis) alpha = e.id === this.youId ? 0.3 : 0.14 + Math.sin(now / 80) * 0.06;
    if (e.fl & Flag.Mist) alpha = 0.35;
    if (e.fl & Flag.Protected) alpha *= Math.floor(now / 120) % 2 ? 0.5 : 1;
    if (isMonster && e.c === 'poltergeist') alpha *= 0.88;
    if (e.fl & Flag.Phased) alpha = (e.id === this.youId ? 0.45 : 0.3) + Math.sin(now / 60) * 0.08;
    if (e.f2 & Flag2.Dim) alpha = e.id === this.youId ? 0.5 : this.litAt(x, y) ? 0.55 : 0.07; // Candle Man apagado: solo se le ve bajo la luz
    ctx.globalAlpha = alpha;
    const w = SW * PIXEL * scale, h = SH * PIXEL * scale;
    const dx = x - w / 2, dy = y - h + 9 * scale - lift;
    const flip = e.f === -1;
    const blit = (img: HTMLCanvasElement) => {
      if (flip) { ctx.save(); ctx.translate(x * 2, 0); ctx.scale(-1, 1); ctx.drawImage(img, dx, dy, w, h); ctx.restore(); }
      else ctx.drawImage(img, dx, dy, w, h);
    };
    blit(fr.base);
    if (flyingBroom) {
      // escoba bajo los pies, con estela de chispas
      const by2 = Math.round((y - lift + 2) / 3) * 3, f = e.f;
      ctx.fillStyle = '#6a4a28'; ctx.fillRect(Math.round((x - 30 * f) / 3) * 3 - (f < 0 ? 57 : 0), by2, 60, 3);
      ctx.fillStyle = '#c8a050'; for (let i = 0; i < 4; i++) ctx.fillRect(Math.round((x - f * (34 + i * 3)) / 3) * 3, by2 - 6 + i * 3, 9, 3);
      if (Math.random() < 0.6) this.effects.particles.push({ x: x - f * 40, y: y - lift, vx: -f * 60, vy: 10, life: 0.5, max: 0.5, color: ['#a0ff40', '#ffe060', '#c060ff'][Math.floor(Math.random() * 3)], size: 3, grav: 0, glow: true });
    }
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
    // R-800 en Protocolo de exterminio: se pone rojo
    if (isMonster && e.c === 'r800' && ult) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + Math.sin(now / 80) * 0.1;
      ctx.filter = 'sepia(1) saturate(8) hue-rotate(-50deg)'; blit(fr.base); ctx.filter = 'none';
      ctx.globalCompositeOperation = 'source-over';
    }
    // R-800: el arma enorme del protocolo apunta hacia su láser
    if (isMonster && e.c === 'r800' && ult) {
      let ga = e.f === 1 ? 0 : Math.PI;
      for (const z of this.ents.values()) if (z.k === Kind.Zone && z.c === 'laser' && z.o === e.id && z.bx !== undefined) ga = Math.atan2((z.by ?? z.ry) - z.ry, z.bx - z.rx);
      const ux = Math.cos(ga), uy = Math.sin(ga), nx = -uy, ny = ux;
      const gx = x + ux * 10, gy = y - 34 - lift;
      // cañón enorme y ancho: culata con aletas, cuerpo con rendijas rojas y boca ancha que brilla
      for (let d = -6; d < 60; d += PIXEL) for (let q = -13; q <= 13; q += PIXEL) {
        const aq = Math.abs(q);
        if (d < 6 && aq > 7) continue;
        if (d >= 6 && d < 46 && aq > 10) continue;
        if (d >= 46 && aq > 13) continue;
        ctx.fillStyle = d >= 50 ? (aq < 8 ? '#ffe0e0' : '#ff3040') : aq > 8 ? '#20242a' : d % 12 < 3 && aq < 6 ? '#ff3040' : q < -2 ? '#9aa0a8' : '#5a6068';
        ctx.fillRect(Math.round((gx + ux * d + nx * q) / PIXEL) * PIXEL, Math.round((gy + uy * d + ny * q) / PIXEL) * PIXEL, PIXEL, PIXEL);
      }
      if (Math.random() < 0.5) this.effects.particles.push({ x: gx + ux * 58, y: gy + uy * 58, vx: ux * 80 + (Math.random() - 0.5) * 60, vy: uy * 80 + (Math.random() - 0.5) * 60, life: 0.25, max: 0.25, color: '#ffb0b0', size: PIXEL, grav: 0, glow: true });
    }
    // Convergencia de Unidad: su cuerpo parpadea antes de explotar
    if (isMonster && e.fl & Flag.Swollen && Math.floor(now / 90) % 2) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.85; blit(fr.base); ctx.globalCompositeOperation = 'source-over';
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
    if (e.fl & Flag.Raged) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + Math.sin(now / 90) * 0.1;
      ctx.filter = 'sepia(1) saturate(8) hue-rotate(-50deg)'; blit(fr.base); ctx.filter = 'none';
      ctx.globalCompositeOperation = 'source-over';
    }
    if (e.f2 & Flag2.Engulfed) { ctx.globalAlpha = 0.45; ctx.fillStyle = '#60d040'; ctx.fillRect(dx, dy, w, h); ctx.globalAlpha = 1; }
    if (e.f2 & Flag2.Burning) this.drawFlames(ctx, x, y - lift, h, now, e.id);
    if (e.f2 & Flag2.Blind) for (let i = 0; i < 3; i++) { const a = now / 200 + i * 2.1; ctx.fillStyle = '#141018'; ctx.fillRect(Math.round((x + Math.cos(a) * 16) / 3) * 3, Math.round((y - h + 6 - lift + Math.sin(a) * 5) / 3) * 3, 6, 3); }
    if (e.fl & Flag.Poison) {
      // envenenado: burbujas tóxicas que suben, gotas que caen y una calavera de vapor de vez en cuando
      if (Math.random() < 0.45) this.particles.push({ x: x + (Math.random() - 0.5) * 22, y: y - 16 - Math.random() * 40, vx: (Math.random() - 0.5) * 8, vy: -26, life: 0.7, max: 0.7, color: ['#a0ff40', '#60c020', '#d0ff90'][Math.floor(Math.random() * 3)], size: Math.random() < 0.3 ? 6 : 3, grav: -10 });
      if (Math.random() < 0.15) this.particles.push({ x: x + (Math.random() - 0.5) * 14, y: y - 30, vx: 0, vy: 10, life: 0.5, max: 0.5, color: '#4a9a20', size: 3, grav: 500 });
      if (Math.random() < 0.02) this.effects.toxicSkull(x, y - 70);
    }
    if (e.fl & Flag.Bleed && Math.random() < 0.3) this.particles.push({ x: x + (Math.random() - 0.5) * 20, y: y - 20 - Math.random() * 40, vx: 0, vy: 0, life: 0.5, max: 0.5, color: '#c01020', size: 3, grav: 300 });
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
    // almas que orbitan a la Parca (una por alma, hasta 12)
    if (isMonster && e.c === 'reaper' && e.o && !invis) {
      const n = Math.min(12, e.o);
      for (let i = 0; i < n; i++) {
        const a = now / 600 + (i / n) * Math.PI * 2;
        const sx = Math.round((x + Math.cos(a) * 26) / PIXEL) * PIXEL, sy = Math.round((y - 44 - lift + Math.sin(a) * 10 + Math.sin(now / 200 + i) * 3) / PIXEL) * PIXEL;
        ctx.globalAlpha = Math.sin(a) > 0 ? 0.95 : 0.5;
        ctx.fillStyle = '#60ffd0'; ctx.fillRect(sx, sy, PIXEL * 2, PIXEL * 2);
        ctx.fillStyle = '#e0fff8'; ctx.fillRect(sx, sy, PIXEL, PIXEL);
        ctx.fillStyle = '#2a8a70'; ctx.fillRect(sx + PIXEL, sy + PIXEL * 2, PIXEL, PIXEL);
      }
      ctx.globalAlpha = 1;
    }

    // ---- delante del personaje
    if (ult && e.c === 'alien') {
      const ufo = getItem('ufo');
      const w2 = ufo.base.width * PIXEL, h2 = ufo.base.height * PIXEL;
      for (let i = 0; i < BAL.alien.ult.ufos; i++) {
        const a = now / 900 + (i / BAL.alien.ult.ufos) * Math.PI * 2;
        const ux = x + Math.cos(a) * 130, uy = y - 150 + Math.sin(a) * 40;
        ctx.drawImage(ufo.base, ux - w2 / 2, uy - h2 / 2, w2, h2);
        if (ufo.glow) glows.push({ img: ufo.glow, x: ux - w2 / 2, y: uy - h2 / 2, w: w2, h: h2, flip: false, a: 1 });
      }
    }
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

  /** Barco fantasma del Capitán Ahogado (nivel 5, sobre el agua). */
  private drawGhostShip(ctx: CanvasRenderingContext2D, x: number, y: number, f: 1 | -1, now: number, glows: { img: HTMLCanvasElement; x: number; y: number; w: number; h: number; flip: boolean; a: number }[]) {
    const s = (v: number) => Math.round(v / 3) * 3;
    const bob = Math.sin(now / 400) * 3;
    ctx.globalAlpha = 0.82;
    // casco
    for (let i = 0; i < 6; i++) { const w = 96 - i * 10; ctx.fillStyle = i < 2 ? '#2a3a48' : '#1e2a36'; ctx.fillRect(s(x - w / 2), s(y - 6 + i * 3 + bob), s(w), 3); }
    ctx.fillStyle = '#4a6a7a'; ctx.fillRect(s(x - 48), s(y - 9 + bob), 96, 3); // borda
    ctx.fillStyle = '#80c0c0'; for (let i = -3; i <= 3; i++) ctx.fillRect(s(x + i * 12), s(y - 3 + bob), 3, 3); // portillas
    // mástil y vela hecha jirones
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(s(x - f * 20), s(y - 96 + bob), 3, 90);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#c8e0e0';
    for (let j = 0; j < 8; j++) { const w = 30 - Math.abs(j - 4) * 3 + Math.round(Math.sin(now / 300 + j) * 2) * 3; ctx.fillRect(s(x - f * 20 - (f > 0 ? w : 0) + 3 * (f > 0 ? 0 : 1)), s(y - 90 + j * 9 + bob), s(w), 9); }
    ctx.globalAlpha = 1;
    if (Math.random() < 0.3) this.particles.push({ x: x + (Math.random() - 0.5) * 90, y: y + 2, vx: -f * 30, vy: -10, life: 0.6, max: 0.6, color: '#a0fff0', size: 3, grav: 0 });
    void glows;
  }

  /** Llamas pixeladas sobre un árbol que arde. */
  private drawTreeFlames(ctx: CanvasRenderingContext2D, o: Obstacle, oy: number, now: number) {
    const top = o.y + oy, n = Math.max(4, Math.round(o.w / 9));
    for (let i = 0; i < n; i++) {
      const fx = o.x + ((i + 0.5) / n) * o.w + Math.sin(now / 150 + i) * 3;
      const fy = top + o.h * 0.25 + ((i * 37) % 10) * (o.h * 0.06) - oy * 0.4;
      const h = 12 + ((Math.floor(now / 90) + i * 3) % 4) * 5;
      ctx.fillStyle = '#c02010'; ctx.fillRect(Math.round(fx / 3) * 3, Math.round((fy - h) / 3) * 3, 6, h);
      ctx.fillStyle = '#ff8020'; ctx.fillRect(Math.round(fx / 3) * 3, Math.round((fy - h + 6) / 3) * 3, 3, h - 6);
      ctx.fillStyle = '#ffe060'; ctx.fillRect(Math.round(fx / 3) * 3, Math.round((fy - 6) / 3) * 3, 3, 3);
    }
    if (Math.random() < 0.5) this.particles.push({ x: o.x + Math.random() * o.w, y: top + Math.random() * o.h * 0.4, vx: (Math.random() - 0.5) * 20, vy: -60 - Math.random() * 40, life: 0.9, max: 0.9, color: Math.random() < 0.5 ? '#ff9020' : '#ffd060', size: 3, grav: -20 });
    if (Math.random() < 0.15) this.particles.push({ x: o.x + Math.random() * o.w, y: top, vx: 0, vy: -30, life: 1.6, max: 1.6, color: '#3a3430', size: 6, grav: -10 }); // humo
  }

  private blitFrame(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, flip: boolean, scale: number, alpha: number) {
    const w = SW * PIXEL * scale, h = SH * PIXEL * scale;
    const dx = x - w / 2, dy = y - h + 9 * scale;
    ctx.globalAlpha = alpha;
    if (flip) { ctx.save(); ctx.translate(x * 2, 0); ctx.scale(-1, 1); ctx.drawImage(img, dx, dy, w, h); ctx.restore(); }
    else ctx.drawImage(img, dx, dy, w, h);
    ctx.globalAlpha = 1;
  }

  /** Objeto del escenario falso (Acecho de Pesadilla): idéntico a los del mapa. */
  private drawProp(ctx: CanvasRenderingContext2D, type: string, x: number, y: number, alpha: number, glows: { img: HTMLCanvasElement; x: number; y: number; w: number; h: number; flip: boolean; a: number }[]) {
    const [w, h] = PROP_SIZE[type] ?? [40, 40];
    let a = PROP_ART.get(type);
    if (!a) { a = renderObstacle({ x: 0, y: 0, w, h, type: type as Obstacle['type'], v: 0 }, this.theme); PROP_ART.set(type, a); }
    const ox = x - w / 2, oy = y - h;
    const W = a.base.width * PIXEL, H = a.base.height * PIXEL;
    ctx.globalAlpha = alpha;
    ctx.drawImage(a.base, ox + a.ox, oy + a.oy, W, H);
    ctx.globalAlpha = 1;
    if (a.glow) glows.push({ img: a.glow, x: ox + a.ox, y: oy + a.oy, w: W, h: H, flip: false, a: alpha });
  }

  /** Zombi esbirro: sprite de humano zombificado + aro del color de su dueño. */
  private drawMinion(ctx: CanvasRenderingContext2D, e: CEnt, now: number, glows: { img: HTMLCanvasElement; x: number; y: number; w: number; h: number; flip: boolean; a: number }[]) {
    const x = e.rx, y = e.ry;
    const variant = e.c;
    if (variant === 'militia') {
      // humano armado por la Cazadora: su aspecto de siempre con antorcha, horca o arco y aro dorado
      const fr = getFrame('npc', e.s ?? 'villager#torch', '', e.a, this.frameFor(e, now), e.l ?? e.id);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(x + 2, y + 3, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = e.o === this.youId ? 'rgba(255,208,96,0.8)' : 'rgba(255,170,90,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y + 2, 17, 5, 0, 0, Math.PI * 2); ctx.stroke();
      this.blitFrame(ctx, fr.base, x, y, e.f === -1, 1, 1);
      if (now - e.flash < 90) { ctx.globalCompositeOperation = 'lighter'; this.blitFrame(ctx, fr.base, x, y, e.f === -1, 1, 0.7); ctx.globalCompositeOperation = 'source-over'; }
      if (fr.glow) glows.push({ img: fr.glow, x: x - (SW * PIXEL) / 2, y: y - SH * PIXEL + 9, w: SW * PIXEL, h: SH * PIXEL, flip: e.f === -1, a: 1 });
      return;
    }
    if (variant === 'skel' || variant === 'skelarcher' || variant === 'skeldog') {
      // esqueletos del Nigromante
      const sk = getSkeleton(variant, e.a, this.frameFor(e, now), '#80ff60');
      const big = e.l === 1 ? BAL.necro.bigT3.scale : 1; // nv. 15: un 30 % más grandes
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      const sc = (variant === 'skeldog' ? 0.9 : 0.95) * big;
      ctx.beginPath(); ctx.ellipse(x, y + 2, 14 * big, 5 * big, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = e.o === this.youId ? 'rgba(128,255,96,0.7)' : 'rgba(255,110,70,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y + 2, 16 * big, 5 * big, 0, 0, Math.PI * 2); ctx.stroke();
      this.blitFrame(ctx, sk.base, x, y, e.f === -1, sc, 1);
      if (now - e.flash < 90) { ctx.globalCompositeOperation = 'lighter'; this.blitFrame(ctx, sk.base, x, y, e.f === -1, sc, 0.7); ctx.globalCompositeOperation = 'source-over'; }
      if (sk.glow) glows.push({ img: sk.glow, x: x - (SW * PIXEL * sc) / 2, y: y - SH * PIXEL * sc + 9 * sc, w: SW * PIXEL * sc, h: SH * PIXEL * sc, flip: e.f === -1, a: 1 });
      return;
    }
    if (variant === 'unit' || variant === 'unitfree') {
      // Unidades: copias del enjambre (las independientes, con antena luminosa)
      const sk = (e.s ?? 'unit:classic').split(':')[1] || 'classic';
      const fr = getFrame('monster', 'unit', sk, e.a, this.frameFor(e, now), 0, 0);
      const mine = e.o === this.youId;
      const boom = !!(e.fl & Flag.Swollen);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(x + 2, y + 3, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = variant === 'unitfree' ? 'rgba(64,224,255,0.75)' : mine ? 'rgba(255,64,192,0.7)' : 'rgba(255,110,70,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y + 2, 17, 5, 0, 0, Math.PI * 2); ctx.stroke();
      this.blitFrame(ctx, fr.base, x, y, e.f === -1, 0.88, 1);
      if (boom ? Math.floor(now / 90) % 2 : now - e.flash < 90) { ctx.globalCompositeOperation = 'lighter'; this.blitFrame(ctx, fr.base, x, y, e.f === -1, 0.88, boom ? 0.9 : 0.7); ctx.globalCompositeOperation = 'source-over'; }
      if (fr.glow) glows.push({ img: fr.glow, x: x - (SW * PIXEL * 0.88) / 2, y: y - SH * PIXEL * 0.88 + 9 * 0.88, w: SW * PIXEL * 0.88, h: SH * PIXEL * 0.88, flip: e.f === -1, a: 0.9 });
      if (variant === 'unitfree') { ctx.fillStyle = '#40e0ff'; ctx.fillRect(Math.round(x / PIXEL) * PIXEL, Math.round((y - SH * PIXEL * 0.88 - 2) / PIXEL) * PIXEL, PIXEL, PIXEL * 3) }
      return;
    }
    if (variant === 'wall' || variant === 'turret' || variant === 'flower') {
      // plantas del Árbol maldito
      const pl = getPlant(variant, Math.floor(now / 400 + e.id) % 2, e.l === 1);
      const sc = variant === 'turret' && e.l === 1 ? 1.25 : variant === 'wall' ? 1.3 : 1;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(x, y + 2, 22 * sc, 7 * sc, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = e.o === this.youId ? 'rgba(160,224,64,0.7)' : 'rgba(255,110,70,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y + 2, 20 * sc, 7 * sc, 0, 0, Math.PI * 2); ctx.stroke();
      this.blitFrame(ctx, pl.base, x, y, e.f === -1, sc, 1);
      if (now - e.flash < 90) { ctx.globalCompositeOperation = 'lighter'; this.blitFrame(ctx, pl.base, x, y, e.f === -1, sc, 0.7); ctx.globalCompositeOperation = 'source-over'; }
      if (pl.glow) glows.push({ img: pl.glow, x: x - (SW * PIXEL * sc) / 2, y: y - SH * PIXEL * sc + 9 * sc, w: SW * PIXEL * sc, h: SH * PIXEL * sc, flip: e.f === -1, a: 0.9 });
      if (variant === 'flower' && Math.random() < 0.08) this.particles.push({ x: x + (Math.random() - 0.5) * 20, y: y - 40, vx: 0, vy: -20, life: 0.8, max: 0.8, color: '#a0ff80', size: 3, grav: 0 });
      return;
    }
    if (variant === 'beacon') {
      const bc = getBeacon(Math.floor(now / (e.l === 1 ? 400 : 140)) % 2);
      const w = bc.base.width * PIXEL, h = bc.base.height * PIXEL;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(bc.base, x - w / 2, y - h + 6, w, h);
      if (bc.glow) glows.push({ img: bc.glow, x: x - w / 2, y: y - h + 6, w, h, flip: false, a: 1 });
      if (e.o === this.youId) { ctx.globalAlpha = 0.25; pixelEllipse(ctx, x, y, BAL.alien.beacon.speedR, BAL.alien.beacon.speedR * 0.62, '#60ff90'); ctx.globalAlpha = 1; }
      return;
    }
    if (variant === 'slimelet') {
      // mitad del slime: él mismo, en pequeño
      const fr = getFrame('monster', 'slime', e.s ?? 'classic', e.a, this.frameFor(e, now), 0, 0);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
      this.blitFrame(ctx, fr.base, x, y, e.f === -1, 0.55, 0.92);
      if (now - e.flash < 90) { ctx.globalCompositeOperation = 'lighter'; this.blitFrame(ctx, fr.base, x, y, e.f === -1, 0.55, 0.6); ctx.globalCompositeOperation = 'source-over'; }
      return;
    }
    if (variant === 'spiderling') {
      const sp = getSpiderling(Math.floor(now / 90 + e.id) % 2);
      const w = sp.base.width * PIXEL, h = sp.base.height * PIXEL;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 10, 3, 0, 0, Math.PI * 2); ctx.fill();
      if (e.f === -1) { ctx.save(); ctx.translate(x * 2, 0); ctx.scale(-1, 1); }
      ctx.drawImage(sp.base, x - w / 2, y - h + 3, w, h);
      if (e.f === -1) ctx.restore();
      if (sp.glow) glows.push({ img: sp.glow, x: x - w / 2, y: y - h + 3, w, h, flip: e.f === -1, a: 1 });
      return;
    }
    if (variant === 'barrel') {
      const it = getItem('barrel');
      const w = it.base.width * PIXEL * 1.3, h = it.base.height * PIXEL * 1.3;
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
      const shake = Math.floor(now / 60) % 2 ? 1 : -1;
      ctx.drawImage(it.base, x - w / 2 + shake, y - h + 6, w, h);
      if (it.glow) glows.push({ img: it.glow, x: x - w / 2 + shake, y: y - h + 6, w, h, flip: false, a: 1 });
      if (Math.random() < 0.5) this.particles.push({ x: x + 3, y: y - h + 6, vx: (Math.random() - 0.5) * 30, vy: -40, life: 0.3, max: 0.3, color: '#ffd040', size: 3, grav: 0 });
      return;
    }
    if (variant === 'buccaneer') {
      // bucanero fantasma: la tripulación del capitán, translúcida y verdosa
      const fr = getFrame('monster', 'pirate', e.s ?? 'classic', e.a, this.frameFor(e, now), 0, 0);
      ctx.strokeStyle = e.o === this.youId ? 'rgba(160,255,240,0.7)' : 'rgba(255,110,70,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y + 2, 16, 5, 0, 0, Math.PI * 2); ctx.stroke();
      this.blitFrame(ctx, fr.base, x, y, e.f === -1, 0.88, 0.62);
      ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'hue-rotate(60deg) saturate(2)';
      this.blitFrame(ctx, fr.base, x, y, e.f === -1, 0.88, 0.2 + (now - e.flash < 90 ? 0.5 : 0));
      ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
      if (Math.random() < 0.15) this.particles.push({ x: x + (Math.random() - 0.5) * 20, y: y - Math.random() * 60, vx: 0, vy: -20, life: 0.5, max: 0.5, color: '#a0fff0', size: 3, grav: 0 });
      return;
    }
    if (variant === 'digger') {
      // el enterrador de la pala: humano con aro dorado
      const fr = getFrame('npc', 'gravedigger', '', e.a, this.frameFor(e, now), e.l ?? 0);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 3, 18, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = e.o === this.youId ? 'rgba(255,208,64,0.75)' : 'rgba(255,110,70,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y + 2, 18, 6, 0, 0, Math.PI * 2); ctx.stroke();
      this.blitFrame(ctx, fr.base, x, y, e.f === -1, 1, 1);
      if (now - e.flash < 90) { ctx.globalCompositeOperation = 'lighter'; this.blitFrame(ctx, fr.base, x, y, e.f === -1, 1, 0.7); ctx.globalCompositeOperation = 'source-over'; }
      return;
    }
    if (variant === 'thrall') {
      // humano enamorado de la súcubo: su aspecto de siempre, aro rosa y un corazón que late sobre la cabeza
      const fr = getFrame('npc', e.s ?? 'teen', '', e.a, this.frameFor(e, now), e.l ?? e.id);
      ctx.strokeStyle = e.o === this.youId ? 'rgba(255,90,150,0.8)' : 'rgba(255,110,140,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y + 2, 18, 6, 0, 0, Math.PI * 2); ctx.stroke();
      this.blitFrame(ctx, fr.base, x, y, e.f === -1, 1, 1);
      if (now - e.flash < 90) { ctx.globalCompositeOperation = 'lighter'; this.blitFrame(ctx, fr.base, x, y, e.f === -1, 1, 0.75); ctx.globalCompositeOperation = 'source-over'; }
      if (fr.glow) glows.push({ img: fr.glow, x: x - (SW * PIXEL) / 2, y: y - SH * PIXEL + 9, w: SW * PIXEL, h: SH * PIXEL, flip: e.f === -1, a: 0.8 });
      const beat = Math.floor(now / 300 + e.id) % 3 === 0 ? 1 : 0;
      const hx = Math.round(x / 3) * 3, hy = Math.round((y - SH * PIXEL - 4 + Math.sin(now / 200 + e.id) * 3) / 3) * 3;
      ctx.fillStyle = '#ff4a8a';
      ctx.fillRect(hx - 6 - beat * 3, hy, 6 + beat * 3, 3); ctx.fillRect(hx + 3, hy, 6 + beat * 3, 3);
      ctx.fillRect(hx - 6 - beat * 3, hy + 3, 15 + beat * 6, 3); ctx.fillRect(hx - 3 - beat * 3, hy + 6, 9 + beat * 6, 3); ctx.fillRect(hx, hy + 9, 3, 3);
      return;
    }
    if (variant === 'clone') {
      // copia de espejo: el monstruo de su dueño, rojizo y algo translúcido
      const [ch, sk] = (e.s ?? 'bloodymary:classic').split(':');
      const fr = getFrame('monster', ch, sk || 'classic', e.a, this.frameFor(e, now), 0, 2);
      const mine = e.o === this.youId;
      ctx.strokeStyle = mine ? 'rgba(255,90,110,0.7)' : 'rgba(255,110,70,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y + 2, 18, 6, 0, 0, Math.PI * 2); ctx.stroke();
      this.blitFrame(ctx, fr.base, x, y, e.f === -1, 1, 0.78);
      ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'sepia(1) saturate(6) hue-rotate(-40deg)';
      this.blitFrame(ctx, fr.base, x, y, e.f === -1, 1, 0.22 + Math.sin(now / 100 + e.id) * 0.08);
      ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
      if (Math.random() < 0.2) this.particles.push({ x: x + (Math.random() - 0.5) * 24, y: y - Math.random() * 70, vx: 0, vy: -20, life: 0.4, max: 0.4, color: Math.random() < 0.5 ? '#e8f0ff' : '#ff4060', size: 3, grav: 0 });
      return;
    }
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

  /** Vista subterránea de la Gusarena: arena oscura y ondas donde hay pisadas. */
  private drawUnderground(ctx: CanvasRenderingContext2D, W: number, H: number, z: number, camX: number, camY: number, now: number, me: { x: number; y: number }) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(24,16,8,0.93)';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(z, 0, 0, z, Math.round(-camX * z), Math.round(-camY * z));
    // grano de arena
    ctx.fillStyle = '#3a2a16';
    for (let i = 0; i < 160; i++) { const gx = camX + ((i * 97.3) % 1) * 0 + ((i * 7919) % 1000) / 1000 * (W / z), gy = camY + ((i * 104729) % 1000) / 1000 * (H / z); ctx.fillRect(Math.round(gx / PIXEL) * PIXEL, Math.round(gy / PIXEL) * PIXEL, PIXEL, PIXEL); }
    const R = (this.you?.tier ?? 0) >= 1 ? BAL.worm.sense.rT1 : BAL.worm.sense.r;
    ctx.globalAlpha = 0.35;
    pixelEllipse(ctx, me.x, me.y, R, R * 0.62, '#a8844a');
    for (const e of this.ents.values()) {
      if (e.id === this.youId || (e.k !== Kind.Player && e.k !== Kind.Npc && e.k !== Kind.Hunter && e.k !== Kind.Minion)) continue;
      if ((e.rx - me.x) ** 2 + ((e.ry - me.y) / 0.62) ** 2 > R * R) continue;
      if (e.a !== Anim.Walk) continue; // solo lo que se mueve hace vibrar la arena
      const big = e.k === Kind.Player || e.k === Kind.Hunter;
      for (let k = 0; k < 2; k++) {
        const t = (now / 700 + k * 0.5 + e.id * 0.13) % 1;
        ctx.globalAlpha = (1 - t) * 0.9;
        pixelEllipse(ctx, e.rx, e.ry, (big ? 10 : 7) + t * (big ? 34 : 22), ((big ? 10 : 7) + t * (big ? 34 : 22)) * 0.55, big ? '#ffd080' : '#e0b070', 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Llamas pixeladas sobre quien arde. */
  private drawFlames(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, now: number, seed: number) {
    const P = PIXEL;
    for (let i = 0; i < 5; i++) {
      const fx = Math.round((x - 15 + i * 7 + Math.sin(now / 90 + i * 1.7 + seed) * 2) / P) * P;
      const base = Math.round((y - 6 - ((i * 13 + seed) % 4) * P - (i % 2 ? h * 0.25 : 0)) / P) * P;
      const fh = (3 + ((Math.floor(now / 70) + i + seed) % 3)) * P;
      ctx.fillStyle = '#c02010'; ctx.fillRect(fx - P, base - fh, P * 3, fh);
      ctx.fillStyle = '#ff7020'; ctx.fillRect(fx - P, base - fh + P, P * 2, fh - P);
      ctx.fillStyle = '#ffd040'; ctx.fillRect(fx, base - fh + P * 2, P, Math.max(P, fh - P * 3));
      ctx.fillStyle = '#ff9030'; ctx.fillRect(fx, base - fh - P, P, P);
    }
    if (Math.random() < 0.5) this.particles.push({ x: x + (Math.random() - 0.5) * 24, y: y - 10 - Math.random() * h * 0.6, vx: 0, vy: -80, life: 0.4, max: 0.4, color: Math.random() < 0.5 ? '#ff6020' : '#ffd040', size: 3, grav: 0 });
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
      if (e.id === this.youId || e.k === Kind.PowerUp || e.k === Kind.Projectile || e.k === Kind.Zone || e.k === Kind.Prop) continue;
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

  /** ¿Está este punto bajo alguna luz del mapa? (Candle Man apagado solo se ve ahí) */
  private litAt(x: number, y: number) {
    const outs = [...this.ents.values()].filter((z) => z.k === Kind.Zone && z.c === 'lightsout' && z.o !== this.youId);
    if (outs.some((z) => (x - z.rx) ** 2 + (y - z.ry) ** 2 < (z.rr ?? 500) ** 2)) return false; // apagón: aquí no hay luz
    for (const l of this.lights) if ((x - l.x) ** 2 + (y - l.y) ** 2 < (l.r * 0.55) ** 2) return true;
    for (const z of this.ents.values()) if (z.k === Kind.Zone && (z.c === 'fire' || z.c === 'waxfire') && (x - z.rx) ** 2 + (y - z.ry) ** 2 < ((z.rr ?? 40) * 1.5) ** 2) return true;
    return false;
  }

  /** Fieras: cocodrilo (al acecho solo asoman los ojos), raptor y tiranosaurio. */
  private drawBeast(ctx: CanvasRenderingContext2D, e: CEnt, now: number, glows: { img: HTMLCanvasElement; x: number; y: number; w: number; h: number; flip: boolean; a: number }[]) {
    const x = e.rx, y = e.ry;
    const lurk = e.c === 'croc' && e.o === 1;
    const state = lurk ? 'lurk' : e.a === Anim.Attack ? 'attack' : e.a === Anim.Cast && e.c === 'rex' ? 'cast' : e.a === Anim.Walk ? 'walk' : 'idle';
    const fr = Math.floor(now / (state === 'walk' ? (e.c === 'raptor' ? 75 : 150) : 300)) + e.id;
    const img = getBeast(e.c, state, fr);
    const w = img.base.width * PIXEL, h = img.base.height * PIXEL;
    const flip = e.f === -1;
    let dx = x - w / 2, dy: number;
    if (lurk) {
      // ondas en el agua alrededor de los ojos
      const k = (now / 1400 + e.id * 0.3) % 1;
      ctx.globalAlpha = 0.5 * (1 - k);
      pixelEllipse(ctx, x + (flip ? -18 : 18), y + 2, 14 + k * 26, 5 + k * 9, '#a0d0e0');
      ctx.globalAlpha = 1;
      dy = y - h + 6;
    } else {
      const deep = this.grid.deepWater(x, y);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(x + 3, y + 3, w * 0.36, Math.max(7, h * 0.08), 0, 0, Math.PI * 2); ctx.fill();
      dy = y - h + (e.c === 'croc' ? (deep ? 24 : 12) : e.c === 'rex' ? 10 : 9);
      if (e.c === 'rex' && state === 'walk' && Math.random() < 0.15) this.effects.particles.push({ x: x + (Math.random() - 0.5) * 60, y: y + 2, vx: (Math.random() - 0.5) * 60, vy: -30, life: 0.5, max: 0.5, color: '#5a4a30', size: PIXEL, grav: 120 });
    }
    dx = Math.round(dx / PIXEL) * PIXEL; dy = Math.round(dy / PIXEL) * PIXEL;
    const blit = (im: HTMLCanvasElement) => {
      if (flip) { ctx.save(); ctx.translate(x * 2, 0); ctx.scale(-1, 1); ctx.drawImage(im, dx, dy, w, h); ctx.restore(); }
      else ctx.drawImage(im, dx, dy, w, h);
    };
    blit(img.base);
    if (now - e.flash < 90) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; blit(img.base); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    if (img.glow) glows.push({ img: img.glow, x: dx, y: dy, w, h, flip, a: 1 });
    // el cocodrilo nadando: agua que le cubre las patas
    if (!lurk && e.c === 'croc' && this.grid.deepWater(x, y)) { ctx.globalAlpha = 0.55; ctx.fillStyle = '#0e2236'; ctx.fillRect(dx, y - 10, w, 14); ctx.globalAlpha = 1; }
  }

  /** Gusarena: al reptar, el cuerpo asoma en jorobas de arena por donde acaba de pasar. */
  private wormPaths = new Map<number, { x: number; y: number }[]>();
  private drawWormTrail(ctx: CanvasRenderingContext2D, e: CEnt, now: number) {
    let path = this.wormPaths.get(e.id);
    if (!path) { path = [{ x: e.rx, y: e.ry }]; this.wormPaths.set(e.id, path); }
    const last = path[path.length - 1];
    if (Math.hypot(e.rx - last.x, e.ry - last.y) > 18) { path.push({ x: e.rx, y: e.ry }); if (path.length > 7) path.shift(); }
    else if (e.a !== Anim.Walk && path.length > 1 && Math.floor(now / 250) % 2 && Math.random() < 0.1) path.shift(); // quieto: las jorobas se hunden
    const pal = getSkin('worm', e.s ?? 'classic').palette;
    const ring = shade(pal.skin, -0.32), top = shade(pal.skin, 0.18);
    const P = PIXEL;
    for (let i = 0; i < path.length - 1; i++) {
      const age = path.length - 1 - i;
      if (age < 2 || age % 2) continue;
      const pt = path[i], k = Math.max(0.35, 1 - age / 8);
      const cx = Math.round(pt.x / P) * P, gy = Math.round(pt.y / P) * P;
      const rw = Math.round(8 * k + 3), rh = Math.round(7 * k + 2);
      // arena removida alrededor
      for (let j = 0; j < 3; j++) { const hw = rw + 3 - j; ctx.fillStyle = j === 1 ? '#c8a060' : '#a8844a'; ctx.fillRect(cx - hw * P, gy - j * P, hw * 2 * P, P); }
      // arco del cuerpo anillado
      for (let c = -rw; c <= rw; c++) {
        const hgt = Math.round(Math.sqrt(Math.max(0, 1 - (c / (rw + 0.5)) ** 2)) * rh);
        for (let t = 0; t < 3; t++) {
          const yy = hgt - t; if (yy < 1) continue;
          ctx.fillStyle = t === 0 ? top : (c + Math.floor(now / 120)) % 3 === 0 ? ring : pal.skin;
          ctx.fillRect(cx + c * P, gy - P - yy * P, P, P);
        }
      }
      if (e.a === Anim.Walk && Math.random() < 0.15) this.effects.particles.push({ x: cx + (Math.random() - 0.5) * rw * P * 2, y: gy - 2, vx: (Math.random() - 0.5) * 50, vy: -50, life: 0.4, max: 0.4, color: Math.random() < 0.5 ? '#c8a060' : '#7a5e34', size: P, grav: 260 });
    }
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, e: CEnt, now: number, glows: { img: HTMLCanvasElement; x: number; y: number; w: number; h: number; flip: boolean; a: number }[]) {
    if ((e.c === 'hook' || e.c === 'tongue') && e.o !== undefined) {
      const ow = this.ents.get(e.o);
      if (ow) {
        const n = Math.ceil(Math.hypot(e.rx - ow.rx, e.ry - ow.ry) / 3);
        const oy = e.c === 'tongue' ? 52 : 40;
        for (let i = 0; i < n; i++) {
          const t = i / n, wob = e.c === 'tongue' ? Math.sin(t * 9 + now / 40) * 3 * (1 - t) : 0;
          const px = Math.round((ow.rx + (e.rx - ow.rx) * t) / 3) * 3, py = Math.round((ow.ry - oy + (e.ry - 40 - ow.ry + oy) * t + wob) / 3) * 3;
          ctx.fillStyle = e.c === 'tongue' ? '#c03050' : '#8a8a94'; ctx.fillRect(px, py, 3, e.c === 'tongue' ? 6 : 3);
          if (e.c === 'tongue') { ctx.fillStyle = '#ff7090'; ctx.fillRect(px, py, 3, 3); }
        }
      }
    }
    if (e.c === 'firewave') {
      // onda de fuego: arco de llamas que avanza
      const a = e.r ?? 0, nx = -Math.sin(a), ny = Math.cos(a);
      for (let i = -5; i <= 5; i++) {
        const px = e.rx + nx * i * 6 - Math.cos(a) * Math.abs(i) * 2, py = e.ry - 20 + ny * i * 4;
        const h = 12 + ((Math.floor(now / 70) + i) % 3) * 4;
        ctx.fillStyle = '#c02010'; ctx.fillRect(Math.round(px / 3) * 3, Math.round((py - h) / 3) * 3, 6, h);
        ctx.fillStyle = '#ffb030'; ctx.fillRect(Math.round(px / 3) * 3, Math.round((py - h + 6) / 3) * 3, 3, h - 6);
      }
      if (Math.random() < 0.6) this.particles.push({ x: e.rx, y: e.ry - 30, vx: 0, vy: -40, life: 0.4, max: 0.4, color: '#ffd040', size: 3, grav: 0 });
      return;
    }
    if (e.c === 'crows' || e.c === 'crowsback') {
      // bandada de cuervos
      for (let i = 0; i < 7; i++) {
        const img = getItem(`crow${Math.floor(now / 80 + i) % 2}`);
        const ox = Math.cos(i * 2.4 + now / 300) * 18, oy = Math.sin(i * 1.7 + now / 250) * 12;
        const w = img.base.width * PIXEL, h = img.base.height * PIXEL;
        ctx.drawImage(img.base, e.rx + ox - w / 2, e.ry - 40 + oy - h / 2, w, h);
        if (img.glow) glows.push({ img: img.glow, x: e.rx + ox - w / 2, y: e.ry - 40 + oy - h / 2, w, h, flip: false, a: 1 });
      }
      if (Math.random() < 0.3) this.particles.push({ x: e.rx, y: e.ry - 40, vx: 0, vy: 20, life: 0.6, max: 0.6, color: '#141018', size: 3, grav: 60 });
      return;
    }
    if (e.c === 'sandstorm') { this.effects.drawStorm(ctx, e.rx, e.ry, e.r ?? 0, now); return; }
    if (e.c === 'twister') { this.effects.drawTwister(ctx, e.rx, e.ry, now); return; }
    if (e.c === 'wave') { this.effects.drawWave(ctx, e.rx, e.ry, e.r ?? 0, now); return; }
    const big = e.c.startsWith('bigpotion');
    const spin = e.c === 'egg' || e.c === 'waxglob' || e.c === 'fireball' || e.c === 'ember' || e.c === 'bandage' || e.c === 'holy' || e.c === 'boulder' || e.c.includes('potion') || e.c.startsWith('obj');
    const id = e.c === 'bat' ? `bat${Math.floor(now / 90) % 2}` : e.c === 'scarab' ? `scarab${Math.floor(now / 60) % 2}`
      : e.c === 'boulder' ? `boulder${({ elm: 0, transylvania: 1, camp: 2, swamp: 2, nile: 0, jungle: 2 } as Record<string, number>)[this.theme] ?? 0}` : big ? e.c.slice(3) : e.c;
    const img = getItem(id);
    const sc = big ? 1.8 : e.c === 'boulder' ? 1.4 : e.c === 'bigsilver' ? 1.5 : e.c === 'zapball' ? 1.2 : 1;
    if (e.c === 'zapball') {
      // chispas eléctricas que saltan alrededor de la bola
      ctx.fillStyle = Math.random() < 0.5 ? '#ffffff' : '#80d8ff';
      for (let i = 0; i < 3; i++) { const a = Math.random() * Math.PI * 2, r0 = 10 + Math.random() * 10; ctx.fillRect(Math.round((e.rx + Math.cos(a) * r0) / PIXEL) * PIXEL, Math.round((e.ry - 40 + Math.sin(a) * r0) / PIXEL) * PIXEL, PIXEL, PIXEL); }
    }
    if (e.c === 'rocket' && Math.random() < 0.9) this.particles.push({ x: e.rx - Math.cos(e.r ?? 0) * 16, y: e.ry - 40 - Math.sin(e.r ?? 0) * 16, vx: (Math.random() - 0.5) * 30, vy: -20, life: 0.5, max: 0.5, color: Math.random() < 0.3 ? '#ff8020' : '#6a6a70', size: PIXEL * 2, grav: -20 });
    const w = img.base.width * PIXEL * sc, h = img.base.height * PIXEL * sc;
    const py = e.ry - 40; // a la altura de las manos (también los escarabajos de Ramsés)
    ctx.save();
    ctx.translate(e.rx, py);
    if (e.c === 'bat') { if ((e.r ?? 0) > Math.PI / 2 || (e.r ?? 0) < -Math.PI / 2) ctx.scale(-1, 1); }
    else ctx.rotate(spin ? Math.floor(now / 90) * (Math.PI / 2) : e.c === 'heart' || e.c === 'wbubble' || e.c === 'orb' || e.c === 'eye' ? 0 : Math.round((e.r ?? 0) / (Math.PI / 4)) * (Math.PI / 4)); // giros en pasos (sin rotación suave)
    ctx.drawImage(img.base, -w / 2, -h / 2, w, h);
    ctx.restore();
    if (e.c === 'silver' || e.c === 'bigsilver') glows.push({ img: img.base, x: e.rx - w / 2, y: py - h / 2, w, h, flip: false, a: 0.55 }); // la plata brilla
    if (img.glow && e.c !== 'bolt') glows.push({ img: img.glow, x: e.rx - w / 2, y: py - h / 2, w, h, flip: false, a: 1 });
    if (Math.random() < 0.5) this.particles.push({ x: e.rx, y: py, vx: 0, vy: 0, life: 0.25, max: 0.25, color: e.c === 'bullet' ? '#ffd060' : e.c === 'candleflame' ? '#ffa020' : e.c === 'waxglob' ? '#ece2c8' : e.c === 'zapball' ? '#a0e8ff' : e.c === 'silver' || e.c === 'bigsilver' ? '#f0f4ff' : e.c === 'rocket' ? '#ffb040' : e.c === 'egg' ? '#e8e0c8' : e.c === 'wbubble' ? '#a0d8f8' : e.c === 'orb' ? '#80ff60' : e.c === 'eye' ? '#ff40c0' : e.c === 'bonearrow' ? '#d8d0c0' : e.c === 'noise' ? '#e8f0f0' : e.c === 'plasma' ? '#60ff90' : e.c === 'bubble' ? '#a0ff70' : e.c === 'fireball' || e.c === 'ember' ? '#ff8020' : e.c === 'web' ? '#e8e8f0' : e.c === 'skull' ? '#a050ff' : e.c === 'cannon' ? '#606068' : e.c === 'hook' ? '#c0c0c8' : e.c === 'thorn' ? '#a0e040' : e.c === 'heart' ? '#ff80b0' : e.c.startsWith('obj') ? '#c0e8ff' : e.c === 'bolt' ? '#c0c0d0' : e.c === 'bat' ? '#402050' : e.c === 'holy' ? '#a0d8ff' : e.c.includes('potion0') ? '#ff8020' : e.c.includes('potion1') ? '#a0ff40' : e.c.includes('potion2') ? '#ff4020' : e.c === 'nailback' ? '#c8e8ff' : '#d8b870', size: 3, grav: 0 });
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
    if (e.k === Kind.PowerUp || e.k === Kind.Projectile || e.k === Kind.Zone || e.k === Kind.Prop) return;
    if (e.fl & Flag.Invisible && e.id !== this.youId) return;
    if (e.fl & Flag.Submerged && e.id !== this.youId) return;
    if (e.f2 & Flag2.Dim && e.id !== this.youId && !this.litAt(e.rx, e.ry)) return;
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
      if (e.c === 'croc' && e.o === 1) return; // cocodrilo al acecho: no se ve
      const ty = top - (e.c === 'heraldo' ? 28 : e.c === 'rex' ? 54 : 0) + (e.c === 'croc' ? 44 : 0);
      ctx.font = '9px "Press Start 2P", monospace';
      ctx.fillStyle = '#000'; ctx.fillText(thunter(e.c), x + 1, ty - 1);
      ctx.fillStyle = info.color; ctx.fillText(thunter(e.c), x, ty - 2);
      if (e.h !== undefined) this.bar(ctx, x, ty + 2, e.c === 'heraldo' ? 60 : 40, e.h, info.color);
      if (e.fl & Flag.Ritual) { ctx.font = '8px "Press Start 2P", monospace'; ctx.fillStyle = '#ff4060'; ctx.fillText(tr('ritual'), x, ty - 14 + (Math.floor(now / 200) % 2) * 2); }
    } else if (e.k === Kind.Minion) {
      if (e.h !== undefined && e.h < 100) this.bar(ctx, x, top + 8, 26, e.h, e.o === this.youId ? '#80ff60' : '#c06040');
    } else if (e.h !== undefined) {
      this.bar(ctx, x, top + 8, 30, e.h, '#e0e0e0');
    }
    // somnolencia (barra violeta) y sueño
    if (e.z && !(e.fl & Flag.Asleep)) this.bar(ctx, x, top + (e.k === Kind.Player ? 5 : 14), 30, e.z, '#a070ff');
    if (e.hy && !(e.f2 & Flag2.Hypnotized)) this.bar(ctx, x, top + (e.k === Kind.Player ? 9 : 18), 30, e.hy, '#40ff90');
    if (e.wx) this.bar(ctx, x, top + (e.k === Kind.Player ? 13 : 22), 30, e.wx, '#f0e0b0'); // encerado
    if (e.f2 & Flag2.Hypnotized) { ctx.font = '14px serif'; ctx.fillText('🌀', x, top - 26 + Math.sin(now / 120) * 2); }
    if (e.fl & Flag.Asleep) {
      ctx.font = '12px "Press Start 2P", monospace';
      for (let i = 0; i < 3; i++) {
        const t = (now / 1400 + i / 3) % 1;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = '#c0a8ff';
        ctx.fillText(i % 2 ? 'z' : 'Z', x + 10 + t * 18 + i * 3, top - 4 - t * 26);
      }
      ctx.globalAlpha = 1;
    }
    // iconos de estado
    let iy = top - (e.k === Kind.Player ? 34 : 14);
    if (e.fl & Flag.Raged) { ctx.font = '14px "Press Start 2P", monospace'; ctx.fillStyle = Math.floor(now / 120) % 2 ? '#ff3020' : '#ffa020'; ctx.fillText('!!', x, iy); iy -= 18; }
    if (e.f2 & Flag2.Silenced) { ctx.font = '14px serif'; ctx.fillText('🔇', x, iy); iy -= 18; }
    if (e.fl & Flag.Charmed) { ctx.font = '14px serif'; ctx.fillText('💗', x, iy + Math.sin(now / 150) * 3); iy -= 18; }
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
      const txt = e.a === Anim.Wave ? tr('wave') : (CHARACTERS[e.c as CharacterId] ? tc(e.c as CharacterId).taunt : undefined) ?? TAUNTS[e.c as CharacterId] ?? '¡Buu!';
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
      if (e.k === Kind.Hunter) { if (e.c === 'croc' && e.o === 1) continue; const big = e.c === 'heraldo' || e.c === 'rex'; c.fillStyle = (HUNTER_LABEL[e.c] ?? HUNTER_LABEL.cazador).color; c.fillRect(e.rx * s - (big ? 3 : 2), e.ry * s - (big ? 3 : 2), big ? 6 : 4, big ? 6 : 4); }
      else if (e.k === Kind.Player && e.id !== this.youId) { c.fillStyle = '#ff3050'; c.fillRect(e.rx * s - 2, e.ry * s - 2, 4, 4); }
      else if (e.k === Kind.Minion && e.o === this.youId) { c.fillStyle = '#80ff60'; c.fillRect(e.rx * s - 1, e.ry * s - 1, 2, 2); }
    }
    const me = this.renderPos();
    c.fillStyle = '#ffe080'; c.fillRect(me.x * s - 3, me.y * s - 3, 6, 6);
    c.strokeStyle = 'rgba(255,255,255,0.3)';
    c.strokeRect((this.cam.x - this.canvas.width / 2 / this.cam.zoom) * s, (this.cam.y - (this.canvas.height * this.focusY) / this.cam.zoom) * s, (this.canvas.width / this.cam.zoom) * s, (this.canvas.height / this.cam.zoom) * s);
  }

  get lastSnap() { return this.lastSnapAt; }
}

/** Lo que no sangra al golpearlo: el Árbol maldito y sus plantas. */
const WOODY = new Set(['tree', 'wall', 'turret', 'flower', 'barrel', 'decoy']);
/** Esbirros que no dejan cadáver (fantasmas, bichos, cachivaches...). */
const NO_CORPSE = new Set(['barrel', 'buccaneer', 'spiderling', 'decoy', 'slimelet', 'beacon', 'skel', 'skelarcher', 'skeldog', 'unit', 'unitfree']);

const AURA: Record<CharacterId, string> = { vampire: '#ff3050', werewolf: '#c8e0ff', mummy: '#ffd860', invisible: '#c0e0ff', zombie: '#80ff60', kthula: '#40e0c0', nightmare: '#a070ff', mary: '#ff3040', reanimated: '#60c8ff', doppy: '#ffe060', witch: '#a0ff40', succubus: '#ff4a8a', poltergeist: '#a0e8ff', tree: '#a0e040', pirate: '#a0fff0', spider: '#ff2040', scarecrow: '#ffb020', demon: '#ff8020', slime: '#a0ff70', alien: '#60ff90', static: '#40ff90', kappa: '#a0d8f0', reaper: '#60ffd0', unit: '#ff40c0', necro: '#80ff60', worm: '#ffb060', dino: '#c0ff60', r800: '#ff3040', huntress: '#e0c060' , candle: '#ffb030' };

/** Tamaño (como obstáculo del mapa) de los objetos en los que se puede convertir Pesadilla. */
const PROP_SIZE: Record<string, [number, number]> = {
  tree: [52, 52], pine: [52, 52], deadtree: [52, 52], cypress: [56, 56], palm: [52, 52], jtree: [64, 64], obelisk: [26, 26], crate: [30, 26], tomb: [28, 34], lamp: [16, 16], statue: [40, 40], mailbox: [14, 14], rock: [46, 36], log: [80, 24], well: [44, 44],
};
const PROP_ART = new Map<string, Prerendered>();

const HUNTER_LABEL: Record<string, { name: string; color: string }> = {
  cazador: { name: 'CAZADOR', color: '#ff9070' },
  inquisidor: { name: 'INQUISIDOR', color: '#ff4040' },
  exorcista: { name: 'EXORCISTA', color: '#80c8ff' },
  sectario: { name: 'SECTARIO', color: '#c060ff' },
  heraldo: { name: 'HERALDO', color: '#fff0a0' },
  croc: { name: 'COCODRILO', color: '#a0c060' },
  raptor: { name: 'RAPTOR', color: '#e0a040' },
  rex: { name: 'T-REX', color: '#ff6030' },
};
/** Tamaño de cada forma del Dinozombie (raptor, tricerátops, pterodáctilo, huevo). */
const DINO_SCALE = [1.35, 1.55, 1.4, 1.25];

const TAUNTS: Record<CharacterId, string> = {
  vampire: '¡Bleh, bleh!',
  werewolf: '¡AUUUUU!',
  mummy: '¡Te envuelvo!',
  invisible: '¿Me buscabas?',
  zombie: '¡Cereeebros!',
  kthula: "Ph'nglui... ¡glub!",
  nightmare: 'Duérmete, niño...',
  mary: 'Di mi nombre 3 veces',
  reanimated: '¡ESTÁ VIVO!',
  doppy: '¿Quién es quién?',
  witch: '¡Jijijiji!',
  succubus: 'Mua ♥',
  poltergeist: '¡BUUU!',
  tree: '¡Yo soy... madera!',
  pirate: '¡Arrr, marinero!',
  spider: 'Ven a mi tela...',
  scarecrow: '¡Bu! ...¿Asustado?',
  demon: '¿Hace calor o soy yo?',
  slime: '*blub blub*',
  alien: 'Llévame con tu líder',
  static: 'No toque su televisor...',
  kappa: '¡Cuidado con mi cuenco!',
  reaper: 'Tu hora ha llegado...',
  unit: 'Somos uno. Únete.',
  necro: '¡Levantaos, huesos!',
  worm: '*ruge desde la arena*',
  dino: '¡RAAAWR... cerebros!',
  r800: 'Objetivo adquirido.',
  huntress: 'Yo también cazaba monstruos.',
  candle: 'Sopla, si te atreves.',
};

export const charName = (c: CharacterId) => CHARACTERS[c]?.name ?? c;
