// Utilidades comunes para grabar trailers con Playwright sobre el juego en modo desarrollo.
// Requiere: servidor `npx tsx server/index.ts --dev` (puerto 3000) y `npx vite --port 5173`.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const font = (pkg, file) => readFileSync(require.resolve(`@fontsource/${pkg}/files/${file}`));

export const BASE = process.env.BASE || 'http://localhost:5173';
export const W = 540, H = 960; // se graba a la mitad y se escala ×2 (pixel art)

/** Abre el juego listo para jugar: nombre, fuentes locales, audio capturable. */
export async function openGame({ name = 'mooonsters.com' } = {}) {
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: Number(process.env.DSF || 2), locale: 'es-ES' });
  // Google Fonts no es accesible desde aquí: servimos las mismas fuentes en local
  await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({
    contentType: 'text/css',
    body: `@font-face{font-family:'Press Start 2P';src:url(https://fonts.gstatic.com/ps2p.woff2) format('woff2');}
@font-face{font-family:'VT323';src:url(https://fonts.gstatic.com/vt323.woff2) format('woff2');}`,
  }));
  await ctx.route(/fonts\.gstatic\.com\/ps2p/, (r) => r.fulfill({ contentType: 'font/woff2', body: font('press-start-2p', 'press-start-2p-latin-400-normal.woff2') }));
  await ctx.route(/fonts\.gstatic\.com\/vt323/, (r) => r.fulfill({ contentType: 'font/woff2', body: font('vt323', 'vt323-latin-400-normal.woff2') }));
  await ctx.addInitScript((n) => {
    try { localStorage.setItem('nl_name', n); localStorage.setItem('nl_tut', 'vampire,mummy,zombie'); } catch {}
    // Captura del audio del juego: todo lo que va a ctx.destination también va a un MediaStream
    const orig = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest, ...rest) {
      const r = orig.call(this, dest, ...rest);
      if (dest instanceof AudioDestinationNode) {
        const ac = dest.context;
        if (!ac.__rec) ac.__rec = ac.createMediaStreamDestination();
        orig.call(this, ac.__rec);
        window.__audioStream = ac.__rec.stream;
      }
      return r;
    };
  }, name);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
  await page.goto(BASE + '/');
  await page.waitForFunction(() => window.__nl && document.fonts.status === 'loaded');
  await page.evaluate(() => document.fonts.load('12px "Press Start 2P"'));
  return { browser, page };
}

/** Entra en una sala privada nueva con el monstruo y mapa elegidos. */
export async function joinRoom(page, { char, theme, skin = 'classic' }) {
  await page.evaluate(async ({ char, theme, skin }) => {
    const { initAudio, stopMusic } = await import('/audio.ts');
    initAudio(); stopMusic(); // la música va aparte (pista continua en el montaje)
    const nl = window.__nl;
    nl.net.send({ t: 'hello', name: 'mooonsters.com' });
    nl.net.send({ t: 'join', mode: 'create', priv: true, theme, char, skin });
  }, { char, theme, skin });
  await page.waitForFunction(() => window.__nl.game.alive && window.__nl.game.ents.has(window.__nl.game.youId), null, { timeout: 15000 });
  // fuera HUD, botones y avisos: solo el juego y los nombres
  await page.addStyleTag({ content: `body > *:not(#game){display:none!important} #game{display:block!important}` });
  await page.evaluate(() => window.__nl.game.roomCode);
  return page.evaluate(() => window.__nl.game.roomCode);
}

/** Instala el piloto automático dentro de la página (window.pilot). */
export async function installPilot(page) {
  await page.evaluate(async () => {
    const { input } = await import('/input.ts');
    const g = window.__nl.game;
    const KINDS = { player: 0, npc: 1, hunter: 2, powerup: 3, minion: 5 };
    const P = {
      mode: 'idle', // idle | hunt | walk | flee | stay
      want: ['npc'], dir: 0, target: null, attack: true, keepDist: 0, hold: false,
      me() { return g.ents.get(g.youId); },
      list(kinds) {
        const me = this.me(); if (!me) return [];
        const ks = kinds.map((k) => KINDS[k]);
        return [...g.ents.values()].filter((e) => e.id !== g.youId && ks.includes(e.k) && !(e.k === 5 && e.o === g.youId) && (e.h ?? 100) > 0)
          .map((e) => ({ e, d: Math.hypot(e.rx - me.rx, e.ry - me.ry) })).sort((a, b) => a.d - b.d);
      },
      nearest(kinds) { return this.list(kinds)[0] ?? null; },
      aimAt(x, y) {
        const z = g.cam.zoom;
        input.mouseX = g.canvas.width / 2 + (x - g.cam.x) * z;
        input.mouseY = g.canvas.height * g.focusY + (y - 30 - g.cam.y) * z;
      },
      aimDir(a, dist = 160) { const me = this.me(); if (me) this.aimAt(me.rx + Math.cos(a) * dist, me.ry - 15 + Math.sin(a) * dist); },
      move(a) {
        for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) input.keys.delete(k);
        if (a === null) return;
        const dx = Math.cos(a), dy = Math.sin(a);
        if (dx > 0.38) input.keys.add('KeyD'); if (dx < -0.38) input.keys.add('KeyA');
        if (dy > 0.38) input.keys.add('KeyS'); if (dy < -0.38) input.keys.add('KeyW');
      },
      press(code) { input.keys.add(code); input.pulses.add(code); setTimeout(() => input.keys.delete(code), 120); },
      tick() {
        const me = this.me(); if (!me) return;
        if (this.mode === 'idle') { this.move(null); input.mouseDown = false; return; }
        if (this.mode === 'walk') { this.move(this.dir); this.aimDir(this.dir); input.mouseDown = false; return; }
        if (this.mode === 'stay') { this.move(null); input.mouseDown = this.hold; return; }
        const t = this.nearest(this.want);
        if (!t) { this.move(this.dir); this.aimDir(this.dir); input.mouseDown = false; if (Math.random() < 0.01) this.dir += 1.2; return; }
        this.target = t;
        const a = Math.atan2(t.e.ry - me.ry, t.e.rx - me.rx);
        this.aimAt(t.e.rx, t.e.ry);
        if (this.mode === 'flee') { this.move(a + Math.PI); input.mouseDown = false; return; }
        if (t.d > (this.keepDist || 34)) this.move(a); else if (this.keepDist && t.d < this.keepDist * 0.6) this.move(a + Math.PI); else this.move(null);
        input.mouseDown = this.attack && t.d < 90;
      },
    };
    window.pilot = P;
    setInterval(() => { try { P.tick(); } catch (e) { console.error(e.message); } }, 40);
  });
}

export const cheat = (page, o) => page.evaluate((o) => window.__nl.net.send({ t: 'cheat', ...o }), o);
export const pilot = (page, o) => page.evaluate((o) => Object.assign(window.pilot, o), o);
export const press = (page, code) => page.evaluate((c) => window.pilot.press(c), code);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fija resolución interna y zoom de cámara (encuadre de los trailers). */
export async function lockView(page, { scale = 1.25, zoom = 2.8 } = {}) {
  await page.evaluate(async ({ scale, zoom }) => {
    const { quality } = await import('/quality.ts');
    quality.max = quality.min = quality.scale = scale;
    window.dispatchEvent(new Event('resize'));
    const g = window.__nl.game;
    window.__zoom = zoom;
    Object.defineProperty(g.cam, 'zoom', { get: () => window.__zoom, set() {}, configurable: true });
  }, { scale, zoom });
}

/** Graba el lienzo del juego + el audio. Devuelve { mark(name), stop() → ruta del .webm }. */
export async function startRecording(page, file) {
  const { createWriteStream } = await import('node:fs');
  const out = createWriteStream(file);
  await page.exposeFunction('__recChunk', (b64) => { out.write(Buffer.from(b64, 'base64')); });
  await page.evaluate(() => {
    const cv = window.__nl.game.canvas;
    const vs = cv.captureStream(30);
    const tracks = [...vs.getVideoTracks(), ...(window.__audioStream ? window.__audioStream.getAudioTracks() : [])];
    const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 14_000_000, audioBitsPerSecond: 160_000 });
    window.__marks = [];
    rec.ondataavailable = async (e) => {
      const buf = new Uint8Array(await e.data.arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      await window.__recChunk(btoa(s));
    };
    window.__rec = rec;
    rec.start(1000);
    window.__t0 = performance.now();
  });
  return {
    mark: (name) => page.evaluate((n) => { const t = (performance.now() - window.__t0) / 1000; window.__marks.push([n, +t.toFixed(2)]); return t; }, name),
    async stop() {
      const marks = await page.evaluate(() => new Promise((res) => { window.__rec.onstop = () => setTimeout(() => res(window.__marks), 1500); window.__rec.stop(); }));
      await new Promise((r) => out.end(r));
      return marks;
    },
  };
}

/** Bot sencillo que entra en la sala con un monstruo y se queda cerca (para Robar rostro, tentáculos…). */
export async function addBot(code, char, name = 'Bot', { respawn = true } = {}) {
  const { default: WebSocket } = await import('ws');
  const ws = new WebSocket('ws://localhost:3000/ws');
  let q = 0, ang = Math.random() * 6.28, me = null;
  const bot = { ws, follow: null, still: true, close: () => ws.close() };
  ws.on('open', () => {
    ws.send(JSON.stringify({ t: 'hello', name }));
    ws.send(JSON.stringify({ t: 'join', mode: 'code', code, char, skin: 'classic' }));
    setInterval(() => {
      if (bot.still) return ws.send(JSON.stringify({ t: 'input', q: ++q, mx: 0, my: 0, a: ang, b: 0 }));
      if (Math.random() < 0.04) ang += (Math.random() - 0.5) * 2;
      ws.send(JSON.stringify({ t: 'input', q: ++q, mx: Math.cos(ang) * 0.5, my: Math.sin(ang) * 0.5, a: ang, b: 0 }));
    }, 50);
  });
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.t === 'died' && respawn) setTimeout(() => ws.send(JSON.stringify({ t: 'respawn' })), 1500); });
  bot.tp = (x, y) => ws.send(JSON.stringify({ t: 'cheat', tp: [x, y], heal: true }));
  return bot;
}

export const myPos = (page) => page.evaluate(() => { const e = window.pilot.me(); return e ? [Math.round(e.rx), Math.round(e.ry)] : null; });

/** Teletransporta cerca del mejor grupo visible de `kinds` (a `dist` px); si no se ve nada, salta a otro sitio. */
export async function approach(page, kinds = ['npc'], dist = 150, { minGroup = 1, angle = Math.PI / 2 } = {}) {
  for (let i = 0; i < 30; i++) {
    const s = await page.evaluate(({ kinds, minGroup }) => {
      const P = window.pilot, g = window.__nl.game, me = P.me();
      const l = P.list(kinds);
      let best = null, bestN = 0;
      for (const a of l) {
        const n = l.filter((b) => Math.hypot(b.e.rx - a.e.rx, b.e.ry - a.e.ry) < 220).length;
        if (n > bestN || (n === bestN && best && a.d < best.d)) { best = a; bestN = n; }
      }
      return { me: me && [me.rx, me.ry], t: best && bestN >= minGroup ? [best.e.rx, best.e.ry, best.d] : null, size: g.map.size ?? 6000 };
    }, { kinds, minGroup });
    if (!s.me) { await sleep(300); continue; }
    if (s.t && s.t[2] < dist + 40 && s.t[2] > dist * 0.5) return true;
    let x, y;
    if (s.t) { const a = angle ?? Math.atan2(s.me[1] - s.t[1], s.me[0] - s.t[0]); x = s.t[0] + Math.cos(a) * dist; y = s.t[1] + Math.sin(a) * dist; }
    else { x = 400 + Math.random() * (s.size - 800); y = 400 + Math.random() * (s.size - 800); }
    await cheat(page, { tp: [Math.round(x), Math.round(y)], heal: true });
    await sleep(s.t ? 450 : 900);
  }
  return false;
}
