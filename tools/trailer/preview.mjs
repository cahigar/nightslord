// Vídeos de vista previa para portales (CrazyGames): 15–20 s, sin sonido, sin textos, empiezan con la portada.
// Uso: node tools/trailer/preview.mjs <land|port> <carpeta>   → <carpeta>/preview-<land|port>.webm + .json (marcas)
// Luego: node tools/trailer/preview.mjs compose <land|port> <carpeta> <portada.png> <salida.mp4>
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { openGame, installPilot, pilot, cheat, sleep, lockView, startRecording, press, approach } from './harness.mjs';

const FMT = { land: { vw: 960, vh: 540, W: 1920, H: 1080, zoom: 4.0 }, port: { vw: 540, vh: 810, W: 1080, H: 1620, zoom: 3.5 } };
// tomas en orden de montaje: [id, offset, duración]
const CUT = [['hunt', 0.3, 4.0], ['q', 0.3, 3.0], ['evo', 0.4, 3.0], ['r', 0.2, 3.8], ['hunter', 0.3, 4.0]];

if (process.argv[2] === 'compose') {
  const [fmt, dir, cover, out] = process.argv.slice(3);
  const F = FMT[fmt], src = `${dir}/preview-${fmt}.webm`;
  const marks = Object.fromEntries(JSON.parse(readFileSync(`${dir}/preview-${fmt}.json`, 'utf8')));
  const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { stdio: 'inherit' });
  const ENC = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', '30', '-an'];
  const parts = [];
  // portada como primer fotograma (0,6 s) y fundido corto al juego
  ff('-loop', '1', '-t', '0.6', '-i', cover, '-vf', `scale=${F.W}:${F.H}:flags=neighbor,setsar=1,fps=30`, ...ENC, `${dir}/pv-${fmt}-0.mp4`);
  parts.push(`${dir}/pv-${fmt}-0.mp4`);
  CUT.forEach(([id, off, len], i) => {
    const o = `${dir}/pv-${fmt}-${i + 1}.mp4`;
    ff('-ss', String(marks[id] + off), '-t', String(len), '-i', src, '-vf', `scale=${F.W}:${F.H}:flags=lanczos,setsar=1,fps=30`, ...ENC, o);
    parts.push(o);
  });
  // concatenación con fundidos muy cortos entre tomas (0,25 s; el primero, de la portada, 0,4 s)
  const lens = [0.6, ...CUT.map((c) => c[2])];
  let f = '', last = '0:v', t = lens[0];
  for (let i = 1; i < parts.length; i++) {
    const d = i === 1 ? 0.4 : 0.25;
    f += `${f ? ';' : ''}[${last}][${i}:v]xfade=transition=fade:duration=${d}:offset=${(t - d).toFixed(2)}[x${i}]`;
    last = `x${i}`; t += lens[i] - d;
  }
  ff(...parts.flatMap((p) => ['-i', p]), '-filter_complex', f, '-map', `[${last}]`, ...ENC, '-movflags', '+faststart', out);
  console.log(out, t.toFixed(1), 's');
  process.exit(0);
}

const [fmt = 'land', outDir = '/tmp/pv'] = process.argv.slice(2);
const F = FMT[fmt];
mkdirSync(outDir, { recursive: true });
const { browser, page } = await openGame({ name: 'Vlad' });
await page.evaluate(() => { localStorage.setItem('nl_lang', 'en'); }); await page.reload(); await page.waitForFunction(() => window.__nl && document.fonts.status === 'loaded');
await page.setViewportSize({ width: F.vw, height: F.vh });
await page.evaluate(async () => {
  const { initAudio, stopMusic } = await import('/audio.ts');
  initAudio(); stopMusic();
  const nl = window.__nl;
  nl.net.send({ t: 'hello', name: 'Vlad' });
  nl.net.send({ t: 'join', mode: 'create', priv: true, fill: true, theme: 'transylvania', char: 'vampire', skin: 'classic' });
});
await page.waitForFunction(() => window.__nl.game.alive && window.__nl.game.ents.has(window.__nl.game.youId), null, { timeout: 15000 });
// sin menús ni botones; el lienzo del juego (con sus nombres y barras) se queda
await page.addStyleTag({ content: `body > *:not(#game){display:none!important} #game{display:block!important}` });
await installPilot(page);
await lockView(page, { scale: F.W / F.vw, zoom: F.zoom, focusY: 0.55 });
await cheat(page, { lvl: 3 });
await sleep(6000); // que entren los bots y se pueble el mapa
const rec = await startRecording(page, `${outDir}/preview-${fmt}.webm`);
const take = async (id, prep, run) => { await pilot(page, { mode: 'idle', want: ['npc'], keepDist: 0 }); await prep(); await sleep(300); await rec.mark(id); await run(); console.log('toma', id); };
const near = (p, k) => p.evaluate((k) => { const t = window.pilot.nearest(k); if (t) window.pilot.aimAt(t.e.rx, t.e.ry); }, k);
await take('hunt', () => approach(page, ['npc'], 100, { minGroup: 3 }), async () => { await pilot(page, { mode: 'hunt', want: ['npc'] }); await sleep(4300); });
await take('q', () => approach(page, ['npc'], 150, { minGroup: 2 }), async () => { await pilot(page, { mode: 'stay' }); await near(page, ['npc']); await sleep(300); await press(page, 'KeyQ'); await sleep(800); await pilot(page, { mode: 'hunt' }); await sleep(2400); });
await take('evo', () => approach(page, ['npc'], 90, { minGroup: 2 }), async () => { await pilot(page, { mode: 'hunt' }); await sleep(500); await cheat(page, { lvl: 10 }); await sleep(800); await cheat(page, { lvl: 15, heal: true }); await sleep(2600); });
await take('r', async () => { await cheat(page, { ult: true, heal: true }); await approach(page, ['npc'], 110, { minGroup: 3 }); }, async () => { await pilot(page, { mode: 'stay' }); await sleep(250); await press(page, 'KeyR'); await sleep(500); await pilot(page, { mode: 'hunt' }); await sleep(3500); });
await take('hunter', async () => {
  await cheat(page, { heal: true });
  for (let i = 0; i < 40; i++) { if (await approach(page, ['hunter'], 150)) break; await sleep(800); }
}, async () => { await pilot(page, { mode: 'hunt', want: ['hunter'] }); await sleep(500); await near(page, ['hunter']); await press(page, 'KeyQ'); await sleep(3800); });
const marks = await rec.stop();
writeFileSync(`${outDir}/preview-${fmt}.json`, JSON.stringify(marks));
await browser.close();
console.log('ok', marks);
process.exit(0);
