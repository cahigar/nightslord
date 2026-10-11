// Servidor HTTP (sirve el cliente compilado) + WebSocket del juego en /ws.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { CHARACTERS, CHARACTER_IDS, SKINS, UPGRADES, type CharacterId } from '../shared/characters';
import { FREE_CHARS, hasCharacter, hasSkin, MEDAL_BY_ID, unlockPrice } from '../shared/catalog';
import { NAME_MAX } from '../shared/constants';
import { TUTORIAL } from '../shared/balance';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import { RoomManager, SHARD } from './RoomManager';
import { store } from './store';
import { analytics } from './analytics';
import type { Conn } from './types';

const PORT = Number(process.env.PORT ?? 3000);
/** Modo desarrollo: permite trucos para probar (subir nivel, llenar la R). */
const DEV = process.argv.includes('--dev') || process.env.NL_DEV === '1';
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? 'dist/client');
/** Inicio de sesión con Google (ID de cliente OAuth "Aplicación web"). Sin él, solo se juega como invitado. */
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
/** Cuentas master (todo desbloqueado y trucos de prueba): correos de Google separados por comas. */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);

/** Comprueba con Google un ID token del botón "Iniciar sesión con Google". */
async function verifyGoogle(credential: string): Promise<{ sub: string; email: string } | null> {
  if (!GOOGLE_CLIENT_ID || !credential || credential.length > 4096) return null;
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!r.ok) return null;
    const t = await r.json() as { aud?: string; sub?: string; email?: string; email_verified?: string | boolean; exp?: string };
    if (t.aud !== GOOGLE_CLIENT_ID || !t.sub || !t.email || String(t.email_verified) !== 'true' || Number(t.exp) * 1000 < Date.now()) return null;
    return { sub: t.sub, email: t.email.toLowerCase() };
  } catch { return null; }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.wav': 'audio/wav',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4',
};

const rooms = new RoomManager();

/** Límite de conexiones por proceso: por encima, se rechaza con un aviso (protege CPU y ancho de banda). */
const MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS ?? 400);
/** Compresión WebSocket (permessage-deflate): ~3-4x menos tráfico a cambio de algo de CPU. WS_DEFLATE=0 la desactiva. */
/** Bytes pendientes de enviar a un jugador a partir de los cuales se descartan las fotos de la partida (se manda la siguiente). */
const SNAP_BACKLOG = 48 * 1024;
const DEFLATE = process.env.WS_DEFLATE !== '0';
/** Bytes enviados (para vigilar el consumo de tráfico, que es lo que más cuesta). */
const traffic: { sent: number; since: number; dropped?: number } = { sent: 0, since: Date.now() };
let trafficRate = 0;
setInterval(() => {
  const s = (Date.now() - traffic.since) / 1000;
  trafficRate = traffic.sent / Math.max(1, s);
  traffic.sent = 0; traffic.since = Date.now();
}, 10_000).unref();

analytics.setOnline(() => {
  const byMode: Record<string, number> = {};
  let playing = 0;
  for (const r of rooms.rooms.values()) {
    let n = 0;
    for (const c of r.conns.values()) if (!c.profile.master) n++;
    if (r.tutorial) continue;
    byMode[r.mode] = (byMode[r.mode] ?? 0) + n; playing += n;
  }
  let conns = 0;
  for (const ws of wss.clients) if (!(ws as unknown as { master?: boolean }).master) conns++;
  return { conns, playing, byMode };
});

/** Panel de estadísticas: solo para cuentas master (token del perfil en la cabecera Authorization). */
/** ¿La petición viene de una cuenta master? (token del perfil en «Authorization: Bearer …») */
function isMasterReq(req: import('node:http').IncomingMessage) {
  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  const p = token && token.length <= 64 ? store.find(token) : null;
  return !!p && p.token === token && !!p.google && ADMIN_EMAILS.includes(p.google.email);
}

/** Reportes de errores de los jugadores para /admin/: GET lista; POST {id, important} marca; POST {id, del: true} borra. */
function reportsApi(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) {
  const ok = isMasterReq(req);
  res.writeHead(ok ? 200 : 403, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  if (!ok) { res.end(JSON.stringify({ error: 'Solo para cuentas master.' })); return; }
  if (req.method !== 'POST') { res.end(JSON.stringify({ list: store.listReports() })); return; }
  let body = '';
  req.on('data', (d) => { body += d; if (body.length > 2000) req.destroy(); });
  req.on('end', () => {
    try {
      const b = JSON.parse(body) as { id?: number; important?: boolean; del?: boolean };
      const id = Number(b.id);
      if (id > 0) { if (b.del) store.deleteReport(id); else store.markReport(id, !!b.important); }
    } catch { /* */ }
    res.end(JSON.stringify({ list: store.listReports() }));
  });
}

function statsApi(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, query: string) {
  const ok = isMasterReq(req);
  res.writeHead(ok ? 200 : 403, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  if (!ok) { res.end(JSON.stringify({ error: 'Solo para cuentas master.' })); return; }
  const qs = new URLSearchParams(query);
  const days = Math.max(1, Math.min(365, Number(qs.get('days')) || 30));
  const tz = Math.max(-840, Math.min(840, Number(qs.get('tz')) || 0));
  try { res.end(JSON.stringify(analytics.report(days, tz))); }
  catch (e) { console.error('[stats]', e); res.end(JSON.stringify({ error: 'error calculando' })); }
}

const server = createServer((req, res) => {
  const [url, query = ''] = (req.url ?? '/').split('?');
  if (url === '/api/stats') { statsApi(req, res, query); return; }
  if (url === '/api/reports') { reportsApi(req, res); return; }
  if (url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
    const players = [...rooms.rooms.values()].reduce((a, r) => a + r.playerCount, 0);
    res.end(JSON.stringify({
      ok: true, shard: SHARD, rooms: rooms.rooms.size, players, connections: wss.clients.size, maxConnections: MAX_CONNECTIONS,
      full: wss.clients.size >= MAX_CONNECTIONS, kbps: Math.round(trafficRate / 1024), deflate: DEFLATE,
    }));
    return;
  }
  let file = normalize(join(STATIC_DIR, url === '/' ? 'index.html' : url));
  if (!file.startsWith(STATIC_DIR)) { res.writeHead(403); res.end(); return; }
  // páginas estáticas (monstruos, mapas, guías): /monstruos/vampiro → /monstruos/vampiro/index.html
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!url.endsWith('/')) { res.writeHead(301, { location: url + '/' }); res.end(); return; }
    file = join(file, 'index.html');
  }
  if (!existsSync(file)) file = join(STATIC_DIR, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Servidor de Mooonsters activo. En desarrollo abre el cliente en http://localhost:5173');
    return;
  }
  // los ficheros de /assets llevan hash en el nombre: se pueden cachear para siempre (CDN y navegador)
  const cache = url.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': cache });
  createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({
  server, path: '/ws', maxPayload: 4096,
  perMessageDeflate: DEFLATE ? { zlibDeflateOptions: { level: 3, memLevel: 7 }, threshold: 256, concurrencyLimit: 4, serverNoContextTakeover: false, clientNoContextTakeover: true } : false,
});
let nextConnId = 1;

function cleanName(n: unknown): string {
  const s = String(n ?? '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, NAME_MAX);
  return s || `Criatura${Math.floor(Math.random() * 900 + 100)}`;
}

wss.on('connection', (ws: WebSocket, req) => {
  if (wss.clients.size > MAX_CONNECTIONS) {
    ws.send(JSON.stringify({ t: 'error', msg: 'El servidor está lleno ahora mismo. Prueba en un momento.', k: 'serverBusy' } satisfies ServerMsg));
    ws.close(1013, 'lleno');
    return;
  }
  let conn: Conn | null = null;
  const sock = (ws as unknown as { _socket?: { bytesWritten: number } })._socket;
  let lastBytes = sock?.bytesWritten ?? 0;
  const send = (m: ServerMsg) => {
    if (ws.readyState !== ws.OPEN) return;
    // red atascada (móvil con mala cobertura): se tiran las fotos viejas en vez de acumularlas;
    // así, cuando la conexión se recupera, llega la situación actual y no segundos de retraso
    if (m.t === 'snap' && ws.bufferedAmount > SNAP_BACKLOG) { traffic.dropped = (traffic.dropped ?? 0) + 1; return; }
    ws.send(JSON.stringify(m), () => { if (sock) { traffic.sent += sock.bytesWritten - lastBytes; lastBytes = sock.bytesWritten; } });
  };
  // limitador simple de mensajes
  let budget = 80;
  const refill = setInterval(() => { budget = Math.min(80, budget + 40); }, 1000);

  ws.on('message', (raw) => {
    if (--budget < 0) return;
    let msg: ClientMsg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    if (msg.t === 'hello') {
      if (conn) {
        // ya identificado: solo actualiza el nombre (se aplica en la próxima aparición)
        const n = cleanName(msg.name);
        if (String(msg.name ?? '').trim()) { conn.name = n; conn.profile.name = n; }
        store.touch();
        send({ t: 'profile', profile: conn.profile });
        return;
      }
      const profile = store.getOrCreate(typeof msg.token === 'string' ? msg.token : undefined, cleanName(msg.name));
      profile.master = !!profile.google && ADMIN_EMAILS.includes(profile.google.email);
      conn = { id: nextConnId++, profile, name: profile.name, send, roomCode: null };
      (ws as unknown as { master?: boolean }).master = !!profile.master;
      const ua = String(req.headers['user-agent'] ?? '');
      const clip = (v: unknown, n = 40) => String(v ?? '').replace(/[^\w.\-]/g, '').slice(0, n).toLowerCase();
      analytics.sessionStart(conn, {
        device: /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'móvil' : 'ordenador',
        lang: clip(msg.lang || String(req.headers['accept-language'] ?? '').split(/[,;]/)[0], 8).slice(0, 2),
        ref: clip(msg.ref), utm: clip(msg.utm),
        isNew: Date.now() - profile.createdAt < 10_000, google: !!profile.google, admin: !!profile.master,
      });
      send({ t: 'welcome', profile, dev: DEV, google: GOOGLE_CLIENT_ID || undefined });
      return;
    }
    if (msg.t === 'login' && conn) {
      const c = conn;
      void verifyGoogle(String(msg.credential ?? '')).then((g) => {
        if (!g) return c.send({ t: 'error', msg: 'No se pudo iniciar sesión con Google.', k: 'loginFail' });
        c.profile = store.linkGoogle(c.profile, g.sub, g.email);
        c.profile.master = ADMIN_EMAILS.includes(g.email);
        (ws as unknown as { master?: boolean }).master = c.profile.master;
        analytics.sessionAccount(c, c.profile.master);
        c.send({ t: 'welcome', profile: c.profile, dev: DEV, google: GOOGLE_CLIENT_ID || undefined });
      });
      return;
    }
    if (msg.t === 'ping') { send({ t: 'pong', c: msg.c }); return; }
    if (!conn) return;
    const c = conn;
    const room = c.roomCode ? rooms.get(c.roomCode) : undefined;

    switch (msg.t) {
      case 'rooms':
        send({ t: 'rooms', list: rooms.list() });
        break;
      case 'join': {
        if (room) room.removeConn(c);
        if (msg.mode === 'tutorial') {
          // práctica: cualquiera de los 3 monstruos del tutorial, en una sala privada solo para ti
          const i = Math.max(0, TUTORIAL.chars.indexOf(msg.char as (typeof TUTORIAL.chars)[number]));
          const t = rooms.create(true, TUTORIAL.themes[i], true);
          if (!t) return send({ t: 'error', msg: 'El servidor está lleno ahora mismo. Prueba en un momento.', k: 'serverBusy' });
          t.addConn(c, TUTORIAL.chars[i], 'classic');
          break;
        }
        const { char, skin } = validChoice(c, msg.char, msg.skin);
        let target = null;
        if (msg.mode === 'nightlord') {
          // El Señor de la Noche: a la previa (pública o una privada nueva)
          target = msg.priv ? rooms.create(true, undefined, false, 'lobby') : rooms.findLobby();
        } else if (msg.mode === 'code') {
          target = msg.code ? rooms.get(msg.code) : undefined;
          if (!target) return send({ t: 'error', msg: 'No existe ninguna sala con ese código.', k: 'noRoom' });
          if (target.mode === 'br') return send({ t: 'error', msg: 'Esa partida ya ha empezado: espera en la previa a la siguiente.', k: 'matchRunning' });
          if (target.isFull) return send({ t: 'error', msg: 'La sala está llena.', k: 'roomFull' });
        } else if (msg.mode === 'create') {
          target = rooms.create(!!msg.priv, msg.theme);
          if (target && msg.priv && msg.fill) target.fillPriv = true; // sala privada con bots hasta que lleguen los amigos
        } else {
          target = rooms.findRandom();
        }
        if (!target) return send({ t: 'error', msg: 'El servidor está lleno. Inténtalo en un rato.', k: 'serverFull' });
        target.addConn(c, char, skin);
        break;
      }
      case 'input':
        room?.onInput(c, msg);
        break;
      case 'emote':
        if (msg.e === 'wave' || msg.e === 'taunt' || msg.e === 'ally') room?.onEmote(c, msg.e);
        break;
      case 'trap':
        room?.onTrap(c);
        break;
      case 'upgrade':
        if (UPGRADES.some((u) => u.id === msg.u)) room?.onUpgrade(c, msg.u);
        break;
      case 'respawn': {
        if (!room) return;
        const { char, skin } = validChoice(c, msg.char, msg.skin);
        room.respawn(c, char, skin);
        break;
      }
      case 'leave':
        if (room) room.removeConn(c);
        send({ t: 'left' });
        send({ t: 'profile', profile: c.profile });
        break;
      case 'tut':
        if (msg.a === 'boost' || msg.a === 'hunter' || msg.a === 'hurt') room?.onTutorial(c, msg.a);
        break;
      case 'cheat':
        if (DEV || c.profile.master) room?.onCheat(c, typeof msg.lvl === 'number' ? msg.lvl : undefined, !!msg.ult, Array.isArray(msg.tp) ? msg.tp : undefined, !!msg.heal);
        break;
      case 'buy':
        buy(c, String(msg.item ?? ''));
        break;
      case 'report': {
        const text = String(msg.text ?? '').trim();
        if (text.length < 3) return;
        const ctx: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(msg.ctx ?? {}).slice(0, 12)) if (typeof v === 'string' || typeof v === 'number') ctx[k.slice(0, 20)] = typeof v === 'string' ? v.slice(0, 160) : v;
        if (room) { ctx.room = room.code; ctx.theme = room.theme; }
        if (SHARD) ctx.shard = SHARD;
        const ok = store.addReport(c.profile.token, c.profile.name || 'Anónimo', text, ctx);
        send({ t: 'toast', text: ok ? '¡Gracias! Hemos recibido tu reporte.' : 'Has enviado muchos reportes seguidos: prueba más tarde.', k: ok ? 'reportThanks' : 'reportLimit' });
        break;
      }

    }
  });

  ws.on('close', () => {
    clearInterval(refill);
    if (conn?.roomCode) rooms.get(conn.roomCode)?.removeConn(conn);
    if (conn) analytics.sessionEnd(conn);
    store.flush();
  });
});

function validChoice(c: Conn, char: unknown, skin: unknown): { char: CharacterId; skin: string } {
  let ch = (CHARACTER_IDS.includes(char as CharacterId) ? char : 'vampire') as CharacterId;
  if (!DEV && !hasCharacter(c.profile, ch)) ch = 'vampire';
  const sk = SKINS[ch].find((s) => s.id === skin);
  return { char: ch, skin: sk && (DEV || hasSkin(c.profile, ch, sk)) ? sk.id : SKINS[ch][0].id };
}

/** Medalla ganada fuera de la partida (compras). */
function awardOutside(c: Conn, id: string) {
  if (store.award(c.profile, id)) c.send({ t: 'medal', id });
  void MEDAL_BY_ID;
}

function buy(c: Conn, item: string) {
  const p = c.profile;
  const parts = item.split(':');
  if (parts[0] === 'char') {
    const ch = parts[1] as CharacterId;
    if (!CHARACTERS[ch] || hasCharacter(p, ch)) return;
    const price = unlockPrice(p);
    if (p.coins < price) return c.send({ t: 'error', msg: 'No tienes monedas suficientes.', k: 'noCoins' });
    p.coins -= price;
    p.chars.push(ch);
    analytics.event(c, 'buyChar', ch, price);
    if (CHARACTER_IDS.filter((x) => FREE_CHARS.includes(x) || hasCharacter(p, x)).length >= 16) awardOutside(c, 'collector');
  } else if (parts[0] === 'skin') {
    const ch = parts[1] as CharacterId;
    const sk = SKINS[ch]?.find((s) => s.id === parts[2]);
    if (!sk || hasSkin(p, ch, sk)) return;
    if (sk.medal && sk.price === 0) return c.send({ t: 'error', msg: 'Esta skin se gana con una medalla.', k: 'skinMedalOnly' });
    if (p.coins < sk.price) return c.send({ t: 'error', msg: 'No tienes monedas suficientes.', k: 'noCoins' });
    p.coins -= sk.price;
    p.skins.push(`${ch}:${sk.id}`);
    analytics.event(c, 'buySkin', `${ch}:${sk.id}`, sk.price);
    awardOutside(c, 'fashion');
  } else return;
  store.touch();
  c.send({ t: 'profile', profile: p });
}

server.listen(PORT, () => console.log(`🦇 Mooonsters escuchando en http://localhost:${PORT}${DEV ? ' (modo desarrollo: Mayús+L sube nivel, Mayús+U carga la R)' : ''}`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { store.flush(); process.exit(0); });
}
