import { ROOM_IDLE_CLOSE_MS } from '../shared/constants';
import type { CharacterId } from '../shared/characters';
import { THEME_IDS, type MapThemeId } from '../shared/maps';
import type { RoomInfo } from '../shared/protocol';
import { Room, type RoomHooks, type RoomMode } from './Room';
import type { Conn } from './types';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 20);
/** Letra de este proceso cuando hay varios (A, B, C...): los códigos de sala empiezan por ella. */
/** Salas públicas que se mantienen siempre abiertas (aunque estén vacías) para que siempre haya dónde entrar. */
const MIN_ROOMS = Number(process.env.MIN_ROOMS ?? 1);
export const SHARD = (process.env.SHARD ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);

export class RoomManager implements RoomHooks {
  rooms = new Map<string, Room>();

  constructor() {
    // Limpieza de salas vacías
    setInterval(() => {
      const now = Date.now();
      let publicOpen = [...this.rooms.values()].filter((r) => !r.priv && r.mode === 'normal').length;
      for (const [code, room] of this.rooms) {
        if (!room.priv && room.mode === 'normal' && publicOpen <= MIN_ROOMS) continue; // se queda abierta, lista para el siguiente
        if (room.playerCount === 0 && (room.tutorial || room.mode === 'br' || now - room.emptySince > ROOM_IDLE_CLOSE_MS)) {
          if (!room.priv && room.mode === 'normal') publicOpen--;
          room.destroy();
          this.rooms.delete(code);
          console.log(`[rooms] sala ${code} cerrada (vacía)`);
        }
      }
      while ([...this.rooms.values()].filter((r) => !r.priv && r.mode === 'normal').length < MIN_ROOMS && this.rooms.size < MAX_ROOMS) this.create(false);
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

  create(priv: boolean, theme?: MapThemeId, tutorial = false, mode: RoomMode = 'normal'): Room | null {
    if (this.rooms.size >= MAX_ROOMS) return null;
    const t = mode === 'lobby' ? 'cemetery' : mode === 'br' ? 'cityz' : theme && THEME_IDS.includes(theme) ? theme : THEME_IDS[Math.floor(Math.random() * THEME_IDS.length)];
    const code = this.newCode();
    const room = new Room(code, t, priv, undefined, mode);
    room.tutorial = tutorial;
    room.mgr = this;
    this.rooms.set(code, room);
    console.log(`[rooms] sala ${code} creada (${t}${priv ? ', privada' : ''}${mode !== 'normal' ? `, ${mode}` : ''})`);
    return room;
  }

  /** Sala pública con hueco (prioriza la más poblada para que haya acción) o una nueva. */
  findRandom(): Room | null {
    let best: Room | null = null;
    for (const r of this.rooms.values()) {
      if (r.priv || r.isFull || r.mode !== 'normal') continue;
      if (!best || r.playerCount > best.playerCount) best = r;
    }
    return best ?? this.create(false);
  }

  /** Previa pública de El Señor de la Noche con hueco (la más poblada) o una nueva. */
  findLobby(): Room | null {
    let best: Room | null = null;
    for (const r of this.rooms.values()) {
      if (r.priv || r.isFull || r.mode !== 'lobby') continue;
      if (!best || r.playerCount > best.playerCount) best = r;
    }
    return best ?? this.create(false, undefined, false, 'lobby');
  }

  /** Todos los de la previa pasan a una partida nueva en la Ciudad Z. */
  startMatch(lobby: Room) {
    const br = this.create(true, 'cityz', false, 'br');
    if (!br) { for (const c of lobby.conns.values()) c.send({ t: 'toast', text: 'El servidor está lleno ahora mismo. Prueba en un momento.', k: 'serverBusy' }); return; }
    br.home = lobby.code;
    for (const c of [...lobby.conns.values()]) {
      const p = lobby.players.get(c.id);
      lobby.removeConn(c);
      br.addConn(c, p?.char ?? 'vampire', p?.skin ?? 'classic');
    }
    br.beginMatch();
    console.log(`[rooms] ${lobby.code} → partida ${br.code} (${br.playerCount} jugadores)`);
  }

  /** Al terminar la partida se vuelve a la previa (la misma si sigue abierta y cabe). */
  toLobby(conn: Conn, char: CharacterId, skin: string, home?: string) {
    const h = home ? this.rooms.get(home) : undefined;
    const l = h && h.mode === 'lobby' && !h.isFull ? h : this.findLobby();
    if (!l) { conn.send({ t: 'left' }); return; }
    l.addConn(conn, char, skin);
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase().trim());
  }

  list(): RoomInfo[] {
    return [...this.rooms.values()]
      .filter((r) => !r.priv && r.mode !== 'br')
      .map((r) => ({ code: r.code, players: r.playerCount, max: 16, theme: r.theme, priv: r.priv, ...(r.mode === 'lobby' ? { nl: true } : {}) }));
  }
}
