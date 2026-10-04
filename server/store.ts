// Persistencia mínima de perfiles en un JSON (suficiente para el prototipo).
// Para producción: cambiar por SQLite / Turso / Supabase manteniendo esta misma interfaz.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Profile } from '../shared/catalog';
import { MEDAL_BY_ID } from '../shared/catalog';

const FILE = process.env.DATA_FILE ?? 'data/profiles.json';

class ProfileStore {
  private profiles = new Map<string, Profile>();
  private dirty = false;

  constructor() {
    try {
      if (existsSync(FILE)) {
        const arr = JSON.parse(readFileSync(FILE, 'utf8')) as Profile[];
        for (const p of arr) this.profiles.set(p.token, p);
        console.log(`[store] ${this.profiles.size} perfiles cargados`);
      }
    } catch (e) {
      console.error('[store] error leyendo perfiles', e);
    }
    setInterval(() => this.flush(), 5000).unref();
  }

  getOrCreate(token: string | undefined, name: string): Profile {
    if (token && this.profiles.has(token)) {
      const p = this.profiles.get(token)!;
      if (name) p.name = name;
      return p;
    }
    const p: Profile = {
      token: randomBytes(16).toString('hex'),
      name,
      coins: 0,
      medals: [],
      chars: [],
      skins: [],
      stats: { npcKills: 0, helsingKills: 0, playerKills: 0, deaths: 0, games: 0, bestScore: 0 },
      createdAt: Date.now(),
    };
    this.profiles.set(p.token, p);
    this.dirty = true;
    return p;
  }

  touch() {
    this.dirty = true;
  }

  /** Concede una medalla. Devuelve true si es nueva. */
  award(p: Profile, medal: string): boolean {
    if (p.medals.includes(medal) || !MEDAL_BY_ID[medal]) return false;
    p.medals.push(medal);
    p.coins += MEDAL_BY_ID[medal].coins;
    this.dirty = true;
    return true;
  }

  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      mkdirSync(dirname(FILE), { recursive: true });
      const tmp = FILE + '.tmp';
      writeFileSync(tmp, JSON.stringify([...this.profiles.values()]));
      renameSync(tmp, FILE);
    } catch (e) {
      console.error('[store] error guardando', e);
    }
  }
}

export const store = new ProfileStore();
