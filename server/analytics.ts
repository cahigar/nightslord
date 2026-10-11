// 📊 Estadísticas de uso (solo para las cuentas master): sesiones, vidas, partidas de El Señor de la Noche y compras.
// - Sin IP ni correos: cada jugador es una huella anónima de su perfil (para contar únicos y retención).
// - Los bots y las cuentas master no cuentan.
// - En su propio archivo SQLite (data/analytics.db) para no engordar el de perfiles. Se borra lo de más de 400 días.
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CHARACTERS } from '../shared/characters';
import { THEMES } from '../shared/maps';
import type { Player } from './entities';
import type { Conn } from './types';

const SHARD = (process.env.SHARD ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1) || '-';

const DB_FILE = process.env.ANALYTICS_DB ?? 'data/analytics.db';
const DAY = 86400_000;

export const tagOf = (token: string) => createHash('sha256').update('mooo:' + token).digest('hex').slice(0, 16);

export interface SessionInfo { device: string; lang: string; ref: string; utm: string; isNew: boolean; google: boolean; admin: boolean }
type LifeEnd = { cause: string; killer: string };

class Analytics {
  private db: DatabaseSync | null = null;
  /** Vidas en curso: id del jugador → datos de inicio. */
  private lives = new Map<number, { sid: number; tag: string; mode: string; theme: string; char: string; skin: string; t0: number; npc: number; hunter: number; player: number }>();
  private onlineFn: () => { conns: number; playing: number; byMode: Record<string, number> } = () => ({ conns: 0, playing: 0, byMode: {} });

  constructor() {
    try {
      mkdirSync(dirname(DB_FILE), { recursive: true });
      const db = new DatabaseSync(DB_FILE);
      db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000; PRAGMA synchronous = NORMAL;
        CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY, tag TEXT, t0 INTEGER, t1 INTEGER, dur INTEGER DEFAULT 0, played INTEGER DEFAULT 0,
          device TEXT, lang TEXT, ref TEXT, utm TEXT, is_new INTEGER, google INTEGER, admin INTEGER);
        CREATE INDEX IF NOT EXISTS s_t0 ON sessions(t0);
        CREATE TABLE IF NOT EXISTS lives (id INTEGER PRIMARY KEY, sid INTEGER, tag TEXT, t0 INTEGER, dur INTEGER, mode TEXT, theme TEXT, char TEXT, skin TEXT,
          lvl INTEGER, pts INTEGER, k_player INTEGER, k_npc INTEGER, k_hunter INTEGER, cause TEXT, killer TEXT);
        CREATE INDEX IF NOT EXISTS l_t0 ON lives(t0);
        CREATE TABLE IF NOT EXISTS matches (id INTEGER PRIMARY KEY, t0 INTEGER, dur INTEGER, reals INTEGER, bots INTEGER, winner_char TEXT, winner_bot INTEGER);
        CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, t INTEGER, tag TEXT, kind TEXT, item TEXT, value INTEGER);
        CREATE INDEX IF NOT EXISTS e_t ON events(t);
        CREATE TABLE IF NOT EXISTS samples (t INTEGER, shard TEXT, conns INTEGER, playing INTEGER, f4a INTEGER, nl INTEGER, PRIMARY KEY (t, shard));`);
      this.db = db;
      // cada minuto: cuántos hay conectados y jugando (para la gráfica de concurrencia)
      setInterval(() => {
        const o = this.onlineFn();
        this.run('INSERT OR REPLACE INTO samples (t, shard, conns, playing, f4a, nl) VALUES (?, ?, ?, ?, ?, ?)', Math.floor(Date.now() / 60_000) * 60_000, SHARD, o.conns, o.playing, o.byMode.normal ?? 0, (o.byMode.lobby ?? 0) + (o.byMode.br ?? 0));
      }, 60_000).unref();
      setInterval(() => { const old = Date.now() - 400 * DAY; for (const t of ['sessions', 'lives', 'events']) this.run(`DELETE FROM ${t} WHERE ${t === 'events' ? 't' : 't0'} < ?`, old); this.run('DELETE FROM samples WHERE t < ?', old); this.run('DELETE FROM matches WHERE t0 < ?', old); }, 6 * 3600_000).unref();
    } catch (e) { console.error('[stats] sin estadísticas:', e); }
  }

  private run(sql: string, ...args: (string | number | null)[]) {
    try { return this.db?.prepare(sql).run(...args); } catch (e) { console.error('[stats]', e); }
  }

  setOnline(fn: typeof this.onlineFn) { this.onlineFn = fn; }

  sessionStart(conn: Conn, s: SessionInfo) {
    const r = this.run('INSERT INTO sessions (tag, t0, device, lang, ref, utm, is_new, google, admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      tagOf(conn.profile.token), Date.now(), s.device, s.lang, s.ref, s.utm, s.isNew ? 1 : 0, s.google ? 1 : 0, s.admin ? 1 : 0);
    conn.sid = Number(r?.lastInsertRowid ?? 0);
    conn.sessT0 = Date.now();
  }
  /** Al iniciar sesión con Google la sesión pasa a ser de esa cuenta (huella nueva). */
  sessionAccount(conn: Conn, admin: boolean) {
    if (conn.sid) this.run('UPDATE sessions SET tag = ?, google = 1, admin = ? WHERE id = ?', tagOf(conn.profile.token), admin ? 1 : 0, conn.sid);
  }
  sessionEnd(conn: Conn) {
    if (!conn.sid || !conn.sessT0) return;
    this.run('UPDATE sessions SET t1 = ?, dur = ?, played = ? WHERE id = ?', Date.now(), Math.round((Date.now() - conn.sessT0) / 1000), Math.round(conn.played ?? 0), conn.sid);
    conn.sid = 0;
  }

  lifeStart(p: Player, mode: string, theme: string) {
    if (p.bot || !p.conn.sid) return;
    const st = p.conn.profile.stats;
    this.lives.set(p.id, { sid: p.conn.sid, tag: tagOf(p.conn.profile.token), mode, theme, char: p.char, skin: p.skin, t0: Date.now(), npc: st.npcKills, hunter: st.hunterKills, player: st.playerKills });
  }
  lifeEnd(p: Player, end: LifeEnd) {
    const l = this.lives.get(p.id);
    if (!l) return;
    this.lives.delete(p.id);
    const st = p.conn.profile.stats, dur = Math.round((Date.now() - l.t0) / 1000);
    p.conn.played = (p.conn.played ?? 0) + dur;
    this.run('INSERT INTO lives (sid, tag, t0, dur, mode, theme, char, skin, lvl, pts, k_player, k_npc, k_hunter, cause, killer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      l.sid, l.tag, l.t0, dur, l.mode, l.theme, l.char, l.skin, p.level, Math.round(p.points), st.playerKills - l.player, st.npcKills - l.npc, st.hunterKills - l.hunter, end.cause, end.killer);
  }

  match(t0: number, reals: number, bots: number, winnerChar: string, winnerBot: boolean) {
    this.run('INSERT INTO matches (t0, dur, reals, bots, winner_char, winner_bot) VALUES (?, ?, ?, ?, ?, ?)', t0, Math.round((Date.now() - t0) / 1000), reals, bots, winnerChar, winnerBot ? 1 : 0);
  }

  event(conn: Conn | null, kind: string, item: string, value = 0) {
    if (conn?.profile.master) return;
    this.run('INSERT INTO events (t, tag, kind, item, value) VALUES (?, ?, ?, ?, ?)', Date.now(), conn ? tagOf(conn.profile.token) : '', kind, item, value);
  }

  // ------------------------------------------------------------------ informe para el panel
  report(days: number, tz: number) {
    const db = this.db;
    if (!db) return { error: 'sin base de datos' };
    const now = Date.now(), since = now - days * DAY, off = tz * 60_000; // tz: minutos a sumar a UTC (hora local)
    const q = <T>(sql: string, ...a: (string | number)[]) => db.prepare(sql).all(...a) as T[];
    const one = <T>(sql: string, ...a: (string | number)[]) => db.prepare(sql).get(...a) as T;
    const S = 'FROM sessions WHERE admin = 0 AND t0 >= ?';
    const L = 'FROM lives l JOIN sessions s ON s.id = l.sid WHERE s.admin = 0 AND l.t0 >= ?';
    const dayExpr = (col: string) => `CAST((${col} + ${off}) / ${DAY} AS INTEGER)`;
    const today = Math.floor((now + off) / DAY);

    const uniq = (from: number) => one<{ n: number }>(`SELECT COUNT(DISTINCT tag) AS n FROM sessions WHERE admin = 0 AND t0 >= ?`, from).n;
    const startToday = today * DAY - off;
    const kpi = {
      today: uniq(startToday),
      d7: uniq(now - 7 * DAY),
      d30: uniq(now - 30 * DAY),
      newRange: one<{ n: number }>(`SELECT COUNT(DISTINCT tag) AS n ${S} AND is_new = 1`, since).n,
      sessions: one<{ n: number }>(`SELECT COUNT(*) AS n ${S}`, since).n,
      avgSession: one<{ a: number | null }>(`SELECT AVG(dur) AS a ${S} AND t1 IS NOT NULL`, since).a ?? 0,
      avgPlayed: one<{ a: number | null }>(`SELECT AVG(played) AS a ${S} AND t1 IS NOT NULL AND played > 0`, since).a ?? 0,
      playHours: (one<{ s: number | null }>(`SELECT SUM(l.dur) AS s ${L}`, since).s ?? 0) / 3600,
      lives: one<{ n: number }>(`SELECT COUNT(*) AS n ${L}`, since).n,
      google: one<{ g: number | null }>(`SELECT AVG(g) AS g FROM (SELECT MAX(google) AS g ${S} GROUP BY tag)`, since).g ?? 0,
      bounce: one<{ b: number | null }>(`SELECT AVG(played = 0) AS b ${S} AND t1 IS NOT NULL`, since).b ?? 0,
    };

    // retención: de los jugadores nuevos de cada día, cuántos volvieron otro día (al día siguiente / en 7 días)
    const cohorts = q<{ tag: string; d0: number }>(`SELECT tag, MIN(${dayExpr('t0')}) AS d0 FROM sessions WHERE admin = 0 GROUP BY tag HAVING MIN(t0) >= ?`, since);
    const daysOf = new Map<string, Set<number>>();
    for (const r of q<{ tag: string; d: number }>(`SELECT DISTINCT tag, ${dayExpr('t0')} AS d FROM sessions WHERE admin = 0 AND t0 >= ?`, since)) {
      let s = daysOf.get(r.tag); if (!s) daysOf.set(r.tag, (s = new Set())); s.add(r.d);
    }
    let c1 = 0, r1 = 0, c7 = 0, r7 = 0;
    for (const c of cohorts) {
      const ds = daysOf.get(c.tag) ?? new Set<number>();
      if (c.d0 + 1 <= today) { c1++; if (ds.has(c.d0 + 1)) r1++; }
      if (c.d0 + 7 <= today) { c7++; if ([...ds].some((d) => d > c.d0 && d <= c.d0 + 7)) r7++; }
    }

    const daily = q<{ d: number; players: number; fresh: number; sessions: number }>(
      `SELECT ${dayExpr('t0')} AS d, COUNT(DISTINCT tag) AS players, COUNT(DISTINCT CASE WHEN is_new = 1 THEN tag END) AS fresh, COUNT(*) AS sessions ${S} GROUP BY d ORDER BY d`, since);
    const dailyPlay = q<{ d: number; h: number }>(`SELECT ${dayExpr('l.t0')} AS d, SUM(l.dur) / 3600.0 AS h ${L} GROUP BY d`, since);
    const hours = q<{ dow: number; h: number; n: number }>(
      `SELECT CAST(((t0 + ${off}) / ${DAY} + 3) % 7 AS INTEGER) AS dow, CAST(((t0 + ${off}) % ${DAY}) / 3600000 AS INTEGER) AS h, COUNT(*) AS n ${S} GROUP BY dow, h`, since); // dow: 0 = lunes
    const conc = q<{ t: number; conns: number; playing: number; f4a: number; nl: number }>(
      `SELECT (t / 3600000) * 3600000 AS t, MAX(conns) AS conns, MAX(playing) AS playing, MAX(f4a) AS f4a, MAX(nl) AS nl
        FROM (SELECT t, SUM(conns) AS conns, SUM(playing) AS playing, SUM(f4a) AS f4a, SUM(nl) AS nl FROM samples WHERE t >= ? GROUP BY t) GROUP BY t / 3600000 ORDER BY t`, Math.max(since, now - 14 * DAY));
    // ahora mismo: este proceso en vivo + la última muestra de los demás shards (de hace menos de 3 min)
    const live = this.onlineFn();
    const online = { conns: live.conns, playing: live.playing, byMode: { ...live.byMode } as Record<string, number> };
    for (const o of q<{ conns: number; playing: number; f4a: number; nl: number }>(
      `SELECT s.conns, s.playing, s.f4a, s.nl FROM samples s JOIN (SELECT shard, MAX(t) AS t FROM samples WHERE t >= ? AND shard != ? GROUP BY shard) m ON m.shard = s.shard AND m.t = s.t`, now - 180_000, SHARD)) {
      online.conns += o.conns; online.playing += o.playing;
      online.byMode.normal = (online.byMode.normal ?? 0) + o.f4a; online.byMode.br = (online.byMode.br ?? 0) + o.nl;
    }
    const chars = q<{ char: string; lives: number; players: number; secs: number; lvl: number; kp: number; kn: number; kh: number; byHunter: number; byPlayer: number }>(
      `SELECT char, COUNT(*) AS lives, COUNT(DISTINCT l.tag) AS players, SUM(l.dur) AS secs, AVG(lvl) AS lvl, AVG(k_player) AS kp, AVG(k_npc) AS kn, AVG(k_hunter) AS kh,
        AVG(cause = 'cazador') AS byHunter, AVG(cause IN ('monstruo', 'bot')) AS byPlayer ${L} AND l.mode != 'tutorial' GROUP BY char ORDER BY secs DESC`, since);
    const modes = q<{ mode: string; lives: number; players: number; secs: number }>(`SELECT l.mode AS mode, COUNT(*) AS lives, COUNT(DISTINCT l.tag) AS players, SUM(l.dur) AS secs ${L} GROUP BY l.mode ORDER BY secs DESC`, since);
    const maps = q<{ theme: string; secs: number; lives: number }>(`SELECT theme, SUM(l.dur) AS secs, COUNT(*) AS lives ${L} AND l.mode != 'tutorial' GROUP BY theme ORDER BY secs DESC`, since);
    const causes = q<{ cause: string; n: number }>(`SELECT cause, COUNT(*) AS n ${L} GROUP BY cause ORDER BY n DESC`, since);
    const killers = q<{ killer: string; n: number }>(`SELECT killer, COUNT(*) AS n ${L} AND cause = 'cazador' GROUP BY killer ORDER BY n DESC LIMIT 8`, since);
    const lengths = one<Record<string, number>>(`SELECT SUM(played = 0) AS b0, SUM(played > 0 AND played < 60) AS b1, SUM(played >= 60 AND played < 180) AS b2, SUM(played >= 180 AND played < 600) AS b3,
        SUM(played >= 600 AND played < 1800) AS b4, SUM(played >= 1800) AS b5 ${S} AND t1 IS NOT NULL`, since);
    const funnel = {
      visits: kpi.sessions ? one<{ n: number }>(`SELECT COUNT(DISTINCT tag) AS n ${S}`, since).n : 0,
      played: one<{ n: number }>(`SELECT COUNT(DISTINCT tag) AS n ${S} AND played > 0`, since).n,
      played3: one<{ n: number }>(`SELECT COUNT(DISTINCT tag) AS n FROM (SELECT tag, SUM(played) AS p ${S} GROUP BY tag) WHERE p >= 180`, since).n,
      returned: one<{ n: number }>(`SELECT COUNT(*) AS n FROM (SELECT tag, COUNT(DISTINCT ${dayExpr('t0')}) AS dd ${S} GROUP BY tag) WHERE dd >= 2`, since).n,
      google: one<{ n: number }>(`SELECT COUNT(DISTINCT tag) AS n ${S} AND google = 1`, since).n,
    };
    const group = (col: string) => q<{ k: string; n: number }>(`SELECT COALESCE(NULLIF(${col}, ''), '—') AS k, COUNT(DISTINCT tag) AS n ${S} GROUP BY k ORDER BY n DESC LIMIT 10`, since);
    const matches = one<{ n: number; dur: number | null; reals: number | null; bots: number | null; botWins: number | null }>(
      `SELECT COUNT(*) AS n, AVG(dur) AS dur, AVG(reals) AS reals, AVG(bots) AS bots, AVG(winner_bot) AS botWins FROM matches WHERE t0 >= ?`, since);
    const winners = q<{ c: string; n: number }>(`SELECT winner_char AS c, COUNT(*) AS n FROM matches WHERE t0 >= ? AND winner_bot = 0 GROUP BY c ORDER BY n DESC LIMIT 6`, since);
    const buys = q<{ kind: string; item: string; n: number; coins: number }>(`SELECT kind, item, COUNT(*) AS n, SUM(value) AS coins FROM events WHERE t >= ? AND kind IN ('buyChar', 'buySkin') GROUP BY kind, item ORDER BY n DESC LIMIT 12`, since);
    const tutorial = one<{ n: number }>(`SELECT COUNT(DISTINCT l.tag) AS n ${L} AND l.mode = 'tutorial'`, since).n;

    return {
      generated: now, days, today, online, kpi,
      retention: { d1: c1 ? r1 / c1 : null, d1n: c1, d7: c7 ? r7 / c7 : null, d7n: c7 },
      daily, dailyPlay, hours, conc, chars, modes, maps, causes, killers, lengths, funnel,
      devices: group('device'), langs: group('lang'), refs: group('ref'), utms: group('utm'),
      matches, winners, buys, tutorial,
      names: Object.fromEntries(Object.values(CHARACTERS).map((c) => [c.id, c.name])),
      themes: Object.fromEntries(Object.values(THEMES).map((t) => [t.id, t.name])),
    };
  }
}

export const analytics = new Analytics();
