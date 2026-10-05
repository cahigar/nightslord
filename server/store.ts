// Perfiles persistentes en SQLite (node:sqlite, sin dependencias).
// Varios procesos del juego en la MISMA máquina pueden compartir el archivo (modo WAL):
// así un jugador conserva monedas, medallas y desbloqueos entre salas/servidores.
// Si existe el antiguo data/profiles.json, se importa una sola vez.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Profile } from '../shared/catalog';
import { MEDAL_BY_ID } from '../shared/catalog';

const DB_FILE = process.env.DB_FILE ?? 'data/profiles.db';
const OLD_JSON = process.env.DATA_FILE ?? 'data/profiles.json';

class ProfileStore {
  private db: DatabaseSync;
  /** Perfiles en uso por este proceso (las conexiones comparten el mismo objeto). */
  private cache = new Map<string, Profile>();
  /** Último JSON guardado y última actividad de cada perfil en caché (solo se escribe lo que cambia). */
  private saved = new Map<string, { json: string; active: number }>();
  private dirty = false;

  constructor() {
    mkdirSync(dirname(DB_FILE), { recursive: true });
    this.db = new DatabaseSync(DB_FILE);
    this.db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000; PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS profiles (token TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL);`);
    this.importOldJson();
    const n = (this.db.prepare('SELECT COUNT(*) AS n FROM profiles').get() as { n: number }).n;
    console.log(`[store] ${n} perfiles en ${DB_FILE}`);
    setInterval(() => this.flush(), 5000).unref();
    // suelta de memoria los perfiles sin actividad en 3 horas
    setInterval(() => {
      this.dirty = true; this.flush();
      const old = Date.now() - 3 * 3600_000;
      for (const [t, s] of this.saved) if (s.active < old) { this.saved.delete(t); this.cache.delete(t); }
    }, 10 * 60_000).unref();
  }

  private importOldJson() {
    if (!existsSync(OLD_JSON)) return;
    try {
      const arr = JSON.parse(readFileSync(OLD_JSON, 'utf8')) as Profile[];
      const ins = this.db.prepare('INSERT OR IGNORE INTO profiles (token, data, updated) VALUES (?, ?, ?)');
      this.db.exec('BEGIN');
      for (const p of arr) { migrate(p); ins.run(p.token, JSON.stringify(p), Date.now()); }
      this.db.exec('COMMIT');
      renameSync(OLD_JSON, OLD_JSON + '.importado');
      console.log(`[store] importados ${arr.length} perfiles de ${OLD_JSON}`);
    } catch (e) {
      console.error('[store] no se pudo importar el JSON antiguo', e);
    }
  }

  getOrCreate(token: string | undefined, name: string): Profile {
    if (token) {
      let p = this.cache.get(token);
      if (!p) {
        const row = this.db.prepare('SELECT data FROM profiles WHERE token = ?').get(token) as { data: string } | undefined;
        if (row) { p = migrate(JSON.parse(row.data) as Profile); this.cache.set(token, p); this.saved.set(token, { json: row.data, active: Date.now() }); }
      }
      if (p) {
        if (name) p.name = name;
        const s = this.saved.get(p.token); if (s) s.active = Date.now();
        return p;
      }
    }
    const p: Profile = {
      token: randomBytes(16).toString('hex'),
      name,
      coins: 0,
      medals: [],
      chars: [],
      skins: [],
      stats: { npcKills: 0, hunterKills: 0, playerKills: 0, deaths: 0, games: 0, bestScore: 0 },
      createdAt: Date.now(),
    };
    this.cache.set(p.token, p);
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
    if (!this.dirty || !this.cache.size) return;
    this.dirty = false;
    try {
      const up = this.db.prepare('INSERT INTO profiles (token, data, updated) VALUES (?, ?, ?) ON CONFLICT(token) DO UPDATE SET data = excluded.data, updated = excluded.updated');
      this.db.exec('BEGIN');
      const now = Date.now();
      for (const p of this.cache.values()) {
        const json = JSON.stringify(p);
        const s = this.saved.get(p.token);
        if (s && s.json === json) continue;
        up.run(p.token, json, now);
        this.saved.set(p.token, { json, active: now });
      }
      this.db.exec('COMMIT');
    } catch (e) {
      try { this.db.exec('ROLLBACK'); } catch { /* */ }
      this.dirty = true;
      console.error('[store] error guardando', e);
    }
  }
}

/** Compatibilidad con perfiles antiguos. */
function migrate(p: Profile): Profile {
  const st = p.stats as Profile['stats'] & { helsingKills?: number };
  if (st.helsingKills !== undefined) { st.hunterKills = (st.hunterKills ?? 0) + st.helsingKills; delete st.helsingKills; }
  st.hunterKills ??= 0;
  return p;
}

export const store = new ProfileStore();
