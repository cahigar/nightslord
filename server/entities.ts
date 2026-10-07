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
  // sueño (Pesadilla)
  drowsy: number; drowsyHold: number; sleepT: number; sleepMarkT: number;
  wax: number; // encerado (Candle Man) 0..100
  // rabia (poción de la bruja): ataca a lo más cercano; las bajas son de quien la lanzó
  rageT: number; rageBy: number;
  bleedT: number; bleedDps: number; bleedBy: number;
  charmT: number; charmBy: number; // engatusado: camina hacia quien lo engatusó
  rageAtk: number;
  rageSafe: boolean; // la rabia no se vuelve contra quien la lanzó (true) o sí (poción de la bruja)
  poisonT: number; poisonDps: number; poisonBy: number;
  hexT: number; hexDx: number; hexDy: number; // convertido en animalillo (maleficio)
  rootT: number; // enredado: no puede moverse (pero sí atacar)
  burnT: number; burnDps: number; burnBy: number; // ardiendo
  silenceT: number; // silenciado: sin habilidades
  liftT: number; // abducido: flota indefenso
  blindT: number; // cegado
  fearX: number; fearY: number; // de dónde huye (NaN: solo se queda paralizado)
  hypno: number; hypnoHold: number; hypnoT: number; hypnoX: number; hypnoY: number; // hipnosis (Interferencia)
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
  dash: { t: number; dx: number; dy: number; hit: Set<number>; speed: number; dmg: number; knock: number; stun?: number } | null;
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
  guise: string | null; // disfraz visible para los demás: 'prop:pine', 'npc:teen:12', 'char:werewolf:classic:Nombre:7'
  flyT: number; // volando (escoba, alas): ignora obstáculos y aterriza en un sitio libre
  phaseT: number; // intangible (Poltergeist): atraviesa ataques y obstáculos
  leap: { sx: number; sy: number; tx: number; ty: number; t: number; T: number } | null; // salto por encima de todo
  spiritsT: number; spiritCd: number; // objeto: calaveras guiadas
  bootsT: number; bootsKind: number; bootsAcc: number; // objeto: botas elementales (0 fuego · 1 naturaleza · 2 agua)
  k: Record<string, number>; // estado numérico propio de cada kit
  // estadísticas de la vida actual
  lifeStart: number;
  lifeKills: number;
  diedAt: number;
  waved: boolean;
  taunted: boolean;
  lastAttacker: string;
  /** Mejor nivel alcanzado en esta sala: al reaparecer se empieza en su última evolución y hasta volver a él la XP rinde doble. */
  bestLevel: number;
  allies: Set<number>; // alianzas (H): solo simbólicas, se pueden traicionar
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
  hx?: number; hy?: number; roarCd?: number; lurk?: boolean; // fieras: guarida, rugido del T-rex, cocodrilo al acecho
  target: number;
  thinkT: number;
  shootCd: number;
  meleeCd: number;
  tx: number;
  ty: number;
  strafe: number;
}

/** Esbirro (zombi de Paciente Cero). Reutilizable para futuros invocadores. */
export type MinionVariant = 'normal' | 'fast' | 'tough' | 'fat' | 'clone' | 'thrall' | 'wall' | 'turret' | 'flower' | 'digger'
  | 'barrel' | 'buccaneer' | 'spiderling' | 'decoy' | 'slimelet' | 'beacon'
  | 'skel' | 'skelarcher' | 'skeldog' | 'unit' | 'unitfree' | 'militia'; // thrall: humano engatusado por la súcubo · wall/turret/flower: plantas del Árbol maldito (no se mueven)
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
  wx?: number; wy?: number; // destino de paseo (Unidad independiente)
  boomAt?: number; // explota en este instante (Convergencia de Unidad)
  orig?: string; // aspecto de humano original (Unidad asimilada)
  hits?: number; // ataques que le quedan antes de deshacerse (arañita de Aracne)
  camo?: boolean; // camuflada como humano normal (Unidad quieta)
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
  land?: boolean; // revienta al final de su recorrido (frascos)
  home?: number; // persigue a esta entidad (clavo que vuelve)
  v?: number; // dato propio del kit
}

/** Zona temporal con efecto. Cápsula entre A y B (si A = B es un círculo de radio w/2).
 *  mistTrail: niebla del Conde · puddle: charca poco profunda (agua) · toxic: contaminación · meat: carne fresca */
export type ZoneKind = 'mistTrail' | 'puddle' | 'toxic' | 'meat' | 'holy' | 'ritual' | 'mirror' | 'glass' | 'nail' | 'storm' | 'fire' | 'hex' | 'thorns' | 'forest' | 'snare' | 'web' | 'bigweb' | 'thread' | 'wheat' | 'goo' | 'venom' | 'radiation' | 'whirl' | 'lastspell' | 'portal' | 'quicksand' | 'laser' | 'wax' | 'waxfire' | 'candle' | 'lightsout';
/** owner: id del jugador (o del cazador en 'holy' y 'ritual'). */
export interface Zone { id: number; kind: ZoneKind; ax: number; ay: number; bx: number; by: number; w: number; until: number; born: number; owner: number; hit?: Set<number>; next?: number /* próximo evento (rayo del clavo) */; v?: number }

export type Source = { player?: Player; hunter?: Hunter; minion?: Minion; name: string; kind: Kind; raw?: boolean /* sin ganchos del kit (rabia, sangrado) */ };

/** Valores iniciales de los estados genéricos. */
export const mobStatus = () => ({
  stunT: 0, slowT: 0, slowMul: 1, fearT: 0, panicT: 0, vulnT: 0, vulnMul: 1, preyT: 0,
  curseMarkT: 0, curseBy: -1, entombT: 0, entombBy: -1, entombDot: 0, weakT: 0, knock: null, dead: false,
  drowsy: 0, drowsyHold: 0, sleepT: 0, sleepMarkT: 0, wax: 0, rageT: 0, rageBy: -1, rageAtk: 0, rageSafe: true, poisonT: 0, poisonDps: 0, poisonBy: -1, hexT: 0, hexDx: 0, hexDy: 0, rootT: 0, burnT: 0, burnDps: 0, burnBy: -1, silenceT: 0, liftT: 0, blindT: 0, fearX: NaN, fearY: NaN, hypno: 0, hypnoHold: 0, hypnoT: 0, hypnoX: 0, hypnoY: 0, bleedT: 0, bleedDps: 0, bleedBy: -1, charmT: 0, charmBy: -1,
});
