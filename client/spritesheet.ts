import { CHARACTER_IDS, SKINS } from '../shared/characters';
import { Anim } from '../shared/protocol';
import { ANIMS, getBeast, getFrame, getItem, getVermin, SH, SW } from './sprites';

const ANIM_NAMES: [Anim, string][] = [
  [Anim.Idle, 'idle'], [Anim.Walk, 'walk'], [Anim.Attack, 'attack'], [Anim.Cast, 'cast'],
  [Anim.Wave, 'saludo'], [Anim.Taunt, 'taunt'], [Anim.Hurt, 'hurt'],
];

export function showSpriteSheet() {
  const S = 3;
  const rows: { label: string; kind: 'monster' | 'npc' | 'hunter' | 'zombie'; variant: string; skin: string; seed?: number; tier?: number }[] = [];
  for (const c of CHARACTER_IDS) {
    for (const s of SKINS[c]) rows.push({ label: `${c}/${s.id}`, kind: 'monster', variant: c, skin: s.id });
    for (const t of [1, 2, 3]) rows.push({ label: `${c} nv${[5, 10, 15][t - 1]}`, kind: 'monster', variant: c, skin: 'classic', tier: t });
  }
  for (const f of [1, 2, 3]) rows.push({ label: `dino forma ${f}`, kind: 'monster', variant: `dino${f}`, skin: 'classic' });
  for (const v of ['teen#torch', 'villager#pitchfork', 'camper#bow']) rows.push({ label: v, kind: 'npc', variant: v, skin: '', seed: 7 });
  for (const t of ['cazador', 'inquisidor', 'exorcista', 'sectario', 'heraldo']) rows.push({ label: t, kind: 'hunter', variant: t, skin: '' });
  for (const [i, v] of (['normal', 'fast', 'tough', 'fat'] as const).entries()) rows.push({ label: `zombi ${v}`, kind: 'zombie', variant: ['camper', 'teen', 'jock', 'villager'][i], skin: v, seed: i * 17 + 3 });
  for (const [i, v] of ['teen', 'teen', 'neighbor', 'jock', 'nerd', 'villager', 'villager', 'priest', 'maid', 'camper', 'camper', 'counselor', 'fellah', 'fellah', 'tourist', 'archaeologist', 'explorer', 'explorer', 'porter', 'scientist'].entries()) rows.push({ label: v, kind: 'npc', variant: v, skin: '', seed: i * 13 + 5 });
  // filtro opcional: #sprites=worm,dino → solo esas filas
  const only = decodeURIComponent(location.hash.split('=')[1] ?? '').split(',').filter(Boolean);
  if (only.length) rows.splice(0, rows.length, ...rows.filter((r) => only.some((o) => r.label.startsWith(o))));
  const cols = ANIM_NAMES.reduce((a, [an]) => a + ANIMS[an].frames.length, 0);
  const cw = SW * S + 4, ch = SH * S + 4;
  const cv = document.createElement('canvas');
  cv.width = 140 + cols * cw; cv.height = 30 + rows.length * ch + 60;
  Object.assign(cv.style, { position: 'fixed', inset: '0', zIndex: '100', background: '#2a2238', overflow: 'auto', imageRendering: 'pixelated' });
  const wrap = document.createElement('div');
  Object.assign(wrap.style, { position: 'fixed', inset: '0', overflow: 'auto', zIndex: '100', background: '#2a2238' });
  cv.style.position = 'static';
  wrap.appendChild(cv);
  document.body.appendChild(wrap);
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.fillStyle = '#fff'; c.font = '12px monospace';
  let x = 140;
  for (const [an, name] of ANIM_NAMES) { c.fillText(name, x, 18); x += ANIMS[an].frames.length * cw; }
  rows.forEach((r, ri) => {
    const y = 30 + ri * ch;
    c.fillStyle = '#fff'; c.fillText(r.label, 6, y + ch / 2);
    let col = 0;
    for (const [an] of ANIM_NAMES) for (let f = 0; f < ANIMS[an].frames.length; f++) {
      const fr = getFrame(r.kind, r.variant, r.skin, an, f, r.seed ?? 0, r.tier ?? 0);
      c.drawImage(fr.base, 140 + col * cw, y, SW * S, SH * S);
      if (fr.glow) { c.globalCompositeOperation = 'lighter'; c.drawImage(fr.glow, 140 + col * cw, y, SW * S, SH * S); c.globalCompositeOperation = 'source-over'; }
      col++;
    }
  });
  const items = ['blood', 'speed', 'fury', 'shield', 'coin', 'xp', 'bolt', 'zapball', 'rocket', 'silver', 'bigsilver'];
  items.forEach((id, i) => { const img = getItem(id).base; c.drawImage(img, 140 + i * 60, 30 + rows.length * ch + 10, img.width * 4, img.height * 4); });
  // fieras y alimañas nuevas (#sprites=fieras)
  if (only.includes('fieras')) {
    cv.height = 1400;
    c.imageSmoothingEnabled = false;
    let y = 40;
    for (const t of ['croc', 'raptor', 'rex']) {
      let x = 140;
      c.fillStyle = '#fff'; c.fillText(t, 6, y + 40);
      for (const st of ['idle', 'walk', 'walk', 'attack', 'cast', 'lurk']) {
        if (st === 'lurk' && t !== 'croc') continue;
        if (st === 'cast' && t !== 'rex') continue;
        const img = getBeast(t, st, st === 'walk' && x > 300 ? 1 : 0);
        c.drawImage(img.base, x, y, img.base.width * 3, img.base.height * 3);
        if (img.glow) { c.globalCompositeOperation = 'lighter'; c.drawImage(img.glow, x, y, img.base.width * 3, img.base.height * 3); c.globalCompositeOperation = 'source-over'; }
        x += img.base.width * 3 + 20;
      }
      y += t === 'rex' ? 170 : 120;
    }
    let x = 140;
    for (const v of ['c_scarab', 'c_parrot']) for (const f of [0, 1]) { const img = getVermin(v, f); c.drawImage(img.base, x, y, img.base.width * 4, img.base.height * 4); x += 90; }
  }
}

/** Visor de mapas (abre /#mapa o /#mapa=camp:1234): todo el mapa a 1 píxel de arte por píxel, sin oscuridad. */
export async function showMapPreview(spec: string) {
  const { generateMap, ALL_THEME_IDS: THEME_IDS } = await import('../shared/maps');
  const { Terrain } = await import('./terrain');
  const { renderObstacle, renderDecor, renderTV } = await import('./tiles');
  const { PIXEL } = await import('../shared/constants');
  const [t, sd] = spec.split(':');
  const theme = (THEME_IDS as string[]).includes(t) ? (t as (typeof THEME_IDS)[number]) : 'elm';
  const map = generateMap(theme, Number(sd) || 1234);
  const cv = document.createElement('canvas');
  const M = 300; // margen exterior visible
  const MAP_SIZE = map.size;
  const S = (MAP_SIZE + 2 * M) / PIXEL;
  cv.width = S; cv.height = S;
  Object.assign(cv.style, { imageRendering: 'pixelated' });
  const wrap = document.createElement('div');
  Object.assign(wrap.style, { position: 'fixed', inset: '0', overflow: 'auto', zIndex: '100', background: '#000' });
  wrap.appendChild(cv);
  document.body.appendChild(wrap);
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.scale(1 / PIXEL, 1 / PIXEL);
  c.translate(M, M);
  const terrain = new Terrain(map);
  terrain.draw(c, -M, -M, MAP_SIZE + M, MAP_SIZE + M, 9999);
  for (const d of map.decor) { const a = renderDecor(d); c.drawImage(a.base, d.x, d.y, a.base.width * PIXEL, a.base.height * PIXEL); }
  const obs = [...map.obstacles, ...map.border.filter((o) => o.x > -M - 100 && o.y > -M - 100 && o.x < MAP_SIZE + M && o.y < MAP_SIZE + M)].filter((o) => o.type !== 'water').sort((a, b) => a.y + a.h - (b.y + b.h));
  for (const o of obs) { const a = renderObstacle(o, theme); c.drawImage(a.base, o.x + a.ox, o.y + a.oy, a.base.width * PIXEL, a.base.height * PIXEL); }
  for (const tv of map.tvs) { const a = renderTV(tv, 0); c.drawImage(a.base, tv.x - PIXEL, tv.y - PIXEL - (tv.kind === 'outdoor' ? 12 : 0), a.base.width * PIXEL, a.base.height * PIXEL); }
  c.strokeStyle = 'rgba(255,0,0,0.6)'; c.lineWidth = 6; c.strokeRect(0, 0, MAP_SIZE, MAP_SIZE); // límite jugable
  document.title = 'mapa listo';
}
