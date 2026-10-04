import { ROOM_IDLE_CLOSE_MS } from '../shared/constants';
import { THEME_IDS, type MapThemeId } from '../shared/maps';
import type { RoomInfo } from '../shared/protocol';
import { Room } from './Room';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 20);

export class RoomManager {
  rooms = new Map<string, Room>();

  constructor() {
    // Limpieza de salas vacías
    setInterval(() => {
      const now = Date.now();
      for (const [code, room] of this.rooms) {
        if (room.playerCount === 0 && now - room.emptySince > ROOM_IDLE_CLOSE_MS) {
          room.destroy();
          this.rooms.delete(code);
          console.log(`[rooms] sala ${code} cerrada (vacía)`);
        }
      }
    }, 10_000).unref();
  }

  private newCode(): string {
    for (;;) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
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
