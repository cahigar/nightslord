// Tipos de entidades del servidor (compartidos por la sala y los kits de personaje).
import type { CharacterDef, CharacterId, UpgradeId } from '../shared/characters';
import type { Anim, Kind, PowerUpType, ProjectileType } from '../shared/protocol';
import type { Conn } from './types';

/** Estado común a cualquier criatura (jugadores, humanos, Helsing). */
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
}

export interface Helsing extends Mob {
  kind: Kind.Helsing;
  target: number;
  thinkT: number;
  shootCd: number;
  meleeCd: number;
  tx: number;
  ty: number;
  strafe: number;
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
  owner: number; // id del jugador (o -1 si es de un Helsing)
  hOwner?: number; // id del Helsing que lo disparó
  dmg: number;
  pierce?: boolean; // atraviesa objetivos (tormenta)
  ghost?: boolean; // atraviesa obstáculos
  hitR?: number;
  hitSet?: Set<number>;
  bounced?: boolean;
}

/** Zona temporal con efecto (p. ej. estela de niebla). Cápsula entre A y B. */
export interface Zone { id: number; kind: 'mistTrail'; ax: number; ay: number; bx: number; by: number; w: number; until: number; owner: number }

export type Source = { player?: Player; helsing?: Helsing; name: string; kind: Kind };

/** Valores iniciales de los estados genéricos. */
export const mobStatus = () => ({
  stunT: 0, slowT: 0, slowMul: 1, fearT: 0, panicT: 0, vulnT: 0, vulnMul: 1, preyT: 0,
  curseMarkT: 0, curseBy: -1, entombT: 0, entombBy: -1, entombDot: 0, knock: null, dead: false,
});
