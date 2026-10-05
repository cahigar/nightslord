import { ROOM_IDLE_CLOSE_MS } from '../shared/constants';
import { THEME_IDS, type MapThemeId } from '../shared/maps';
import type { RoomInfo } from '../shared/protocol';
import { Room } from './Room';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 20);
/** Letra de este proceso cuando hay varios (A, B, C...): los códigos de sala empiezan por ella. */
/** Salas públicas que se mantienen siempre abiertas (aunque estén vacías) para que siempre haya dónde entrar. */
const MIN_ROOMS = Number(process.env.MIN_ROOMS ?? 1);
export const SHARD = (process.env.SHARD ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);

export class RoomManager {
  rooms = new Map<string, Room>();

  constructor() {
    // Limpieza de salas vacías
    setInterval(() => {
      const now = Date.now();
      let publicOpen = [...this.rooms.values()].filter((r) => !r.priv).length;
      for (const [code, room] of this.rooms) {
        if (!room.priv && publicOpen <= MIN_ROOMS) continue; // se queda abierta, lista para el siguiente
        if (room.playerCount === 0 && now - room.emptySince > ROOM_IDLE_CLOSE_MS) {
          if (!room.priv) publicOpen--;
          room.destroy();
          this.rooms.delete(code);
          console.log(`[rooms] sala ${code} cerrada (vacía)`);
        }
      }
      while ([...this.rooms.values()].filter((r) => !r.priv).length < MIN_ROOMS && this.rooms.size < MAX_ROOMS) this.create(false);
    }, 10_000).unref();
    for (let i = 0; i < MIN_ROOMS; i++) this.create(false);
  }

  private newCode(): string {
    for (;;) {
      let c = SHARD;
      while (c.length < 4) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!this.rooms.has(c)) return c;
    }
  }

  create(priv: boolean, theme?: MapThemeId): Room | null {
    if (this.rooms.size >= MAX_ROOMS) return null;
    const t = theme && THEME_IDS.includes(theme) ? theme : THEME_IDS[Math.floor(Math.random() * THEME_IDS.length)];
    const code = this.newCode();
    const room = new Room(code, t, priv);
    this.rooms.set(code, room);
    console.log(`[rooms] sala ${code} creada (${t}${priv ? ', privada' : ''})`);
    return room;
  }

  /** Sala pública con hueco (prioriza la más poblada para que haya acción) o una nueva. */
  findRandom(): Room | null {
    let best: Room | null = null;
    for (const r of this.rooms.values()) {
      if (r.priv || r.isFull) continue;
      if (!best || r.playerCount > best.playerCount) best = r;
    }
    return best ?? this.create(false);
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase().trim());
  }

  list(): RoomInfo[] {
    return [...this.rooms.values()]
      .filter((r) => !r.priv)
      .map((r) => ({ code: r.code, players: r.playerCount, max: 16, theme: r.theme, priv: r.priv }));
  }
}
