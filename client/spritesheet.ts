import { CHARACTER_IDS, SKINS } from '../shared/characters';
import { Anim } from '../shared/protocol';
import { ANIMS, getFrame, getItem, SH, SW } from './sprites';

const ANIM_NAMES: [Anim, string][] = [
  [Anim.Idle, 'idle'], [Anim.Walk, 'walk'], [Anim.Attack, 'attack'], [Anim.Cast, 'cast'],
  [Anim.Wave, 'saludo'], [Anim.Taunt, 'taunt'], [Anim.Hurt, 'hurt'],
];

export function showSpriteSheet() {
  const S = 3;
  const rows: { label: string; kind: 'monster' | 'npc' | 'helsing'; variant: string; skin: string; seed?: number }[] = [];
  for (const c of CHARACTER_IDS) for (const s of SKINS[c]) rows.push({ label: `${c}/${s.id}`, kind: 'monster', variant: c, skin: s.id });
  rows.push({ label: 'helsing', kind: 'helsing', variant: 'helsing', skin: '' });
  for (const [i, v] of ['teen', 'teen', 'neighbor', 'jock', 'nerd', 'villager', 'villager', 'priest', 'maid', 'camper', 'camper', 'counselor'].entries()) rows.push({ label: v, kind: 'npc', variant: v, skin: '', seed: i * 13 + 5 });
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
      const fr = getFrame(r.kind, r.variant, r.skin, an, f, r.seed ?? 0);
      c.drawImage(fr.base, 140 + col * cw, y, SW * S, SH * S);
      if (fr.glow) { c.globalCompositeOperation = 'lighter'; c.drawImage(fr.glow, 140 + col * cw, y, SW * S, SH * S); c.globalCompositeOperation = 'source-over'; }
      col++;
    }
  });
  const items = ['blood', 'speed', 'fury', 'shield', 'coin', 'xp', 'bat0', 'bat1', 'bandage', 'bolt'];
  items.forEach((id, i) => { const img = getItem(id).base; c.drawImage(img, 140 + i * 60, 30 + rows.length * ch + 10, img.width * 4, img.height * 4); });
}

/** Visor de mapas (abre /#mapa o /#mapa=camp:1234): todo el mapa a 1 píxel de arte por píxel, sin oscuridad. */
export async function showMapPreview(spec: string) {
  const { generateMap, THEME_IDS } = await import('../shared/maps');
  const { Terrain } = await import('./terrain');
  const { renderObstacle, renderDecor } = await import('./tiles');
  const { MAP_SIZE, PIXEL } = await import('../shared/constants');
  const [t, sd] = spec.split(':');
  const theme = (THEME_IDS as string[]).includes(t) ? (t as (typeof THEME_IDS)[number]) : 'elm';
  const map = generateMap(theme, Number(sd) || 1234);
  const cv = document.createElement('canvas');
  const S = MAP_SIZE / PIXEL;
  cv.width = S; cv.height = S;
  Object.assign(cv.style, { imageRendering: 'pixelated' });
  const wrap = document.createElement('div');
  Object.assign(wrap.style, { position: 'fixed', inset: '0', overflow: 'auto', zIndex: '100', background: '#000' });
  wrap.appendChild(cv);
  document.body.appendChild(wrap);
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.scale(1 / PIXEL, 1 / PIXEL);
  const terrain = new Terrain(map);
  terrain.draw(c, 0, 0, MAP_SIZE, MAP_SIZE, 9999);
  for (const d of map.decor) { const a = renderDecor(d); c.drawImage(a.base, d.x, d.y, a.base.width * PIXEL, a.base.height * PIXEL); }
  const obs = map.obstacles.filter((o) => o.type !== 'water').sort((a, b) => a.y + a.h - (b.y + b.h));
  for (const o of obs) { const a = renderObstacle(o, theme); c.drawImage(a.base, o.x + a.ox, o.y + a.oy, a.base.width * PIXEL, a.base.height * PIXEL); }
  document.title = 'mapa listo';
}
