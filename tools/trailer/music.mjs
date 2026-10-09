// Graba la música del juego sola (pista continua para el montaje). Uso: node tools/trailer/music.mjs salida.webm [segundos]
import { openGame, sleep } from './harness.mjs';
import { writeFileSync } from 'node:fs';
const [file = '/tmp/tr/music.webm', secs = 32] = process.argv.slice(2);
const { browser, page } = await openGame();
const b64 = await page.evaluate(async (secs) => {
  const { initAudio, startMusic } = await import('/audio.ts');
  initAudio(); startMusic();
  await new Promise((r) => setTimeout(r, 300));
  const rec = new MediaRecorder(window.__audioStream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
  const parts = [];
  rec.ondataavailable = (e) => parts.push(e.data);
  rec.start();
  await new Promise((r) => setTimeout(r, secs * 1000));
  await new Promise((r) => { rec.onstop = r; rec.stop(); });
  const buf = new Uint8Array(await new Blob(parts).arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}, Number(secs));
writeFileSync(file, Buffer.from(b64, 'base64'));
await browser.close();
console.log('música', file);
