// Rótulos y escenas animadas de los trailers, dibujados con las fuentes y sprites del propio juego.
//  · capas PNG 1080×1920 transparentes por toma (título, subtítulo, tarjeta): compose.mjs las anima (entran desde la izquierda)
//  · escenas animadas grabadas a .webm: intro (el monstruo caminando y los textos entrando por etapas),
//    skins (desfile de aspectos) y cierre (logo con tormenta, «JUEGA GRATIS», web y fundido)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const SHARED = '/@fs' + fileURLToPath(new URL('../../shared/characters.ts', import.meta.url));
import { openGame } from './harness.mjs';

const b64 = (d) => Buffer.from(d.split(',')[1], 'base64');

// Código común que se inyecta en la página (dibujo de textos con el estilo de los trailers)
const LIB = () => {
  const W = 1080, H = 1920, PS = '"Press Start 2P"', VT = '"VT323"';
  const fit = (c, txt, font, max, maxW) => { let s = max; c.font = `${s}px ${font}`; while (c.measureText(txt).width > maxW && s > 12) { s -= 2; c.font = `${s}px ${font}`; } return s; };
  /** Título: blanco con sombra de color y sombra negra (como los trailers originales). */
  const title = (c, txt, x, y, max, accent, maxW = 1000, align = 'center') => {
    const s = fit(c, txt, PS, max, maxW); c.textAlign = align; c.textBaseline = 'alphabetic';
    const d = Math.max(4, Math.round(s / 11));
    c.fillStyle = '#000'; c.fillText(txt, x + d * 2, y + d * 2);
    c.fillStyle = accent; c.fillText(txt, x + d, y + d);
    c.fillStyle = '#f4ecff'; c.fillText(txt, x, y);
    return s;
  };
  const small = (c, txt, x, y, size, color, font = PS, maxW = 980) => {
    fit(c, txt, font, size, maxW); c.textAlign = 'center';
    c.fillStyle = '#000'; c.fillText(txt, x + 4, y + 4); c.fillStyle = color; c.fillText(txt, x, y);
  };
  const sprite = (c, f, cx, footY, k) => {
    const sw = 26 * k, sh = 34 * k;
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.ellipse(cx, footY - k, sw * 0.32, k * 2.2, 0, 0, Math.PI * 2); c.fill();
    c.imageSmoothingEnabled = false;
    c.drawImage(f.base, cx - sw / 2, footY - sh, sw, sh);
    if (f.glow) { c.globalCompositeOperation = 'lighter'; c.drawImage(f.glow, cx - sw / 2, footY - sh, sw, sh); c.globalCompositeOperation = 'source-over'; }
  };
  /** Fondo de las escenas: noche con brasas flotando y viñeta. */
  const embers = Array.from({ length: 70 }, (_, i) => ({ x: (i * 397) % W, y: (i * 911) % H, v: 20 + (i % 7) * 9, s: 3 + (i % 3) * 2 }));
  const bg = (c, t, tint = '#1a0f2a') => {
    const g = c.createRadialGradient(W / 2, H * 0.48, 80, W / 2, H * 0.48, 1150); g.addColorStop(0, tint); g.addColorStop(1, '#020104');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (const e of embers) {
      const y = (e.y - t * e.v + H * 10) % H, a = 0.25 + 0.35 * Math.sin(t * 3 + e.x);
      c.fillStyle = `rgba(255,${120 + (e.x % 80)},60,${a})`; c.fillRect(Math.round(e.x + Math.sin(t + e.y) * 12), Math.round(y), e.s, e.s);
    }
  };
  /** Entrada desde la izquierda con rebote (0 → 1 en `d` segundos). */
  const slide = (t, t0, d = 0.22) => { const u = Math.max(0, Math.min(1, (t - t0) / d)); const e = 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2); return u >= 1 ? 0 : (1 - e) * -W; };
  const pop = (t, t0, d = 0.18) => { const u = Math.max(0, Math.min(1, (t - t0) / d)); return u <= 0 ? 0 : u < 1 ? 1.25 - 0.25 * u : 1; };
  return { W, H, PS, VT, fit, title, small, sprite, bg, slide, pop };
};

async function evalLib(page, fn, arg) {
  return page.evaluate(`(async () => { const L = (${LIB.toString()})(); const arg = ${JSON.stringify(arg)}; return (${fn.toString()})(L, arg); })()`);
}

/** Capas de una toma: título, subtítulo y tarjeta (por separado, para animarlas). */
async function segLayers(page, spec) {
  return evalLib(page, (L, spec) => {
    const mk = (draw) => { const cv = document.createElement('canvas'); cv.width = L.W; cv.height = L.H; const c = cv.getContext('2d'); draw(c); return cv.toDataURL('image/png'); };
    const out = {};
    if (spec.title) out.title = mk((c) => L.title(c, spec.title, L.W / 2, 150, 80, spec.accent));
    if (spec.sub) out.sub = mk((c) => L.small(c, spec.sub, L.W / 2, 238, 34, spec.subColor || spec.accent));
    if (spec.card) out.card = mk((c) => {
      const x = 46, y = 1440, w = 988, h = 176;
      c.fillStyle = 'rgba(14,8,24,0.92)'; c.fillRect(x, y, w, h);
      c.strokeStyle = spec.accent; c.lineWidth = 6; c.strokeRect(x + 3, y + 3, w - 6, h - 6);
      c.fillStyle = '#2c2040'; c.fillRect(x + 26, y + 26, 66, 66);
      c.strokeStyle = spec.accent; c.lineWidth = 3; c.strokeRect(x + 27.5, y + 27.5, 63, 63);
      c.textAlign = 'center'; c.font = `32px ${L.PS}`; c.fillStyle = spec.accent; c.fillText(spec.card.key, x + 59, y + 76);
      c.textAlign = 'left'; L.fit(c, spec.card.name, L.PS, 40, w - 150); c.fillStyle = '#ffd040'; c.fillText(spec.card.name, x + 118, y + 76);
      L.fit(c, spec.card.desc, L.VT, 56, w - 60); c.fillStyle = '#e4daf2'; c.fillText(spec.card.desc, x + 30, y + 148);
    });
    return out;
  }, spec);
}

/** Viñeta oscura (bordes) para las tomas de juego. */
async function vignette(page) {
  return evalLib(page, (L) => {
    const cv = document.createElement('canvas'); cv.width = L.W; cv.height = L.H; const c = cv.getContext('2d');
    const g = c.createRadialGradient(L.W / 2, L.H * 0.47, L.H * 0.28, L.W / 2, L.H * 0.47, L.H * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.78)');
    c.fillStyle = g; c.fillRect(0, 0, L.W, L.H);
    return cv.toDataURL('image/png');
  });
}

/** Graba una escena animada (`draw(c, t)` por fotograma) durante `secs` y devuelve el .webm en base64. */
async function scene(page, kind, spec, secs) {
  return evalLib(page, async (L, { kind, spec, secs }) => {
    const { getFrame, frameCount } = await import('/sprites.ts');
    const { SKINS } = await import(spec.sharedChars);
    const { startLogo } = await import('/logo.ts');
    const cv = document.createElement('canvas'); cv.width = L.W; cv.height = L.H; document.body.appendChild(cv);
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    const lc = document.createElement('canvas'); document.body.appendChild(lc); startLogo(lc);
    const skins = SKINS[spec.char];
    const walk = (t, skin, tier = 0, anim = 1) => getFrame('monster', spec.char, skin, anim, Math.floor(t / (anim === 1 ? 0.1 : 0.38)) % frameCount(anim), 0, tier);
    const draws = {
      intro(t) {
        L.bg(c, t, spec.tint);
        c.globalAlpha = Math.min(1, t / 0.5);
        // el monstruo entra caminando y se planta
        const k = 24, cx = L.W / 2 + Math.max(0, (0.9 - t) / 0.9) * 420, moving = t < 0.9;
        L.sprite(c, walk(t, skins[0].id, 0, moving ? 1 : 0), cx, 1240 + (moving ? Math.abs(Math.sin(t * 16)) * -10 : 0), k);
        c.globalAlpha = 1;
        if (t > 0.8) { c.save(); const s = L.pop(t, 0.8); c.translate(L.W / 2, 1390); c.scale(s, s); L.title(c, spec.name, 0, 0, 104, spec.accent); c.restore(); }
        if (t > 1.3) L.small(c, spec.title, L.W / 2 + L.slide(t, 1.3), 1480, 44, spec.accent);
        if (t > 1.9 && spec.tagline) { c.save(); const s = L.pop(t, 1.9, 0.14); c.translate(L.W / 2, 1570); c.scale(s, s); L.small(c, spec.tagline, 0, 0, 40, '#ffd040'); c.restore(); }
        if (t > 2.2) { c.globalAlpha = Math.min(1, (t - 2.2) / 0.25); c.drawImage(lc, (L.W - 220 * 2.4) / 2, 70, 220 * 2.4, 84 * 2.4); c.globalAlpha = 1; }
        c.fillStyle = `rgba(0,0,0,${Math.max(0, 1 - t / 0.35)})`; c.fillRect(0, 0, L.W, L.H);
      },
      skins(t) {
        L.bg(c, t, spec.tint);
        L.title(c, `${skins.length} SKINS`, L.W / 2 + L.slide(t, 0), 300, 72, spec.accent);
        const n = skins.length, k = n > 4 ? 11 : 14, gap = L.W / (n + 1);
        skins.forEach((sk, i) => {
          const t0 = 0.3 + i * 0.32; if (t < t0) return;
          const s = L.pop(t, t0, 0.16), cx = gap * (i + 1);
          c.save(); c.translate(cx, 1150); c.scale(s, s); L.sprite(c, walk(t + i * 0.13, sk.id, 3, 0), 0, 0, k); c.restore();
          L.small(c, sk.name.toUpperCase(), cx, 1240, 24, i === 0 ? '#f0e8ff' : '#ffd040', L.PS, gap - 12);
        });
      },
      end(t) {
        L.bg(c, t, spec.tint);
        c.drawImage(lc, (L.W - 220 * 4.6) / 2, 80 + Math.min(0, (t - 0.25) * 400), 220 * 4.6, 84 * 4.6);
        if (t > 0.35) L.title(c, 'JUEGA GRATIS', L.W / 2 + L.slide(t, 0.35), 600, 76, '#7a0a1c');
        if (t > 0.7) { c.save(); const s = L.pop(t, 0.7); c.translate(L.W / 2, 730); c.scale(s, s); L.small(c, 'mooonsters.com', 0, 0, 62, '#ffd040'); c.restore(); }
        if (t > 1.1) { c.globalAlpha = Math.min(1, (t - 1.1) / 0.3); L.small(c, spec.line1, L.W / 2, 840, 64, '#f0e8ff', L.VT); c.globalAlpha = 1; }
        if (t > 1.4) { c.globalAlpha = Math.min(1, (t - 1.4) / 0.3); L.small(c, spec.line2, L.W / 2, 910, 64, '#f0e8ff', L.VT); c.globalAlpha = 1; }
        const cx = L.W / 2 + Math.sin(t * 1.4) * 260;
        L.sprite(c, walk(t, skins[0].id, 3, 1), cx, 1680, 16);
        const out = Math.max(0, (t - (secs - 0.45)) / 0.45);
        if (out > 0) { c.fillStyle = `rgba(0,0,0,${Math.min(1, out)})`; c.fillRect(0, 0, L.W, L.H); }
      },
    };
    await new Promise((r) => setTimeout(r, 400)); // que el logo empiece a moverse
    const t0 = performance.now();
    draws[kind](0);
    const rec = new MediaRecorder(cv.captureStream(30), { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 14_000_000 });
    const parts = []; rec.ondataavailable = (e) => parts.push(e.data);
    let live = true; const loop = () => { if (!live) return; draws[kind]((performance.now() - t0) / 1000); requestAnimationFrame(loop); }; loop();
    rec.start();
    await new Promise((r) => setTimeout(r, secs * 1000 + 250));
    await new Promise((r) => { rec.onstop = r; rec.stop(); }); live = false;
    cv.remove(); lc.remove();
    const buf = new Uint8Array(await new Blob(parts).arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, { kind, spec, secs });
}

/** Genera todas las capas y escenas de un trailer en `dir`. */
export async function renderCards(cfg, dir, { intro, skins, end }) {
  const { browser, page } = await openGame();
  await page.evaluate(() => Promise.all([document.fonts.load('40px "Press Start 2P"'), document.fonts.load('40px "VT323"')]));
  writeFileSync(`${dir}/vignette.png`, b64(await vignette(page)));
  for (const [i, s] of cfg.segments.entries()) {
    const l = await segLayers(page, { accent: cfg.accent, ...s });
    for (const k of ['title', 'sub', 'card']) if (l[k]) writeFileSync(`${dir}/seg${i}-${k}.png`, b64(l[k]));
  }
  const spec = { sharedChars: SHARED, char: cfg.char, name: cfg.name, title: cfg.title, tagline: cfg.tagline, accent: cfg.accent, tint: cfg.tint, line1: '+29 MONSTRUOS MÁS', line2: 'MÓVIL Y PC · SIN DESCARGAS' };
  writeFileSync(`${dir}/intro.webm`, Buffer.from(await scene(page, 'intro', spec, intro), 'base64'));
  if (skins) writeFileSync(`${dir}/skins.webm`, Buffer.from(await scene(page, 'skins', spec, skins), 'base64'));
  writeFileSync(`${dir}/end.webm`, Buffer.from(await scene(page, 'end', spec, end), 'base64'));
  await browser.close();
}
