// Una sala de juego: simulación autoritativa con su propio bucle de ticks.
// Los jugadores entran y salen en cualquier momento sin reiniciar la partida.
// Las habilidades de cada monstruo viven en server/kits; aquí están los sistemas genéricos
// (movimiento, estados, proyectiles, zonas, recompensas, evolución, red).
import { BAL, tierOf, ULT } from '../shared/balance';
import {
  BTN_ATTACK, BTN_E, BTN_Q, BTN_R, HELSING_RADIUS, MAP_SIZE, MAX_PLAYERS_PER_ROOM, NPC_RADIUS, PLAYER_RADIUS,
  POWERUP_RADIUS, RANK_EVERY, RESPAWN_POINT_KEEP, SNAPSHOT_EVERY, SPAWN_PROTECTION, TICK_DT, TICK_RATE, VIEW_RADIUS,
} from '../shared/constants';
import { CHARACTERS, MAX_LEVEL, UPGRADES, xpForLevel, type CharacterId, type UpgradeId } from '../shared/characters';
import { distToSegment, generateMap, type GameMap, type MapThemeId } from '../shared/maps';
import { ObstacleGrid } from '../shared/physics';
import {
  Anim, Flag, Kind, type EntSnap, type FxId, type GameEvent, type PowerUpType, type ProjectileType, type SfxId, type YouState,
} from '../shared/protocol';
import { mobStatus, type Helsing, type Mob, type Npc, type Player, type PowerUp, type Projectile, type Source, type Zone } from './entities';
import { KITS } from './kits';
import { store } from './store';
import type { Conn } from './types';

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
const DAMA = BAL.invisible;

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
  zones: Zone[] = [];
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
      ...mobStatus(),
      id: this.nextId++, kind: Kind.Player, x: pos.x, y: pos.y, r: PLAYER_RADIUS, facing: 1,
      hp: def.hp, maxHp: def.hp, anim: Anim.Idle, animSeq: 0, animUntil: 0, moving: false,
      conn, name: conn.name, char, skin, def,
      level: 1, tier: 0, xp: 0, totalXp: 0,
      points: prev ? Math.floor(prev.points * RESPAWN_POINT_KEEP) : 0,
      coinsEarned: 0,
      ups: { vit: 0, str: 0, spd: 0, pow: 0 }, upPts: 0,
      cd: [0, 0, 0], cdMax: [def.attackCd, def.abilities[0].cooldown, def.abilities[1].cooldown],
      input: { mx: 0, my: 0, a: 0, b: 0 }, queue: [], ack: prev?.ack ?? 0,
      speedT: 0, furyT: 0, howlT: 0, shieldHp: 0, shieldT: 0, invisT: 0, invisKind: 'none', invisBonus: false, mistT: 0,
      protectT: SPAWN_PROTECTION, dash: null,
      ult: 0, ultT: 0, ultExt: 0, qCharges: 1, qLock: 0, orbit: [], lastCombatT: this.time, reinvisT: 0,
      frenzyT: 0, killSpeedT: 0, hits: new Map(), lastAtkFromInvis: false, stepT: 0,
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
    if (!p || p.dead || this.time < p.animUntil || p.entombT > 0) return;
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

  /** Solo modo desarrollo: subir de nivel / llenar la definitiva para probar. */
  onCheat(conn: Conn, lvl?: number, ult?: boolean, tp?: [number, number]) {
    const p = this.players.get(conn.id);
    if (!p || p.dead) return;
    if (tp && !this.grid.blocked(+tp[0], +tp[1], p.r)) { p.x = +tp[0]; p.y = +tp[1]; }
    if (lvl) { let guard = 0; while (p.level < Math.min(MAX_LEVEL, lvl) && guard++ < 60) this.addXp(p, xpForLevel(p.level) - p.xp); }
    if (ult && p.tier >= 2) p.ult = ULT.max;
  }

  // ------------------------------------------------------------------ API para los kits
  setAnim(m: Mob, a: Anim, dur: number) {
    m.anim = a;
    m.animSeq = (m.animSeq + 1) % 1000;
    m.animUntil = this.time + dur;
  }

  private emit(ev: GameEvent, x: number, y: number, global = false) {
    this.events.push({ ev, x, y, global });
  }

  fx(f: FxId, x: number, y: number, extra: Partial<Extract<GameEvent, { e: 'fx' }>> = {}) {
    this.emit({ e: 'fx', f, x: Math.round(x), y: Math.round(y), ...extra }, x, y);
  }

  sfx(s: SfxId, x: number, y: number) {
    this.emit({ e: 'sfx', s, x: Math.round(x), y: Math.round(y) }, x, y);
  }

  src(p: Player): Source { return { player: p, name: p.name, kind: Kind.Player }; }

  powMult(p: Player) { return 1 + 0.06 * p.ups.pow; }

  calcDamage(p: Player, mult = 1) {
    let d = p.def.damage * (1 + 0.12 * p.ups.str) * (1 + 0.025 * (p.level - 1)) * mult;
    if (p.furyT > 0) d *= 1.5;
    if (p.howlT > 0) d *= BAL.werewolf.howlDmgMul;
    return d;
  }

  /** Ralentiza (se queda con la ralentización más fuerte activa). */
  slow(m: Mob, t: number, mul: number) {
    m.slowMul = m.slowT > 0 ? Math.min(m.slowMul, mul) : mul;
    m.slowT = Math.max(m.slowT, t);
  }

  knockback(m: Mob, dx: number, dy: number, dist: number) {
    if (m.entombT > 0) return;
    const t = 0.2;
    m.knock = { vx: (dx * dist) / t, vy: (dy * dist) / t, t };
  }

  shoot(type: ProjectileType, owner: number, x: number, y: number, a: number, speed: number, life: number, dmg: number): Projectile {
    const pr: Projectile = { id: this.nextId++, type, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, owner, dmg };
    this.projectiles.set(pr.id, pr);
    return pr;
  }

  addZone(z: Omit<Zone, 'id'>) { this.zones.push({ ...z, id: this.nextId++ }); }

  /** Rompe invisibilidad/protección al actuar. Devuelve el multiplicador de daño (golpe desde invisibilidad). */
  breakStealth(p: Player): number {
    p.protectT = 0;
    p.lastCombatT = this.time;
    if (p.invisT > 0 || p.invisBonus) {
      const bonus = p.invisBonus ? DAMA.invisBonus : 1;
      p.invisT = 0;
      p.invisKind = 'none';
      p.invisBonus = false;
      return bonus;
    }
    return 1;
  }

  forEachEnemyNear(p: Player, x: number, y: number, radius: number, fn: (m: Mob) => void) {
    for (const n of this.npcs.values()) if (dist2(x, y, n.x, n.y) < (radius + n.r) ** 2) fn(n);
    for (const h of this.helsings.values()) if (dist2(x, y, h.x, h.y) < (radius + h.r) ** 2) fn(h);
    for (const o of this.players.values()) {
      if (o === p || o.dead || o.protectT > 0 || o.mistT > 0) continue;
      if (dist2(x, y, o.x, o.y) < (radius + o.r) ** 2) fn(o);
    }
  }

  nearestEnemy(p: Player, x: number, y: number, radius: number, excludeId: number): Mob | null {
    let best: Mob | null = null, bd = radius * radius;
    this.forEachEnemyNear(p, x, y, radius, (m) => {
      if (m.id === excludeId || m.dead || m.entombT > 0) return;
      const d = dist2(x, y, m.x, m.y);
      if (d < bd) { bd = d; best = m; }
    });
    return best;
  }

  /** Golpe cuerpo a cuerpo en arco (reutilizable por cualquier monstruo). */
  meleeSwing(p: Player, a: number, o: { sfx: SfxId; rangeMul?: number; dmgFor?: (m: Mob) => number }) {
    const mult = this.breakStealth(p);
    this.setAnim(p, Anim.Attack, 0.3);
    const def = p.def;
    const reach = (def.range + 18) * (o.rangeMul ?? 1);
    const hx = p.x + Math.cos(a) * 14, hy = p.y + Math.sin(a) * 14;
    let total = 0;
    const hits: { m: Mob; dealt: number }[] = [];
    this.forEachEnemyNear(p, hx, hy, reach, (m) => {
      const ang = Math.atan2(m.y - p.y, m.x - p.x);
      if (dist2(p.x, p.y, m.x, m.y) > (p.r + m.r + 10) ** 2 && angleDiff(ang, a) > def.arc / 2) return;
      const extra = o.dmgFor ? o.dmgFor(m) : 1;
      const dealt = this.damage(m, this.calcDamage(p, mult * extra), this.src(p), mult > 1 || extra > 1);
      total += dealt;
      hits.push({ m, dealt });
      if (m.kind !== Kind.Player) this.knockback(m, Math.cos(a), Math.sin(a), 120);
    });
    this.sfx(o.sfx, p.x, p.y);
    this.fx('swing', hx, hy, { r: +a.toFixed(2), o: p.id, c: p.char, n: p.tier, d: Math.round(reach) });
    return { total, hits, fromInvis: mult > 1 };
  }

  /** Humanos cercanos entran en pánico (corren sin rumbo). */
  panicAround(x: number, y: number, r: number, t: number) {
    for (const n of this.npcs.values()) if (n.disguiseT <= 0 && dist2(x, y, n.x, n.y) < r * r) { n.panicT = Math.max(n.panicT, t); n.fleeing = false; }
  }

  /** Disfraza a los humanos cercanos con la ropa de la Dama. Devuelve cuántos. */
  disguiseAround(p: Player, r: number, t: number) {
    let n = 0;
    for (const npc of this.npcs.values()) {
      if (npc.entombT > 0 || dist2(p.x, p.y, npc.x, npc.y) > r * r) continue;
      npc.disguiseBy = p.id;
      npc.disguiseT = t;
      npc.panicT = 0; npc.fearT = 0; npc.fleeing = false;
      this.fx('disguise', npc.x, npc.y, { o: npc.id, r: 0, s: p.skin });
      n++;
    }
    return n;
  }

  /** ¿Se mueve el jugador hacia algún enemigo herido cercano? (Instinto depredador) */
  chasingWounded(p: Player, r: number, hpFrac: number, minDot: number) {
    const { mx, my } = p.input;
    const ml = Math.hypot(mx, my);
    if (ml < 0.1) return false;
    let found = false;
    this.forEachEnemyNear(p, p.x, p.y, r, (m) => {
      if (found || m.hp / m.maxHp >= hpFrac) return;
      const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy) || 1;
      if ((dx * mx + dy * my) / (d * ml) > minDot) found = true;
    });
    return found;
  }

  // ------------------------------------------------------------------ utilidades internas
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
      ...mobStatus(),
      id: this.nextId++, kind: Kind.Npc, x: pos.x, y: pos.y, r: NPC_RADIUS, facing: 1, hp: 30, maxHp: 30,
      anim: Anim.Idle, animSeq: 0, animUntil: 0, moving: false,
      variant: variants[Math.floor(Math.random() * variants.length)], tx: pos.x, ty: pos.y, thinkT: 0, fleeing: false, screamCd: 0,
      disguiseBy: -1, disguiseT: 0,
    };
    this.npcs.set(n.id, n);
  }

  private spawnHelsing() {
    const pos = this.findSpawn(700, HELSING_RADIUS + 2);
    const h: Helsing = {
      ...mobStatus(),
      id: this.nextId++, kind: Kind.Helsing, x: pos.x, y: pos.y, r: HELSING_RADIUS, facing: 1, hp: 180, maxHp: 180,
      anim: Anim.Idle, animSeq: 0, animUntil: 0, moving: false,
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

  calcSpeed(p: Player) {
    if (p.stunT > 0 || p.entombT > 0) return 0;
    let s = p.def.speed * (1 + 0.05 * p.ups.spd);
    if (p.speedT > 0) s *= 1.4;
    if (p.howlT > 0) s *= BAL.werewolf.howlSpeedMul;
    if (p.slowT > 0) s *= p.slowMul;
    s *= KITS[p.char].speedMul?.(this, p) ?? 1;
    return s;
  }

  private qChargesMax(p: Player) { return KITS[p.char].qCharges?.(p) ?? 1; }

  // ------------------------------------------------------------------ bucle principal
  private step() {
    const dt = TICK_DT;
    this.time += dt;
    this.tick++;

    for (const p of this.players.values()) if (!p.dead) this.updatePlayer(p, dt);
    for (const n of this.npcs.values()) this.updateNpc(n, dt);
    for (const h of this.helsings.values()) this.updateHelsing(h, dt);
    this.updateProjectiles(dt);
    this.updateZones();
    this.updatePickups();
    this.maintainPopulation(dt);

    if (this.tick % SNAPSHOT_EVERY === 0) this.sendSnapshots();
    if (this.tick % RANK_EVERY === 0) { this.sendRank(); this.checkTimedMedals(); }
  }

  /** Estados genéricos. Devuelve true si el empujón controla el movimiento este tick. */
  private applyStatus(m: Mob, dt: number) {
    m.stunT = Math.max(0, m.stunT - dt);
    m.slowT = Math.max(0, m.slowT - dt);
    if (m.slowT <= 0) m.slowMul = 1;
    m.fearT = Math.max(0, m.fearT - dt);
    m.panicT = Math.max(0, m.panicT - dt);
    m.vulnT = Math.max(0, m.vulnT - dt);
    if (m.vulnT <= 0) m.vulnMul = 1;
    m.preyT = Math.max(0, m.preyT - dt);
    m.curseMarkT = Math.max(0, m.curseMarkT - dt);
    if (m.entombT > 0) {
      m.entombT -= dt;
      m.knock = null;
      m.moving = false;
      m.entombDot -= dt;
      if (m.entombDot <= 0) {
        m.entombDot = BAL.mummy.ult.dotEvery;
        const by = this.findPlayerById(m.entombBy);
        if (by) this.damage(m, BAL.mummy.ult.dotDmg, this.src(by));
      }
      if (m.entombT <= 0) { m.entombBy = -1; this.fx('entomb', m.x, m.y, { o: m.id, d: 0 }); }
      return true;
    }
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
    const kit = KITS[p.char];
    const rate = kit.cdRate?.(this, p) ?? 1;
    p.cd[0] = Math.max(0, p.cd[0] - dt);
    for (let i = 1; i < 3; i++) p.cd[i] = Math.max(0, p.cd[i] - dt * rate);
    // cargas de Q
    const qMax = this.qChargesMax(p);
    if (p.qCharges > qMax) p.qCharges = qMax;
    if (qMax > 1 && p.qCharges < qMax && p.cd[1] <= 0) { p.qCharges++; if (p.qCharges < qMax) p.cd[1] = p.cdMax[1]; }
    p.qLock = Math.max(0, p.qLock - dt);
    p.speedT = Math.max(0, p.speedT - dt);
    p.furyT = Math.max(0, p.furyT - dt);
    p.howlT = Math.max(0, p.howlT - dt);
    p.mistT = Math.max(0, p.mistT - dt);
    p.protectT = Math.max(0, p.protectT - dt);
    if (p.ultT > 0) { p.ultT -= dt; if (p.ultT <= 0) { p.ultT = 0; this.fx('evolve', p.x, p.y, { o: p.id, n: -1 }); } }
    if (p.shieldT > 0) { p.shieldT -= dt; if (p.shieldT <= 0) p.shieldHp = 0; }
    if (p.invisT > 0) {
      p.invisT -= dt;
      if (p.invisT <= 0) { p.invisT = 0; p.invisBonus = false; p.invisKind = 'none'; }
    }
    // regeneración lenta
    if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.008 * dt);
    kit.tick?.(this, p, dt);

    const inp = p.queue.shift();
    if (inp) {
      p.input = inp;
      p.ack = inp.q;
    }
    const { mx, my, a, b } = p.input;
    const locked = this.applyStatus(p, dt);
    if (p.entombT > 0) { p.dash = null; return; }

    if (p.dash) {
      const res = this.grid.move(p.x, p.y, p.dash.dx * p.dash.speed * dt, p.dash.dy * p.dash.speed * dt, p.r);
      p.x = res.x; p.y = res.y;
      const dash = p.dash;
      this.forEachEnemyNear(p, p.x, p.y, p.r + 26, (m) => {
        if (dash.hit.has(m.id)) return;
        dash.hit.add(m.id);
        this.damage(m, this.calcDamage(p, dash.dmg), this.src(p));
        this.knockback(m, dash.dx, dash.dy, dash.knock);
      });
      dash.t -= dt;
      if (dash.t <= 0 || res.hit) p.dash = null;
      p.moving = true;
    } else if (!locked) {
      const sp = this.calcSpeed(p);
      p.moving = (mx !== 0 || my !== 0) && sp > 0;
      if (p.moving) {
        const res = this.grid.move(p.x, p.y, mx * sp * dt, my * sp * dt, p.r);
        p.x = res.x; p.y = res.y;
        if (p.anim === Anim.Wave || p.anim === Anim.Taunt) p.animUntil = 0;
      }
    }
    p.facing = Math.cos(a) >= 0 ? 1 : -1;

    // pisadas: señales físicas de una presencia invisible (no cuando está desvestida del todo)
    if ((p.invisKind === 'auto' || p.invisKind === 'timed') && p.moving) {
      p.stepT -= dt;
      if (p.stepT <= 0) { p.stepT = 0.42; this.fx('step', p.x, p.y, { r: +Math.atan2(my, mx).toFixed(1) }); }
    }

    if (p.stunT > 0) return;
    if (b & BTN_ATTACK && p.cd[0] <= 0) {
      p.cd[0] = p.cdMax[0] * (kit.atkSpeedMul?.(this, p) ?? 1);
      p.lastCombatT = this.time;
      kit.basic(this, p, a);
    }
    if (b & BTN_Q) {
      if (qMax > 1) {
        if (p.qCharges > 0 && p.qLock <= 0) {
          if (p.qCharges === qMax) p.cd[1] = p.cdMax[1];
          p.qCharges--;
          p.qLock = BAL.werewolf.chargeLock;
          kit.ability(this, p, 0, a);
        }
      } else if (p.cd[1] <= 0) {
        p.cd[1] = p.cdMax[1];
        kit.ability(this, p, 0, a);
      }
    }
    if (b & BTN_E && p.cd[2] <= 0) {
      p.cd[2] = p.cdMax[2];
      kit.ability(this, p, 1, a);
    }
    if (b & BTN_R && p.tier >= 2 && p.ult >= ULT.max && p.ultT <= 0) {
      if (kit.ult(this, p, a)) { p.ult = 0; this.sfx('ult', p.x, p.y); }
    }
  }

  /** Aplica daño y devuelve el daño efectivo. */
  damage(m: Mob, amount: number, src: Source, crit = false): number {
    if (m.dead) return 0;
    // sarcófago: solo Ramsés puede golpearlo, y se cura al hacerlo
    if (m.entombT > 0) {
      if (!src.player || src.player.id !== m.entombBy) return 0;
    }
    if (src.player) amount = KITS[src.player.char].onDealDamage?.(this, src.player, m, amount) ?? amount;
    if (m.vulnT > 0) amount *= m.vulnMul;
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
      p.lastCombatT = this.time;
      // recibir daño rompe la invisibilidad
      if (amount > 0 && (p.invisT > 0 || p.invisKind !== 'none')) {
        p.invisT = 0; p.invisKind = 'none'; p.invisBonus = false; p.reinvisT = 0;
        this.fx('reveal', p.x, p.y, { o: p.id });
      }
    }
    if (m.kind === Kind.Helsing && src.player) (m as Helsing).target = src.player.id;
    amount = Math.max(0, amount);
    if (m.entombT > 0 && src.player && amount > 0) {
      src.player.hp = Math.min(src.player.maxHp, src.player.hp + amount * BAL.mummy.ult.healFrac);
      this.fx('drain', m.x, m.y, { tx: Math.round(src.player.x), ty: Math.round(src.player.y), o: src.player.id, n: 2, c: 'sand' });
    }
    m.hp -= amount;
    this.emit({ e: 'hit', x: Math.round(m.x), y: Math.round(m.y), d: Math.round(amount), t: m.id, crit }, m.x, m.y);
    if (m.hp <= 0) this.kill(m, src);
    else if (this.time >= m.animUntil && m.entombT <= 0) this.setAnim(m, Anim.Hurt, 0.2);
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
      // ¡sorpresa! era un humano disfrazado de la Dama
      if (n.disguiseT > 0 && (!killer || killer.id !== n.disguiseBy)) {
        const dama = this.findPlayerById(n.disguiseBy);
        if (killer) this.surprise(killer, DAMA.ult.surpriseStunPlayer, DAMA.ult.vulnMul);
        else if (src.helsing) this.surprise(src.helsing, DAMA.ult.surpriseStunHelsing, DAMA.ult.vulnMulHelsing);
        if (dama) this.fx('undress', n.x, n.y, { o: -1, s: dama.skin, r: 1 });
      }
      if (killer) {
        this.reward(killer, 12, 10, 1);
        this.chargeUlt(killer, ULT.npc);
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
        this.chargeUlt(killer, ULT.helsing);
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
      v.ultT = 0;
      this.recordBest(v);
      v.conn.profile.stats.deaths++;
      if (killer) {
        this.reward(killer, 40 + Math.round(v.totalXp * 0.25), 50 + Math.round(v.points * 0.25), 5);
        this.chargeUlt(killer, ULT.player);
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
    if (killer) KITS[killer.char].onKill?.(this, killer, m);
    this.emit({ e: 'die', x: Math.round(m.x), y: Math.round(m.y), k: m.kind, c }, m.x, m.y);
  }

  private surprise(m: Mob, stun: number, vuln: number) {
    m.stunT = Math.max(m.stunT, stun);
    m.vulnT = Math.max(m.vulnT, stun);
    m.vulnMul = vuln;
    if (m.kind === Kind.Player) (m as Player).dash = null;
    this.fx('surprise', m.x, m.y, { o: m.id, d: stun });
    this.sfx('surprise', m.x, m.y);
  }

  private chargeUlt(p: Player, amount: number) {
    if (p.tier < 2 || p.ultT > 0) return;
    p.ult = Math.min(ULT.max, p.ult + amount);
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
      this.fx('lvl', p.x, p.y, { o: p.id });
      this.sfx('level', p.x, p.y);
      if (p.level >= 10) this.medal(p, 'level10');
      const tier = tierOf(p.level);
      if (tier > p.tier) {
        p.tier = tier;
        if (tier === 2) p.ult = Math.max(p.ult, ULT.onUnlock);
        KITS[p.char].onTier?.(this, p, tier);
        if (this.qChargesMax(p) > 1) p.qCharges = this.qChargesMax(p);
        this.fx('evolve', p.x, p.y, { o: p.id, n: tier, c: p.char });
        this.sfx('evolve', p.x, p.y);
      }
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
      if (p.dead || p.invisKind !== 'none' || p.entombT > 0) continue;
      const d = dist2(x, y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  private updateNpc(n: Npc, dt: number) {
    n.screamCd = Math.max(0, n.screamCd - dt);
    if (n.disguiseT > 0) { n.disguiseT -= dt; if (n.disguiseT <= 0) { n.disguiseBy = -1; this.fx('disguise', n.x, n.y, { o: n.id, r: -1 }); } }
    if (this.applyStatus(n, dt)) return;
    if (n.stunT > 0 || n.fearT > 0) { n.moving = false; return; }
    n.thinkT -= dt;
    let speed = 55;
    if (n.thinkT <= 0) {
      n.thinkT = 0.25 + Math.random() * 0.2;
      if (n.disguiseT > 0) {
        // disfrazados: pasean con decisión, como haría un jugador
        n.fleeing = false;
        if (Math.random() < 0.12 || dist2(n.x, n.y, n.tx, n.ty) < 900) {
          const a = Math.random() * Math.PI * 2;
          n.tx = n.x + Math.cos(a) * 320; n.ty = n.y + Math.sin(a) * 320;
        }
      } else if (n.panicT > 0) {
        // pánico: carreras sin rumbo y gritos
        n.fleeing = false;
        const a = Math.random() * Math.PI * 2;
        n.tx = n.x + Math.cos(a) * 140; n.ty = n.y + Math.sin(a) * 140;
        if (n.screamCd <= 0 && Math.random() < 0.3) { this.sfx('scream', n.x, n.y); n.screamCd = 2.5; }
      } else {
        const threat = this.visibleMonsterNear(n.x, n.y, 240);
        if (threat) {
          if (!n.fleeing && n.screamCd <= 0) { this.sfx('scream', n.x, n.y); n.screamCd = 4; }
          n.fleeing = true;
          let ax = n.x - threat.x, ay = n.y - threat.y;
          const d = Math.hypot(ax, ay) || 1;
          ax /= d; ay /= d;
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
    }
    if (n.disguiseT > 0) speed = 170;
    else if (n.panicT > 0) speed = 95;
    else if (n.fleeing) speed = 155;
    if (n.slowT > 0) speed *= n.slowMul;
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
  /** Objetivo de Helsing: un jugador o un humano disfrazado de la Dama (¡se dejan engañar!). */
  private helsingTarget(id: number): Mob | null {
    if (id < 0) return null;
    const p = this.findPlayerById(id);
    if (p) return p;
    const n = this.npcs.get(id);
    return n && n.disguiseT > 0 ? n : null;
  }

  private updateHelsing(h: Helsing, dt: number) {
    h.shootCd = Math.max(0, h.shootCd - dt);
    h.meleeCd = Math.max(0, h.meleeCd - dt);
    if (this.applyStatus(h, dt)) return;
    if (h.stunT > 0 || h.fearT > 0) { h.moving = false; return; }

    h.thinkT -= dt;
    if (h.thinkT <= 0) {
      h.thinkT = 0.5;
      let t = this.helsingTarget(h.target);
      if (t && (t.dead || t.entombT > 0 || dist2(h.x, h.y, t.x, t.y) > 650 ** 2)) t = null;
      if (t && t.kind === Kind.Player && ((t as Player).invisKind !== 'none' || (t as Player).mistT > 0)) t = null;
      if (!t) {
        let bd = Infinity;
        for (const p of this.players.values()) {
          if (p.dead || p.invisKind !== 'none' || p.protectT > 0 || p.entombT > 0) continue;
          const range = p.id === this.bountyId ? 700 : 460;
          const d = dist2(h.x, h.y, p.x, p.y);
          if (d < range * range && d < bd && this.grid.lineOfSight(h.x, h.y, p.x, p.y)) { bd = d; t = p; }
        }
        for (const n of this.npcs.values()) {
          if (n.disguiseT <= 0) continue;
          const d = dist2(h.x, h.y, n.x, n.y);
          if (d < 460 * 460 && d < bd && this.grid.lineOfSight(h.x, h.y, n.x, n.y)) { bd = d; t = n; }
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

    const t = this.helsingTarget(h.target);
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
        let vx = 0, vy = 0;
        if (t.kind === Kind.Player) { const tp = t as Player; const s = this.calcSpeed(tp); vx = tp.input.mx * s; vy = tp.input.my * s; }
        const a = Math.atan2(t.y + vy * tt - h.y, t.x + vx * tt - h.x) + (Math.random() - 0.5) * 0.12;
        const pr = this.shoot('bolt', -1, h.x, h.y, a, 640, 1.0, 26);
        pr.hOwner = h.id;
        this.setAnim(h, Anim.Attack, 0.3);
        this.sfx('bolt', h.x, h.y);
      }
    } else {
      const dx = h.tx - h.x, dy = h.ty - h.y;
      const d = Math.hypot(dx, dy);
      if (d > 8) { mx = dx / d; my = dy / d; h.facing = dx >= 0 ? 1 : -1; }
    }
    if (h.slowT > 0) speed *= h.slowMul;
    h.moving = mx !== 0 || my !== 0;
    if (h.moving) {
      const res = this.grid.move(h.x, h.y, mx * speed * dt, my * speed * dt, h.r);
      if (res.hit && !t) { h.tx = h.x; h.ty = h.y; }
      if (res.hit && t) h.strafe *= -1;
      h.x = res.x; h.y = res.y;
    }
  }

  findPlayerById(id: number): Player | null {
    if (id < 0) return null;
    for (const p of this.players.values()) if (p.id === id) return p;
    return null;
  }

  // ------------------------------------------------------------------ proyectiles, zonas y recogidas
  private updateProjectiles(dt: number) {
    for (const pr of this.projectiles.values()) {
      pr.life -= dt;
      let done = pr.life <= 0;
      const steps = 2;
      for (let s = 0; s < steps && !done; s++) {
        pr.x += (pr.vx * dt) / steps;
        pr.y += (pr.vy * dt) / steps;
        if (!pr.ghost && this.grid.blocked(pr.x, pr.y, 3, true)) { done = true; break; }
        // bloqueos (murciélagos orbitales, etc.)
        for (const p of this.players.values()) {
          if (p.dead || p.id === pr.owner || dist2(pr.x, pr.y, p.x, p.y) > 80 * 80) continue;
          if (KITS[p.char].blockProjectile?.(this, p, pr)) { done = true; break; }
        }
        if (done) break;
        if (pr.owner === -1) {
          // virote de Helsing: daña a monstruos (y a humanos disfrazados de la Dama)
          const helsing = pr.hOwner !== undefined ? this.helsings.get(pr.hOwner) : undefined;
          const src: Source = { helsing, name: 'Helsing', kind: Kind.Helsing };
          for (const p of this.players.values()) {
            if (p.dead || dist2(pr.x, pr.y, p.x, p.y) > (p.r + 6) ** 2) continue;
            this.damage(p, pr.dmg, src);
            done = true;
            break;
          }
          if (!done) for (const n of this.npcs.values()) {
            if (n.disguiseT <= 0 || dist2(pr.x, pr.y, n.x, n.y) > (n.r + 6) ** 2) continue;
            this.damage(n, pr.dmg, src);
            done = true;
            break;
          }
        } else {
          const owner = this.findPlayerById(pr.owner);
          const hitR = pr.hitR ?? 8;
          const tryHit = (m: Mob) => {
            if (done || m.dead || dist2(pr.x, pr.y, m.x, m.y) > (m.r + hitR) ** 2) return;
            if (pr.hitSet?.has(m.id)) return;
            if (m.kind === Kind.Player && ((m as Player).protectT > 0 || (m as Player).mistT > 0)) return;
            const dealt = this.damage(m, pr.dmg, owner ? this.src(owner) : { name: '???', kind: Kind.Player });
            if (owner && !owner.dead) KITS[owner.char].onProjectileHit?.(this, owner, pr, m, dealt);
            if (pr.pierce) pr.hitSet?.add(m.id);
            else done = true;
          };
          for (const n of this.npcs.values()) tryHit(n);
          for (const h of this.helsings.values()) tryHit(h);
          for (const p of this.players.values()) if (p.id !== pr.owner) tryHit(p);
        }
      }
      if (done) this.projectiles.delete(pr.id);
    }
  }

  private updateZones() {
    if (!this.zones.length) return;
    this.zones = this.zones.filter((z) => z.until > this.time);
    for (const z of this.zones) {
      const owner = this.findPlayerById(z.owner);
      const inside = (m: Mob) => distToSegment(m.x, m.y, z.ax, z.ay, z.bx, z.by) < z.w / 2 + m.r;
      const B = BAL.vampire;
      for (const n of this.npcs.values()) if (inside(n)) this.slow(n, B.mistTrailSlowT, B.mistTrailSlow);
      for (const h of this.helsings.values()) if (inside(h)) this.slow(h, B.mistTrailSlowT, B.mistTrailSlow);
      for (const p of this.players.values()) if (p !== owner && !p.dead && inside(p)) this.slow(p, B.mistTrailSlowT, B.mistTrailSlow);
    }
  }

  private updatePickups() {
    for (const p of this.players.values()) {
      if (p.dead || p.entombT > 0) continue;
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
    if (m.panicT > 0) f |= Flag.Panic;
    if (m.vulnT > 0) f |= Flag.Vulnerable;
    if (m.preyT > 0) f |= Flag.Prey;
    if (m.curseMarkT > 0) f |= Flag.Cursed;
    if (m.entombT > 0) f |= Flag.Entombed;
    if (m.kind === Kind.Player) {
      const p = m as Player;
      if (p.invisKind !== 'none') f |= Flag.Invisible;
      if (p.shieldHp > 0) f |= Flag.Shield;
      if (p.furyT > 0 || p.howlT > 0) f |= Flag.Buffed;
      if (p.protectT > 0) f |= Flag.Protected;
      if (p.mistT > 0) f |= Flag.Mist;
      if (p.id === this.bountyId) f |= Flag.Bounty;
      if (p.ultT > 0) f |= Flag.Ult;
      if (p.frenzyT > 0 || p.killSpeedT > 0) f |= Flag.Haste;
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
    if (m.kind === Kind.Npc) {
      const n = m as Npc;
      s.c = n.variant;
      // Todos somos la Dama: se envía EXACTAMENTE como si fuera ella (sin pistas para los clientes)
      const dama = n.disguiseT > 0 ? this.findPlayerById(n.disguiseBy) : null;
      if (dama && !dama.dead) {
        s.k = Kind.Player; s.c = dama.char; s.s = dama.skin; s.n = dama.name; s.l = dama.level;
        s.h = s.h ?? 100;
        if (s.fl) s.fl &= ~(Flag.Feared | Flag.Panic);
      }
    } else if (m.kind === Kind.Helsing) s.c = 'helsing';
    else {
      const p = m as Player;
      s.c = p.char; s.s = p.skin; s.n = p.name; s.l = p.level;
      if (s.h === undefined) s.h = 100;
      if (p.orbit.length) s.o = p.orbit.filter((t) => t <= 0).length;
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
        if (p !== me && p.invisKind !== 'none') {
          // desvestida: invisible del todo; en el resto se intuye solo muy de cerca
          if (p.invisKind === 'full' || dist2(cx, cy, p.x, p.y) > DAMA.revealR ** 2) continue;
        }
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
      const addB = (t: string, r: number) => { if (r > 0) buffs.push({ t, r: +Math.min(r, 999).toFixed(1) }); };
      addB('speed', me.speedT); addB('fury', me.furyT); addB('howl', me.howlT); addB('shield', me.shieldT);
      addB(me.invisKind === 'auto' ? 'invisAuto' : 'invis', me.invisKind !== 'none' ? Math.max(me.invisT, 0.1) : 0);
      addB('protect', me.protectT); addB('slow', me.slowT); addB('stun', me.stunT);
      addB('frenzy', me.frenzyT); addB('haste', me.killSpeedT); addB('vuln', me.vulnT); addB('tomb', me.entombT);

      const qMax = this.qChargesMax(me);
      const you: YouState = {
        id: me.id, alive: !me.dead, x: +me.x.toFixed(1), y: +me.y.toFixed(1), ack: me.ack,
        spd: Math.round(this.calcSpeed(me)), st: me.stunT > 0 || !!me.knock || !!me.dash || me.entombT > 0,
        hp: Math.ceil(me.hp), mhp: me.maxHp, xp: Math.round(me.xp), xpn: xpForLevel(me.level), lvl: me.level,
        pts: Math.round(me.points), coins: me.coinsEarned,
        cd: [+me.cd[0].toFixed(2), +me.cd[1].toFixed(2), +me.cd[2].toFixed(2)],
        cdm: [+(me.cdMax[0] * (KITS[me.char].atkSpeedMul?.(this, me) ?? 1)).toFixed(2), +me.cdMax[1].toFixed(2), +me.cdMax[2].toFixed(2)],
        up: me.upPts, ups: me.ups, kills: me.lifeKills, buffs,
        tier: me.tier, ult: Math.round(me.ult), ultOn: +me.ultT.toFixed(1),
      };
      if (qMax > 1) { you.qc = me.qCharges; you.qcm = qMax; }
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
