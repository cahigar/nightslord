// Constantes compartidas entre servidor y cliente.

export const TICK_RATE = 20; // ticks de simulación por segundo
export const TICK_DT = 1 / TICK_RATE;
export const SNAPSHOT_EVERY = 2; // envía snapshot cada N ticks (10 Hz)
export const RANK_EVERY = TICK_RATE; // ranking 1 vez por segundo

export const MAP_SIZE = 3200;
export const VIEW_RADIUS = 1150; // radio de interés (entidades que se envían a cada jugador)

export const MAX_PLAYERS_PER_ROOM = 16;
export const ROOM_IDLE_CLOSE_MS = 60_000; // cerrar sala vacía tras 60 s

export const PLAYER_RADIUS = 18;
export const NPC_RADIUS = 14;
export const HUNTER_RADIUS = 17;
export const POWERUP_RADIUS = 16;

export const SPAWN_PROTECTION = 3; // segundos
export const RESPAWN_POINT_KEEP = 0.7; // al morir conservas el 70 % de los puntos de sala

export const NAME_MAX = 14;

// Bits de botones en el input
export const BTN_ATTACK = 1;
export const BTN_Q = 2;
export const BTN_E = 4;
export const BTN_R = 8;

// Escala de render del pixel art (1 pixel de sprite = N pixeles de mundo)
export const PIXEL = 3;
