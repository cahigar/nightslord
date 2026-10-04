// Una sala de juego: simulación autoritativa con su propio bucle de ticks.
// Los jugadores entran y salen en cualquier momento sin reiniciar la partida.
import {
  BTN_ATTACK, BTN_E, BTN_Q, HELSING_RADIUS, MAP_SIZE, MAX_PLAYERS_PER_ROOM, NPC_RADIUS, PLAYER_RADIUS,
  POWERUP_RADIUS, RANK_EVERY, RESPAWN_POINT_KEEP, SNAPSHOT_EVERY, SPAWN_PROTECTION, TICK_DT, TICK_RATE, VIEW_RADIUS,
} from '../shared/constants';
import { CHARACTERS, MAX_LEVEL, UPGRADES, xpForLevel, type CharacterDef, type CharacterId, type UpgradeId } from '../shared/characters';
import { generateMap, type GameMap, type MapThemeId } from '../shared/maps';
import { ObstacleGrid } from '../shared/physics';
import {
  Anim, Flag, Kind, type EntSnap, type GameEvent, type PowerUpType, type ProjectileType, type SfxId, type YouState,
} from '../shared/protocol';
import { store } from './store';
import type { Conn } from './types';

// ---------------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------------
interface Mob {
  id: number;
  kind: Kind;
  x: number;
  y: number;
  r: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  anim: Anim;
  animSeq: number;
  animUntil: number;
  moving: boolean;
  stunT: number;
  slowT: number;
  fearT: number;
  knock: { vx: number; vy: number; t: number } | null;
  dead: boolean;
}

interface Player extends Mob {
  kind: Kind.Player;
  conn: Conn;
  name: string;
  char: CharacterId;
  skin: string;
  def: CharacterDef;
  level: number;
  xp: number;
  totalXp: number;
  points: number;
  coinsEarned: number;
  ups: Record<UpgradeId, number>;
  upPts: number;
  cd: [number, number, number];
  cdMax: [number, number, number];
  input: { mx: number; my: number; a: number; b: number };
  queue: { q: number; mx: number; my: number; a: number; b: number }[];
  ack: number;
  // efectos
  speedT: number;
  furyT: number;
  howlT: number;
  shieldHp: number;
  shieldT: number;
  invisT: number;
  invisBonus: boolean;
  mistT: number;
  protectT: number;
  dash: { t: number; dx: number; dy: number; hit: Set<number> } | null;
  // estadísticas de la vida actual
  lifeStart: number;
  lifeKills: number;
  diedAt: number;
  waved: boolean;
  taunted: boolean;
  lastAttacker: string;
}

interface Npc extends Mob {
  kind: Kind.Npc;
  variant: string;
  tx: number;
  ty: number;
  thinkT: number;
  fleeing: boolean;
  screamCd: number;
}

interface Helsing extends Mob {
  kind: Kind.Helsing;
  target: number;
  thinkT: number;
  shootCd: number;
  meleeCd: number;
  tx: number;
  ty: number;
  strafe: number;
}

interface PowerUp { id: number; x: number; y: number; type: PowerUpType }

interface Projectile {
  id: number;
  type: ProjectileType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  owner: number; // id del jugador (o -1 helsing)
  dmg: number;
}

type Source = { player?: Player; helsing?: Helsing; name: string; kind: Kind };

const NPC_VARIANTS: Record<MapThemeId, string[]> = {
  elm: ['teen', 'neighbor', 'jock', 'nerd'],
  transylvania: ['villager', 'priest', 'maid', 'villager'],
  camp: ['camper', 'counselor', 'jock', 'nerd'],
};

const POWERUP_WEIGHTS: [PowerUpType, number][] = [
  ['blood', 30], ['xp', 25], ['coin', 18], ['speed', 10], ['fury', 9], ['shield', 8],
];

const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;
const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// ---------------------------------------------------------------------------
export class Room {
  readonly map: GameMap;
  readonly grid: ObstacleGrid;
  readonly seed: number;
  players = new Map<number, Player>(); // por conn.id
  npcs = new Map<number, Npc>();
  helsings = new Map<number, Helsing>();
  powerups = new Map<number, PowerUp>();
  projectiles = new Map<number, Projectile>();
  conns = new Map<number, Conn>();

  private nextId = 1;
  private tick = 0;
  time = 0;
  private events: { ev: GameEvent; x: number; y: number; global?: boolean }[] = [];
  private loop: NodeJS.Timeout;
  private helsingRespawnT = 0;
  private powerupRespawnT = 0;
  emptySince = Date.now();
  bountyId = -1;

  constructor(public code: string, public theme: MapThemeId, public priv: boolean, private onPlayerCountChange?: () => void) {
    this.seed = (Math.random() * 2 ** 31) >>> 0;
    this.map = generateMap(theme, this.seed);
    this.grid = new ObstacleGrid(this.map);
    for (let i = 0; i < 45; i++) this.spawnNpc();
    for (let i = 0; i < 4; i++) this.spawnHelsing();
    for (let i = 0; i < 28; i++) this.spawnPowerUp();
    let last = performance.now();
    let acc = 0;
    // Bucle con acumulador para mantener 20 Hz estables.
    this.loop = setInterval(() => {
      const now = performance.now();
      acc += (now - last) / 1000;
      last = now;
      let n = 0;
      while (acc >= TICK_DT && n < 4) {
        this.step();
        acc -= TICK_DT;
        n++;
      }
      if (n === 4) acc = 0;
    }, 1000 / TICK_RATE / 2);
  }

  get playerCount() { return this.conns.size; }
  get isFull() { return this.conns.size >= MAX_PLAYERS_PER_ROOM; }

  destroy() { clearInterval(this.loop); }

  // ------------------------------------------------------------------ conexión
  addConn(conn: Conn, char: CharacterId, skin: string) {
    this.conns.set(conn.id, conn);
    conn.roomCode = this.code;
    conn.profile.stats.games++;
    store.touch();
    const p = this.spawnPlayer(conn, char, skin);
    conn.send({ t: 'joined', code: this.code, theme: this.theme, seed: this.seed, priv: this.priv, you: p.id });
    this.sendRank();
    this.onPlayerCountChange?.();
  }

  removeConn(conn: Conn) {
    const p = this.players.get(conn.id);
    if (p) this.recordBest(p);
    this.players.delete(conn.id);
    this.conns.delete(conn.id);
    conn.roomCode = null;
    if (this.conns.size === 0) this.emptySince = Date.now();
    this.onPlayerCountChange?.();
  }

  respawn(conn: Conn, char: CharacterId, skin: string) {
    const old = this.players.get(conn.id);
    if (old && !old.dead) return;
    const p = this.spawnPlayer(conn, char, skin, old);
    conn.send({ t: 'joined', code: this.code, theme: this.theme, seed: this.seed, priv: this.priv, you: p.id });
  }

  private spawnPlayer(conn: Conn, char: CharacterId, skin: string, prev?: Player): Player {
    const def = CHARACTERS[char];
    const pos = this.findSpawn(400);
    const p: Player = {
      id: this.nextId++, kind: Kind.Player, x: pos.x, y: pos.y, r: PLAYER_RADIUS, facing: 1,
      hp: def.hp, maxHp: def.hp, anim: Anim.Idle, animSeq: 0, animUntil: 0, moving: false,
      stunT: 0, slowT: 0, fearT: 0, knock: null, dead: false,
      conn, name: conn.name, char, skin, def,
      level: 1, xp: 0, totalXp: 0,
      points: prev ? Math.floor(prev.points * RESPAWN_POINT_KEEP) : 0,
      coinsEarned: 0,
      ups: { vit: 0, str: 0, spd: 0, pow: 0 }, upPts: 0,
      cd: [0, 0, 0], cdMax: [def.attackCd, def.abilities[0].cooldown, def.abilities[1].cooldown],
      input: { mx: 0, my: 0, a: 0, b: 0 }, queue: [], ack: prev?.ack ?? 0,
      speedT: 0, furyT: 0, howlT: 0, shieldHp: 0, shieldT: 0, invisT: 0, invisBonus: false, mistT: 0,
      protectT: SPAWN_PROTECTION, dash: null,
      lifeStart: this.time, lifeKills: 0, diedAt: 0, waved: prev?.waved ?? false, taunted: prev?.taunted ?? false,
      lastAttacker: '',
    };
    this.players.set(conn.id, p);
    return p;
  }

  // ------------------------------------------------------------------ entradas
  onInput(conn: Conn, m: { q: number; mx: number; my: number; a: number; b: number }) {
    const p = this.players.get(conn.id);
    if (!p) return;
    const len = Math.hypot(m.mx, m.my);
    const mx = len > 1 ? m.mx / len : m.mx || 0;
    const my = len > 1 ? m.my / len : m.my || 0;
    p.queue.push({ q: m.q | 0, mx, my, a: +m.a || 0, b: m.b | 0 });
    if (p.queue.length > 6) p.queue.splice(0, p.queue.length - 3);
  }

  onEmote(conn: Conn, e: 'wave' | 'taunt') {
    const p = this.players.get(conn.id);
    if (!p || p.dead || this.time < p.animUntil) return;
    if (e === 'wave') { this.setAnim(p, Anim.Wave, 1.2); p.waved = true; this.sfx('wave', p.x, p.y); }
    else { this.setAnim(p, Anim.Taunt, 1.6); p.taunted = true; this.sfx('taunt', p.x, p.y); }
    if (p.waved && p.taunted) this.medal(p, 'social');
  }

  onUpgrade(conn: Conn, u: UpgradeId) {
    const p = this.players.get(conn.id);
    const def = UPGRADES.find((x) => x.id === u);
    if (!p || p.dead || !def || p.upPts <= 0 || p.ups[u] >= def.max) return;
    p.ups[u]++;
    p.upPts--;
    if (u === 'vit') {
      const old = p.maxHp;
      p.maxHp = this.calcMaxHp(p);
      p.hp += p.maxHp - old;
    }
    if (u === 'pow') {
      const m = 1 - 0.08 * p.ups.pow;
      p.cdMax = [p.def.attackCd, p.def.abilities[0].cooldown * m, p.def.abilities[1].cooldown * m];
    }
  }

  // ------------------------------------------------------------------ utilidades
  private setAnim(m: Mob, a: Anim, dur: number) {
    m.anim = a;
    m.animSeq = (m.animSeq + 1) % 1000;
    m.animUntil = this.time + dur;
  }

  private emit(ev: GameEvent, x: number, y: number, global = false) {
    this.events.push({ ev, x, y, global });
  }

  private sfx(s: SfxId, x: number, y: number) {
    this.emit({ e: 'sfx', s, x: Math.round(x), y: Math.round(y) }, x, y);
  }

  private findSpawn(minDist: number, r = PLAYER_RADIUS + 4): { x: number; y: number } {
    for (let i = 0; i < 40; i++) {
      const x = 150 + Math.random() * (MAP_SIZE - 300);
      const y = 150 + Math.random() * (MAP_SIZE - 300);
      if (this.grid.blocked(x, y, r)) continue;
      let ok = true;
      const md2 = minDist * minDist * (i < 30 ? 1 : 0.25);
      for (const p of this.players.values()) if (!p.dead && dist2(x, y, p.x, p.y) < md2) { ok = false; break; }
      if (ok) for (const h of this.helsings.values()) if (dist2(x, y, h.x, h.y) < md2) { ok = false; break; }
      if (ok) return { x, y };
    }
    for (;;) {
      const x = 150 + Math.random() * (MAP_SIZE - 300), y = 150 + Math.random() * (MAP_SIZE - 300);
      if (!this.grid.blocked(x, y, r)) return { x, y };
    }
  }

  private spawnNpc() {
    const pos = this.findSpawn(500, NPC_RADIUS + 2);
    const variants = NPC_VARIANTS[this.theme];
    const n: Npc = {
      id: this.nextId++, kind: Kind.Npc, x: pos.x, y: pos.y, r: NPC_RADIUS, facing: 1, hp: 30, maxHp: 30,
      anim: Anim.Idle, animSeq: 0, animUntil: 0, moving: false, stunT: 0, slowT: 0, fearT: 0, knock: null, dead: false,
      variant: variants[Math.floor(Math.random() * variants.length)], tx: pos.x, ty: pos.y, thinkT: 0, fleeing: false, screamCd: 0,
    };
    this.npcs.set(n.id, n);
  }

  private spawnHelsing() {
    const pos = this.findSpawn(700, HELSING_RADIUS + 2);
    const h: Helsing = {
      id: this.nextId++, kind: Kind.Helsing, x: pos.x, y: pos.y, r: HELSING_RADIUS, facing: 1, hp: 180, maxHp: 180,
      anim: Anim.Idle, animSeq: 0, animUntil: 0, moving: false, stunT: 0, slowT: 0, fearT: 0, knock: null, dead: false,
      target: -1, thinkT: 0, shootCd: 1, meleeCd: 0, tx: pos.x, ty: pos.y, strafe: Math.random() < 0.5 ? 1 : -1,
    };
    this.helsings.set(h.id, h);
  }

  private spawnPowerUp() {
    const pos = this.findSpawn(150, POWERUP_RADIUS + 6);
    let total = 0;
    for (const [, w] of POWERUP_WEIGHTS) total += w;
    let r = Math.random() * total;
    let type: PowerUpType = 'blood';
    for (const [t, w] of POWERUP_WEIGHTS) { if ((r -= w) <= 0) { type = t; break; } }
    const u: PowerUp = { id: this.nextId++, x: pos.x, y: pos.y, type };
    this.powerups.set(u.id, u);
  }

  private alivePlayers() {
    const out: Player[] = [];
    for (const p of this.players.values()) if (!p.dead) out.push(p);
    return out;
  }

  private calcMaxHp(p: Player) {
    return Math.round(p.def.hp * (1 + 0.15 * p.ups.vit) * (1 + 0.03 * (p.level - 1)));
  }

  private calcDamage(p: Player, mult = 1) {
    let d = p.def.damage * (1 + 0.12 * p.ups.str) * (1 + 0.025 * (p.level - 1)) * mult;
    if (p.furyT > 0) d *= 1.5;
    if (p.howlT > 0) d *= 1.3;
    return d;
  }

  private calcSpeed(p: Player) {
    if (p.stunT > 0) return 0;
    let s = p.def.speed * (1 + 0.05 * p.ups.spd);
    if (p.speedT > 0) s *= 1.4;
    if (p.howlT > 0) s *= 1.2;
    if (p.slowT > 0) s *= 0.5;
    return s;
  }

  // ------------------------------------------------------------------ bucle principal
  private step() {
    const dt = TICK_DT;
    this.time += dt;
    this.tick++;

    for (const p of this.players.values()) if (!p.dead) this.updatePlayer(p, dt);
    for (const n of this.npcs.values()) this.updateNpc(n, dt);
    for (const h of this.helsings.values()) this.updateHelsing(h, dt);
    this.updateProjectiles(dt);
    this.updatePickups();
    this.maintainPopulation(dt);

    if (this.tick % SNAPSHOT_EVERY === 0) this.sendSnapshots();
    if (this.tick % RANK_EVERY === 0) { this.sendRank(); this.checkTimedMedals(); }
  }

  private applyStatus(m: Mob, dt: number) {
    m.stunT = Math.max(0, m.stunT - dt);
    m.slowT = Math.max(0, m.slowT - dt);
    m.fearT = Math.max(0, m.fearT - dt);
    if (m.knock) {
      const res = this.grid.move(m.x, m.y, m.knock.vx * dt, m.knock.vy * dt, m.r);
      m.x = res.x; m.y = res.y;
      m.knock.t -= dt;
      if (m.knock.t <= 0) m.knock = null;
      return true;
    }
    return false;
  }

  private updatePlayer(p: Player, dt: number) {
    for (let i = 0; i < 3; i++) p.cd[i] = Math.max(0, p.cd[i] - dt);
    p.speedT = Math.max(0, p.speedT - dt);
    p.furyT = Math.max(0, p.furyT - dt);
    p.howlT = Math.max(0, p.howlT - dt);
    p.mistT = Math.max(0, p.mistT - dt);
    p.protectT = Math.max(0, p.protectT - dt);
    if (p.shieldT > 0) { p.shieldT -= dt; if (p.shieldT <= 0) p.shieldHp = 0; }
    if (p.invisT > 0) { p.invisT -= dt; if (p.invisT <= 0) p.invisBonus = false; }
    // regeneración lenta
    if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.008 * dt);

    const inp = p.queue.shift();
    if (inp) {
      p.input = inp;
      p.ack = inp.q;
    }
    const { mx, my, a, b } = p.input;
    const knocked = this.applyStatus(p, dt);

    if (p.dash) {
      const sp = p.def.speed * 3.2;
      const res = this.grid.move(p.x, p.y, p.dash.dx * sp * dt, p.dash.dy * sp * dt, p.r);
      p.x = res.x; p.y = res.y;
      this.forEachEnemyNear(p, p.x, p.y, p.r + 26, (m) => {
        if (p.dash!.hit.has(m.id)) return;
        p.dash!.hit.add(m.id);
        this.damage(m, this.calcDamage(p, 1.2), this.src(p));
        this.knockback(m, p.dash!.dx, p.dash!.dy, 200);
      });
      p.dash.t -= dt;
      if (p.dash.t <= 0 || res.hit) p.dash = null;
      p.moving = true;
    } else if (!knocked) {
      const sp = this.calcSpeed(p);
      p.moving = (mx !== 0 || my !== 0) && sp > 0;
      if (p.moving) {
        const res = this.grid.move(p.x, p.y, mx * sp * dt, my * sp * dt, p.r);
        p.x = res.x; p.y = res.y;
        if (p.anim === Anim.Wave || p.anim === Anim.Taunt) p.animUntil = 0;
      }
    }
    p.facing = Math.cos(a) >= 0 ? 1 : -1;

    if (p.stunT > 0) return;
    if (b & BTN_ATTACK && p.cd[0] <= 0) this.basicAttack(p, a);
    if (b & BTN_Q && p.cd[1] <= 0) this.ability(p, 0, a);
    if (b & BTN_E && p.cd[2] <= 0) this.ability(p, 1, a);
  }

  private src(p: Player): Source { return { player: p, name: p.name, kind: Kind.Player }; }

  private forEachEnemyNear(p: Player, x: number, y: number, radius: number, fn: (m: Mob) => void) {
    for (const n of this.npcs.values()) if (dist2(x, y, n.x, n.y) < (radius + n.r) ** 2) fn(n);
    for (const h of this.helsings.values()) if (dist2(x, y, h.x, h.y) < (radius + h.r) ** 2) fn(h);
    for (const o of this.players.values()) {
      if (o === p || o.dead || o.protectT > 0 || o.mistT > 0) continue;
      if (dist2(x, y, o.x, o.y) < (radius + o.r) ** 2) fn(o);
    }
  }

  private breakStealth(p: Player): number {
    p.protectT = 0;
    if (p.invisT > 0 || p.invisBonus) {
      const bonus = p.invisBonus ? 2 : 1;
      p.invisT = 0;
      p.invisBonus = false;
      return bonus;
    }
    return 1;
  }

  private basicAttack(p: Player, a: number) {
    p.cd[0] = p.cdMax[0];
    const mult = this.breakStealth(p);
    this.setAnim(p, Anim.Attack, 0.3);
    const def = p.def;
    const reach = def.range + 18;
    const hx = p.x + Math.cos(a) * 14, hy = p.y + Math.sin(a) * 14;
    let total = 0;
    this.forEachEnemyNear(p, hx, hy, reach, (m) => {
      const ang = Math.atan2(m.y - p.y, m.x - p.x);
      if (dist2(p.x, p.y, m.x, m.y) > (p.r + m.r + 10) ** 2 && angleDiff(ang, a) > def.arc / 2) return;
      const d = this.calcDamage(p, mult);
      total += this.damage(m, d, this.src(p), mult > 1);
      if (m.kind !== Kind.Player) this.knockback(m, Math.cos(a), Math.sin(a), 120);
    });
    if (p.char === 'vampire' && total > 0) p.hp = Math.min(p.maxHp, p.hp + total * 0.3);
    const s: SfxId = p.char === 'vampire' ? 'bite' : p.char === 'werewolf' ? 'claw' : 'punch';
    this.sfx(s, p.x, p.y);
    this.emit({ e: 'fx', f: 'swing', x: Math.round(hx), y: Math.round(hy), r: +a.toFixed(2), o: p.id }, p.x, p.y);
  }

  private ability(p: Player, slot: 0 | 1, a: number) {
    p.cd[slot + 1] = p.cdMax[slot + 1];
    const powMult = 1 + 0.06 * p.ups.pow;
    const ca = Math.cos(a), sa = Math.sin(a);
    switch (`${p.char}:${slot}`) {
      case 'vampire:0': {
        this.breakStealth(p);
        this.setAnim(p, Anim.Cast, 0.35);
        for (const off of [-0.28, 0, 0.28]) this.shoot('bat', p.id, p.x, p.y, a + off, 540, 0.9, this.calcDamage(p, 0.8 * powMult));
        this.sfx('bat', p.x, p.y);
        break;
      }
      case 'vampire:1': {
        const from = { x: p.x, y: p.y };
        let d = 240;
        while (d > 0 && this.grid.blocked(p.x + ca * d, p.y + sa * d, p.r)) d -= 20;
        p.x += ca * d; p.y += sa * d;
        p.mistT = 1;
        p.knock = null; p.stunT = 0;
        this.emit({ e: 'fx', f: 'mist', x: Math.round(from.x), y: Math.round(from.y) }, from.x, from.y);
        this.emit({ e: 'fx', f: 'mist', x: Math.round(p.x), y: Math.round(p.y) }, p.x, p.y);
        this.sfx('mist', p.x, p.y);
        break;
      }
      case 'werewolf:0': {
        this.breakStealth(p);
        p.dash = { t: 0.3, dx: ca, dy: sa, hit: new Set() };
        this.setAnim(p, Anim.Attack, 0.3);
        this.emit({ e: 'fx', f: 'dash', x: Math.round(p.x), y: Math.round(p.y), r: +a.toFixed(2) }, p.x, p.y);
        this.sfx('dash', p.x, p.y);
        break;
      }
      case 'werewolf:1': {
        p.howlT = 5 * powMult;
        this.setAnim(p, Anim.Cast, 0.8);
        for (const n of this.npcs.values()) if (dist2(p.x, p.y, n.x, n.y) < 420 ** 2) n.fearT = 1.8;
        for (const h of this.helsings.values()) if (dist2(p.x, p.y, h.x, h.y) < 260 ** 2) h.fearT = 0.8;
        this.emit({ e: 'fx', f: 'howl', x: Math.round(p.x), y: Math.round(p.y), r: 420 }, p.x, p.y);
        this.sfx('howl', p.x, p.y);
        break;
      }
      case 'mummy:0': {
        this.breakStealth(p);
        this.setAnim(p, Anim.Cast, 0.35);
        this.shoot('bandage', p.id, p.x, p.y, a, 500, 0.95, this.calcDamage(p, 1 * powMult));
        this.sfx('bat', p.x, p.y);
        break;
      }
      case 'mummy:1': {
        this.breakStealth(p);
        this.setAnim(p, Anim.Cast, 0.6);
        const R = 175;
        this.forEachEnemyNear(p, p.x, p.y, R, (m) => {
          this.damage(m, this.calcDamage(p, 1 * powMult), this.src(p));
          m.slowT = 3;
        });
        this.emit({ e: 'fx', f: 'curse', x: Math.round(p.x), y: Math.round(p.y), r: R }, p.x, p.y);
        this.sfx('curse', p.x, p.y);
        break;
      }
      case 'invisible:0': {
        p.invisT = 4 * powMult;
        p.invisBonus = true;
        p.protectT = 0;
        this.emit({ e: 'fx', f: 'vanish', x: Math.round(p.x), y: Math.round(p.y) }, p.x, p.y);
        this.sfx('vanish', p.x, p.y);
        break;
      }
      case 'invisible:1': {
        this.breakStealth(p);
        this.setAnim(p, Anim.Cast, 0.4);
        const R = 155;
        this.forEachEnemyNear(p, p.x, p.y, R, (m) => {
          this.damage(m, this.calcDamage(p, 0.8 * powMult), this.src(p));
          const d = Math.hypot(m.x - p.x, m.y - p.y) || 1;
          this.knockback(m, (m.x - p.x) / d, (m.y - p.y) / d, 280);
          m.stunT = Math.max(m.stunT, 0.6);
        });
        this.emit({ e: 'fx', f: 'push', x: Math.round(p.x), y: Math.round(p.y), r: R }, p.x, p.y);
        this.sfx('push', p.x, p.y);
        break;
      }
    }
  }

  private knockback(m: Mob, dx: number, dy: number, dist: number) {
    const t = 0.2;
    m.knock = { vx: (dx * dist) / t, vy: (dy * dist) / t, t };
  }

  private shoot(type: ProjectileType, owner: number, x: number, y: number, a: number, speed: number, life: number, dmg: number) {
    const pr: Projectile = { id: this.nextId++, type, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, owner, dmg };
    this.projectiles.set(pr.id, pr);
  }

  /** Aplica daño y devuelve el daño efectivo. */
  private damage(m: Mob, amount: number, src: Source, crit = false): number {
    if (m.dead) return 0;
    if (m.kind === Kind.Player) {
      const p = m as Player;
      if (p.protectT > 0 || p.mistT > 0) return 0;
      amount *= 1 - p.def.armor;
      if (p.shieldHp > 0) {
        const absorbed = Math.min(p.shieldHp, amount);
        p.shieldHp -= absorbed;
        amount -= absorbed;
        if (p.shieldHp <= 0) p.shieldT = 0;
      }
      p.lastAttacker = src.name;
    }
    if (m.kind === Kind.Helsing && src.player) (m as Helsing).target = src.player.id;
    amount = Math.max(0, amount);
    m.hp -= amount;
    this.emit({ e: 'hit', x: Math.round(m.x), y: Math.round(m.y), d: Math.round(amount), t: m.id, crit }, m.x, m.y);
    if (m.hp <= 0) this.kill(m, src);
    else if (this.time >= m.animUntil) this.setAnim(m, Anim.Hurt, 0.2);
    return amount;
  }

  private kill(m: Mob, src: Source) {
    m.dead = true;
    m.hp = 0;
    const killer = src.player && !src.player.dead ? src.player : undefined;
    let c = '';
    if (m.kind === Kind.Npc) {
      const n = m as Npc;
      c = n.variant;
      this.npcs.delete(n.id);
      this.sfx('scream', n.x, n.y);
      if (killer) {
        this.reward(killer, 12, 10, 1);
        const st = killer.conn.profile.stats;
        st.npcKills++;
        this.medal(killer, 'firstblood');
        if (st.npcKills >= 100) this.medal(killer, 'glutton');
      }
    } else if (m.kind === Kind.Helsing) {
      c = 'helsing';
      this.helsings.delete(m.id);
      this.helsingRespawnT = Math.max(this.helsingRespawnT, 6);
      if (killer) {
        this.reward(killer, 70, 80, 8);
        const st = killer.conn.profile.stats;
        st.helsingKills++;
        this.medal(killer, 'hunter');
        if (st.helsingKills >= 25) this.medal(killer, 'slayer');
        this.emit({ e: 'kill', a: killer.name, v: 'Helsing', ak: Kind.Player, vk: Kind.Helsing }, m.x, m.y, true);
      }
    } else if (m.kind === Kind.Player) {
      const v = m as Player;
      c = v.char;
      v.diedAt = this.time;
      v.dash = null;
      this.recordBest(v);
      v.conn.profile.stats.deaths++;
      if (killer) {
        this.reward(killer, 40 + Math.round(v.totalXp * 0.25), 50 + Math.round(v.points * 0.25), 5);
        killer.lifeKills++;
        killer.conn.profile.stats.playerKills++;
        if (killer.lifeKills >= 3) this.medal(killer, 'predator');
      }
      const by = src.name || v.lastAttacker || 'la noche';
      this.emit({ e: 'kill', a: by, v: v.name, ak: src.kind, vk: Kind.Player }, m.x, m.y, true);
      this.sfx('death', v.x, v.y);
      v.conn.send({
        t: 'died', by, pts: Math.round(v.points), lvl: v.level, kills: v.lifeKills,
        time: Math.round(this.time - v.lifeStart), coins: v.coinsEarned,
      });
      v.conn.send({ t: 'profile', profile: v.conn.profile });
      store.touch();
    }
    this.emit({ e: 'die', x: Math.round(m.x), y: Math.round(m.y), k: m.kind, c }, m.x, m.y);
  }

  private recordBest(p: Player) {
    const st = p.conn.profile.stats;
    if (p.points > st.bestScore) { st.bestScore = Math.round(p.points); store.touch(); }
  }

  private reward(p: Player, xp: number, pts: number, coins: number) {
    p.points += pts;
    p.coinsEarned += coins;
    p.conn.profile.coins += coins;
    store.touch();
    this.addXp(p, xp);
  }

  private addXp(p: Player, xp: number) {
    p.totalXp += xp;
    p.xp += xp;
    while (p.level < MAX_LEVEL && p.xp >= xpForLevel(p.level)) {
      p.xp -= xpForLevel(p.level);
      p.level++;
      p.upPts++;
      const old = p.maxHp;
      p.maxHp = this.calcMaxHp(p);
      p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - old) + p.maxHp * 0.2);
      this.emit({ e: 'fx', f: 'lvl', x: Math.round(p.x), y: Math.round(p.y), o: p.id }, p.x, p.y);
      this.sfx('level', p.x, p.y);
      if (p.level >= 10) this.medal(p, 'level10');
    }
  }

  private medal(p: Player, id: string) {
    if (store.award(p.conn.profile, id)) {
      p.conn.send({ t: 'medal', id });
      p.conn.send({ t: 'profile', profile: p.conn.profile });
    }
  }

  private checkTimedMedals() {
    const alive = this.alivePlayers();
    for (const p of alive) if (this.time - p.lifeStart >= 300) this.medal(p, 'survivor');
    if (alive.length >= 3) {
      const top = alive.reduce((a, b) => (b.points > a.points ? b : a));
      if (top.points >= 150) this.medal(top, 'lord');
    }
  }

  // ------------------------------------------------------------------ IA humanos
  private visibleMonsterNear(x: number, y: number, radius: number): Player | null {
    let best: Player | null = null;
    let bd = radius * radius;
    for (const p of this.players.values()) {
      if (p.dead || p.invisT > 0) continue;
      const d = dist2(x, y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  private updateNpc(n: Npc, dt: number) {
    n.screamCd = Math.max(0, n.screamCd - dt);
    if (this.applyStatus(n, dt)) return;
    if (n.stunT > 0 || n.fearT > 0) { n.moving = false; return; }
    n.thinkT -= dt;
    let speed = 55;
    if (n.thinkT <= 0) {
      n.thinkT = 0.25 + Math.random() * 0.2;
      const threat = this.visibleMonsterNear(n.x, n.y, 240);
      if (threat) {
        if (!n.fleeing && n.screamCd <= 0) { this.sfx('scream', n.x, n.y); n.screamCd = 4; }
        n.fleeing = true;
        let ax = n.x - threat.x, ay = n.y - threat.y;
        const d = Math.hypot(ax, ay) || 1;
        ax /= d; ay /= d;
        // probar direcciones hasta encontrar una libre
        for (const rot of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
          const c = Math.cos(rot), s = Math.sin(rot);
          const dx = ax * c - ay * s, dy = ax * s + ay * c;
          if (!this.grid.blocked(n.x + dx * 60, n.y + dy * 60, n.r)) { n.tx = n.x + dx * 200; n.ty = n.y + dy * 200; break; }
        }
      } else {
        n.fleeing = false;
        if (Math.random() < 0.15 || dist2(n.x, n.y, n.tx, n.ty) < 400) {
          if (Math.random() < 0.4) { n.tx = n.x; n.ty = n.y; }
          else { n.tx = n.x + (Math.random() - 0.5) * 400; n.ty = n.y + (Math.random() - 0.5) * 400; }
        }
      }
    }
    if (n.fleeing) speed = 155;
    if (n.slowT > 0) speed *= 0.5;
    const dx = n.tx - n.x, dy = n.ty - n.y;
    const d = Math.hypot(dx, dy);
    n.moving = d > 6;
    if (n.moving) {
      const step = Math.min(d, speed * dt);
      const res = this.grid.move(n.x, n.y, (dx / d) * step, (dy / d) * step, n.r);
      if (res.hit && !n.fleeing) { n.tx = n.x; n.ty = n.y; }
      n.x = res.x; n.y = res.y;
      n.facing = dx >= 0 ? 1 : -1;
    }
  }

  // ------------------------------------------------------------------ IA Helsing
  private updateHelsing(h: Helsing, dt: number) {
    h.shootCd = Math.max(0, h.shootCd - dt);
    h.meleeCd = Math.max(0, h.meleeCd - dt);
    if (this.applyStatus(h, dt)) return;
    if (h.stunT > 0 || h.fearT > 0) { h.moving = false; return; }

    h.thinkT -= dt;
    if (h.thinkT <= 0) {
      h.thinkT = 0.5;
      // mantener objetivo o buscar uno nuevo (el cazarrecompensas ve más lejos al líder)
      let t = this.findPlayerById(h.target);
      if (!t || t.dead || t.invisT > 0 || t.mistT > 0 || dist2(h.x, h.y, t.x, t.y) > 650 ** 2) t = null;
      if (!t) {
        let bd = Infinity;
        for (const p of this.players.values()) {
          if (p.dead || p.invisT > 0 || p.protectT > 0) continue;
          const range = p.id === this.bountyId ? 700 : 460;
          const d = dist2(h.x, h.y, p.x, p.y);
          if (d < range * range && d < bd && this.grid.lineOfSight(h.x, h.y, p.x, p.y)) { bd = d; t = p; }
        }
      }
      h.target = t ? t.id : -1;
      if (!t) {
        if (h.hp < h.maxHp) h.hp = Math.min(h.maxHp, h.hp + 10);
        if (Math.random() < 0.2 || dist2(h.x, h.y, h.tx, h.ty) < 400) {
          h.tx = Math.max(100, Math.min(MAP_SIZE - 100, h.x + (Math.random() - 0.5) * 600));
          h.ty = Math.max(100, Math.min(MAP_SIZE - 100, h.y + (Math.random() - 0.5) * 600));
        }
      }
      if (Math.random() < 0.1) h.strafe *= -1;
    }

    const t = h.target >= 0 ? this.findPlayerById(h.target) : null;
    let mx = 0, my = 0, speed = 90;
    if (t && !t.dead) {
      const dx = t.x - h.x, dy = t.y - h.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      h.facing = dx >= 0 ? 1 : -1;
      speed = 150;
      if (d > 300) { mx = ux; my = uy; }
      else if (d < 160) { mx = -ux; my = -uy; }
      else { mx = -uy * h.strafe * 0.7; my = ux * h.strafe * 0.7; }
      if (d < h.r + t.r + 26 && h.meleeCd <= 0) {
        h.meleeCd = 1.3;
        this.setAnim(h, Anim.Attack, 0.3);
        this.damage(t, 34, { helsing: h, name: 'Helsing', kind: Kind.Helsing });
        this.sfx('stake', h.x, h.y);
      } else if (h.shootCd <= 0 && d < 520) {
        h.shootCd = 1.6 + Math.random() * 0.4;
        // apuntar con algo de predicción
        const tt = d / 640;
        const px = t.x + (t.moving ? Math.cos(t.input.a) * 0 : 0) + (t.input.mx * this.calcSpeed(t) * tt);
        const py = t.y + (t.input.my * this.calcSpeed(t) * tt);
        const a = Math.atan2(py - h.y, px - h.x) + (Math.random() - 0.5) * 0.12;
        this.shoot('bolt', -1, h.x, h.y, a, 640, 1.0, 26);
        this.setAnim(h, Anim.Attack, 0.3);
        this.sfx('bolt', h.x, h.y);
      }
    } else {
      const dx = h.tx - h.x, dy = h.ty - h.y;
      const d = Math.hypot(dx, dy);
      if (d > 8) { mx = dx / d; my = dy / d; h.facing = dx >= 0 ? 1 : -1; }
    }
    if (h.slowT > 0) speed *= 0.5;
    h.moving = mx !== 0 || my !== 0;
    if (h.moving) {
      const res = this.grid.move(h.x, h.y, mx * speed * dt, my * speed * dt, h.r);
      if (res.hit && !t) { h.tx = h.x; h.ty = h.y; }
      if (res.hit && t) h.strafe *= -1;
      h.x = res.x; h.y = res.y;
    }
  }

  private findPlayerById(id: number): Player | null {
    if (id < 0) return null;
    for (const p of this.players.values()) if (p.id === id) return p;
    return null;
  }

  // ------------------------------------------------------------------ proyectiles y recogidas
  private updateProjectiles(dt: number) {
    for (const pr of this.projectiles.values()) {
      pr.life -= dt;
      let done = pr.life <= 0;
      const steps = 2;
      for (let s = 0; s < steps && !done; s++) {
        pr.x += (pr.vx * dt) / steps;
        pr.y += (pr.vy * dt) / steps;
        if (this.grid.blocked(pr.x, pr.y, 3, true)) { done = true; break; }
        if (pr.owner === -1) {
          // virote de Helsing: solo daña a monstruos
          for (const p of this.players.values()) {
            if (p.dead || dist2(pr.x, pr.y, p.x, p.y) > (p.r + 6) ** 2) continue;
            this.damage(p, pr.dmg, { name: 'Helsing', kind: Kind.Helsing });
            done = true;
            break;
          }
        } else {
          const owner = this.findPlayerById(pr.owner);
          const hitR = 8;
          const tryHit = (m: Mob) => {
            if (done || m.dead || dist2(pr.x, pr.y, m.x, m.y) > (m.r + hitR) ** 2) return;
            if (m.kind === Kind.Player && ((m as Player).protectT > 0 || (m as Player).mistT > 0)) return;
            this.damage(m, pr.dmg, owner ? this.src(owner) : { name: '???', kind: Kind.Player });
            if (pr.type === 'bandage') { m.stunT = Math.max(m.stunT, 1.2); }
            if (pr.type === 'bat' && owner) owner.hp = Math.min(owner.maxHp, owner.hp + pr.dmg * 0.15);
            done = true;
          };
          for (const n of this.npcs.values()) tryHit(n);
          for (const h of this.helsings.values()) tryHit(h);
          for (const p of this.players.values()) if (p.id !== pr.owner) tryHit(p);
        }
      }
      if (done) this.projectiles.delete(pr.id);
    }
  }

  private updatePickups() {
    for (const p of this.players.values()) {
      if (p.dead) continue;
      for (const u of this.powerups.values()) {
        if (dist2(p.x, p.y, u.x, u.y) > (p.r + POWERUP_RADIUS) ** 2) continue;
        this.powerups.delete(u.id);
        switch (u.type) {
          case 'blood': p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4); break;
          case 'speed': p.speedT = 6; break;
          case 'fury': p.furyT = 8; break;
          case 'shield': p.shieldHp = 50; p.shieldT = 10; break;
          case 'coin': p.coinsEarned += 5; p.conn.profile.coins += 5; store.touch(); break;
          case 'xp': this.addXp(p, 30); break;
        }
        p.points += 5;
        this.emit({ e: 'pick', x: Math.round(u.x), y: Math.round(u.y), p: u.type }, u.x, u.y);
        this.sfx(u.type === 'coin' ? 'coin' : 'pickup', u.x, u.y);
      }
    }
  }

  private maintainPopulation(dt: number) {
    const pc = this.alivePlayers().length;
    const npcTarget = Math.min(95, 45 + pc * 4);
    if (this.npcs.size < npcTarget && this.tick % 10 === 0) this.spawnNpc();
    const helsingTarget = Math.min(12, 4 + Math.floor(pc / 2));
    this.helsingRespawnT = Math.max(0, this.helsingRespawnT - dt);
    if (this.helsings.size < helsingTarget && this.helsingRespawnT <= 0) {
      this.spawnHelsing();
      this.helsingRespawnT = 4;
    }
    this.powerupRespawnT -= dt;
    if (this.powerups.size < 28 && this.powerupRespawnT <= 0) {
      this.spawnPowerUp();
      this.powerupRespawnT = 1.5;
    }
  }

  // ------------------------------------------------------------------ red
  private mobFlags(m: Mob): number {
    let f = 0;
    if (m.stunT > 0) f |= Flag.Stunned;
    if (m.slowT > 0) f |= Flag.Slowed;
    if (m.fearT > 0) f |= Flag.Feared;
    if (m.kind === Kind.Player) {
      const p = m as Player;
      if (p.invisT > 0) f |= Flag.Invisible;
      if (p.shieldHp > 0) f |= Flag.Shield;
      if (p.furyT > 0 || p.howlT > 0) f |= Flag.Buffed;
      if (p.protectT > 0) f |= Flag.Protected;
      if (p.mistT > 0) f |= Flag.Mist;
      if (p.id === this.bountyId) f |= Flag.Bounty;
    }
    return f;
  }

  private snapMob(m: Mob): EntSnap {
    const anim = this.time < m.animUntil ? m.anim : m.moving ? Anim.Walk : Anim.Idle;
    const s: EntSnap = {
      i: m.id, k: m.kind, x: Math.round(m.x), y: Math.round(m.y), f: m.facing, a: anim, q: m.animSeq, c: '',
    };
    const fl = this.mobFlags(m);
    if (fl) s.fl = fl;
    if (m.hp < m.maxHp) s.h = Math.max(1, Math.round((m.hp / m.maxHp) * 100));
    if (m.kind === Kind.Npc) s.c = (m as Npc).variant;
    else if (m.kind === Kind.Helsing) s.c = 'helsing';
    else {
      const p = m as Player;
      s.c = p.char; s.s = p.skin; s.n = p.name; s.l = p.level;
      if (s.h === undefined) s.h = 100;
    }
    return s;
  }

  private sendSnapshots() {
    const R2 = VIEW_RADIUS * VIEW_RADIUS;
    const events = this.events;
    this.events = [];
    for (const conn of this.conns.values()) {
      const me = this.players.get(conn.id);
      if (!me) continue;
      const cx = me.x, cy = me.y;
      const ents: EntSnap[] = [];
      const inView = (x: number, y: number) => dist2(cx, cy, x, y) < R2;
      for (const p of this.players.values()) {
        if (p.dead || !inView(p.x, p.y)) continue;
        if (p !== me && p.invisT > 0 && dist2(cx, cy, p.x, p.y) > 110 ** 2) continue;
        ents.push(this.snapMob(p));
      }
      for (const n of this.npcs.values()) if (inView(n.x, n.y)) ents.push(this.snapMob(n));
      for (const h of this.helsings.values()) if (inView(h.x, h.y)) ents.push(this.snapMob(h));
      for (const u of this.powerups.values()) if (inView(u.x, u.y)) ents.push({ i: u.id, k: Kind.PowerUp, x: Math.round(u.x), y: Math.round(u.y), f: 1, a: Anim.Idle, q: 0, c: u.type });
      for (const pr of this.projectiles.values()) {
        if (!inView(pr.x, pr.y)) continue;
        ents.push({ i: pr.id, k: Kind.Projectile, x: Math.round(pr.x), y: Math.round(pr.y), f: pr.vx >= 0 ? 1 : -1, a: Anim.Idle, q: 0, c: pr.type, r: +Math.atan2(pr.vy, pr.vx).toFixed(2) });
      }
      const ev: GameEvent[] = [];
      for (const e of events) if (e.global || inView(e.x, e.y)) ev.push(e.ev);

      const buffs: { t: string; r: number }[] = [];
      const addB = (t: string, r: number) => { if (r > 0) buffs.push({ t, r: +r.toFixed(1) }); };
      addB('speed', me.speedT); addB('fury', me.furyT); addB('howl', me.howlT); addB('shield', me.shieldT);
      addB('invis', me.invisT); addB('protect', me.protectT); addB('slow', me.slowT); addB('stun', me.stunT);

      const you: YouState = {
        id: me.id, alive: !me.dead, x: +me.x.toFixed(1), y: +me.y.toFixed(1), ack: me.ack,
        spd: Math.round(this.calcSpeed(me)), st: me.stunT > 0 || !!me.knock || !!me.dash,
        hp: Math.ceil(me.hp), mhp: me.maxHp, xp: Math.round(me.xp), xpn: xpForLevel(me.level), lvl: me.level,
        pts: Math.round(me.points), coins: me.coinsEarned,
        cd: [+me.cd[0].toFixed(2), +me.cd[1].toFixed(2), +me.cd[2].toFixed(2)],
        cdm: [+me.cdMax[0].toFixed(2), +me.cdMax[1].toFixed(2), +me.cdMax[2].toFixed(2)],
        up: me.upPts, ups: me.ups, kills: me.lifeKills, buffs,
      };
      conn.send({ t: 'snap', tk: this.tick, you, ents, ev });
    }
  }

  sendRank() {
    const all = [...this.players.values()].sort((a, b) => b.points - a.points);
    const top = all.find((p) => !p.dead);
    this.bountyId = top && top.points >= 100 ? top.id : -1;
    const list = all.slice(0, 10).map((p) => [p.name, Math.round(p.points), p.char, p.id] as [string, number, CharacterId, number]);
    for (const c of this.conns.values()) c.send({ t: 'rank', list, total: this.conns.size });
  }
}
