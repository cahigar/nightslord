// Genera las imágenes de las páginas SEO a partir de los sprites del juego.
// Uso: npx vite --port 5199 (en otra terminal) y luego: node tools/seo-images.mjs
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
const base = process.argv[2] || 'http://localhost:5199';
const b = await chromium.launch(); const p = await b.newPage();
p.on('pageerror', (e) => console.log('error:', e.message));
await p.goto(`${base}/render/`);
await p.waitForFunction(() => window.out, null, { timeout: 30000 });
const out = await p.evaluate(() => window.out);
mkdirSync('client/public/img/monstruos', { recursive: true });
for (const [name, url] of Object.entries(out)) {
  const file = name.startsWith('monstruo-') ? `client/public/img/monstruos/${name.slice(9)}.png` : `client/public/img/${name}.png`;
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
}
console.log(`${Object.keys(out).length} imágenes`);
await b.close();
