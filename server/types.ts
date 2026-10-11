import type { Profile } from '../shared/catalog';
import type { ServerMsg } from '../shared/protocol';

/** Una conexión de jugador (un socket). */
export interface Conn {
  id: number;
  profile: Profile;
  /** Nombre en esta conexión (cada pestaña puede usar uno distinto aunque compartan perfil). */
  name: string;
  send(msg: ServerMsg): void;
  roomCode: string | null;
  /** Estadísticas: id de la sesión, cuándo empezó y segundos jugados (en partida). */
  sid?: number;
  sessT0?: number;
  played?: number;
}
