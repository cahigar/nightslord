// Servidor HTTP (sirve el cliente compilado) + WebSocket del juego en /ws.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { CHARACTERS, CHARACTER_IDS, SKINS, UPGRADES, type CharacterId } from '../shared/characters';
import { CHARACTER_UNLOCK, hasCharacter, hasSkin } from '../shared/catalog';
import { NAME_MAX } from '../shared/constants';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import { RoomManager, SHARD } from './RoomManager';
import { store } from './store';
import type { Conn } from './types';

const PORT = Number(process.env.PORT ?? 3000);
/** Modo desarrollo: permite trucos para probar (subir nivel, llenar la R). */
const DEV = process.argv.includes('--dev') || process.env.NL_DEV === '1';
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? 'dist/client');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.wav': 'audio/wav',
};

const rooms = new RoomManager();

/** Límite de conexiones por proceso: por encima, se rechaza con un aviso (protege CPU y ancho de banda). */
const MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS ?? 400);
/** Compresión WebSocket (permessage-deflate): ~3-4x menos tráfico a cambio de algo de CPU. WS_DEFLATE=0 la desactiva. */
const DEFLATE = process.env.WS_DEFLATE !== '0';
/** Bytes enviados (para vigilar el consumo de tráfico, que es lo que más cuesta). */
const traffic = { sent: 0, since: Date.now() };
let trafficRate = 0;
setInterval(() => {
  const s = (Date.now() - traffic.since) / 1000;
  trafficRate = traffic.sent / Math.max(1, s);
  traffic.sent = 0; traffic.since = Date.now();
}, 10_000).unref();

const server = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
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
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(STATIC_DIR, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Servidor de El Señor de la Noche activo. En desarrollo abre el cliente en http://localhost:5173');
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
    ws.send(JSON.stringify({ t: 'error', msg: 'El servidor está lleno ahora mismo. Prueba en un momento.' } satisfies ServerMsg));
    ws.close(1013, 'lleno');
    return;
  }
  void req;
  let conn: Conn | null = null;
  const sock = (ws as unknown as { _socket?: { bytesWritten: number } })._socket;
  let lastBytes = sock?.bytesWritten ?? 0;
  const send = (m: ServerMsg) => {
    if (ws.readyState !== ws.OPEN) return;
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
      conn = { id: nextConnId++, profile, name: profile.name, send, roomCode: null };
      send({ t: 'welcome', profile, dev: DEV });
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
        const { char, skin } = validChoice(c, msg.char, msg.skin);
        let target = null;
        if (msg.mode === 'code') {
          target = msg.code ? rooms.get(msg.code) : undefined;
          if (!target) return send({ t: 'error', msg: 'No existe ninguna sala con ese código.' });
          if (target.isFull) return send({ t: 'error', msg: 'La sala está llena.' });
        } else if (msg.mode === 'create') {
          target = rooms.create(!!msg.priv, msg.theme);
        } else {
          target = rooms.findRandom();
        }
        if (!target) return send({ t: 'error', msg: 'El servidor está lleno. Inténtalo en un rato.' });
        target.addConn(c, char, skin);
        break;
      }
      case 'input':
        room?.onInput(c, msg);
        break;
      case 'emote':
        if (msg.e === 'wave' || msg.e === 'taunt') room?.onEmote(c, msg.e);
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
      case 'cheat':
        if (DEV) room?.onCheat(c, typeof msg.lvl === 'number' ? msg.lvl : undefined, !!msg.ult, Array.isArray(msg.tp) ? msg.tp : undefined, !!msg.heal);
        break;
      case 'buy':
        buy(c, String(msg.item ?? ''));
        break;
    }
  });

  ws.on('close', () => {
    clearInterval(refill);
    if (conn?.roomCode) rooms.get(conn.roomCode)?.removeConn(conn);
    store.flush();
  });
});

function validChoice(c: Conn, char: unknown, skin: unknown): { char: CharacterId; skin: string } {
  let ch = (CHARACTER_IDS.includes(char as CharacterId) ? char : 'vampire') as CharacterId;
  if (!DEV && !hasCharacter(c.profile, ch)) ch = 'vampire';
  const sk = SKINS[ch].find((s) => s.id === skin);
  return { char: ch, skin: sk && (DEV || hasSkin(c.profile, ch, sk)) ? sk.id : SKINS[ch][0].id };
}

function buy(c: Conn, item: string) {
  const p = c.profile;
  const parts = item.split(':');
  if (parts[0] === 'char') {
    const ch = parts[1] as CharacterId;
    if (!CHARACTERS[ch] || hasCharacter(p, ch)) return;
    const price = CHARACTER_UNLOCK[ch].price;
    if (p.coins < price) return c.send({ t: 'error', msg: 'No tienes monedas suficientes.' });
    p.coins -= price;
    p.chars.push(ch);
  } else if (parts[0] === 'skin') {
    const ch = parts[1] as CharacterId;
    const sk = SKINS[ch]?.find((s) => s.id === parts[2]);
    if (!sk || hasSkin(p, ch, sk)) return;
    if (sk.medal && sk.price === 0) return c.send({ t: 'error', msg: 'Esta skin se gana con una medalla.' });
    if (p.coins < sk.price) return c.send({ t: 'error', msg: 'No tienes monedas suficientes.' });
    p.coins -= sk.price;
    p.skins.push(`${ch}:${sk.id}`);
  } else return;
  store.touch();
  c.send({ t: 'profile', profile: p });
}

server.listen(PORT, () => console.log(`🦇 El Señor de la Noche escuchando en http://localhost:${PORT}${DEV ? ' (modo desarrollo: Mayús+L sube nivel, Mayús+U carga la R)' : ''}`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { store.flush(); process.exit(0); });
}
