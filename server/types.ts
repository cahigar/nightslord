import type { Profile } from '../shared/catalog';
import type { ServerMsg } from '../shared/protocol';

/** Una conexión de jugador (un socket). */
export interface Conn {
  id: number;
  profile: Profile;
  send(msg: ServerMsg): void;
  roomCode: string | null;
}
