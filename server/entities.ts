// Tipos de entidades del servidor (compartidos por la sala y los kits de personaje).
import type { HunterDef, HunterType } from '../shared/balance';
import type { CharacterDef, CharacterId, UpgradeId } from '../shared/characters';
import type { Anim, Kind, PowerUpType, ProjectileType } from '../shared/protocol';
import type { Conn } from './types';

/** Estado común a cualquier criatura (jugadores, humanos, Hunter). */
export interface Mob {
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
  dead: boolean;
  knock: { vx: number; vy: number; t: number } | null;
  // estados genéricos (reutilizables por cualquier monstruo futuro)
  stunT: number;
  slowT: number;
  slowMul: number; // multiplicador de velocidad mientras dura slowT
  fearT: number;
  panicT: number;
  vulnT: number; // vulnerable: recibe daño extra
  vulnMul: number;
  preyT: number; // marcado como Presa
  curseMarkT: number; // marca de maldición
  curseBy: number;
  entombT: number; // encerrado en sarcófago
  entombBy: number;
  entombDot: number;
  weakT: number; // debilitado: hace menos daño
}

export type InvisKind = 'none' | 'timed' | 'auto' | 'full';

export interface Player extends Mob {
  kind: Kind.Player;
  conn: Conn;
  name: string;
  char: CharacterId;
  skin: string;
  def: CharacterDef;
  level: number;
  tier: number;
  xp: number;
  totalXp: number;
  points: number;
  coinsEarned: number;
  ups: Record<UpgradeId, number>;
  upPts: number;
  cd: [number, number, number];
  cdMax: [number, number, number];
  input: { mx: number; my: number; a: number; b: number; d: number };
  queue: { q: number; mx: number; my: number; a: number; b: number; d: number }[];
  ack: number;
  // efectos
  speedT: number;
  furyT: number;
  howlT: number;
  shieldHp: number;
  shieldT: number;
  invisT: number;
  invisKind: InvisKind;
  invisBonus: boolean;
  mistT: number;
  protectT: number;
  dash: { t: number; dx: number; dy: number; hit: Set<number>; speed: number; dmg: number; knock: number } | null;
  // evolución y definitiva
  ult: number; // carga 0..100
  ultT: number; // tiempo restante de definitiva activa
  ultExt: number; // segundos ya añadidos (Luna Llena)
  qCharges: number;
  qLock: number;
  orbit: number[]; // murciélagos orbitales: 0 = listo, >0 = regenerándose
  lastCombatT: number;
  reinvisT: number;
  frenzyT: number;
  killSpeedT: number;
  hits: Map<number, number>; // impactos por objetivo (marca de maldición)
  lastAtkFromInvis: boolean;
  stepT: number;
  submergeT: number; // K'thula sumergido (no se le puede golpear ni ataca)
  lastHurtT: number;
  spillT: number;
  meatId: number; // carne fresca activa (Paciente Cero)
  jetT: number; // K'thula: chorro de agua activo
  jetTick: number;
  stillT: number; // tiempo quieta (charca que crece)
  growZone: number; // id de la charca que está creciendo
  summonedAt: number; // última vez que un sectario lo invocó
  // estadísticas de la vida actual
  lifeStart: number;
  lifeKills: number;
  diedAt: number;
  waved: boolean;
  taunted: boolean;
  lastAttacker: string;
}

export interface Npc extends Mob {
  kind: Kind.Npc;
  variant: string;
  tx: number;
  ty: number;
  thinkT: number;
  fleeing: boolean;
  screamCd: number;
  disguiseBy: number; // id de la Dama que lo disfrazó
  disguiseT: number;
  infectT: number; // infectado por Paciente Cero: pierde vida hasta convertirse
  infectBy: number;
}

export interface Hunter extends Mob {
  kind: Kind.Hunter;
  type: HunterType;
  def: HunterDef;
  lungeT: number; lungeCd: number; ldx: number; ldy: number; // inquisidor
  potionCd: number; // exorcista
  ritualT: number; ritualCd: number; fleeT: number; ritualZone: number; // sectario
  flyT: number; flyTotal: number; stuckT: number; bestD: number; // heraldo: vuela si no puede llegar
  target: number;
  thinkT: number;
  shootCd: number;
  meleeCd: number;
  tx: number;
  ty: number;
  strafe: number;
}

/** Esbirro (zombi de Paciente Cero). Reutilizable para futuros invocadores. */
export type MinionVariant = 'normal' | 'fast' | 'tough' | 'fat';
export interface Minion extends Mob {
  kind: Kind.Minion;
  owner: number; // id del jugador dueño
  variant: MinionVariant;
  look: string; // aspecto del humano original
  lookSeed: number;
  life: number;
  chain: boolean; // puede contagiar a sus víctimas
  target: number;
  thinkT: number;
  atkCd: number;
  speed: number;
  swellT: number; // zombi gordo a punto de explotar
  born: number;
}

export interface PowerUp { id: number; x: number; y: number; type: PowerUpType }

export interface Projectile {
  id: number;
  type: ProjectileType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  owner: number; // id del jugador (o -1 si es de un Hunter)
  hOwner?: number; // id del Hunter que lo disparó
  dmg: number;
  pierce?: boolean; // atraviesa objetivos (tormenta)
  ghost?: boolean; // atraviesa obstáculos
  hitR?: number;
  hitSet?: Set<number>;
  bounced?: boolean;
  trailAcc?: number;
  land?: boolean; // revienta al final de su recorrido (frasco de agua bendita)
}

/** Zona temporal con efecto. Cápsula entre A y B (si A = B es un círculo de radio w/2).
 *  mistTrail: niebla del Conde · puddle: charca poco profunda (agua) · toxic: contaminación · meat: carne fresca */
export type ZoneKind = 'mistTrail' | 'puddle' | 'toxic' | 'meat' | 'holy' | 'ritual';
/** owner: id del jugador (o del cazador en 'holy' y 'ritual'). */
export interface Zone { id: number; kind: ZoneKind; ax: number; ay: number; bx: number; by: number; w: number; until: number; born: number; owner: number; hit?: Set<number> }

export type Source = { player?: Player; hunter?: Hunter; minion?: Minion; name: string; kind: Kind };

/** Valores iniciales de los estados genéricos. */
export const mobStatus = () => ({
  stunT: 0, slowT: 0, slowMul: 1, fearT: 0, panicT: 0, vulnT: 0, vulnMul: 1, preyT: 0,
  curseMarkT: 0, curseBy: -1, entombT: 0, entombBy: -1, entombDot: 0, weakT: 0, knock: null, dead: false,
});
