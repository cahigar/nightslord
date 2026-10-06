// Una sala de juego: simulación autoritativa con su propio bucle de ticks.
// Los jugadores entran y salen en cualquier momento sin reiniciar la partida.
// Las habilidades de cada monstruo viven en server/kits; aquí están los sistemas genéricos
// (movimiento, estados, proyectiles, zonas, recompensas, evolución, red).
import { BAL, CLASS, CRITTERS, HUNTERS, ITEMS, ORDER, STATUS, tierOf, ULT, type HunterType } from '../shared/balance';
import {
  BTN_ATTACK, BTN_E, BTN_Q, BTN_R, HUNTER_RADIUS, MAP_SIZE, MAX_PLAYERS_PER_ROOM, NPC_RADIUS, PLAYER_RADIUS,
  POWERUP_RADIUS, RANK_EVERY, RESPAWN_POINT_KEEP, SNAPSHOT_EVERY, SPAWN_PROTECTION, TICK_DT, TICK_RATE, VIEW_RADIUS,
} from '../shared/constants';
import { CHARACTERS, MAX_LEVEL, UPGRADES, upgradeMax, xpForLevel, type CharacterId, type UpgradeId } from '../shared/characters';
import { distToSegment, generateMap, NPC_VARIANTS, tvLinks, tvSpot, type GameMap, type MapThemeId } from '../shared/maps';
import { ObstacleGrid } from '../shared/physics';
import {
  Anim, Flag, Flag2, Kind, type EntSnap, type FxId, type GameEvent, type PowerUpType, type ProjectileType, type ServerMsg, type SfxId, type TvState, type YouState,
} from '../shared/protocol';
import { mobStatus, type Hunter, type Minion, type MinionVariant, type Mob, type Npc, type Player, type PowerUp, type Projectile, type Source, type Zone, type ZoneKind } from './entities';
import { createHash } from 'node:crypto';
import { KITS } from './kits';

/** Huella anónima de un perfil (nunca se envía el token de otro jugador). */
const profileTag = (token: string) => createHash('sha256').update(token).digest('hex').slice(0, 16);
import { store } from './store';
import type { Conn } from './types';

/** Alimañas de cada mapa (bichos que huyen y siempre sueltan un objeto). */
const CRITTER_KINDS: Record<MapThemeId, string[]> = {
  elm: ['c_rat', 'c_crow', 'c_rat'],
  transylvania: ['c_bat', 'c_rat', 'c_crow', 'c_bat'],
  camp: ['c_toad', 'c_bat', 'c_crow'],
  swamp: ['c_toad', 'c_bat', 'c_rat', 'c_toad'],
};
/** ¿Es una alimaña? */
export const isCritter = (m: Mob) => m.kind === Kind.Npc && (m as Npc).variant.startsWith('c_');
/** Clase de un jugador (vida, armadura, regeneración, robo de vida). */
const classOf = (p: Player) => CLASS[p.def.role ?? 'hybrid'];

const TR = BAL.tree;
const plant = (hp: number) => ({ hp, speed: 0, dmg: 0, cd: 0 }); // plantas del Árbol maldito: no se mueven
const MINION_STATS: Record<MinionVariant, { hp: number; speed: number; dmg: number; cd: number }> = {
  ...BAL.zombie.minion, clone: STATUS.clone, thrall: BAL.succubus.thrall,
  wall: plant(TR.wall.hp), turret: plant(TR.turret.hp), flower: plant(TR.flower.hp),
  digger: ITEMS.digger,
  barrel: plant(1), buccaneer: BAL.pirate.buccaneer, spiderling: BAL.spider.spiderling,
  decoy: plant(BAL.scarecrow.decoy.hp), slimelet: BAL.slime.slimelet, beacon: plant(BAL.alien.beacon.hp),
  skel: BAL.necro.skel, skelarcher: BAL.necro.archer, skeldog: BAL.necro.dog, unit: BAL.unit.drone, unitfree: BAL.unit.freeDrone,
};
/** Radio de los esbirros que no tienen el de un humano. */
const MINION_R: Partial<Record<MinionVariant, number>> = { wall: TR.wall.r, turret: TR.turret.r, flower: TR.flower.r, barrel: 14, spiderling: 9, slimelet: 12, beacon: 12, decoy: PLAYER_RADIUS, fat: 18, tough: 16, skeldog: 12 };
/** Esbirros con su propio tope (no cuentan con la horda de zombis). */
const OWN_GROUP = new Set<MinionVariant>(['clone', 'digger', 'wall', 'turret', 'flower', 'barrel', 'buccaneer', 'spiderling', 'decoy', 'slimelet', 'beacon', 'skel', 'skelarcher', 'skeldog', 'unit', 'unitfree']);
/** Grupo con tope común (los tres tipos de esqueleto comparten tope). */
const capGroup = (v: MinionVariant) => (v === 'skel' || v === 'skelarcher' || v === 'skeldog' ? 'skel' : OWN_GROUP.has(v) ? v : 'horde');
/** Esbirro inmóvil (planta): no le afectan empujones, rabia, engatusar ni maleficios. */
const isStatic = (m: Mob) => m.kind === Kind.Minion && MINION_STATS[(m as Minion).variant].speed === 0;

const POWERUP_WEIGHTS: [PowerUpType, number][] = [
  ['blood', 30], ['xp', 25], ['coin', 18], ['speed', 10], ['fury', 9], ['shield', 8], ['spirits', 5], ['boots', 5], ['shovel', 3],
];
/** Vegetación del mapa que puede arder. */
const FLAMMABLE = new Set(['tree', 'pine', 'deadtree', 'hedge', 'cypress']);

const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;
const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const DAMA = BAL.invisible;
const ZB = BAL.zombie;
const KT = BAL.kthula;
const isAquatic = (m: Mob) => m.kind === Kind.Player && !!(m as Player).def.aquatic;
/** Puede pisar agua profunda: los acuáticos y los que levitan (Poltergeist). */
const walksWater = (m: Mob) => m.kind === Kind.Player && (!!(m as Player).def.aquatic || !!(m as Player).def.hover || !!KITS[(m as Player).char].walksWater?.(m as Player));
const fireImmune = (m: Mob) => m.kind === Kind.Player && !!(m as Player).def.fireImmune;

// ---------------------------------------------------------------------------
export class Room {
  readonly map: GameMap;
  readonly grid: ObstacleGrid;
  readonly seed: number;
  players = new Map<number, Player>(); // por conn.id
  npcs = new Map<number, Npc>();
  hunters = new Map<number, Hunter>();
  powerups = new Map<number, PowerUp>();
  projectiles = new Map<number, Projectile>();
  minions = new Map<number, Minion>();
  private timers: { at: number; fn: () => void }[] = [];
  zones: Zone[] = [];
  /** Árboles del mapa quemados: índice del obstáculo → hasta cuándo sigue quemado / ardiendo y quién lo prendió. */
  burning = new Map<number, { until: number; flame: number; by: number }>();
  /** Teles (Interferencia): visibles si hay alguna en la sala, con Cambio de canal (id → hasta / dueño) y Emisión nacional. */
  tvOn = false;
  tvChannel = new Map<number, { until: number; owner: number }>();
  broadcast: { until: number; owner: number; color: string } | null = null;
  private tvLinksCache: [number, number][] | null = null;
  get tvLinks() { return (this.tvLinksCache ??= tvLinks(this.map.tvs)); }
  tvSpots() { return this.map.tvs.map(tvSpot); }
  conns = new Map<number, Conn>();

  private nextId = 1;
  private tick = 0;
  time = 0;
  private events: { ev: GameEvent; x: number; y: number; global?: boolean }[] = [];
  private loop: NodeJS.Timeout;
  private hunterRespawnT = 0;
  private powerupRespawnT = 0;
  emptySince = Date.now();
  private critterT = 2;
  bountyId = -1;

  constructor(public code: string, public theme: MapThemeId, public priv: boolean, private onPlayerCountChange?: () => void) {
    this.seed = (Math.random() * 2 ** 31) >>> 0;
    this.map = generateMap(theme, this.seed);
    this.grid = new ObstacleGrid(this.map);
    for (let i = 0; i < 45; i++) this.spawnNpc();
    for (let i = 0; i < 4; i++) this.spawnHunter('cazador');
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
    if (conn.profile.stats.games >= 10) store.award(conn.profile, 'games10');
    if (conn.profile.stats.games >= 50) store.award(conn.profile, 'games50');
    store.touch();
    const p = this.spawnPlayer(conn, char, skin);
    conn.send({ t: 'joined', code: this.code, theme: this.theme, seed: this.seed, priv: this.priv, you: p.id });
    this.sendRank();
    this.onPlayerCountChange?.();
  }

  removeConn(conn: Conn) {
    const p = this.players.get(conn.id);
    if (p) { this.recordBest(p); this.releaseMinions(p.id); for (const o of this.players.values()) o.allies.delete(p.id); }
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
      input: { mx: 0, my: 0, a: 0, b: 0, d: 200 }, queue: [], ack: prev?.ack ?? 0,
      speedT: 0, furyT: 0, howlT: 0, shieldHp: 0, shieldT: 0, invisT: 0, invisKind: 'none', invisBonus: false, mistT: 0,
      protectT: SPAWN_PROTECTION, dash: null,
      ult: 0, ultT: 0, ultExt: 0, qCharges: 1, qLock: 0, orbit: [], lastCombatT: this.time, reinvisT: 0,
      frenzyT: 0, killSpeedT: 0, hits: new Map(), lastAtkFromInvis: false, stepT: 0,
      submergeT: 0, lastHurtT: -99, spillT: 0, meatId: -1, jetT: 0, jetTick: 0, stillT: 0, growZone: -1, summonedAt: -999, guise: null, flyT: 0, phaseT: 0, leap: null, spiritsT: 0, spiritCd: 0, bootsT: 0, bootsKind: 0, bootsAcc: 0, k: {},
      lifeStart: this.time, lifeKills: 0, diedAt: 0, waved: prev?.waved ?? false, taunted: prev?.taunted ?? false,
      lastAttacker: '', allies: new Set(),
    };
    p.maxHp = p.hp = this.calcMaxHp(p);
    this.players.set(conn.id, p);
    return p;
  }

  // ------------------------------------------------------------------ entradas
  onInput(conn: Conn, m: { q: number; mx: number; my: number; a: number; b: number; d?: number }) {
    const p = this.players.get(conn.id);
    if (!p) return;
    const len = Math.hypot(m.mx, m.my);
    const mx = len > 1 ? m.mx / len : m.mx || 0;
    const my = len > 1 ? m.my / len : m.my || 0;
    p.queue.push({ q: m.q | 0, mx, my, a: +m.a || 0, b: m.b | 0, d: Math.max(0, Math.min(1200, +(m.d ?? 200) || 0)) });
    if (p.queue.length > 6) p.queue.splice(0, p.queue.length - 3);
  }

  /** Peticiones de alianza pendientes: quién → a quién y hasta cuándo. */
  private allyAsk = new Map<number, { to: number; until: number }>();

  onEmote(conn: Conn, e: 'wave' | 'taunt' | 'ally') {
    const p = this.players.get(conn.id);
    if (!p || p.dead || this.time < p.animUntil || p.entombT > 0) return;
    if (e === 'ally') { this.askAlliance(p); return; }
    if (e === 'wave') { this.setAnim(p, Anim.Wave, 1.2); p.waved = true; this.sfx('wave', p.x, p.y); }
    else { this.setAnim(p, Anim.Taunt, 1.6); p.taunted = true; this.sfx('taunt', p.x, p.y); }
    if (p.waved && p.taunted) this.medal(p, 'social');
  }

  /** H: pide alianza al monstruo más cercano; si él ya te la había pedido (o responde con H), sale confeti.
   *  La alianza no cambia nada del juego: es solo entre ellos... y se puede traicionar. */
  private askAlliance(p: Player) {
    let best: Player | null = null, bd = 260 ** 2;
    for (const o of this.players.values()) {
      if (o === p || o.dead) continue;
      const d = dist2(p.x, p.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    this.setAnim(p, Anim.Wave, 0.8);
    if (!best) return;
    const o = best as Player;
    const theirs = this.allyAsk.get(o.id);
    if (theirs && theirs.to === p.id && theirs.until > this.time) {
      this.allyAsk.delete(o.id);
      p.allies.add(o.id); o.allies.add(p.id);
      this.fx('confetti', (p.x + o.x) / 2, (p.y + o.y) / 2, { o: p.id, tx: Math.round(o.x), ty: Math.round(o.y) });
      this.sfx('level', p.x, p.y);
      this.medal(p, 'ally'); this.medal(o, 'ally');
      return;
    }
    this.allyAsk.set(p.id, { to: o.id, until: this.time + 8 });
    this.fx('allyAsk', p.x, p.y, { o: p.id, tx: Math.round(o.x), ty: Math.round(o.y) });
    o.conn.send({ t: 'toast', text: `🤝 ${p.name} te ofrece una alianza: pulsa H para aceptar.`, k: 'allyOffer', a: { n: p.name } });
  }

  onUpgrade(conn: Conn, u: UpgradeId) {
    const p = this.players.get(conn.id);
    const def = UPGRADES.find((x) => x.id === u);
    if (!p || p.dead || !def || p.upPts <= 0 || p.ups[u] >= upgradeMax(def, p.level)) return;
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
  onCheat(conn: Conn, lvl?: number, ult?: boolean, tp?: [number, number], heal = false) {
    const p = this.players.get(conn.id);
    if (!p || p.dead) return;
    if (heal) p.hp = p.maxHp;
    if (tp && !this.grid.blocked(+tp[0], +tp[1], p.r, walksWater(p))) { p.x = +tp[0]; p.y = +tp[1]; }
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
    if (m.entombT > 0 || isStatic(m)) return;
    const t = 0.2;
    m.knock = { vx: (dx * dist) / t, vy: (dy * dist) / t, t };
  }

  shoot(type: ProjectileType, owner: number, x: number, y: number, a: number, speed: number, life: number, dmg: number): Projectile {
    const pr: Projectile = { id: this.nextId++, type, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, owner, dmg };
    this.projectiles.set(pr.id, pr);
    return pr;
  }

  /** Añade una zona. Las charcas tienen un máximo por dueño (se elimina la más antigua). */
  addZone(z: Omit<Zone, 'id' | 'born'>) {
    const zone: Zone = { ...z, id: this.nextId++, born: this.time };
    this.zones.push(zone);
    if (z.kind === 'puddle') {
      const mine = this.zones.filter((o) => o.kind === 'puddle' && o.owner === z.owner);
      if (mine.length > KT.maxPuddles) { const old = mine[0]; this.zones = this.zones.filter((o) => o !== old); }
    }
    return zone;
  }

  /** Charca circular (agua poco profunda). */
  puddle(owner: number, x: number, y: number, r: number, t: number) {
    if (this.grid.deepWater(x, y)) return null; // en agua profunda no hace falta
    return this.addZone({ kind: 'puddle', ax: x, ay: y, bx: x, by: y, w: r * 2, until: this.time + t, owner });
  }

  /** Agua bajo un punto: 'deep' (lagos, ríos, piscinas), 'shallow' (charcas de cualquier criatura) o null. */
  waterAt(x: number, y: number): 'deep' | 'shallow' | null {
    if (this.grid.deepWater(x, y)) return 'deep';
    for (const z of this.zones) if ((z.kind === 'puddle' || z.kind === 'whirl') && (x - z.ax) ** 2 + (y - z.ay) ** 2 < (z.w / 2) ** 2) return 'shallow'; // el remolino del Kappa también es agua
    return null;
  }

  // ------------------------------------------------------------------ estados reutilizables (sueño, sangrado, rabia, engatusar)
  /** Suma somnolencia; al llenarse, el objetivo se duerme un rato. */
  addDrowsy(m: Mob, amount: number, by: Player, susceptMul = 1) {
    if (m.dead || m.sleepT > 0 || m.entombT > 0) return;
    if (m.kind === Kind.Player && ((m as Player).protectT > 0 || (m as Player).submergeT > 0 || (m as Player).phaseT > 0)) return;
    if (m.sleepMarkT > 0) amount *= susceptMul;
    m.drowsy += amount;
    m.drowsyHold = STATUS.drowsyHold;
    if (m.drowsy >= 100) {
      m.drowsy = 0;
      m.sleepT = m.kind === Kind.Player ? STATUS.sleepPlayer : STATUS.sleepOther;
      m.stunT = Math.max(m.stunT, m.sleepT);
      m.sleepMarkT = STATUS.sleepMarkT;
      this.fx('sleep', m.x, m.y, { o: m.id, d: m.sleepT });
      this.sfx('lullaby', m.x, m.y);
      KITS[by.char].onSleep?.(this, by, m);
    }
  }

  bleed(m: Mob, t: number, dps: number, by: Player) {
    if (m.dead) return;
    m.bleedT = Math.max(m.bleedT, t); m.bleedDps = Math.max(m.bleedT > t ? m.bleedDps : 0, dps); m.bleedBy = by.id;
  }

  /** Rabia: ataca a lo más cercano. spare = nunca a quien la lanzó (la poción de la bruja sí puede volverse contra ella). */
  rage(m: Mob, t: number, by: Player, spare = true) {
    if (m.dead || m === by || m.entombT > 0 || m.hexT > 0 || isStatic(m)) return;
    m.rageT = Math.max(m.rageT, t); m.rageBy = by.id; m.rageSafe = spare;
    if (m.kind === Kind.Npc) { (m as Npc).fleeing = false; m.panicT = 0; m.fearT = 0; }
  }

  /** Quemadura: daño continuo (los inmunes al fuego no arden). Devuelve true si ya estaba ardiendo. */
  burn(m: Mob, t: number, dps: number, by: Player | null): boolean {
    if (m.dead || fireImmune(m)) return false;
    const was = m.burnT > 0;
    m.burnDps = was ? Math.max(m.burnDps, dps) : dps;
    m.burnT = Math.max(m.burnT, t); m.burnBy = by ? by.id : -1;
    return was;
  }

  silence(m: Mob, t: number) { if (!m.dead) m.silenceT = Math.max(m.silenceT, t); }
  blind(m: Mob, t: number) { if (!m.dead) { m.blindT = Math.max(m.blindT, t); if (m.kind === Kind.Hunter) (m as Hunter).target = -1; } }

  /** Abducción: lo levanta un haz (indefenso) durante t segundos. */
  lift(m: Mob, t: number) {
    if (m.dead || m.entombT > 0 || isStatic(m)) return;
    if (m.kind === Kind.Player && ((m as Player).protectT > 0 || (m as Player).submergeT > 0 || (m as Player).phaseT > 0)) return;
    m.liftT = Math.max(m.liftT, t); m.stunT = Math.max(m.stunT, t); m.knock = null;
    if (m.kind === Kind.Player) (m as Player).dash = null;
  }

  /** Miedo: huye de (x, y) durante t segundos. */
  scare(m: Mob, t: number, x: number, y: number) {
    if (m.dead || m.entombT > 0 || isStatic(m)) return;
    if (m.kind === Kind.Player && ((m as Player).protectT > 0 || (m as Player).submergeT > 0)) return;
    if (m.kind === Kind.Hunter && (m as Hunter).type === 'heraldo') return; // el heraldo no conoce el miedo
    m.fearT = Math.max(m.fearT, t); m.fearX = x; m.fearY = y;
    if (m.kind === Kind.Npc) { (m as Npc).fleeing = true; }
  }

  /** Huida de quien está aterrorizado con origen conocido. Devuelve true si se ha encargado del movimiento. */
  private flee(m: Mob, speed: number, dt: number): boolean {
    if (m.fearT <= 0 || Number.isNaN(m.fearX)) return false;
    let dx = m.x - m.fearX, dy = m.y - m.fearY;
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const sp = m.rootT > 0 ? 0 : speed * (m.slowT > 0 ? m.slowMul : 1);
    const res = this.grid.move(m.x, m.y, dx * sp * dt, dy * sp * dt, m.r, walksWater(m));
    m.x = res.x; m.y = res.y; m.moving = sp > 0; m.facing = dx >= 0 ? 1 : -1;
    return true;
  }

  /** Salta por encima de todo hasta (tx, ty) en t segundos (aterriza siempre en un sitio libre). */
  leapTo(p: Player, tx: number, ty: number, t: number) {
    tx = Math.max(p.r, Math.min(MAP_SIZE - p.r, tx)); ty = Math.max(p.r, Math.min(MAP_SIZE - p.r, ty));
    p.leap = { sx: p.x, sy: p.y, tx, ty, t: 0, T: t };
    p.dash = null; p.knock = null;
  }

  /** Hipnosis: se acumula; al llenarse camina hacia la Interferencia o la tele encendida más cercana. */
  addHypno(m: Mob, amount: number) {
    if (m.dead || m.hypnoT > 0 || m.entombT > 0 || isStatic(m)) return;
    if (m.kind === Kind.Player && ((m as Player).protectT > 0 || (m as Player).submergeT > 0 || (m as Player).phaseT > 0 || (m as Player).char === 'static')) return;
    m.hypno += amount; m.hypnoHold = STATUS.hypno.hold;
    if (m.hypno < 100) return;
    m.hypno = 0;
    let best: { x: number; y: number } | null = null, bd = STATUS.hypno.pullR ** 2;
    const consider = (x: number, y: number) => { const d = (x - m.x) ** 2 + (y - m.y) ** 2; if (d < bd) { bd = d; best = { x, y }; } };
    for (const p of this.players.values()) if (!p.dead && p.char === 'static' && p !== m) consider(p.x, p.y);
    if (this.tvOn) for (const s of this.tvSpots()) consider(s.x, s.y);
    if (!best) return;
    const b = best as { x: number; y: number };
    m.hypnoT = m.kind === Kind.Player ? STATUS.hypno.tPlayer : STATUS.hypno.tOther; m.hypnoX = b.x; m.hypnoY = b.y;
    this.fx('hypno', m.x, m.y, { o: m.id, d: m.hypnoT });
  }

  /** Movimiento del hipnotizado hacia su punto. Devuelve true si se ha encargado. */
  private hypnoWalk(m: Mob, dt: number): boolean {
    if (m.hypnoT <= 0) return false;
    const dx = m.hypnoX - m.x, dy = m.hypnoY - m.y, d = Math.hypot(dx, dy);
    if (d > 30 && m.rootT <= 0) {
      const res = this.grid.move(m.x, m.y, (dx / d) * STATUS.hypno.speed * dt, (dy / d) * STATUS.hypno.speed * dt, m.r, walksWater(m));
      m.x = res.x; m.y = res.y; m.moving = true; m.facing = dx >= 0 ? 1 : -1;
    } else m.moving = false;
    return true;
  }

  /** Suelta un objeto del mapa en un punto (botín). */
  dropPowerUp(x: number, y: number, type: PowerUpType) {
    const f = this.findFreeSpot(x, y, POWERUP_RADIUS);
    const u: PowerUp = { id: this.nextId++, x: f.x, y: f.y, type };
    this.powerups.set(u.id, u);
  }

  /** Prende la vegetación del mapa que toque el círculo (x, y, r). */
  ignite(x: number, y: number, r: number, by: number) {
    const obs = this.map.obstacles;
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      if (!FLAMMABLE.has(o.type)) continue;
      const cx = Math.max(o.x, Math.min(o.x + o.w, x)), cy = Math.max(o.y, Math.min(o.y + o.h, y));
      if ((cx - x) ** 2 + (cy - y) ** 2 > r * r) continue;
      const b = this.burning.get(i);
      if (b && b.until > this.time) continue; // ya quemado: no vuelve a arder hasta que se recupere
      this.burning.set(i, { until: this.time + STATUS.treeBurnT, flame: this.time + STATUS.treeFlameT, by });
      this.fx('treeFire', o.x + o.w / 2, o.y + o.h / 2, { r: Math.max(o.w, o.h) / 2 });
      this.sfx('explode', o.x + o.w / 2, o.y + o.h / 2);
    }
  }

  /** Árboles en llamas: dañan alrededor a quien no sea inmune al fuego. */
  private updateBurningTrees(dt: number) {
    if (!this.burning.size) return;
    const obs = this.map.obstacles, R = STATUS.treeFireR;
    for (const [i, b] of this.burning) {
      if (b.until <= this.time) { this.burning.delete(i); continue; }
      if (b.flame <= this.time) continue;
      const o = obs[i];
      const by = this.findPlayerById(b.by);
      const hit = (m: Mob) => {
        if (m.dead || fireImmune(m) || m.x < o.x - R || m.x > o.x + o.w + R || m.y < o.y - R || m.y > o.y + o.h + R) return;
        const src: Source = by && by !== m ? { ...this.src(by), raw: true } : { name: 'un incendio', kind: Kind.Player, raw: true };
        this.damage(m, STATUS.treeFireDps * dt, src, false, true);
      };
      for (const n of this.npcs.values()) hit(n);
      for (const h of this.hunters.values()) hit(h);
      for (const m of this.minions.values()) hit(m);
      for (const p of this.players.values()) if (!p.dead && p.flyT <= 0 && p.phaseT <= 0) hit(p);
    }
  }

  /** Ataque eléctrico: si cae cerca del agua, electrocuta a todos los que estén en ella alrededor. */
  electrify(x: number, y: number, by: Player) {
    const near = [[0, 0], [60, 0], [-60, 0], [0, 50], [0, -50]].some(([dx, dy]) => this.waterAt(x + dx, y + dy));
    if (!near) return;
    const S = STATUS.shock;
    this.fx('shock', x, y, { r: S.r, o: by.id });
    this.sfx('zap', x, y);
    this.forEachEnemyNear(by, x, y, S.r, (m) => {
      if (m.dead || !this.waterAt(m.x, m.y)) return;
      if (m.kind === Kind.Player && ((m as Player).flyT > 0 || (m as Player).leap)) return; // por el aire no le llega
      m.stunT = Math.max(m.stunT, m.kind === Kind.Player ? S.stunPlayer : S.stun);
      this.damage(m, S.dmg, { ...this.src(by), raw: true });
      this.fx('spark', m.x, m.y, { r: 30, o: by.id });
    });
  }

  /** Enreda: no puede moverse durante t segundos (sí atacar). */
  root(m: Mob, t: number) {
    if (m.dead || m.entombT > 0 || isStatic(m)) return;
    if (m.kind === Kind.Player) {
      const p = m as Player;
      if (p.protectT > 0 || p.submergeT > 0 || p.flyT > 0 || p.phaseT > 0) return;
      p.dash = null;
    }
    if (m.kind === Kind.Hunter && (m as Hunter).type === 'heraldo') t *= ORDER.herald.stunMul;
    if (m.rootT <= 0) this.fx('rooted', m.x, m.y, { o: m.id, d: t });
    m.rootT = Math.max(m.rootT, t);
  }

  poison(m: Mob, t: number, dps: number, by: Player) {
    if (m.dead) return;
    m.poisonDps = m.poisonT > 0 ? Math.max(m.poisonDps, dps) : dps;
    m.poisonT = Math.max(m.poisonT, t); m.poisonBy = by.id;
  }

  /** Maleficio: convierte en animalillo (no ataca ni usa habilidades y va dando saltitos). */
  hex(m: Mob, t: number) {
    if (m.dead || m.entombT > 0 || isStatic(m)) return;
    if (m.kind === Kind.Player) {
      const p = m as Player;
      if (p.protectT > 0 || p.submergeT > 0 || p.flyT > 0 || p.phaseT > 0) return;
      p.dash = null; p.jetT = 0;
      if (p.invisKind !== 'none') { p.invisT = 0; p.invisKind = 'none'; p.invisBonus = false; }
    }
    if (m.kind === Kind.Hunter) {
      const h = m as Hunter;
      if (h.flyT > 0) return;
      if (h.type === 'heraldo') t *= 0.5;
      if (h.ritualT > 0) { h.ritualT = 0; this.zones = this.zones.filter((z) => z.id !== h.ritualZone); }
      h.lungeT = 0;
    }
    if (m.hexT <= 0) this.fx('hexed', m.x, m.y, { o: m.id });
    m.hexT = Math.max(m.hexT, t);
    m.rageT = 0; m.charmT = 0;
  }

  /** Saltitos del animalillo (criaturas que no maneja un jugador). Devuelve true si está hechizado. */
  private hexHop(m: Mob, dt: number): boolean {
    if (m.hexT <= 0) return false;
    if (m.rootT > 0) { m.moving = false; return true; }
    if (Math.random() < dt * 1.2 || (m.hexDx === 0 && m.hexDy === 0)) { const a = Math.random() * Math.PI * 2; m.hexDx = Math.cos(a); m.hexDy = Math.sin(a); }
    const sp = 70 * (m.slowT > 0 ? m.slowMul : 1);
    const res = this.grid.move(m.x, m.y, m.hexDx * sp * dt, m.hexDy * sp * dt, m.r);
    if (res.hit) { m.hexDx = -m.hexDx; m.hexDy = -m.hexDy; }
    m.x = res.x; m.y = res.y; m.moving = true;
    m.facing = m.hexDx >= 0 ? 1 : -1;
    return true;
  }

  charm(m: Mob, t: number, by: Player) {
    if (m.dead || m === by || m.entombT > 0 || m.hexT > 0 || isStatic(m)) return;
    m.charmT = Math.max(m.charmT, t); m.charmBy = by.id;
  }

  /** Criatura más cercana a m (cualquier bando, salvo `except`): objetivo de la rabia. */
  nearestAny(m: Mob, R: number, except: number): Mob | null {
    let best: Mob | null = null, bd = R * R;
    const consider = (t: Mob) => {
      if (t === m || t.dead || t.id === except || t.entombT > 0) return;
      if (t.kind === Kind.Player && ((t as Player).submergeT > 0 || (t as Player).protectT > 0 || (t as Player).phaseT > 0)) return;
      const d = dist2(m.x, m.y, t.x, t.y);
      if (d < bd) { bd = d; best = t; }
    };
    for (const n of this.npcs.values()) consider(n);
    for (const h of this.hunters.values()) consider(h);
    for (const p of this.players.values()) if (!p.dead) consider(p);
    for (const mn of this.minions.values()) consider(mn);
    return best;
  }

  /** ¿Va disfrazado de algo que no es un monstruo (objeto o humano)? Cazadores, humanos y zombis no lo ven como amenaza. */
  isHiddenGuise(p: Player) { return !!p.guise && !p.guise.startsWith('char:'); }

  /** Ejecuta algo tras un retardo (en tiempo de simulación). */
  later(delay: number, fn: () => void) { this.timers.push({ at: this.time + delay, fn }); }

  // ------------------------------------------------------------------ esbirros (zombis de Paciente Cero)
  minionsOf(ownerId: number) { return [...this.minions.values()].filter((m) => m.owner === ownerId && !m.dead); }

  spawnMinion(owner: Player, x: number, y: number, variant: MinionVariant, look: string, lookSeed: number, life: number, chain: boolean, capOverride?: number): Minion {
    const cap = capOverride ?? (owner.ultT > 0 ? ZB.maxMinionsUlt : ZB.maxMinions);
    const mine = this.minionsOf(owner.id).filter((m) => capGroup(m.variant) === capGroup(variant)).sort((a, b) => a.born - b.born);
    while (mine.length >= cap) { const old = mine.shift()!; old.life = 0; this.kill(old, { name: '', kind: Kind.Minion }); }
    const st = MINION_STATS[variant];
    const m: Minion = {
      ...mobStatus(),
      id: this.nextId++, kind: Kind.Minion, x, y, r: MINION_R[variant] ?? NPC_RADIUS, facing: owner.facing,
      hp: st.hp, maxHp: st.hp, anim: Anim.Cast, animSeq: 1, animUntil: this.time + 0.5, moving: false,
      owner: owner.id, variant, look, lookSeed, life, chain, target: -1, thinkT: 0, atkCd: 0.6, speed: st.speed, swellT: 0, born: this.time,
    };
    this.minions.set(m.id, m);
    return m;
  }

  /** El dueño se ha ido: sus esbirros se desmoronan (los humanos engatusados vuelven en sí). */
  private releaseMinions(ownerId: number) {
    for (const m of this.minions.values()) {
      if (m.owner !== ownerId) continue;
      if (m.variant === 'thrall') this.freeThrall(m);
      else { this.fx('infect', m.x, m.y, { o: m.id, n: -1 }); this.minions.delete(m.id); }
    }
    this.zones = this.zones.filter((z) => z.owner !== ownerId);
  }

  /** Un humano engatusado vuelve en sí: deja de ser esbirro y sigue con su vida (asustado). */
  freeThrall(m: Minion) {
    this.minions.delete(m.id);
    m.dead = true;
    const n = this.spawnNpc({ x: m.x, y: m.y }, m.look);
    n.hp = Math.max(1, Math.min(n.maxHp, (m.hp / m.maxHp) * n.maxHp));
    n.panicT = 2;
    this.fx('thrall', n.x, n.y, { o: n.id, n: -1 });
  }

  /** ¿Es m enemigo del jugador p? (no lo es él mismo ni sus esbirros) */
  isEnemyOf(p: Player | null, m: Mob) {
    if (!p) return true;
    if (m === p) return false;
    if (m.kind === Kind.Minion && (m as Minion).owner === p.id) return false;
    return true;
  }

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
    for (const h of this.hunters.values()) if (dist2(x, y, h.x, h.y) < (radius + h.r) ** 2) fn(h);
    for (const o of this.players.values()) {
      if (o === p || o.dead || o.protectT > 0 || o.mistT > 0 || o.submergeT > 0 || o.phaseT > 0) continue;
      if (dist2(x, y, o.x, o.y) < (radius + o.r) ** 2) fn(o);
    }
    for (const m of this.minions.values()) {
      if (m.dead || m.owner === p.id) continue;
      if (dist2(x, y, m.x, m.y) < (radius + m.r) ** 2) fn(m);
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

  /** Rompe los espejos (de Bloody Mary) de otros que haya en el círculo. */
  breakMirrors(x: number, y: number, r: number, attacker: number) {
    const hit = this.zones.filter((z) => z.kind === 'mirror' && z.owner !== attacker && (z.ax - x) ** 2 + (z.ay - y) ** 2 < (r + z.w / 2) ** 2);
    if (!hit.length) return false;
    this.zones = this.zones.filter((z) => !hit.includes(z));
    for (const z of hit) { this.fx('shards', z.ax, z.ay, { n: 14 }); this.sfx('glass', z.ax, z.ay); }
    return true;
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
    this.breakMirrors(hx, hy, reach * 0.8, p.id);
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
      if (npc.entombT > 0 || isCritter(npc) || dist2(p.x, p.y, npc.x, npc.y) > r * r) continue;
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
      if (ok) for (const h of this.hunters.values()) if (dist2(x, y, h.x, h.y) < md2) { ok = false; break; }
      if (ok) return { x, y };
    }
    for (;;) {
      const x = 150 + Math.random() * (MAP_SIZE - 300), y = 150 + Math.random() * (MAP_SIZE - 300);
      if (!this.grid.blocked(x, y, r)) return { x, y };
    }
  }

  private spawnNpc(at?: { x: number; y: number }, variant?: string) {
    const pos = at ?? this.findSpawn(500, NPC_RADIUS + 2);
    const variants = variant ? [variant] : NPC_VARIANTS[this.theme];
    const n: Npc = {
      ...mobStatus(),
      id: this.nextId++, kind: Kind.Npc, x: pos.x, y: pos.y, r: NPC_RADIUS, facing: 1, hp: 30, maxHp: 30,
      anim: Anim.Idle, animSeq: 0, animUntil: 0, moving: false,
      variant: variants[Math.floor(Math.random() * variants.length)], tx: pos.x, ty: pos.y, thinkT: 0, fleeing: false, screamCd: 0,
      disguiseBy: -1, disguiseT: 0, infectT: 0, infectBy: -1,
    };
    this.npcs.set(n.id, n);
    return n;
  }

  private spawnHunter(type: HunterType = 'cazador') {
    const def = HUNTERS[type];
    const pos = this.findSpawn(700, def.r + 2);
    const h: Hunter = {
      ...mobStatus(),
      id: this.nextId++, kind: Kind.Hunter, x: pos.x, y: pos.y, r: def.r, facing: 1, hp: def.hp, maxHp: def.hp,
      anim: Anim.Idle, animSeq: 0, animUntil: 0, moving: false, type, def,
      lungeT: 0, lungeCd: 2, ldx: 0, ldy: 0, potionCd: 1.5, flyT: 0, flyTotal: 0, stuckT: 0, bestD: Infinity, ritualT: 0, ritualCd: 8 + Math.random() * 6, fleeT: 0, ritualZone: -1,
      target: -1, thinkT: 0, shootCd: 1, meleeCd: 0, tx: pos.x, ty: pos.y, strafe: Math.random() < 0.5 ? 1 : -1,
    };
    this.hunters.set(h.id, h);
    if (type === 'heraldo') { this.fx('descend', h.x, h.y, { o: h.id }); this.sfx('smite', h.x, h.y); }
  }

  /** Objeto al azar (según los pesos del mapa). */
  randomPowerUp(): PowerUpType {
    let total = 0;
    for (const [, w] of POWERUP_WEIGHTS) total += w;
    let r = Math.random() * total;
    for (const [t, w] of POWERUP_WEIGHTS) { if ((r -= w) <= 0) return t; }
    return 'blood';
  }

  private spawnPowerUp() {
    const pos = this.findSpawn(150, POWERUP_RADIUS + 6);
    const u: PowerUp = { id: this.nextId++, x: pos.x, y: pos.y, type: this.randomPowerUp() };
    this.powerups.set(u.id, u);
  }

  /** Alimaña nueva lejos de los jugadores. */
  private spawnCritter() {
    const kinds = CRITTER_KINDS[this.theme];
    const n = this.spawnNpc(this.findSpawn(600, CRITTERS.r + 2), kinds[Math.floor(Math.random() * kinds.length)]);
    n.hp = n.maxHp = CRITTERS.hp; n.r = CRITTERS.r;
  }

  /** Alimañas: pasean despacio y huyen muy rápido de cualquier monstruo o cazador. */
  private updateCritter(n: Npc, dt: number) {
    if (this.applyStatus(n, dt)) return;
    if (n.stunT > 0 || n.rootT > 0) { n.moving = false; return; }
    n.thinkT -= dt;
    if (n.thinkT <= 0) {
      n.thinkT = 0.2 + Math.random() * 0.15;
      let threat: Mob | null = null, bd = CRITTERS.seeR ** 2;
      const see = (t: Mob) => { if (t.dead) return; const d = dist2(n.x, n.y, t.x, t.y); if (d < bd) { bd = d; threat = t; } };
      for (const p of this.players.values()) if (p.invisKind === 'none' && !this.isHiddenGuise(p)) see(p);
      for (const h of this.hunters.values()) see(h);
      for (const mn of this.minions.values()) see(mn);
      if (threat) {
        const t = threat as Mob;
        let ax = n.x - t.x, ay = n.y - t.y; const d = Math.hypot(ax, ay) || 1; ax /= d; ay /= d;
        for (const rot of [0, 0.5, -0.5, 1.1, -1.1, 1.7, -1.7, 2.4, -2.4]) {
          const c = Math.cos(rot), sn = Math.sin(rot), dx = ax * c - ay * sn, dy = ax * sn + ay * c;
          if (!this.grid.blocked(n.x + dx * 50, n.y + dy * 50, n.r)) { n.tx = n.x + dx * 240; n.ty = n.y + dy * 240; break; }
        }
        n.fleeing = true;
      } else {
        n.fleeing = false;
        if (Math.random() < 0.2 || dist2(n.x, n.y, n.tx, n.ty) < 300) { n.tx = n.x + (Math.random() - 0.5) * 300; n.ty = n.y + (Math.random() - 0.5) * 300; }
      }
    }
    let speed = n.fleeing ? CRITTERS.flee : CRITTERS.speed;
    if (n.slowT > 0) speed *= n.slowMul;
    const dx = n.tx - n.x, dy = n.ty - n.y, d = Math.hypot(dx, dy);
    n.moving = d > 6;
    if (!n.moving) return;
    const step = Math.min(d, speed * dt);
    const res = this.grid.move(n.x, n.y, (dx / d) * step, (dy / d) * step, n.r);
    if (res.hit) { n.tx = n.x; n.ty = n.y; n.thinkT = 0; }
    n.x = res.x; n.y = res.y;
    n.facing = dx >= 0 ? 1 : -1;
  }

  private alivePlayers() {
    const out: Player[] = [];
    for (const p of this.players.values()) if (!p.dead) out.push(p);
    return out;
  }

  private calcMaxHp(p: Player) {
    return Math.round(CHARACTERS[p.char].hp * classOf(p).hp * (1 + 0.15 * p.ups.vit) * (1 + 0.03 * (p.level - 1)));
  }

  calcSpeed(p: Player) {
    if (p.stunT > 0 || p.entombT > 0 || p.rootT > 0) return 0;
    let s = p.def.speed * (1 + 0.05 * p.ups.spd);
    if (p.speedT > 0) s *= 1.4;
    if (p.howlT > 0) s *= BAL.werewolf.howlSpeedMul;
    if (p.slowT > 0) s *= p.slowMul;
    if (p.hexT > 0) s *= STATUS.hexSpeedMul;
    if (p.bootsT > 0) s *= ITEMS.boots.speedMul;
    s *= KITS[p.char].speedMul?.(this, p) ?? 1;
    if (p.def.aquatic) {
      const w = this.waterAt(p.x, p.y);
      if (w === 'deep') s *= KT.deepSpeedMul;
      else if (w === 'shallow') s *= 1 + (KT.deepSpeedMul - 1) * KT.shallowFactor;
    }
    if (p.submergeT > 0) s *= KT.diveSpeedMul;
    return s;
  }

  private qChargesMax(p: Player) { return KITS[p.char].qCharges?.(p) ?? 1; }

  // ------------------------------------------------------------------ bucle principal
  private step() {
    const dt = TICK_DT;
    this.time += dt;
    this.tick++;

    this.tvOn = [...this.players.values()].some((p) => !p.dead && p.char === 'static');
    if (this.broadcast && this.broadcast.until <= this.time) this.broadcast = null;
    for (const [id, c] of this.tvChannel) if (c.until <= this.time) this.tvChannel.delete(id);
    for (const p of this.players.values()) if (!p.dead) this.updatePlayer(p, dt);
    for (const n of this.npcs.values()) this.updateNpc(n, dt);
    for (const h of this.hunters.values()) this.updateHunter(h, dt);
    for (const m of this.minions.values()) this.updateMinion(m, dt);
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      this.timers = this.timers.filter((t) => t.at > this.time);
      for (const t of due) t.fn();
    }
    this.updateProjectiles(dt);
    this.updateZones();
    this.updateBurningTrees(dt);
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
    m.weakT = Math.max(0, m.weakT - dt);
    // sueño, sangrado, rabia, engatusar
    m.sleepMarkT = Math.max(0, m.sleepMarkT - dt);
    if (m.sleepT > 0) { m.sleepT -= dt; m.stunT = Math.max(m.stunT, m.sleepT); }
    if (m.drowsy > 0 && m.kind === Kind.Player) { m.drowsyHold -= dt; if (m.drowsyHold <= 0) m.drowsy = Math.max(0, m.drowsy - STATUS.drowsyDecay * dt); } // humanos y cazadores no se espabilan solos
    m.rageT = Math.max(0, m.rageT - dt);
    m.charmT = Math.max(0, m.charmT - dt);
    m.hexT = Math.max(0, m.hexT - dt);
    m.rootT = Math.max(0, m.rootT - dt);
    m.silenceT = Math.max(0, m.silenceT - dt);
    if (m.hypnoT > 0) m.hypnoT = Math.max(0, m.hypnoT - dt);
    if (m.hypno > 0) { m.hypnoHold -= dt; if (m.hypnoHold <= 0) m.hypno = Math.max(0, m.hypno - STATUS.hypno.decay * dt); }
    m.blindT = Math.max(0, m.blindT - dt);
    if (m.liftT > 0) { m.liftT -= dt; m.stunT = Math.max(m.stunT, m.liftT); }
    if (m.fearT <= 0) { m.fearX = NaN; m.fearY = NaN; }
    if (m.burnT > 0) {
      m.burnT -= dt;
      const by = this.findPlayerById(m.burnBy);
      this.damage(m, m.burnDps * dt, by && by !== m ? { ...this.src(by), raw: true } : { name: 'el fuego', kind: Kind.Player, raw: true }, false, true);
      if (m.dead) return true;
    }
    if (m.poisonT > 0) {
      m.poisonT -= dt;
      const by = this.findPlayerById(m.poisonBy);
      this.damage(m, m.poisonDps * dt, by ? { ...this.src(by), raw: true } : { name: 'veneno', kind: Kind.Player, raw: true }, false, true);
      if (m.dead) return true;
    }
    if (m.bleedT > 0) {
      m.bleedT -= dt;
      const by = this.findPlayerById(m.bleedBy);
      this.damage(m, m.bleedDps * dt, by ? { ...this.src(by), raw: true } : { name: 'sangrado', kind: Kind.Player, raw: true }, false, true);
      if (m.dead) return true;
    }
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
      const res = this.grid.move(m.x, m.y, m.knock.vx * dt, m.knock.vy * dt, m.r, walksWater(m));
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
    const eMaxC = kit.eCharges?.(p) ?? 1;
    if (eMaxC > 1 && p.k.ec !== undefined && p.k.ec < eMaxC && p.cd[2] <= 0) { p.k.ec++; if (p.k.ec < eMaxC) p.cd[2] = p.cdMax[2]; }
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
    // regeneración lenta (y la de las criaturas acuáticas en el agua, si no les han dado hace poco)
    let regen = 0.008 * classOf(p).regen;
    if (p.def.aquatic && this.time - p.lastHurtT >= KT.regenSafeT) {
      const w = this.waterAt(p.x, p.y);
      if (w === 'deep') regen += KT.deepRegen;
      else if (w === 'shallow') regen += KT.deepRegen * KT.shallowFactor;
    }
    if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * regen * dt);
    kit.tick?.(this, p, dt);

    const inp = p.queue.shift();
    if (inp) {
      p.input = inp;
      p.ack = inp.q;
    }
    let { mx, my, a, b } = p.input;
    // rabia: ataca a lo más cercano · engatusado: camina hacia quien lo engatusó
    if (p.rageT > 0 || p.charmT > 0) {
      const t = p.charmT > 0 ? this.findPlayerById(p.charmBy) : this.nearestAny(p, 600, p.rageSafe ? p.rageBy : -1);
      if (t) {
        const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy) || 1;
        mx = dx / d; my = dy / d; a = Math.atan2(dy, dx);
        if (p.charmT > 0 && d < 50) { mx = 0; my = 0; }
        b = p.rageT > 0 && d < p.def.range + p.r + t.r + 30 ? BTN_ATTACK : 0;
      } else b = 0;
    }
    if (p.fearT > 0 && !Number.isNaN(p.fearX)) {
      // aterrorizado: huye de lo que le asusta
      const dx = p.x - p.fearX, dy = p.y - p.fearY, d = Math.hypot(dx, dy) || 1;
      mx = dx / d; my = dy / d; a = Math.atan2(dy, dx); b = 0;
    }
    if (p.hypnoT > 0) {
      // hipnotizado: camina hacia la Interferencia o la tele
      const dx = p.hypnoX - p.x, dy = p.hypnoY - p.y, d = Math.hypot(dx, dy) || 1;
      mx = d > 30 ? dx / d : 0; my = d > 30 ? dy / d : 0; a = Math.atan2(dy, dx); b = 0;
    }
    if (p.silenceT > 0) b &= BTN_ATTACK; // silenciado: solo el ataque básico
    if (p.hexT > 0) b = 0; // animalillo: ni ataca ni usa habilidades
    const locked = this.applyStatus(p, dt);
    if (p.entombT > 0) { p.dash = null; return; }

    if (p.leap) {
      // salto: vuela en arco por encima de todo
      const L = p.leap;
      L.t += dt;
      const k = Math.min(1, L.t / L.T);
      p.x = L.sx + (L.tx - L.sx) * k; p.y = L.sy + (L.ty - L.sy) * k;
      p.moving = true;
      if (k >= 1) {
        p.leap = null;
        if (this.grid.blocked(p.x, p.y, p.r, walksWater(p))) { const f = this.findFreeSpot(p.x, p.y, p.r); p.x = f.x; p.y = f.y; }
        kit.onLand?.(this, p);
      }
      p.facing = L.tx >= L.sx ? 1 : -1;
      return;
    } else if (p.dash) {
      const res = this.grid.move(p.x, p.y, p.dash.dx * p.dash.speed * dt, p.dash.dy * p.dash.speed * dt, p.r, walksWater(p));
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
    } else if (p.flyT > 0 || p.phaseT > 0) {
      // vuelo / intangible: atraviesa obstáculos; al terminar, aterriza siempre en un sitio libre
      const sp = this.calcSpeed(p);
      p.moving = mx !== 0 || my !== 0;
      p.x = Math.max(p.r, Math.min(MAP_SIZE - p.r, p.x + mx * sp * dt));
      p.y = Math.max(p.r, Math.min(MAP_SIZE - p.r, p.y + my * sp * dt));
      const phased = p.phaseT > 0;
      if (phased) p.phaseT -= dt; else p.flyT -= dt;
      if (p.flyT <= 0 && p.phaseT <= 0) {
        p.flyT = 0; p.phaseT = 0;
        if (this.grid.blocked(p.x, p.y, p.r, walksWater(p))) { const f = this.findFreeSpot(p.x, p.y, p.r); p.x = f.x; p.y = f.y; }
        this.fx(phased ? 'phase' : p.def.id === 'succubus' ? 'wings' : 'broom', p.x, p.y, { o: p.id, n: 0 });
      }
    } else if (!locked) {
      const sp = this.calcSpeed(p);
      p.moving = (mx !== 0 || my !== 0) && sp > 0;
      if (p.moving) {
        const res = this.grid.move(p.x, p.y, mx * sp * dt, my * sp * dt, p.r, walksWater(p));
        p.x = res.x; p.y = res.y;
        if (p.anim === Anim.Wave || p.anim === Anim.Taunt) p.animUntil = 0;
      }
    }
    p.facing = Math.cos(a) >= 0 ? 1 : -1;
    this.updateItems(p, dt);

    // pisadas: señales físicas de una presencia invisible (no cuando está desvestida del todo)
    if ((p.invisKind === 'auto' || p.invisKind === 'timed') && p.moving) {
      p.stepT -= dt;
      if (p.stepT <= 0) { p.stepT = 0.42; this.fx('step', p.x, p.y, { r: +Math.atan2(my, mx).toFixed(1) }); }
    }

    if (p.stunT > 0 || p.submergeT > 0) return;
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
    const eMax = kit.eCharges?.(p) ?? 1;
    if (eMax > 1) {
      if (p.k.ec === undefined) p.k.ec = eMax;
      if (b & BTN_E && p.k.ec > 0 && (p.k.eLock ?? 0) <= this.time) {
        if (p.k.ec === eMax) p.cd[2] = p.cdMax[2];
        p.k.ec--;
        p.k.eLock = this.time + 0.35;
        kit.ability(this, p, 1, a);
      }
    } else if (b & BTN_E && p.cd[2] <= 0) {
      p.cd[2] = p.cdMax[2];
      kit.ability(this, p, 1, a);
    }
    if (b & BTN_R && p.tier >= 2 && p.ult >= ULT.max && p.ultT <= 0) {
      if (kit.ult(this, p, a)) { p.ult = 0; this.sfx('ult', p.x, p.y); }
    }
  }

  /** Efectos de los objetos recogidos: calaveras guiadas y botas elementales. */
  private updateItems(p: Player, dt: number) {
    if (p.spiritsT > 0) {
      p.spiritsT -= dt; p.spiritCd -= dt;
      const S = ITEMS.spirits;
      if (p.spiritCd <= 0) {
        const t = this.nearestEnemy(p, p.x, p.y, S.range, -1);
        if (t) {
          p.spiritCd = S.every;
          const pr = this.shoot('skull', p.id, p.x, p.y - 30, Math.atan2(t.y - p.y, t.x - p.x) + (Math.random() - 0.5) * 1.2, S.speed, 2.5, this.calcDamage(p, S.dmg));
          pr.home = t.id; pr.ghost = true; pr.hitR = 12;
        }
      }
    }
    if (p.bootsT > 0) {
      p.bootsT -= dt;
      if (!p.moving) return;
      p.bootsAcc += this.calcSpeed(p) * dt;
      const Bt = ITEMS.boots;
      if (p.bootsAcc < Bt.every) return;
      p.bootsAcc = 0;
      if (p.bootsKind === 0) this.addZone({ kind: 'fire', ax: p.x, ay: p.y, bx: p.x, by: p.y, w: Bt.fire.r * 2, until: this.time + Bt.fire.t, owner: p.id, v: Bt.fire.dps });
      else if (p.bootsKind === 1) this.addZone({ kind: 'snare', ax: p.x, ay: p.y, bx: p.x, by: p.y, w: Bt.nature.r * 2, until: this.time + Bt.nature.t, owner: p.id });
      else this.puddle(p.id, p.x, p.y, Bt.water.r, Bt.water.t);
    }
  }

  /** Aplica daño y devuelve el daño efectivo. */
  damage(m: Mob, amount: number, src: Source, crit = false, quiet = false): number {
    if (m.dead) return 0;
    // sarcófago: solo Ramsés puede golpearlo, y se cura al hacerlo
    if (m.entombT > 0) {
      if (!src.player || src.player.id !== m.entombBy) return 0;
    }
    if (src.player && !src.minion && !src.raw) amount = KITS[src.player.char].onDealDamage?.(this, src.player, m, amount) ?? amount;
    // debilitado (zona contaminada)
    const atk: Mob | undefined = src.minion ?? src.player ?? src.hunter;
    if (atk && atk.weakT > 0) amount *= ZB.weakMul;
    if (m.vulnT > 0) amount *= m.vulnMul;
    if (m.kind === Kind.Player) {
      const p = m as Player;
      if (p.protectT > 0 || p.mistT > 0 || p.submergeT > 0 || p.phaseT > 0) return 0;
      amount *= (1 - Math.min(0.6, p.def.armor + classOf(p).armor)) * (KITS[p.char].damageTakenMul?.(this, p) ?? 1);
      p.lastHurtT = this.time;
      if (p.shieldHp > 0) {
        const absorbed = Math.min(p.shieldHp, amount);
        p.shieldHp -= absorbed;
        amount -= absorbed;
        if (p.shieldHp <= 0) p.shieldT = 0;
      }
      p.lastAttacker = src.name;
      p.lastCombatT = this.time;
      if (amount > 0) {
        if (p.guise && !p.guise.startsWith('char:')) { p.guise = null; this.fx('prop', p.x, p.y, { o: p.id, n: -1 }); } // recibir daño destapa el disfraz (la copia de otro monstruo aguanta)
        KITS[p.char].onHurt?.(this, p, amount);
      }
      // recibir daño rompe la invisibilidad
      if (amount > 0 && (p.invisT > 0 || p.invisKind !== 'none')) {
        p.invisT = 0; p.invisKind = 'none'; p.invisBonus = false; p.reinvisT = 0;
        this.fx('reveal', p.x, p.y, { o: p.id });
      }
    }
    if (m.kind === Kind.Hunter && src.player) (m as Hunter).target = src.player.id;
    amount = Math.max(0, amount);
    if (m.entombT > 0 && src.player && amount > 0) {
      src.player.hp = Math.min(src.player.maxHp, src.player.hp + amount * BAL.mummy.ult.healFrac);
      this.fx('drain', m.x, m.y, { tx: Math.round(src.player.x), ty: Math.round(src.player.y), o: src.player.id, n: 2, c: 'sand' });
    }
    // robo de vida de los asesinos (solo sus golpes directos)
    if (src.player && !src.minion && !src.raw && amount > 0 && src.player !== m && !src.player.dead) {
      const ls = classOf(src.player).lifesteal;
      if (ls > 0) src.player.hp = Math.min(src.player.maxHp, src.player.hp + Math.min(amount, Math.max(0, m.hp)) * ls);
    }
    m.hp -= amount;
    if (!quiet) this.emit({ e: 'hit', x: Math.round(m.x), y: Math.round(m.y), d: Math.round(amount), t: m.id, crit }, m.x, m.y);
    if (m.hp <= 0) this.kill(m, src);
    else if (this.time >= m.animUntil && m.entombT <= 0) this.setAnim(m, Anim.Hurt, 0.2);
    return amount;
  }

  kill(m: Mob, src: Source) {
    if (m.dead) return;
    // Somos Uno (Unidad): la muerte no cuenta si le queda otra Unidad
    if (m.kind === Kind.Player && KITS[(m as Player).char].preventDeath?.(this, m as Player)) return;
    m.dead = true;
    m.hp = 0;
    let killer = src.player && !src.player.dead ? src.player : undefined;
    // rabia: las bajas de quien está bajo la poción cuentan para la bruja que la lanzó
    const raged = src.player ?? src.hunter;
    if (raged && raged.rageT > 0 && raged.rageBy >= 0) { const w = this.findPlayerById(raged.rageBy); if (w && !w.dead && w !== m) killer = w; }
    const share = src.minion ? ZB.rewardShare : 1; // bajas de esbirros: la mitad
    let c = '';
    if (m.kind === Kind.Minion) {
      const mn = m as Minion;
      c = mn.look;
      this.minions.delete(mn.id);
      const owner = this.findPlayerById(mn.owner);
      if (owner && !owner.dead) KITS[owner.char].onMinionDeath?.(this, owner, mn);
      if (killer && killer.id !== mn.owner) this.reward(killer, 4, 3, 0);
      this.emit({ e: 'die', x: Math.round(m.x), y: Math.round(m.y), k: m.kind, c }, m.x, m.y);
      return;
    }
    if (m.kind === Kind.Npc && isCritter(m)) {
      // alimaña: siempre suelta un objeto
      const n = m as Npc;
      this.npcs.delete(n.id);
      this.dropPowerUp(n.x, n.y, this.randomPowerUp());
      this.fx('critterPop', n.x, n.y, { c: n.variant });
      this.sfx('pickup', n.x, n.y);
      if (killer) this.reward(killer, CRITTERS.xp * share, CRITTERS.pts * share, 0);
      if (killer && !src.minion) KITS[killer.char].onKill?.(this, killer, m);
      else if (killer && src.minion) KITS[killer.char].onMinionKill?.(this, killer, src.minion, m);
      this.emit({ e: 'die', x: Math.round(m.x), y: Math.round(m.y), k: m.kind, c: n.variant }, m.x, m.y);
      return;
    }
    if (m.kind === Kind.Npc) {
      const n = m as Npc;
      c = n.variant;
      this.npcs.delete(n.id);
      this.sfx('scream', n.x, n.y);
      // ¡sorpresa! era un humano disfrazado de la Dama
      if (n.disguiseT > 0 && (!killer || killer.id !== n.disguiseBy || src.minion)) {
        const dama = this.findPlayerById(n.disguiseBy);
        if (src.minion) this.surprise(src.minion, DAMA.ult.surpriseStunHunter, DAMA.ult.vulnMulHunter);
        else if (killer) this.surprise(killer, DAMA.ult.surpriseStunPlayer, DAMA.ult.vulnMul);
        else if (src.hunter) this.surprise(src.hunter, DAMA.ult.surpriseStunHunter, DAMA.ult.vulnMulHunter);
        if (dama) this.fx('undress', n.x, n.y, { o: -1, s: dama.skin, r: 1 });
      }
      // contagio en cadena: la víctima de un zombi puede levantarse como zombi
      if (killer && src.minion?.chain && Math.random() < ZB.chainChance) {
        const z = this.spawnMinion(killer, n.x, n.y, this.minionVariant(killer), n.variant, n.id % 97, ZB.chainLife, false);
        this.fx('infect', z.x, z.y, { o: z.id, n: 1 });
        this.sfx('groan', z.x, z.y);
      }
      if (killer) {
        this.reward(killer, 12 * share, 10 * share, src.minion ? 0 : 1);
        if (!src.minion) this.chargeUlt(killer, ULT.npc);
        const st = killer.conn.profile.stats;
        st.npcKills++;
        this.medal(killer, 'firstblood');
        if (st.npcKills >= 100) this.medal(killer, 'glutton');
        if (st.npcKills >= 500) this.medal(killer, 'npc500');
      }
    } else if (m.kind === Kind.Hunter) {
      const h = m as Hunter;
      c = h.type;
      this.hunters.delete(m.id);
      this.zones = this.zones.filter((z) => !(z.kind === 'ritual' && z.owner === h.id)); // ritual interrumpido
      this.hunterRespawnT = Math.max(this.hunterRespawnT, 6);
      if (killer) {
        const rw = h.def.reward;
        this.reward(killer, rw.xp * share, rw.pts * share, src.minion ? Math.ceil(rw.coins / 2) : rw.coins);
        this.chargeUlt(killer, rw.ult * share);
        const st = killer.conn.profile.stats;
        st.hunterKills++;
        this.medal(killer, 'hunter');
        if (st.hunterKills >= 25) this.medal(killer, 'slayer');
        if (st.hunterKills >= 100) this.medal(killer, 'hunter100');
        if (h.type === 'heraldo') this.medal(killer, 'herald');
        if (h.type === 'sectario') this.medal(killer, 'cultist');
        this.emit({ e: 'kill', a: killer.name, v: h.def.name, ak: Kind.Player, vk: Kind.Hunter }, m.x, m.y, true);
      }
    } else if (m.kind === Kind.Player) {
      const v = m as Player;
      c = v.char;
      v.diedAt = this.time;
      v.dash = null;
      v.ultT = 0;
      v.submergeT = 0;
      this.releaseMinions(v.id);
      KITS[v.char].onDeath?.(this, v);
      this.recordBest(v);
      v.conn.profile.stats.deaths++;
      if (killer) {
        this.reward(killer, (40 + Math.round(v.totalXp * 0.25)) * share, (50 + Math.round(v.points * 0.25)) * share, 5);
        this.chargeUlt(killer, ULT.player * share);
        killer.lifeKills++;
        killer.conn.profile.stats.playerKills++;
        if (killer.lifeKills >= 3) this.medal(killer, 'predator');
        if (killer.lifeKills >= 5) this.medal(killer, 'streak5');
        const pk = killer.conn.profile.stats.playerKills;
        if (pk >= 10) this.medal(killer, 'monster10');
        if (pk >= 50) this.medal(killer, 'monster50');
        if (v.id === this.bountyId) this.medal(killer, 'bounty');
        if (killer.conn.profile.lastKiller === profileTag(v.conn.profile.token)) { this.medal(killer, 'revenge'); killer.conn.profile.lastKiller = undefined; }
        if (killer.allies.has(v.id)) { this.medal(killer, 'traitor'); killer.allies.delete(v.id); this.fx('allyAsk', v.x, v.y, { o: v.id, n: -1 }); }
        v.conn.profile.lastKiller = profileTag(killer.conn.profile.token);
      }
      const by = src.name || v.lastAttacker || 'la noche';
      this.emit({ e: 'kill', a: by, v: v.name, ak: src.kind, vk: Kind.Player }, m.x, m.y, true);
      this.sfx('death', v.x, v.y);
      const died = { t: 'died' as const, by, pts: Math.round(v.points), lvl: v.level, kills: v.lifeKills, time: Math.round(this.time - v.lifeStart), coins: v.coinsEarned };
      // Último conjuro del Nigromante: la pantalla de muerte espera a que se desintegre su fantasma
      const wait = v.char === 'necro' && v.tier >= 1 ? BAL.necro.last.delay + BAL.necro.last.t : 0;
      if (wait) this.later(wait, () => { v.conn.send(died); v.conn.send({ t: 'profile', profile: v.conn.profile }); });
      else { v.conn.send(died); v.conn.send({ t: 'profile', profile: v.conn.profile }); }
      store.touch();
    }
    if (killer && !src.minion) KITS[killer.char].onKill?.(this, killer, m);
    else if (killer && src.minion) KITS[killer.char].onMinionKill?.(this, killer, src.minion, m);
    this.emit({ e: 'die', x: Math.round(m.x), y: Math.round(m.y), k: m.kind, c }, m.x, m.y);
  }

  /** Variante de zombi según la evolución del dueño (nivel 15: cepas mutantes). */
  minionVariant(owner: Player): MinionVariant {
    if (owner.tier < 3) return 'normal';
    const r = Math.random();
    return r < ZB.variantChanceT3.fast ? 'fast' : r < ZB.variantChanceT3.fast + ZB.variantChanceT3.tough ? 'tough' : 'normal';
  }

  private surprise(m: Mob, stun: number, vuln: number) {
    m.stunT = Math.max(m.stunT, stun);
    m.vulnT = Math.max(m.vulnT, stun);
    m.vulnMul = vuln;
    if (m.kind === Kind.Player) (m as Player).dash = null;
    this.fx('surprise', m.x, m.y, { o: m.id, d: stun });
    this.sfx('surprise', m.x, m.y);
  }

  chargeUlt(p: Player, amount: number) {
    if (p.tier < 2 || p.ultT > 0) return;
    p.ult = Math.min(ULT.max, p.ult + amount);
  }

  private recordBest(p: Player) {
    const st = p.conn.profile.stats;
    if (p.points > st.bestScore) { st.bestScore = Math.round(p.points); store.touch(); }
  }

  reward(p: Player, xp: number, pts: number, coins: number) {
    xp = Math.round(xp); pts = Math.round(pts);
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
      if (p.level >= 15) { this.medal(p, 'level15'); this.medal(p, `char:${p.char}`); }
      if (p.level >= 20) this.medal(p, 'level20');
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
    for (const p of alive) {
      if (this.time - p.lifeStart >= 300) this.medal(p, 'survivor');
      if (this.time - p.lifeStart >= 600) this.medal(p, 'eternal');
      if (p.conn.profile.coins >= 1000) this.medal(p, 'rich');
    }
    if (alive.length >= 3) {
      const top = alive.reduce((a, b) => (b.points > a.points ? b : a));
      if (top.points >= 150) this.medal(top, 'lord');
    }
  }

  // ------------------------------------------------------------------ IA humanos
  private visibleMonsterNear(x: number, y: number, radius: number): Mob | null {
    let best: Mob | null = null;
    let bd = radius * radius;
    for (const p of this.players.values()) {
      if (p.dead || p.invisKind !== 'none' || p.entombT > 0 || p.submergeT > 0 || this.isHiddenGuise(p)) continue;
      const d = dist2(x, y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    for (const m of this.minions.values()) {
      if (m.dead || m.entombT > 0 || m.camo) continue;
      const d = dist2(x, y, m.x, m.y);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  /** Fin del contagio: el humano se levanta como zombi de quien lo infectó. */
  private turnZombie(n: Npc) {
    const owner = this.findPlayerById(n.infectBy);
    this.npcs.delete(n.id);
    n.dead = true;
    if (!owner || owner.dead) { this.emit({ e: 'die', x: Math.round(n.x), y: Math.round(n.y), k: n.kind, c: n.variant }, n.x, n.y); return; }
    const z = this.spawnMinion(owner, n.x, n.y, this.minionVariant(owner), n.variant, n.id % 97, ZB.minionLife, true);
    this.fx('emerge', z.x, z.y, { o: z.id });
    this.sfx('groan', z.x, z.y);
  }

  private updateNpc(n: Npc, dt: number) {
    if (isCritter(n)) { this.updateCritter(n, dt); return; }
    n.screamCd = Math.max(0, n.screamCd - dt);
    if (n.infectT > 0) {
      // contagio: la vida baja poco a poco hasta cero y se levanta como zombi
      n.infectT -= dt;
      n.hp -= (n.maxHp / ZB.infectT) * dt;
      n.slowT = Math.max(n.slowT, 0.2); n.slowMul = Math.min(n.slowMul, ZB.infectSlowMul);
      if (n.infectT <= 0 || n.hp <= 0) { this.turnZombie(n); return; }
    }
    if (n.disguiseT > 0) { n.disguiseT -= dt; if (n.disguiseT <= 0) { n.disguiseBy = -1; this.fx('disguise', n.x, n.y, { o: n.id, r: -1 }); } }
    if (this.applyStatus(n, dt)) return;
    if (this.hypnoWalk(n, dt)) return;
    if (this.flee(n, STATUS.fleeSpeed, dt)) return;
    if (n.stunT > 0 || n.fearT > 0) { n.moving = false; return; }
    if (this.hexHop(n, dt)) return;
    if (this.rageOrCharm(n, 150, STATUS.rageNpcDmg, 0.9, 22, dt)) return;
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
    if (n.rootT > 0) speed = 0;
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

  // ------------------------------------------------------------------ IA de la orden de cazadores
  /** Objetivo válido: un jugador, un humano disfrazado de la Dama (¡se dejan engañar!) o un zombi. */
  private hunterTarget(id: number): Mob | null {
    if (id < 0) return null;
    const p = this.findPlayerById(id);
    if (p) return p;
    const n = this.npcs.get(id);
    if (n && n.disguiseT > 0) return n;
    return this.minions.get(id) ?? null;
  }

  private hiddenPlayer(p: Player) {
    return p.dead || p.invisKind !== 'none' || p.protectT > 0 || p.entombT > 0 || p.submergeT > 0 || p.mistT > 0 || p.phaseT > 0 || this.isHiddenGuise(p);
  }

  /** Elige objetivo. Los zombis cercanos van primero (si no, el Paciente Cero los farmea con su horda). */
  private pickHunterTarget(h: Hunter): Mob | null {
    const PR = ORDER.minionPriorityR;
    let best: Mob | null = null, bd = PR * PR;
    for (const m of this.minions.values()) {
      if (m.dead || m.entombT > 0 || m.camo) continue;
      const d = dist2(h.x, h.y, m.x, m.y);
      if (d < bd) { bd = d; best = m; }
    }
    if (best) return best;
    let score = Infinity;
    for (const p of this.players.values()) {
      if (this.hiddenPlayer(p)) continue;
      if (h.type === 'heraldo' && p.level < ORDER.herald.ignoreBelow) continue;
      const range = p.id === this.bountyId ? 700 : h.type === 'heraldo' || h.type === 'inquisidor' ? 620 : 460;
      const d = Math.sqrt(dist2(h.x, h.y, p.x, p.y));
      if (d > range || !this.grid.lineOfSight(h.x, h.y, p.x, p.y)) continue;
      // inquisidor y heraldo prefieren monstruos de más nivel (dejan tranquilos a los que empiezan)
      const sc = h.type === 'inquisidor' || h.type === 'heraldo' ? d - p.level * ORDER.levelBias : d;
      if (sc < score) { score = sc; best = p; }
    }
    for (const n of this.npcs.values()) {
      if (n.disguiseT <= 0) continue; // clones de la Dama: también para el heraldo
      const d = Math.sqrt(dist2(h.x, h.y, n.x, n.y));
      if (d < 460 && d < score && this.grid.lineOfSight(h.x, h.y, n.x, n.y)) { score = d; best = n; }
    }
    return best;
  }

  private updateHunter(h: Hunter, dt: number) {
    h.shootCd = Math.max(0, h.shootCd - dt);
    h.meleeCd = Math.max(0, h.meleeCd - dt);
    h.lungeCd = Math.max(0, h.lungeCd - dt);
    h.potionCd = Math.max(0, h.potionCd - dt);
    if (h.type === 'heraldo') {
      // lento pero constante: no se le asusta, ralentiza ni empuja, y los aturdimientos le duran poco
      h.fearT = 0; h.panicT = 0; h.slowT = 0; h.slowMul = 1; h.knock = null;
      if (h.stunT > ORDER.herald.stunMul * 2) h.stunT = ORDER.herald.stunMul * 2;
    }
    if (this.applyStatus(h, dt)) return;
    if (h.stunT <= 0 && this.hypnoWalk(h, dt)) { h.lungeT = 0; return; }
    if (h.stunT <= 0 && this.flee(h, h.def.speed, dt)) { h.lungeT = 0; return; }
    if (h.stunT > 0 || h.fearT > 0) { h.moving = false; h.lungeT = 0; return; }
    if (this.hexHop(h, dt)) return;
    if (this.rageOrCharm(h, h.def.speed, Math.max(10, h.def.melee), h.def.meleeCd, h.def.reach, dt)) return;
    if (h.type === 'sectario') { this.updateCultist(h, dt); return; }
    const D = h.def;

    h.thinkT -= dt;
    if (h.thinkT <= 0) {
      h.thinkT = 0.5;
      let t = this.hunterTarget(h.target);
      if (t && (t.dead || t.entombT > 0 || dist2(h.x, h.y, t.x, t.y) > 700 ** 2)) t = null;
      if (t && t.kind === Kind.Player && this.hiddenPlayer(t as Player)) t = null;
      // reevaluar: un zombi que se acerca pasa por delante de cualquier jugador
      const pick = this.pickHunterTarget(h);
      if (pick && (!t || pick.kind === Kind.Minion || t.kind !== Kind.Minion && Math.random() < 0.3)) t = pick;
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

    if (h.blindT > 0) h.target = -1; // cegado: no ve a nadie
    const t = this.hunterTarget(h.target);
    const src: Source = { hunter: h, name: D.name, kind: Kind.Hunter };
    let mx = 0, my = 0, speed = D.speed * 0.6;
    if (t && !t.dead) {
      const dx = t.x - h.x, dy = t.y - h.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      h.facing = dx >= 0 ? 1 : -1;
      speed = D.speed;
      // distancia preferida según el oficio
      if (h.type === 'cazador') {
        if (d > 300) { mx = ux; my = uy; } else if (d < 160) { mx = -ux; my = -uy; } else { mx = -uy * h.strafe * 0.7; my = ux * h.strafe * 0.7; }
      } else if (h.type === 'exorcista') {
        if (d > 360) { mx = ux; my = uy; } else if (d < 220) { mx = -ux; my = -uy; } else { mx = -uy * h.strafe * 0.6; my = ux * h.strafe * 0.6; }
      } else { mx = ux; my = uy; } // inquisidor y heraldo: siempre hacia delante
      // embestida del inquisidor
      if (h.type === 'inquisidor' && h.lungeT <= 0 && h.lungeCd <= 0 && d < ORDER.lunge.range && d > ORDER.lunge.min) {
        h.lungeT = ORDER.lunge.t; h.lungeCd = ORDER.lunge.cd; h.ldx = ux; h.ldy = uy;
        this.setAnim(h, Anim.Attack, ORDER.lunge.t);
        this.sfx('dash', h.x, h.y);
      }
      if (h.lungeT > 0) { h.lungeT -= dt; mx = h.ldx; my = h.ldy; speed = D.speed * ORDER.lunge.mul; }
      if (d < h.r + t.r + D.reach && h.meleeCd <= 0 && D.melee > 0) {
        h.meleeCd = D.meleeCd;
        h.lungeT = 0;
        this.setAnim(h, Anim.Attack, 0.3);
        this.damage(t, D.melee, src);
        this.breakMirrors(t.x, t.y, 40, -1);
        if (h.type === 'heraldo') { this.fx('smite', t.x, t.y, { o: h.id }); this.sfx('smite', t.x, t.y); this.knockback(t, ux, uy, 60); }
        else this.sfx(h.type === 'inquisidor' ? 'claw' : 'stake', h.x, h.y);
      } else if (h.type === 'cazador' && h.shootCd <= 0 && d < ORDER.shoot.range) {
        h.shootCd = ORDER.shoot.cd + Math.random() * 0.4;
        // apuntar con algo de predicción
        const tt = d / ORDER.shoot.speed;
        let vx = 0, vy = 0;
        if (t.kind === Kind.Player) { const tp = t as Player; const s = this.calcSpeed(tp); vx = tp.input.mx * s; vy = tp.input.my * s; }
        const a = Math.atan2(t.y + vy * tt - h.y, t.x + vx * tt - h.x) + (Math.random() - 0.5) * 0.12;
        const pr = this.shoot('bolt', -1, h.x, h.y, a, ORDER.shoot.speed, 1.0, ORDER.shoot.dmg);
        pr.hOwner = h.id;
        this.setAnim(h, Anim.Attack, 0.3);
        this.sfx('bolt', h.x, h.y);
      } else if (h.type === 'exorcista' && h.potionCd <= 0 && d < ORDER.potion.range) {
        // frasco de agua bendita lanzado al punto donde estará el objetivo
        h.potionCd = ORDER.potion.cd + Math.random() * 0.6;
        let tx = t.x, ty = t.y;
        if (t.kind === Kind.Player) { const tp = t as Player; const s = this.calcSpeed(tp) * 0.6; const tt = d / ORDER.potion.speed; tx += tp.input.mx * s * tt; ty += tp.input.my * s * tt; }
        const dd = Math.hypot(tx - h.x, ty - h.y);
        const pr = this.shoot('holy', -1, h.x, h.y, Math.atan2(ty - h.y, tx - h.x), ORDER.potion.speed, dd / ORDER.potion.speed, 0);
        pr.hOwner = h.id; pr.ghost = true; pr.land = true;
        this.setAnim(h, Anim.Cast, 0.35);
        this.sfx('bolt', h.x, h.y);
      }
    } else {
      h.lungeT = 0;
      const dx = h.tx - h.x, dy = h.ty - h.y;
      const d = Math.hypot(dx, dy);
      if (d > 8) { mx = dx / d; my = dy / d; h.facing = dx >= 0 ? 1 : -1; }
    }
    if (h.type === 'heraldo') { this.heraldFlight(h, t, mx, my, speed, dt); return; }
    this.moveHunter(h, mx, my, speed, dt, !!t);
  }

  /** Heraldo: si no consigue acercarse (obstáculos, agua...), alza el vuelo y los atraviesa; aterriza siempre en un sitio libre. */
  private heraldFlight(h: Hunter, t: Mob | null, mx: number, my: number, speed: number, dt: number) {
    if (h.flyT > 0) {
      h.flyT -= dt; h.flyTotal += dt;
      h.moving = mx !== 0 || my !== 0;
      h.x = Math.max(h.r, Math.min(MAP_SIZE - h.r, h.x + mx * speed * 1.3 * dt));
      h.y = Math.max(h.r, Math.min(MAP_SIZE - h.r, h.y + my * speed * 1.3 * dt));
      if (h.flyT <= 0) {
        if (this.grid.blocked(h.x, h.y, h.r) && h.flyTotal < 6) h.flyT = 0.3; // sigue planeando hasta un hueco libre
        else {
          if (this.grid.blocked(h.x, h.y, h.r)) { const f = this.findFreeSpot(h.x, h.y, h.r); h.x = f.x; h.y = f.y; }
          h.flyTotal = 0; h.stuckT = 0; h.bestD = Infinity;
          this.fx('smite', h.x, h.y, { o: h.id }); // aterrizaje
        }
      }
      return;
    }
    const before = { x: h.x, y: h.y };
    this.moveHunter(h, mx, my, speed, dt, !!t);
    if (!t) { h.stuckT = 0; h.bestD = Infinity; return; }
    const d = Math.hypot(t.x - h.x, t.y - h.y);
    const moved = Math.hypot(h.x - before.x, h.y - before.y);
    // sin progreso hacia el objetivo durante un rato → volar
    if (d < h.bestD - 6) { h.bestD = d; h.stuckT = 0; }
    else if (d > h.r + t.r + h.def.reach + 10) h.stuckT += dt * (moved < speed * dt * 0.5 ? 2 : 1);
    if (h.stuckT > 1.2) {
      h.flyT = 2.5; h.flyTotal = 0; h.stuckT = 0; h.bestD = Infinity;
      this.fx('descend', h.x, h.y, { o: h.id });
    }
  }

  /** Rabia (atacar a lo más cercano, las bajas son de la bruja) o engatusado (caminar hacia quien lo engatusó). */
  private rageOrCharm(m: Mob, speed: number, dmg: number, cd: number, reach: number, dt: number): boolean {
    if (m.rageT <= 0 && m.charmT <= 0) return false;
    m.rageAtk = Math.max(0, m.rageAtk - dt);
    let t: Mob | null = null;
    if (m.charmT > 0) t = this.findPlayerById(m.charmBy);
    else t = this.nearestAny(m, 520, m.rageSafe ? m.rageBy : -1);
    if (!t || t.dead) { m.moving = false; return true; }
    const dx = t.x - m.x, dy = t.y - m.y, d = Math.hypot(dx, dy) || 1;
    m.facing = dx >= 0 ? 1 : -1;
    if (m.rageT > 0 && d < m.r + t.r + reach) {
      m.moving = false;
      if (m.rageAtk <= 0) {
        m.rageAtk = cd;
        this.setAnim(m, Anim.Attack, 0.3);
        const w = this.findPlayerById(m.rageBy);
        this.damage(t, dmg, w ? { player: w, name: w.name, kind: Kind.Player, raw: true } : { name: 'rabia', kind: Kind.Npc });
        this.sfx('punch', m.x, m.y);
      }
      return true;
    }
    if (m.charmT > 0 && d < 50) { m.moving = false; return true; }
    const sp = m.rootT > 0 ? 0 : speed * (m.slowT > 0 ? m.slowMul : 1) * (m.charmT > 0 ? 0.7 : 1.1);
    const res = this.grid.move(m.x, m.y, (dx / d) * sp * dt, (dy / d) * sp * dt, m.r);
    m.x = res.x; m.y = res.y; m.moving = true;
    return true;
  }

  /** Busca el punto libre más cercano (espiral) para no quedarse atrapado al aterrizar. */
  findFreeSpot(x: number, y: number, r: number): { x: number; y: number } {
    if (!this.grid.blocked(x, y, r)) return { x, y };
    for (let rad = 20; rad < 600; rad += 20) {
      const n = Math.ceil((rad * Math.PI * 2) / 30);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        if (px > r && py > r && px < MAP_SIZE - r && py < MAP_SIZE - r && !this.grid.blocked(px, py, r)) return { x: px, y: py };
      }
    }
    return this.findSpawn(0, r);
  }

  private moveHunter(h: Hunter, mx: number, my: number, speed: number, dt: number, chasing: boolean) {
    if (h.slowT > 0) speed *= h.slowMul;
    if (h.rootT > 0) { h.moving = false; h.lungeT = 0; return; }
    h.moving = mx !== 0 || my !== 0;
    if (!h.moving) return;
    const res = this.grid.move(h.x, h.y, mx * speed * dt, my * speed * dt, h.r);
    if (res.hit && !chasing) { h.tx = h.x; h.ty = h.y; }
    if (res.hit && chasing) { h.strafe *= -1; h.lungeT = 0; }
    h.x = res.x; h.y = res.y;
  }

  /** Agua bendita: el frasco revienta y deja un charco sagrado. */
  private holySplash(pr: Projectile) {
    this.addZone({ kind: 'holy', ax: pr.x, ay: pr.y, bx: pr.x, by: pr.y, w: ORDER.potion.r * 2, until: this.time + ORDER.potion.t, owner: pr.hOwner ?? -1 });
    this.fx('holysplash', pr.x, pr.y, { r: ORDER.potion.r });
    this.sfx('glass', pr.x, pr.y);
  }

  /** Sectario: muy débil. Busca un sitio, hace un ritual e invoca a un monstruo de nivel alto con la mitad de su vida; luego huye. */
  private updateCultist(h: Hunter, dt: number) {
    const RT = ORDER.ritual;
    h.ritualCd = Math.max(0, h.ritualCd - dt);
    const victims = () => [...this.players.values()].filter((p) => !p.dead && p.level >= RT.minLevel && p.entombT <= 0 && p.protectT <= 0 && this.time - p.summonedAt > RT.victimCd);
    // ritual en curso: quieto, cantando
    if (h.ritualT > 0) {
      h.moving = false;
      h.ritualT -= dt;
      if (h.ritualT > 0) return;
      this.zones = this.zones.filter((z) => z.id !== h.ritualZone);
      const list = victims();
      if (list.length) {
        const v = list[Math.floor(Math.random() * list.length)];
        this.fx('summon', v.x, v.y, { o: v.id, n: 0 });
        let x = h.x + (Math.random() - 0.5) * 30, y = h.y + 10;
        if (this.grid.blocked(x, y, v.r, walksWater(v))) { x = h.x; y = h.y; }
        v.x = x; v.y = y; v.dash = null; v.knock = null; v.submergeT = 0; v.jetT = 0;
        v.hp = Math.max(1, Math.ceil(v.hp / 2)); // llega con la mitad de su vida actual
        v.summonedAt = this.time;
        v.lastAttacker = 'Sectario';
        v.conn.send({ t: 'toast', text: '¡Un sectario te ha invocado! Llegas con la mitad de tu vida.', k: 'summoned' });
        this.fx('summon', x, y, { o: v.id, n: 1 });
        this.sfx('chant', x, y);
      }
      h.fleeT = RT.flee;
      h.ritualCd = RT.cd;
      return;
    }
    let mx = 0, my = 0, speed = h.def.speed * 0.5;
    // huir de los monstruos cercanos (y después del ritual, salir corriendo y desaparecer)
    let fx = 0, fy = 0, threat = false;
    for (const p of this.players.values()) {
      if (p.dead) continue;
      const d2 = dist2(h.x, h.y, p.x, p.y);
      if (d2 < (h.fleeT > 0 ? 700 : 320) ** 2) { const d = Math.sqrt(d2) || 1; fx -= (p.x - h.x) / d; fy -= (p.y - h.y) / d; threat = true; }
    }
    if (h.fleeT > 0) {
      h.fleeT -= dt;
      if (h.fleeT <= 0) { this.fx('vanish', h.x, h.y, { o: h.id }); this.hunters.delete(h.id); h.dead = true; return; }
    }
    if (threat) {
      const l = Math.hypot(fx, fy) || 1;
      mx = fx / l; my = fy / l; speed = h.def.speed;
    } else if (h.ritualCd <= 0 && victims().length && !this.grid.blocked(h.x, h.y, RT.r * 0.6)) {
      // empezar el ritual: círculo pixelado en el suelo
      h.ritualT = RT.t;
      h.moving = false;
      const z = this.addZone({ kind: 'ritual', ax: h.x, ay: h.y, bx: h.x, by: h.y, w: RT.r * 2, until: this.time + RT.t + 0.2, owner: h.id });
      h.ritualZone = z.id;
      this.setAnim(h, Anim.Cast, RT.t);
      this.sfx('chant', h.x, h.y);
      return;
    } else {
      // pasear (cerca de otros cazadores si los hay: así el invocado cae en territorio hostil)
      h.thinkT -= dt;
      if (h.thinkT <= 0) {
        h.thinkT = 1;
        let ally: Hunter | null = null, bd = 900 * 900;
        for (const o of this.hunters.values()) if (o !== h && o.type !== 'sectario') { const d = dist2(h.x, h.y, o.x, o.y); if (d < bd) { bd = d; ally = o; } }
        if (ally && bd > 160 * 160) { h.tx = ally.x + (Math.random() - 0.5) * 120; h.ty = ally.y + (Math.random() - 0.5) * 120; }
        else if (Math.random() < 0.3) { h.tx = h.x + (Math.random() - 0.5) * 400; h.ty = h.y + (Math.random() - 0.5) * 400; }
      }
      const dx = h.tx - h.x, dy = h.ty - h.y, d = Math.hypot(dx, dy);
      if (d > 10) { mx = dx / d; my = dy / d; }
    }
    if (mx || my) h.facing = mx >= 0 ? 1 : -1;
    this.moveHunter(h, mx, my, speed, dt, false);
  }


  // ------------------------------------------------------------------ IA de esbirros (zombis)
  private mobById(id: number): Mob | null {
    if (id < 0) return null;
    return this.npcs.get(id) ?? this.hunters.get(id) ?? this.minions.get(id) ?? this.findPlayerById(id);
  }

  private updateMinion(m: Minion, dt: number) {
    if (m.dead) return;
    m.life -= dt;
    m.atkCd = Math.max(0, m.atkCd - dt);
    const owner = this.findPlayerById(m.owner);
    if (m.variant === 'thrall' && owner && !owner.dead && m.life <= 0) { this.freeThrall(m); return; } // se le pasa el enamoramiento
    if (!owner || owner.dead || m.life <= 0) { this.kill(m, { name: '', kind: Kind.Minion }); return; }
    if (isStatic(m)) { m.knock = null; this.applyStatus(m, dt); m.moving = false; return; } // plantas: su kit decide qué hacen
    if (this.applyStatus(m, dt)) return;
    if (m.stunT <= 0 && this.hypnoWalk(m, dt)) return;
    if (m.stunT <= 0 && this.flee(m, m.speed, dt)) return;
    if (m.stunT > 0 || m.fearT > 0) { m.moving = false; return; }
    if (m.anim === Anim.Cast && this.time < m.animUntil && m.swellT <= 0) { m.moving = false; return; } // saliendo de la tierra
    if (this.hexHop(m, dt)) return;
    if (this.rageOrCharm(m, m.speed, this.calcDamage(owner, MINION_STATS[m.variant].dmg), MINION_STATS[m.variant].cd || 1, ZB.attackReach, dt)) return;
    if (m.variant === 'unit') { this.unitFollow(m, owner, dt); return; } // las Unidades vinculadas siempre siguen en grupo
    // zombi gordo hinchándose: aviso antes de explotar
    if (m.swellT > 0) {
      m.swellT -= dt;
      m.moving = false;
      if (m.swellT <= 0) this.explodeFat(m, owner);
      return;
    }
    const meat = this.zones.find((z) => z.kind === 'meat' && z.owner === m.owner);
    m.thinkT -= dt;
    if (m.thinkT <= 0) {
      m.thinkT = 0.35;
      let best: Mob | null = null, bd = Infinity;
      const cx = meat ? meat.ax : m.x, cy = meat ? meat.ay : m.y;
      const R = meat ? ZB.meatFightR : m.variant === 'fat' ? ZB.ult.fatSeekR : ZB.aggroR;
      const leash2 = (ZB.leashR * 1.5) ** 2;
      const consider = (t: Mob) => {
        if (t.dead || t.entombT > 0 || !this.isEnemyOf(owner, t)) return;
        if (t.kind === Kind.Npc && (t as Npc).infectT > 0) return; // ya es de la horda
        if (m.variant === 'thrall' && t.kind === Kind.Npc && (t as Npc).disguiseT <= 0) return; // los siervos de la súcubo van a por cazadores y monstruos
        if (m.variant === 'fat' && t.kind !== Kind.Player && t.kind !== Kind.Hunter) return;
        const d = dist2(cx, cy, t.x, t.y);
        if (d < R * R && d < bd && (meat || m.variant === 'unitfree' || dist2(owner.x, owner.y, t.x, t.y) < leash2)) { bd = d; best = t; }
      };
      for (const n of this.npcs.values()) if (!isCritter(n) || m.variant === 'skeldog') consider(n);
      for (const h of this.hunters.values()) consider(h);
      for (const p of this.players.values()) if (!p.dead && p.invisKind === 'none' && p.submergeT <= 0 && p.protectT <= 0 && p.mistT <= 0 && p.phaseT <= 0 && !this.isHiddenGuise(p)) consider(p);
      for (const o of this.minions.values()) if (o.owner !== m.owner) consider(o);
      m.target = best ? (best as Mob).id : -1;
    }
    const t = this.mobById(m.target);
    const mul = KITS[owner.char].minionMul?.(this, owner, m) ?? 1;
    let tx: number, ty: number, speed = m.speed * mul;
    // arquero esqueleto: dispara desde lejos y no se acerca más de la cuenta
    if (m.variant === 'skelarcher' && t && !t.dead) {
      const A = BAL.necro.archer, d = Math.hypot(t.x - m.x, t.y - m.y);
      m.facing = t.x >= m.x ? 1 : -1;
      if (d < A.range) {
        m.moving = false;
        if (m.atkCd <= 0) {
          m.atkCd = A.cd / mul;
          this.setAnim(m, Anim.Attack, 0.3);
          const pr = this.shoot('bonearrow', owner.id, m.x, m.y - 20, Math.atan2(t.y - m.y, t.x - m.x), A.arrowSpeed, A.range / A.arrowSpeed + 0.1, this.calcDamage(owner, A.dmg));
          pr.hitR = 10;
          this.sfx('stake', m.x, m.y);
        }
        return;
      }
    }
    if (t && !t.dead) { tx = t.x; ty = t.y; }
    else if (meat && dist2(m.x, m.y, meat.ax, meat.ay) < ZB.meatPullR ** 2) { tx = meat.ax; ty = meat.ay; speed *= 1.2; }
    else if (m.variant === 'unitfree') {
      // Unidad independiente: recorre el mapa por libre
      if (m.wx === undefined || m.wy === undefined || dist2(m.x, m.y, m.wx, m.wy) < 40 * 40 || Math.random() < 0.004) {
        const f = this.findSpawn(0, m.r + 2); m.wx = f.x; m.wy = f.y;
      }
      tx = m.wx; ty = m.wy; speed *= 0.8;
    }
    else if (dist2(m.x, m.y, owner.x, owner.y) > ZB.followDist ** 2) { tx = owner.x - owner.facing * 50; ty = owner.y + ((m.id % 5) - 2) * 18; }
    else { m.moving = false; return; }
    if (m.slowT > 0) speed *= m.slowMul;
    if (m.rootT > 0) speed = 0;
    const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy) || 1;
    m.facing = dx >= 0 ? 1 : -1;
    if (t && !t.dead && d < 90) speed *= 1.6; // embestida final del zombi
    if (t && !t.dead) {
      if (m.variant === 'fat') {
        if (d < ZB.ult.fatTriggerR + t.r) {
          m.swellT = ZB.ult.fatSwellT;
          this.setAnim(m, Anim.Cast, ZB.ult.fatSwellT);
          this.sfx('groan', m.x, m.y);
          return;
        }
      } else if (d < m.r + t.r + ZB.attackReach) {
        m.moving = false;
        if (m.atkCd <= 0) {
          m.atkCd = MINION_STATS[m.variant].cd / mul;
          this.setAnim(m, Anim.Attack, 0.3);
          this.damage(t, this.calcDamage(owner, MINION_STATS[m.variant].dmg), { player: owner, minion: m, name: owner.name, kind: Kind.Player });
          KITS[owner.char].onMinionHit?.(this, owner, m, t);
          this.sfx(m.variant === 'clone' ? 'glass' : m.variant === 'thrall' || m.variant === 'digger' ? 'punch' : 'bite', m.x, m.y);
          if (m.variant === 'clone') this.fx('shards', t.x, t.y, { n: 4 });
        }
        return;
      }
    }
    const step = Math.min(d, speed * dt);
    // rodear obstáculos: si el camino directo está bloqueado, probar desvíos
    let ux = dx / d, uy = dy / d;
    if (this.grid.blocked(m.x + ux * (m.r + 14), m.y + uy * (m.r + 14), m.r)) {
      for (const rot of [0.7, -0.7, 1.3, -1.3, 1.9, -1.9]) {
        const c = Math.cos(rot * (m.id % 2 ? 1 : -1)), sn = Math.sin(rot * (m.id % 2 ? 1 : -1));
        const vx = ux * c - uy * sn, vy = ux * sn + uy * c;
        if (!this.grid.blocked(m.x + vx * (m.r + 14), m.y + vy * (m.r + 14), m.r)) { ux = vx; uy = vy; break; }
      }
    }
    const res = this.grid.move(m.x, m.y, ux * step, uy * step, m.r);
    m.x = res.x; m.y = res.y;
    m.moving = step > 0.5;
  }

  /** Unidad vinculada: se apiña alrededor de su dueña en formación (o, camuflada, pasea como un humano cualquiera). */
  private unitFollow(m: Minion, owner: Player, dt: number) {
    const mates = this.minionsOf(owner.id).filter((o) => o.variant === 'unit').sort((a, b) => a.id - b.id);
    const i = Math.max(0, mates.indexOf(m)), n = mates.length;
    let tx: number, ty: number, speed = m.speed * (KITS[owner.char].minionMul?.(this, owner, m) ?? 1);
    if (m.camo) {
      // disimula: paseíllo tranquilo cerca de la dueña
      if (m.wx === undefined || m.wy === undefined || dist2(m.x, m.y, m.wx, m.wy) < 20 * 20 || Math.random() < 0.01) {
        const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 110;
        m.wx = owner.x + Math.cos(a) * d; m.wy = owner.y + Math.sin(a) * d * 0.7;
      }
      tx = m.wx; ty = m.wy; speed = 55;
    } else {
      const ring = Math.floor(i / 6), inRing = Math.min(6, n - ring * 6);
      const a = ((i % 6) / inRing) * Math.PI * 2 + ring * 0.5 + (owner.facing === 1 ? Math.PI : 0) * 0.15;
      const R = 42 + ring * 30;
      tx = owner.x + Math.cos(a) * R; ty = owner.y + Math.sin(a) * R * 0.75;
      m.wx = undefined; m.wy = undefined;
    }
    if (m.slowT > 0) speed *= m.slowMul;
    if (m.rootT > 0) speed = 0;
    const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy);
    if (d > 260) { const f = this.findFreeSpot(tx, ty, m.r); m.x = f.x; m.y = f.y; m.moving = false; return; } // se ha quedado atrás: alcanza al grupo
    m.moving = d > 6;
    if (!m.moving) { m.facing = owner.facing; return; }
    if (!m.camo && d > 60) speed *= 1.35;
    const step = Math.min(d, speed * dt);
    const res = this.grid.move(m.x, m.y, (dx / d) * step, (dy / d) * step, m.r);
    m.x = res.x; m.y = res.y;
    m.facing = dx >= 0 ? 1 : -1;
  }

  /** El zombi gordo revienta: daño en área a todos los enemigos de su dueño. */
  private explodeFat(m: Minion, owner: Player) {
    const R = ZB.ult.fatBoomR;
    const src: Source = { player: owner, minion: m, name: owner.name, kind: Kind.Player };
    this.forEachEnemyNear(owner, m.x, m.y, R, (t) => {
      if (t === m) return;
      this.damage(t, this.calcDamage(owner, ZB.ult.fatBoomDmg), src);
      const d = Math.hypot(t.x - m.x, t.y - m.y) || 1;
      this.knockback(t, (t.x - m.x) / d, (t.y - m.y) / d, 120);
    });
    this.fx('fatboom', m.x, m.y, { r: R, o: m.id });
    this.sfx('explode', m.x, m.y);
    m.life = 0;
    this.kill(m, { name: '', kind: Kind.Minion });
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
      if (done && pr.land && pr.owner === -1) this.holySplash(pr);
      // proyectil que persigue (el clavo vuelve a su dueño)
      if (pr.home !== undefined) {
        const t = this.mobById(pr.home);
        if (!t || t.dead) done = true;
        else {
          const dx = t.x - pr.x, dy = t.y - pr.y, d = Math.hypot(dx, dy) || 1;
          const sp = Math.hypot(pr.vx, pr.vy);
          pr.vx = (dx / d) * sp; pr.vy = (dy / d) * sp;
          if (d < 24 && t.id === pr.owner) done = true; // el clavo vuelve a su dueño; los que persiguen enemigos chocan
          if (t.id === pr.owner) pr.life = Math.max(pr.life, 0.2);
        }
      }
      const steps = 2;
      for (let s = 0; s < steps && !done; s++) {
        pr.x += (pr.vx * dt) / steps;
        pr.y += (pr.vy * dt) / steps;
        if (!pr.ghost && this.grid.blocked(pr.x, pr.y, 3, true)) { done = true; break; }
        if (!pr.land && this.breakMirrors(pr.x, pr.y, 6, pr.owner)) { if (!pr.pierce) { done = true; break; } } // los espejos se rompen
        // bloqueos (murciélagos orbitales, etc.)
        for (const p of this.players.values()) {
          if (p.dead || p.id === pr.owner || dist2(pr.x, pr.y, p.x, p.y) > 80 * 80) continue;
          if (KITS[p.char].blockProjectile?.(this, p, pr)) { done = true; break; }
        }
        if (done) break;
        if (pr.owner === -1) {
          // virote de Hunter: daña a monstruos (y a humanos disfrazados de la Dama)
          const hunter = pr.hOwner !== undefined ? this.hunters.get(pr.hOwner) : undefined;
          const src: Source = { hunter, name: hunter?.def.name ?? 'Cazador', kind: Kind.Hunter };
          if (pr.land) continue; // el frasco vuela por encima y revienta al final
          for (const p of this.players.values()) {
            if (p.dead || p.submergeT > 0 || p.phaseT > 0 || dist2(pr.x, pr.y, p.x, p.y) > (p.r + 6) ** 2) continue;
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
          if (!done) for (const mn of this.minions.values()) {
            if (mn.dead || dist2(pr.x, pr.y, mn.x, mn.y) > (mn.r + 6) ** 2) continue;
            this.damage(mn, pr.dmg, src);
            done = true;
            break;
          }
        } else {
          const owner = this.findPlayerById(pr.owner);
          if (pr.land) continue; // frasco lanzado: vuela por encima y revienta al final
          const hitR = pr.hitR ?? 8;
          const tryHit = (m: Mob) => {
            if (done || m.dead || dist2(pr.x, pr.y, m.x, m.y) > (m.r + hitR) ** 2) return;
            if (pr.hitSet?.has(m.id)) return;
            if (m.kind === Kind.Player && ((m as Player).protectT > 0 || (m as Player).mistT > 0 || (m as Player).submergeT > 0 || (m as Player).phaseT > 0)) return;
            if (m.kind === Kind.Minion && (m as Minion).owner === pr.owner) return;
            const dealt = this.damage(m, pr.dmg, owner ? this.src(owner) : { name: '???', kind: Kind.Player });
            if (owner && !owner.dead) KITS[owner.char].onProjectileHit?.(this, owner, pr, m, dealt);
            if (pr.pierce) pr.hitSet?.add(m.id);
            else done = true;
          };
          for (const n of this.npcs.values()) tryHit(n);
          for (const h of this.hunters.values()) tryHit(h);
          for (const p of this.players.values()) if (p.id !== pr.owner) tryHit(p);
          for (const mn of this.minions.values()) tryHit(mn);
        }
      }
      // la ola de K'thula va dejando charcas detrás
      if (pr.type === 'wave' && !done) {
        const owner = this.findPlayerById(pr.owner);
        const step = Math.hypot(pr.vx, pr.vy) * dt;
        pr.trailAcc = (pr.trailAcc ?? 0) + step;
        if (owner && pr.trailAcc >= KT.ult.puddleEvery) {
          pr.trailAcc = 0;
          const nx = -pr.vy, ny = pr.vx, nl = Math.hypot(nx, ny) || 1;
          for (const s of [-1, 1]) this.puddle(owner.id, pr.x + (nx / nl) * s * 40, pr.y + (ny / nl) * s * 40, KT.ult.puddleR, KT.puddleT);
        }
      }
      if (done) {
        this.projectiles.delete(pr.id);
        if (pr.owner >= 0) { const o = this.findPlayerById(pr.owner); if (o) KITS[o.char].onProjectileEnd?.(this, o, pr); }
      }
    }
  }

  private updateZones() {
    if (!this.zones.length) return;
    this.zones = this.zones.filter((z) => z.until > this.time);
    // el fuego prende los árboles que toca
    if (this.tick % 10 === 0) for (const z of this.zones) if (z.kind === 'fire') this.ignite(z.ax, z.ay, z.w / 2, z.owner);
    const V = BAL.vampire;
    for (const z of this.zones) {
      if (z.kind === 'meat' || z.kind === 'ritual' || z.kind === 'mirror' || z.kind === 'nail' || z.kind === 'portal') continue;
      if (z.kind === 'lastspell') { this.lastSpell(z); continue; }
      const owner = this.findPlayerById(z.owner);
      const inside = (m: Mob) => distToSegment(m.x, m.y, z.ax, z.ay, z.bx, z.by) < z.w / 2 + (z.kind === 'puddle' ? 0 : m.r);
      const all: Mob[] = [...this.npcs.values(), ...this.hunters.values(), ...this.minions.values(), ...[...this.players.values()].filter((p) => !p.dead)];
      for (const m of all) {
        if (!inside(m)) continue;
        if (z.kind === 'mistTrail') { if (m !== owner && this.isEnemyOf(owner, m)) this.slow(m, V.mistTrailSlowT, V.mistTrailSlow); }
        else if (z.kind === 'puddle') { if (!walksWater(m)) this.slow(m, 0.35, KT.puddleSlowMul); } // el agua ralentiza a todos menos a los acuáticos
        else if (z.kind === 'toxic') { if (this.isEnemyOf(owner, m)) { this.slow(m, 0.4, ZB.toxicSlowMul); m.weakT = Math.max(m.weakT, 0.5); } }
        else if (z.kind === 'hex') {
          // charco embrujado: quien lo pisa se convierte en animalillo (una vez por charco)
          if (!owner || !this.isEnemyOf(owner, m) || m.hexT > 0) continue;
          if (!z.hit) z.hit = new Set();
          if (z.hit.has(m.id)) continue;
          z.hit.add(m.id);
          this.hex(m, m.kind === Kind.Player ? BAL.witch.ult.tPlayer : BAL.witch.ult.tOther);
        }
        else if (z.kind === 'glass') { if (this.isEnemyOf(owner, m)) this.slow(m, 0.3, BAL.mary.shardsSlow); }
        else if (z.kind === 'snare') {
          if (!owner || !this.isEnemyOf(owner, m) || z.hit?.size) continue;
          (z.hit ??= new Set()).add(m.id); // la trampa de raíces atrapa al primero que la pisa
          this.root(m, ITEMS.boots.nature.root);
          z.until = Math.min(z.until, this.time + 0.4);
        }
        else if (z.kind === 'whirl') {
          // remolino: arrastra hacia el centro a los enemigos (su dueño se mueve libre)
          if (!owner || !this.isEnemyOf(owner, m) || isStatic(m) || (m.kind === Kind.Player && (m as Player).flyT > 0)) continue;
          const dx = z.ax - m.x, dy = z.ay - m.y, d = Math.hypot(dx, dy) || 1;
          const pull = Math.min(d, BAL.kappa.ult.pull * TICK_DT);
          const res = this.grid.move(m.x, m.y, (dx / d) * pull - (dy / d) * pull * 0.6, (dy / d) * pull + (dx / d) * pull * 0.6, m.r, walksWater(m));
          m.x = res.x; m.y = res.y;
        }
        else if (z.kind === 'radiation') { if (owner && this.isEnemyOf(owner, m)) this.damage(m, BAL.alien.beacon.radDps * TICK_DT, { ...this.src(owner), raw: true }, false, true); }
        else if (z.kind === 'goo') { if (owner && this.isEnemyOf(owner, m)) this.slow(m, 0.3, BAL.slime.goo.slowMul); }
        else if (z.kind === 'venom') { if (owner && this.isEnemyOf(owner, m) && m.poisonT < 1) this.poison(m, BAL.slime.trail.poisonT, BAL.slime.trail.poisonDps, owner); }
        else if (z.kind === 'web' || z.kind === 'bigweb' || z.kind === 'thread') { if (owner && this.isEnemyOf(owner, m)) this.slow(m, 0.3, z.kind === 'web' ? BAL.spider.web.slowMul : BAL.spider.ult.slowMul); }
        else if (z.kind === 'thorns' || z.kind === 'forest') { if (owner && this.isEnemyOf(owner, m)) this.slow(m, 0.3, z.kind === 'thorns' ? TR.bramble.slowMul : TR.ult.slowMul); }
        else if (z.kind === 'storm' || z.kind === 'fire') {
          if (!owner || !this.isEnemyOf(owner, m) || (m.kind === Kind.Player && (m as Player).submergeT > 0)) continue;
          if (z.kind === 'fire' && fireImmune(m)) continue;
          if (z.kind === 'storm') this.slow(m, 0.3, BAL.reanimated.ult.slowMul);
          const dps = z.kind === 'storm' ? BAL.reanimated.ult.dps : (z.v ?? BAL.witch.fire.dps);
          this.damage(m, dps * TICK_DT, { ...this.src(owner), raw: true }, false, true);
        }
        else if (z.kind === 'holy') {
          // agua bendita: quema poco a poco a los monstruos y los aturde al pisarla
          const monster = m.kind === Kind.Player || m.kind === Kind.Minion || (m.kind === Kind.Npc && (m as Npc).disguiseT > 0);
          if (!monster || (m.kind === Kind.Player && (m as Player).submergeT > 0)) continue;
          const hz = this.hunters.get(z.owner);
          const src: Source = { hunter: hz, name: 'Exorcista', kind: Kind.Hunter };
          if (!z.hit) z.hit = new Set();
          if (!z.hit.has(m.id)) { z.hit.add(m.id); m.stunT = Math.max(m.stunT, ORDER.potion.stun); }
          this.damage(m, ORDER.potion.dps * TICK_DT, src);
        }
      }
    }
  }

  /** Último conjuro del Nigromante (nv. 5): su fantasma gira un largo rayo hacia el enemigo más cercano. */
  private lastSpell(z: Zone) {
    const L = BAL.necro.last;
    const owner = this.findPlayerById(z.owner);
    if (!owner) { z.until = 0; return; }
    let a = z.v ?? 0;
    // el jugador (ya muerto) maneja el rayo con el ratón o el dedo
    const inp = owner.queue.pop();
    if (inp) { owner.input = inp; owner.queue.length = 0; }
    const want = owner.input.a;
    const diff = Math.atan2(Math.sin(want - a), Math.cos(want - a));
    a += Math.max(-L.turn * TICK_DT, Math.min(L.turn * TICK_DT, diff));
    z.v = a;
    z.bx = z.ax + Math.cos(a) * L.len; z.by = z.ay - 30 + Math.sin(a) * L.len;
    const src: Source = { ...this.src(owner), raw: true };
    this.forEachEnemyNear(owner, (z.ax + z.bx) / 2, (z.ay - 30 + z.by) / 2, L.len / 2 + L.w, (m) => {
      if (m.dead || distToSegment(m.x, m.y - 20, z.ax, z.ay - 30, z.bx, z.by) > L.w / 2 + m.r) return;
      this.damage(m, L.dps * TICK_DT * (1 + 0.025 * (owner.level - 1)), src, false, true);
    });
  }

  private updatePickups() {
    for (const p of this.players.values()) {
      if (p.dead || p.entombT > 0) continue;
      for (const u of this.powerups.values()) {
        if (dist2(p.x, p.y, u.x, u.y) > (p.r + POWERUP_RADIUS) ** 2) continue;
        this.powerups.delete(u.id);
        const pm = KITS[p.char].powerupMul?.(p) ?? 1;
        const tm = KITS[p.char].powerupTimeMul?.(p) ?? 1; // la bruja (nv. 15) los alarga
        switch (u.type) {
          case 'blood': p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4 * pm); break;
          case 'speed': p.speedT = 6 * pm * tm; break;
          case 'fury': p.furyT = 8 * pm * tm; break;
          case 'shield': p.shieldHp = 50 * pm; p.shieldT = 10 * pm * tm; break;
          case 'coin': p.coinsEarned += 5; p.conn.profile.coins += 5; store.touch(); break;
          case 'xp': this.addXp(p, 30 * pm); break;
          case 'spirits': p.spiritsT = ITEMS.spirits.t * tm; p.spiritCd = 0; break;
          case 'boots': p.bootsT = ITEMS.boots.t * tm; p.bootsKind = Math.floor(Math.random() * 3); p.bootsAcc = 0; break;
          case 'shovel': {
            const d = this.spawnMinion(p, p.x - p.facing * 40, p.y, 'digger', 'gravedigger', p.id % 97, 1e9, false, 1);
            this.fx('emerge', d.x, d.y, { o: d.id });
            break;
          }
        }
        KITS[p.char].onPickup?.(this, p, u.type);
        p.points += 5;
        this.emit({ e: 'pick', x: Math.round(u.x), y: Math.round(u.y), p: u.type }, u.x, u.y);
        this.sfx(u.type === 'coin' ? 'coin' : 'pickup', u.x, u.y);
      }
    }
  }

  /** Cuántos cazadores de cada tipo quiere la sala según el nivel medio y el número de jugadores. */
  hunterWants(): Record<HunterType, number> {
    const alive = this.alivePlayers();
    const pc = alive.length;
    const avg = pc ? alive.reduce((s, p) => s + p.level, 0) / pc : 0;
    const vets = alive.filter((p) => p.level >= ORDER.herald.ignoreBelow);
    const avgVets = vets.length ? vets.reduce((s, p) => s + p.level, 0) / vets.length : 0;
    const n15 = alive.filter((p) => p.level >= ORDER.ritual.minLevel).length;
    const C = ORDER.caps;
    const clamp = (v: number, max: number) => Math.max(1, Math.min(max, v));
    const want: Record<HunterType, number> = {
      inquisidor: avg >= ORDER.inquisidorAvg ? clamp(Math.round(pc * 0.25), C.inquisidor) : 0,
      exorcista: avg >= ORDER.exorcistaAvg ? clamp(Math.floor(pc / 4), C.exorcista) : 0,
      sectario: n15 > 0 ? clamp(Math.ceil(n15 / 3), C.sectario) : 0,
      heraldo: vets.length && avgVets >= ORDER.heraldoAvg ? clamp(Math.floor(vets.length / 4), C.heraldo) : 0,
      cazador: 0,
    };
    const special = want.inquisidor + want.exorcista + want.heraldo;
    want.cazador = Math.max(3, Math.min(12, 4 + Math.floor(pc / 2)) - special); // el total no se dispara
    return want;
  }

  private hunterCounts(): Record<HunterType, number> {
    const c: Record<HunterType, number> = { cazador: 0, inquisidor: 0, exorcista: 0, sectario: 0, heraldo: 0 };
    for (const h of this.hunters.values()) c[h.type]++;
    return c;
  }

  /** Si sobran (la media de nivel ha bajado), se retiran los que nadie está viendo. */
  private cullHunters() {
    const want = this.hunterWants(), have = this.hunterCounts();
    for (const h of this.hunters.values()) {
      if (have[h.type] <= want[h.type] || h.target >= 0 || h.ritualT > 0) continue;
      let seen = false;
      for (const p of this.players.values()) if (!p.dead && dist2(p.x, p.y, h.x, h.y) < 1000 * 1000) { seen = true; break; }
      if (seen) continue;
      this.hunters.delete(h.id);
      have[h.type]--;
    }
  }

  private maintainPopulation(dt: number) {
    const pc = this.alivePlayers().length;
    const npcTarget = Math.min(95, 45 + pc * 4);
    let critters = 0;
    for (const n of this.npcs.values()) if (isCritter(n)) critters++;
    if (this.npcs.size - critters < npcTarget && this.tick % 10 === 0) this.spawnNpc();
    this.critterT -= dt;
    if (critters < CRITTERS.max && this.critterT <= 0) { this.critterT = CRITTERS.every * (0.6 + Math.random() * 0.8); this.spawnCritter(); }
    this.hunterRespawnT = Math.max(0, this.hunterRespawnT - dt);
    if (this.tick % TICK_RATE === 0) this.cullHunters();
    if (this.hunterRespawnT <= 0) {
      const want = this.hunterWants();
      const have = this.hunterCounts();
      // primero los de más nivel que falten, después cazadores normales
      const order: HunterType[] = ['heraldo', 'sectario', 'exorcista', 'inquisidor', 'cazador'];
      const next = order.find((t) => have[t] < want[t]);
      if (next) { this.spawnHunter(next); this.hunterRespawnT = next === 'cazador' ? 4 : 6; }
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
    if (m.weakT > 0) f |= Flag.Weak;
    if (m.kind === Kind.Minion && ((m as Minion).swellT > 0 || (m as Minion).boomAt !== undefined)) f |= Flag.Swollen;
    if (m.kind === Kind.Player && ((m as Player).k.convergeAt ?? 0) > this.time) f |= Flag.Swollen; // Convergencia: el cuerpo de Unidad parpadea
    if (m.kind === Kind.Npc && (m as Npc).infectT > 0) f |= Flag.Infected;
    if (m.kind === Kind.Hunter && (m as Hunter).ritualT > 0) f |= Flag.Ritual;
    if (m.kind === Kind.Hunter && (m as Hunter).flyT > 0) f |= Flag.Flying;
    if (m.sleepT > 0) f |= Flag.Asleep;
    if (m.rageT > 0) f |= Flag.Raged;
    if (m.bleedT > 0) f |= Flag.Bleed;
    if (m.charmT > 0) f |= Flag.Charmed;
    if (m.hexT > 0) f |= Flag.Hexed;
    if (m.poisonT > 0) f |= Flag.Poison;
    if (m.kind === Kind.Player) {
      const p = m as Player;
      if (p.invisKind !== 'none') f |= Flag.Invisible;
      if (p.shieldHp > 0) f |= Flag.Shield;
      if (p.furyT > 0 || p.howlT > 0) f |= Flag.Buffed;
      if (p.protectT > 0) f |= Flag.Protected;
      if (p.mistT > 0) f |= Flag.Mist;
      if (p.id === this.bountyId) f |= Flag.Bounty;
      if (p.ultT > 0) f |= Flag.Ult;
      if (p.frenzyT > 0 || p.killSpeedT > 0 || (p.k.marchEnd ?? 0) > this.time) f |= Flag.Haste;
      if (p.submergeT > 0) f |= Flag.Submerged;
      if (p.jetT > 0) f |= Flag.Jet;
      if (p.flyT > 0) f |= Flag.Flying;
      if (p.phaseT > 0) f |= Flag.Phased;
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
    let f2 = 0;
    if (m.burnT > 0) f2 |= Flag2.Burning;
    if (m.silenceT > 0) f2 |= Flag2.Silenced;
    if (m.liftT > 0) f2 |= Flag2.Lifted;
    if (m.hypnoT > 0) f2 |= Flag2.Hypnotized;
    if (m.blindT > 0) f2 |= Flag2.Blind;
    if (m.kind === Kind.Player && (m as Player).leap) f2 |= Flag2.Leaping;
    if (m.kind === Kind.Player && ((m as Player).k.engulfed ?? 0) > this.time) f2 |= Flag2.Engulfed;
    if (f2) s.f2 = f2;
    if (m.hp < m.maxHp) s.h = Math.max(1, Math.round((m.hp / m.maxHp) * 100));
    if (m.drowsy > 0) s.z = Math.round(m.drowsy);
    if (m.hypno > 0) s.hy = Math.round(m.hypno);
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
    } else if (m.kind === Kind.Hunter) s.c = (m as Hunter).type;
    else if (m.kind === Kind.Minion) {
      const mn = m as Minion;
      s.c = mn.variant; s.s = mn.look; s.l = mn.lookSeed; s.o = mn.owner;
      // Unidad camuflada: se envía como un humano normal (sin pistas)
      if (mn.camo && mn.orig) return { i: s.i, k: Kind.Npc, x: s.x, y: s.y, f: s.f, a: s.a, q: s.q, c: mn.orig, ...(s.h !== undefined ? { h: s.h } : {}) };
      // señuelo del Segador: se envía EXACTAMENTE como su dueño
      const ow = mn.variant === 'decoy' ? this.findPlayerById(mn.owner) : null;
      if (ow) { s.k = Kind.Player; s.c = ow.char; s.s = ow.skin; s.n = ow.name; s.l = ow.level; s.h = s.h ?? 100; delete s.o; }
    } else {
      const p = m as Player;
      s.c = p.char; s.s = p.skin; s.n = p.name; s.l = p.level;
      if (p.jetT > 0) s.r = +p.input.a.toFixed(2);
      if (s.h === undefined) s.h = 100;
      if (p.orbit.length) s.o = p.orbit.filter((t) => t <= 0).length;
      if (p.char === 'reaper' && p.k.souls) s.o = p.k.souls;
    }
    return s;
  }

  /** Un jugador visto por otro: si va disfrazado, se envía EXACTAMENTE como aquello que imita. */
  private snapPlayerFor(p: Player, viewer: Player): EntSnap {
    const s = this.snapMob(p);
    if (!p.guise) return s;
    if (p === viewer) { s.g = p.guise; s.fl = (s.fl ?? 0) | Flag.Disguised; return s; }
    const [kind, a, b, c, d] = p.guise.split(':');
    const keep = (s.fl ?? 0) & (Flag.Stunned | Flag.Slowed | Flag.Asleep | Flag.Bleed);
    if (kind === 'prop') return { i: s.i, k: Kind.Prop, x: s.x, y: s.y, f: 1, a: Anim.Idle, q: 0, c: a };
    if (kind === 'npc') {
      const o: EntSnap = { i: s.i, k: Kind.Npc, x: s.x, y: s.y, f: s.f, a: s.a, q: s.q, c: a };
      if (keep) o.fl = keep;
      if (s.h !== undefined && s.h < 100) o.h = s.h;
      return o;
    }
    // 'char': otro monstruo (con su nombre y nivel)
    const o: EntSnap = { ...s, c: a, s: b || 'classic', n: c || s.n, l: d ? +d : s.l };
    delete o.o; delete o.r;
    return o;
  }

  private sendSnapshots() {
    const R2 = VIEW_RADIUS * VIEW_RADIUS;
    const events = this.events;
    this.events = [];
    let burn: [number, number, number][] | null = null;
    const tv: TvState | null = this.tvOn ? {} : null;
    if (tv && this.tvChannel.size) tv.ch = [...this.tvChannel.keys()];
    if (tv && this.broadcast) tv.bc = this.broadcast.color;
    if (this.burning.size) burn = [...this.burning].map(([i, b]) => [i, +Math.max(0, b.flame - this.time).toFixed(1), +(b.until - this.time).toFixed(1)]);
    for (const conn of this.conns.values()) {
      const me = this.players.get(conn.id);
      if (!me) continue;
      const cx = me.x, cy = me.y;
      const ents: EntSnap[] = [];
      const inView = (x: number, y: number) => dist2(cx, cy, x, y) < R2;
      for (const p of this.players.values()) {
        if (p.dead || !inView(p.x, p.y)) continue;
        if (p !== me && p.phaseT > 0 && this.grid.blocked(p.x, p.y, p.r * 0.5, true)) continue; // intangible dentro de un obstáculo: nadie lo ve
        if (p !== me && (p.k.tvEnd ?? 0) > this.time) continue; // Interferencia dentro de una tele
        if (p !== me && p.invisKind !== 'none') {
          // desvestida: invisible del todo; en el resto se intuye solo muy de cerca
          if (p.invisKind === 'full' || dist2(cx, cy, p.x, p.y) > DAMA.revealR ** 2) continue;
        }
        ents.push(this.snapPlayerFor(p, me));
      }
      for (const n of this.npcs.values()) if (inView(n.x, n.y)) ents.push(this.snapMob(n));
      for (const h of this.hunters.values()) if (inView(h.x, h.y)) ents.push(this.snapMob(h));
      for (const m of this.minions.values()) {
        if (!inView(m.x, m.y)) continue;
        if (m.camo && m.owner === me.id) { m.camo = false; ents.push(this.snapMob(m)); m.camo = true; continue; } // la dueña ve a su enjambre camuflado
        ents.push(this.snapMob(m));
      }
      for (const z of this.zones) {
        if (z.kind === 'mistTrail' || !inView(z.ax, z.ay)) continue;
        const life = Math.max(0, (z.until - this.time) / Math.max(0.1, z.until - z.born));
        const zs: EntSnap = { i: z.id, k: Kind.Zone, x: Math.round(z.ax), y: Math.round(z.ay), f: 1, a: Anim.Idle, q: 0, c: z.kind, rr: Math.round(z.w / 2), h: Math.round(life * 100), o: z.owner };
        if (z.bx !== z.ax || z.by !== z.ay) { zs.bx = Math.round(z.bx); zs.by = Math.round(z.by); }
        ents.push(zs);
      }
      for (const u of this.powerups.values()) if (inView(u.x, u.y)) ents.push({ i: u.id, k: Kind.PowerUp, x: Math.round(u.x), y: Math.round(u.y), f: 1, a: Anim.Idle, q: 0, c: u.type });
      for (const pr of this.projectiles.values()) {
        if (!inView(pr.x, pr.y)) continue;
        ents.push({ i: pr.id, k: Kind.Projectile, x: Math.round(pr.x), y: Math.round(pr.y), f: pr.vx >= 0 ? 1 : -1, a: Anim.Idle, q: 0, c: pr.type, r: +Math.atan2(pr.vy, pr.vx).toFixed(2), o: pr.owner });
      }
      const ev: GameEvent[] = [];
      for (const e of events) if (e.global || inView(e.x, e.y)) ev.push(e.ev);

      const buffs: { t: string; r: number }[] = [];
      const addB = (t: string, r: number) => { if (r > 0) buffs.push({ t, r: +Math.min(r, 999).toFixed(1) }); };
      addB('speed', me.speedT); addB('fury', me.furyT); addB('howl', me.howlT); addB('shield', me.shieldT);
      addB(me.invisKind === 'auto' ? 'invisAuto' : 'invis', me.invisKind !== 'none' ? Math.max(me.invisT, 0.1) : 0);
      addB('protect', me.protectT); addB('slow', me.slowT); addB('stun', me.stunT);
      addB('frenzy', me.frenzyT); addB('haste', me.killSpeedT); addB('vuln', me.vulnT); addB('tomb', me.entombT);
      addB('weak', me.weakT); addB('dive', me.submergeT);
      addB('hex', me.hexT); addB('poison', me.poisonT);
      if ((me.k.plantEnd ?? 0) > this.time) addB('planted', me.k.plantEnd - this.time); else addB('root', me.rootT);
      addB('burn', me.burnT); addB('silence', me.silenceT); addB('blind', me.blindT); addB('fear', me.fearT);
      addB('spirits', me.spiritsT); addB(['bootsFire', 'bootsNature', 'bootsWater'][me.bootsKind], me.bootsT);
      addB('sleep', me.sleepT); addB('rage', me.rageT); addB('charm', me.charmT); addB('bleed', me.bleedT); addB('fly', me.flyT); addB('phase', me.phaseT);
      if (me.guise) buffs.push({ t: me.guise.startsWith('prop') ? 'prop' : me.guise.startsWith('char') ? 'mimic' : 'guise', r: 999 });
      if (me.char === 'mary') { const n = this.zones.filter((z) => z.kind === 'mirror' && z.owner === me.id).length; if (n) buffs.push({ t: 'mirrors', r: n }); }
      if (me.char === 'nightmare' && me.guise?.startsWith('prop')) addB('ambush', Math.min(100, ((me.k.still ?? 0) / (me.tier >= 3 ? BAL.nightmare.stalk.chargeTT3 : BAL.nightmare.stalk.chargeT)) * 100));
      if (me.char === 'zombie') { const n = this.minionsOf(me.id).length; if (n) buffs.push({ t: 'horde', r: n }); }
      if (me.char === 'tree' && (me.k.rooted ?? 0) > 0) buffs.push({ t: 'treeRoot', r: 999 });
      if (me.char === 'succubus') { const n = this.minionsOf(me.id).filter((m) => m.variant === 'thrall').length; if (n) buffs.push({ t: 'thralls', r: n }); }
      KITS[me.char].buffs?.(this, me, addB, buffs);
      if (me.def.aquatic) { const w = this.waterAt(me.x, me.y); if (w) buffs.push({ t: w === 'deep' ? 'deep' : 'puddle', r: 999 }); }

      const qMax = this.qChargesMax(me);
      const you: YouState = {
        id: me.id, alive: !me.dead, x: +me.x.toFixed(1), y: +me.y.toFixed(1), ack: me.ack,
        spd: Math.round(this.calcSpeed(me)), st: me.hypnoT > 0 || me.stunT > 0 || !!me.knock || !!me.dash || me.entombT > 0 || me.rootT > 0 || !!me.leap || (me.fearT > 0 && !Number.isNaN(me.fearX)),
        hp: Math.ceil(me.hp), mhp: me.maxHp, xp: Math.round(me.xp), xpn: xpForLevel(me.level), lvl: me.level,
        pts: Math.round(me.points), coins: me.coinsEarned,
        cd: [+me.cd[0].toFixed(2), +me.cd[1].toFixed(2), +me.cd[2].toFixed(2)],
        cdm: [+(me.cdMax[0] * (KITS[me.char].atkSpeedMul?.(this, me) ?? 1)).toFixed(2), +me.cdMax[1].toFixed(2), +me.cdMax[2].toFixed(2)],
        up: me.upPts, ups: me.ups, kills: me.lifeKills, buffs,
        tier: me.tier, ult: Math.round(me.ult), ultOn: +me.ultT.toFixed(1),
      };
      if (me.flyT > 0 || me.phaseT > 0) you.fly = true;
      if (qMax > 1) { you.qc = me.qCharges; you.qcm = qMax; }
      const eMax = KITS[me.char].eCharges?.(me) ?? 1;
      if (eMax > 1) { you.ec = me.k.ec ?? eMax; you.ecm = eMax; }
      const msg: Extract<ServerMsg, { t: 'snap' }> = { t: 'snap', tk: this.tick, you, ents, ev };
      if (burn) msg.burn = burn;
      if (tv) msg.tv = tv;
      conn.send(msg);
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
