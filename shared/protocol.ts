// Protocolo de mensajes WebSocket (JSON). Claves cortas para ahorrar ancho de banda.
import type { CharacterId, UpgradeId } from './characters';
import type { Profile } from './catalog';
import type { MapThemeId } from './maps';

export enum Kind { Player = 0, Npc = 1, Hunter = 2, PowerUp = 3, Projectile = 4, Minion = 5, Zone = 6, Prop = 7 }

export enum Anim { Idle = 0, Walk = 1, Attack = 2, Cast = 3, Wave = 4, Taunt = 5, Hurt = 6, Dead = 7 }

export enum Flag {
  Invisible = 1, Shield = 2, Stunned = 4, Slowed = 8, Buffed = 16, Protected = 32, Feared = 64, Mist = 128, Bounty = 256,
  Ult = 512, // definitiva activa
  Vulnerable = 1024, // recibe daño extra
  Prey = 2048, // marcado como Presa (Lobo nv. 15)
  Cursed = 4096, // marca de maldición (Ramsés nv. 5)
  Entombed = 8192, // encerrado en un sarcófago
  Panic = 16384, // humano en pánico
  Haste = 32768, // frenesí / acelerón
  Submerged = 65536, // sumergido (K'thula)
  Swollen = 131072, // zombi gordo a punto de explotar
  Weak = 262144, // debilitado (hace menos daño)
  Infected = 524288, // humano infectado (se convierte en zombi)
  Jet = 1048576, // K'thula lanzando su chorro (r = ángulo)
  Ritual = 2097152, // sectario en pleno ritual
  Flying = 4194304, // volando por encima de obstáculos (heraldo, escoba)
  Asleep = 8388608, // dormido (Pesadilla)
  Disguised = 16777216, // (solo en tu propia entidad) estás disfrazado: los demás te ven como otra cosa
  Raged = 33554432, // poción de rabia
  Bleed = 67108864, // sangrado
  Charmed = 134217728, // engatusado (Doppy)
  Hexed = 268435456, // convertido en animalillo (maleficio de la bruja)
  Poison = 536870912, // envenenado
  Phased = 1073741824, // intangible (Poltergeist)
}

/** Segundo grupo de estados (el primero ya no tiene bits libres). Va en EntSnap.f2. */
export enum Flag2 {
  Burning = 1, // ardiendo
  Silenced = 2, // silenciado: no puede usar habilidades
  Lifted = 4, // abducido (lo levanta un haz)
  Blind = 8, // cegado por los cuervos
  Leaping = 16, // en pleno salto
  Engulfed = 32, // atrapado dentro del slime
}

export type PowerUpType = 'blood' | 'speed' | 'fury' | 'shield' | 'coin' | 'xp' | 'spirits' | 'boots' | 'shovel';
export type ProjectileType = 'bat' | 'bandage' | 'bolt' | 'scarab' | 'sandstorm' | 'wave' | 'holy'
  | 'nail' | 'nailback' | 'boulder' | 'potion0' | 'potion1' | 'potion2' | 'bigpotion0' | 'bigpotion1' | 'bigpotion2'
  | 'heart' | 'obj0' | 'obj1' | 'obj2' | 'obj3' | 'thorn' | 'skull' | 'hook' | 'cannon' | 'web' | 'crows' | 'crowsback';

export interface EntSnap {
  i: number; // id
  k: Kind;
  x: number;
  y: number;
  f: 1 | -1; // orientación
  a: Anim;
  q: number; // contador de animación (cambia cuando empieza una animación puntual)
  c: string; // variante: personaje, tipo de npc, tipo de power-up, tipo de proyectil
  s?: string; // skin
  h?: number; // vida 0..100
  fl?: number; // flags
  f2?: number; // flags (Flag2)
  l?: number; // nivel
  n?: string; // nombre
  r?: number; // ángulo (proyectiles)
  o?: number; // murciélagos orbitales (Conde nv. 15) · id del dueño (esbirros)
  rr?: number; // radio (zonas)
  bx?: number; by?: number; // segundo extremo (zonas alargadas, como los hilos de telaraña)
  z?: number; // somnolencia 0..100
  g?: string; // (solo tu entidad) disfraz actual: 'prop:pine', 'npc:teen', 'char:werewolf'...
}

export type GameEvent =
  | { e: 'hit'; x: number; y: number; d: number; t: number; crit?: boolean }
  | { e: 'die'; x: number; y: number; k: Kind; c: string }
  | { e: 'sfx'; s: SfxId; x: number; y: number }
  | { e: 'fx'; f: FxId; x: number; y: number; r?: number; o?: number; tx?: number; ty?: number; n?: number; c?: string; s?: string; d?: number }
  | { e: 'kill'; a: string; v: string; ak: Kind; vk: Kind }
  | { e: 'pick'; x: number; y: number; p: PowerUpType };

/** Efectos visuales. x,y origen; tx,ty destino; r ángulo o radio; o id del autor; n nivel/tier; c personaje; s skin; d duración. */
export type FxId =
  | 'mist' | 'howl' | 'curse' | 'push' | 'lvl' | 'swing' | 'dash' | 'vanish'
  | 'drain' | 'ghosthit' | 'undress' | 'crimson' | 'moon' | 'storm' | 'entomb' | 'disguise' | 'surprise'
  | 'mistTrail' | 'orbitBlock' | 'step' | 'prey' | 'curseMark' | 'evolve' | 'frenzy' | 'reveal'
  | 'infect' | 'emerge' | 'fatboom' | 'meat' | 'tentacle' | 'tentacleWarn' | 'dive' | 'surface' | 'splash'
  | 'descend' | 'smite' | 'holysplash' | 'summon'
  | 'sleep' | 'lullaby' | 'prop' | 'ambush' | 'dreamwalk' | 'shards' | 'mirror' | 'mirrorBoom' | 'maryOut'
  | 'slam' | 'spark' | 'lightning' | 'storm' | 'faceSteal' | 'charm' | 'mimic' | 'potion' | 'broom' | 'rage'
  | 'hexed' | 'hexzone' | 'wings' | 'thrall' | 'heartHit' | 'phase' | 'objSpawn' | 'drainBeam'
  | 'rooted' | 'sprout' | 'bramble' | 'forest' | 'treeFire' | 'shock' | 'leapLand' | 'scare';

export type SfxId = 'bite' | 'claw' | 'punch' | 'bat' | 'howl' | 'bolt' | 'stake' | 'scream' | 'pickup' | 'coin' | 'curse' | 'push' | 'mist' | 'vanish' | 'level' | 'death' | 'dash' | 'wave' | 'taunt' | 'ult' | 'scarab' | 'sand' | 'tomb' | 'evolve' | 'surprise' | 'groan' | 'explode' | 'tentacle' | 'splash' | 'bubble' | 'smite' | 'glass' | 'chant' | 'lullaby' | 'zap' | 'thunder' | 'slam' | 'poof' | 'charm' | 'brew';

export interface YouState {
  id: number;
  alive: boolean;
  x: number;
  y: number;
  ack: number; // último input procesado
  spd: number; // velocidad efectiva (para predicción)
  st: boolean; // inmovilizado
  hp: number;
  mhp: number;
  xp: number;
  xpn: number;
  lvl: number;
  pts: number;
  coins: number; // monedas ganadas esta sesión
  cd: [number, number, number]; // enfriamiento restante: ataque, Q, E
  cdm: [number, number, number];
  tier: number; // evolución 0..3 (niveles 5, 10, 15)
  ult: number; // carga de la definitiva 0..100
  ultOn: number; // segundos restantes de definitiva activa
  qc?: number; // cargas de Q (si tiene más de una)
  ec?: number; // cargas de E (si tiene más de una)
  ecm?: number;
  qcm?: number;
  up: number; // puntos de mejora disponibles
  ups: Record<UpgradeId, number>;
  kills: number;
  buffs: { t: string; r: number }[];
  fly?: boolean; // volando: la predicción ignora obstáculos
}

// ---------- Cliente -> Servidor ----------
export type ClientMsg =
  | { t: 'hello'; token?: string; name: string }
  | { t: 'join'; mode: 'random' | 'code' | 'create'; code?: string; char: CharacterId; skin: string; priv?: boolean; theme?: MapThemeId }
  | { t: 'input'; q: number; mx: number; my: number; a: number; b: number; d?: number } // d: distancia al cursor
  | { t: 'emote'; e: 'wave' | 'taunt' }
  | { t: 'upgrade'; u: UpgradeId }
  | { t: 'respawn'; char?: CharacterId; skin?: string }
  | { t: 'leave' }
  | { t: 'cheat'; lvl?: number; ult?: boolean; tp?: [number, number]; heal?: boolean } // solo en modo desarrollo
  | { t: 'buy'; item: string } // "char:<id>" o "skin:<char>:<id>"
  | { t: 'rooms' }
  | { t: 'ping'; c: number };

// ---------- Servidor -> Cliente ----------
export interface RoomInfo { code: string; players: number; max: number; theme: MapThemeId; priv: boolean }

export type ServerMsg =
  | { t: 'welcome'; profile: Profile; dev?: boolean }
  | { t: 'profile'; profile: Profile }
  | { t: 'toast'; text: string }
  | { t: 'joined'; code: string; theme: MapThemeId; seed: number; priv: boolean; you: number }
  | { t: 'snap'; tk: number; you: YouState; ents: EntSnap[]; ev: GameEvent[]; burn?: [number, number, number][] } // burn: árboles del mapa [índice, s ardiendo, s quemado]
  | { t: 'rank'; list: [string, number, CharacterId, number][]; total: number } // nombre, puntos, personaje, id
  | { t: 'died'; by: string; pts: number; lvl: number; kills: number; time: number; coins: number }
  | { t: 'medal'; id: string }
  | { t: 'rooms'; list: RoomInfo[] }
  | { t: 'left' }
  | { t: 'error'; msg: string }
  | { t: 'pong'; c: number };
