import { CHARACTER_IDS, SKINS } from '../shared/characters';
import { Anim } from '../shared/protocol';
import { ANIMS, getFrame, getItem } from './sprites';

const ANIM_NAMES: [Anim, string][] = [
  [Anim.Idle, 'idle'], [Anim.Walk, 'walk'], [Anim.Attack, 'attack'], [Anim.Cast, 'cast'],
  [Anim.Wave, 'saludo'], [Anim.Taunt, 'taunt'], [Anim.Hurt, 'hurt'],
];

export function showSpriteSheet() {
  const S = 3;
  const rows: { label: string; kind: 'monster' | 'npc' | 'helsing'; variant: string; skin: string; seed?: number }[] = [];
  for (const c of CHARACTER_IDS) for (const s of SKINS[c]) rows.push({ label: `${c}/${s.id}`, kind: 'monster', variant: c, skin: s.id });
  rows.push({ label: 'helsing', kind: 'helsing', variant: 'helsing', skin: '' });
  for (const [i, v] of ['teen', 'neighbor', 'jock', 'nerd', 'villager', 'priest', 'maid', 'camper', 'counselor'].entries()) rows.push({ label: v, kind: 'npc', variant: v, skin: '', seed: i * 7 });
  const cols = ANIM_NAMES.reduce((a, [an]) => a + ANIMS[an].frames.length, 0);
  const cw = 22 * S + 4, ch = 26 * S + 4;
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
      c.drawImage(getFrame(r.kind, r.variant, r.skin, an, f, r.seed ?? 0), 140 + col * cw, y, 22 * S, 26 * S);
      col++;
    }
  });
  const items = ['blood', 'speed', 'fury', 'shield', 'coin', 'xp', 'bat0', 'bat1', 'bandage', 'bolt'];
  items.forEach((id, i) => { const img = getItem(id); c.drawImage(img, 140 + i * 50, 30 + rows.length * ch + 10, img.width * 4, img.height * 4); });
}
