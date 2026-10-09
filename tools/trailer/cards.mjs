// Rótulos de los trailers (PNG 1080×1920 transparentes) y tarjeta final animada (.webm), dibujados con
// las fuentes y sprites del propio juego. Se usa desde compose.mjs.
import { writeFileSync } from 'node:fs';
import { openGame } from './harness.mjs';

const b64 = (d) => Buffer.from(d.split(',')[1], 'base64');

/** Dibuja en la página: devuelve dataURL. `spec` = { kind: 'seg'|'intro', ... }. */
async function draw(page, spec) {
  return page.evaluate(async (spec) => {
    const { getFrame } = await import('/sprites.ts');
    const W = 1080, H = 1920;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    const PS = '"Press Start 2P"', VT = '"VT323"';
    const fit = (txt, font, max, maxW) => { let s = max; c.font = `${s}px ${font}`; while (c.measureText(txt).width > maxW && s > 12) { s -= 2; c.font = `${s}px ${font}`; } return s; };
    const title = (txt, y, max, accent) => {
      const s = fit(txt, PS, max, 980); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      const d = Math.max(4, Math.round(s / 10));
      c.fillStyle = '#000'; c.fillText(txt, W / 2 + d * 2, y + d * 2);
      c.fillStyle = accent; c.fillText(txt, W / 2 + d, y + d);
      c.fillStyle = '#f4ecff'; c.fillText(txt, W / 2, y);
    };
    const sub = (txt, y, size, color) => {
      fit(txt, VT, size, 1000); c.textAlign = 'center';
      c.fillStyle = '#000'; c.fillText(txt, W / 2 + 4, y + 4);
      c.fillStyle = color; c.fillText(txt, W / 2, y);
    };
    if (spec.kind === 'seg') {
      if (spec.title) title(spec.title, 230, 66, spec.accent);
      if (spec.sub) { const sz = fit(spec.sub, PS, 30, 960); c.textAlign = 'center'; c.fillStyle = '#000'; c.fillText(spec.sub, W / 2 + 4, 318 + 4); c.fillStyle = spec.accent; c.fillText(spec.sub, W / 2, 318); }
      if (spec.card) {
        const x = 50, y = 1370, w = 980, h = 170;
        c.fillStyle = 'rgba(16,9,26,0.9)'; c.fillRect(x, y, w, h);
        c.strokeStyle = spec.accent; c.lineWidth = 5; c.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
        c.fillStyle = '#2c2040'; c.fillRect(x + 26, y + 24, 64, 64);
        c.strokeStyle = spec.accent; c.lineWidth = 3; c.strokeRect(x + 27.5, y + 25.5, 61, 61);
        c.textAlign = 'center'; c.font = `30px ${PS}`; c.fillStyle = spec.accent; c.fillText(spec.card.key, x + 58, y + 72);
        c.textAlign = 'left'; fit(spec.card.name, PS, 36, w - 150); c.fillStyle = '#ffd040'; c.fillText(spec.card.name, x + 116, y + 72);
        fit(spec.card.desc, VT, 54, w - 60); c.fillStyle = '#ddd2ee'; c.fillText(spec.card.desc, x + 30, y + 140);
      }
    } else if (spec.kind === 'intro') {
      const f = getFrame('monster', spec.char, 'classic', 0, 0, 0, 0);
      const k = 22, sw = 26 * k, sh = 34 * k;
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.ellipse(W / 2, 1180, 200, 36, 0, 0, Math.PI * 2); c.fill();
      c.drawImage(f.base, (W - sw) / 2, 1200 - sh, sw, sh);
      if (f.glow) { c.globalCompositeOperation = 'lighter'; c.drawImage(f.glow, (W - sw) / 2, 1200 - sh, sw, sh); c.globalCompositeOperation = 'source-over'; }
      title(spec.name, 1360, 96, spec.accent);
      sub(spec.title, 1460, 72, spec.accent);
    }
    return cv.toDataURL('image/png');
  }, spec);
}

/** Tarjeta final animada: logo con tormenta, textos y el monstruo en reposo. */
async function endCard(page, spec, file, secs) {
  const data = await page.evaluate(async ({ spec, secs }) => {
    const { getFrame, frameCount } = await import('/sprites.ts');
    const { startLogo } = await import('/logo.ts');
    const W = 1080, H = 1920;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; document.body.appendChild(cv);
    const lc = document.createElement('canvas'); document.body.appendChild(lc); startLogo(lc);
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    const PS = '"Press Start 2P"', VT = '"VT323"';
    const shadowText = (t, y, font, col, d) => { c.font = font; c.textAlign = 'center'; c.fillStyle = '#000'; c.fillText(t, W / 2 + d * 2, y + d * 2); c.fillStyle = '#7a0a1c'; c.fillText(t, W / 2 + d, y + d); c.fillStyle = col; c.fillText(t, W / 2, y); };
    const t0 = performance.now();
    const drawFrame = () => {
      const t = (performance.now() - t0) / 1000;
      const g = c.createRadialGradient(W / 2, H * 0.45, 100, W / 2, H * 0.45, 1100); g.addColorStop(0, '#1a0f2a'); g.addColorStop(1, '#030106');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      const pop = Math.min(1, t / 0.35);
      c.globalAlpha = pop;
      c.drawImage(lc, (W - 220 * 4.6) / 2, 90, 220 * 4.6, 84 * 4.6);
      shadowText('JUEGA GRATIS', 620, `72px ${PS}`, '#f4ecff', 6);
      c.font = `60px ${PS}`; c.textAlign = 'center'; c.fillStyle = '#000'; c.fillText('mooonsters.com', W / 2 + 5, 750 + 5); c.fillStyle = '#ffd040'; c.fillText('mooonsters.com', W / 2, 750);
      c.font = `60px ${VT}`; c.fillStyle = '#000'; c.fillText(spec.line1, W / 2 + 3, 860 + 3); c.fillText(spec.line2, W / 2 + 3, 930 + 3);
      c.fillStyle = '#f0e8ff'; c.fillText(spec.line1, W / 2, 860); c.fillText(spec.line2, W / 2, 930);
      const fr = Math.floor(t / 0.38) % frameCount(0);
      const f = getFrame('monster', spec.char, 'classic', 0, fr, 0, 3);
      const k = 16, sw = 26 * k, sh = 34 * k;
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.ellipse(W / 2, 1640, 150, 28, 0, 0, Math.PI * 2); c.fill();
      c.drawImage(f.base, (W - sw) / 2, 1650 - sh, sw, sh);
      if (f.glow) { c.globalCompositeOperation = 'lighter'; c.drawImage(f.glow, (W - sw) / 2, 1650 - sh, sw, sh); c.globalCompositeOperation = 'source-over'; }
      c.globalAlpha = 1;
    };
    drawFrame();
    const rec = new MediaRecorder(cv.captureStream(30), { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 12_000_000 });
    const parts = []; rec.ondataavailable = (e) => parts.push(e.data);
    let live = true; const loop = () => { if (!live) return; drawFrame(); requestAnimationFrame(loop); }; loop();
    rec.start();
    await new Promise((r) => setTimeout(r, secs * 1000 + 300));
    await new Promise((r) => { rec.onstop = r; rec.stop(); }); live = false;
    const buf = new Uint8Array(await new Blob(parts).arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, { spec, secs });
  writeFileSync(file, Buffer.from(data, 'base64'));
}

/** Genera todos los rótulos de un trailer en `dir`. */
export async function renderCards(cfg, dir, endSecs) {
  const { browser, page } = await openGame();
  await page.evaluate(() => Promise.all([document.fonts.load('40px "Press Start 2P"'), document.fonts.load('40px "VT323"')]));
  writeFileSync(`${dir}/intro.png`, b64(await draw(page, { kind: 'intro', char: cfg.char, name: cfg.name, title: cfg.title, accent: cfg.accent })));
  for (const [i, s] of cfg.segments.entries()) writeFileSync(`${dir}/seg${i}.png`, b64(await draw(page, { kind: 'seg', accent: cfg.accent, ...s })));
  await endCard(page, { char: cfg.char, line1: '+29 MONSTRUOS MÁS', line2: 'MÓVIL Y PC · SIN DESCARGAS' }, `${dir}/end.webm`, endSecs);
  await browser.close();
}
