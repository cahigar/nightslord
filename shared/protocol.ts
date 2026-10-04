// Protocolo de mensajes WebSocket (JSON). Claves cortas para ahorrar ancho de banda.
import type { CharacterId, UpgradeId } from './characters';
import type { Profile } from './catalog';
import type { MapThemeId } from './maps';

export enum Kind { Player = 0, Npc = 1, Helsing = 2, PowerUp = 3, Projectile = 4 }

export enum Anim { Idle = 0, Walk = 1, Attack = 2, Cast = 3, Wave = 4, Taunt = 5, Hurt = 6, Dead = 7 }

export enum Flag {
  Invisible = 1, Shield = 2, Stunned = 4, Slowed = 8, Buffed = 16, Protected = 32, Feared = 64, Mist = 128, Bounty = 256,
}

export type PowerUpType = 'blood' | 'speed' | 'fury' | 'shield' | 'coin' | 'xp';
export type ProjectileType = 'bat' | 'bandage' | 'bolt';

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
  l?: number; // nivel
  n?: string; // nombre
  r?: number; // ángulo (proyectiles)
}

export type GameEvent =
  | { e: 'hit'; x: number; y: number; d: number; t: number; crit?: boolean }
  | { e: 'die'; x: number; y: number; k: Kind; c: string }
  | { e: 'sfx'; s: SfxId; x: number; y: number }
  | { e: 'fx'; f: 'mist' | 'howl' | 'curse' | 'push' | 'lvl' | 'swing' | 'dash' | 'vanish'; x: number; y: number; r?: number; o?: number }
  | { e: 'kill'; a: string; v: string; ak: Kind; vk: Kind }
  | { e: 'pick'; x: number; y: number; p: PowerUpType };

export type SfxId = 'bite' | 'claw' | 'punch' | 'bat' | 'howl' | 'bolt' | 'stake' | 'scream' | 'pickup' | 'coin' | 'curse' | 'push' | 'mist' | 'vanish' | 'level' | 'death' | 'dash' | 'wave' | 'taunt';

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
  up: number; // puntos de mejora disponibles
  ups: Record<UpgradeId, number>;
  kills: number;
  buffs: { t: string; r: number }[];
}

// ---------- Cliente -> Servidor ----------
export type ClientMsg =
  | { t: 'hello'; token?: string; name: string }
  | { t: 'join'; mode: 'random' | 'code' | 'create'; code?: string; char: CharacterId; skin: string; priv?: boolean; theme?: MapThemeId }
  | { t: 'input'; q: number; mx: number; my: number; a: number; b: number }
  | { t: 'emote'; e: 'wave' | 'taunt' }
  | { t: 'upgrade'; u: UpgradeId }
  | { t: 'respawn'; char?: CharacterId; skin?: string }
  | { t: 'leave' }
  | { t: 'buy'; item: string } // "char:<id>" o "skin:<char>:<id>"
  | { t: 'rooms' }
  | { t: 'ping'; c: number };

// ---------- Servidor -> Cliente ----------
export interface RoomInfo { code: string; players: number; max: number; theme: MapThemeId; priv: boolean }

export type ServerMsg =
  | { t: 'welcome'; profile: Profile }
  | { t: 'profile'; profile: Profile }
  | { t: 'joined'; code: string; theme: MapThemeId; seed: number; priv: boolean; you: number }
  | { t: 'snap'; tk: number; you: YouState; ents: EntSnap[]; ev: GameEvent[] }
  | { t: 'rank'; list: [string, number, CharacterId, number][]; total: number } // nombre, puntos, personaje, id
  | { t: 'died'; by: string; pts: number; lvl: number; kills: number; time: number; coins: number }
  | { t: 'medal'; id: string }
  | { t: 'rooms'; list: RoomInfo[] }
  | { t: 'left' }
  | { t: 'error'; msg: string }
  | { t: 'pong'; c: number };
