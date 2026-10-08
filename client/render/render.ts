// Renderiza: un PNG por monstruo (sprite evolucionado, escala 6) y la tarjeta Open Graph 1200×630.
// Deja los resultados en window.out = { nombre: dataURL }.
import { FORMS, ANIMS } from '../sprites';
import { PB } from '../pixel';
import { getSkin, CHARACTERS, type CharacterId } from '../../shared/characters';
import { Anim } from '../../shared/protocol';
import { startLogo } from '../logo';

const out: Record<string, string> = {};

function sprite(id: CharacterId, tier = 3, frame = 0) {
  const b = new PB(26, 34);
  const pose = ANIMS[Anim.Idle].frames[frame];
  FORMS[id](b, pose, getSkin(id, 'default').palette, Anim.Idle, tier);
  return b.finish({ outline: id === 'invisible' ? 'faint' : 'selout' });
}
function drawSprite(ctx: CanvasRenderingContext2D, id: CharacterId, x: number, y: number, s: number) {
  const f = sprite(id);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(f.base, x, y, 26 * s, 34 * s);
  if (f.glow) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(f.glow, x, y, 26 * s, 34 * s); ctx.globalCompositeOperation = 'source-over'; }
}

const ids = Object.keys(CHARACTERS) as CharacterId[];
for (const id of ids) {
  const c = document.createElement('canvas'); c.width = 26 * 6; c.height = 34 * 6;
  drawSprite(c.getContext('2d')!, id, 0, 0, 6);
  out[`monstruo-${id}`] = c.toDataURL('image/png');
}

// Fuente 3×5 para la tarjeta
const F: Record<string, string[]> = {
  A: ['XXX', 'X.X', 'XXX', 'X.X', 'X.X'], C: ['XXX', 'X..', 'X..', 'X..', 'XXX'], E: ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
  G: ['XXX', 'X..', 'X.X', 'X.X', 'XXX'], I: ['XXX', '.X.', '.X.', '.X.', 'XXX'], J: ['..X', '..X', '..X', 'X.X', 'XXX'],
  M: ['X.X', 'XXX', 'X.X', 'X.X', 'X.X'], N: ['XX.', 'X.X', 'X.X', 'X.X', 'X.X'], O: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
  R: ['XX.', 'X.X', 'XX.', 'X.X', 'X.X'], S: ['XXX', 'X..', 'XXX', '..X', 'XXX'], T: ['XXX', '.X.', '.X.', '.X.', '.X.'],
  U: ['X.X', 'X.X', 'X.X', 'X.X', 'XXX'], V: ['X.X', 'X.X', 'X.X', 'X.X', '.X.'], Y: ['X.X', 'X.X', '.X.', '.X.', '.X.'],
  L: ['X..', 'X..', 'X..', 'X..', 'XXX'], P: ['XXX', 'X.X', 'XXX', 'X..', 'X..'],
  '3': ['XXX', '..X', 'XXX', '..X', 'XXX'], '0': ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'], '.': ['...', '...', '...', '...', '.X.'],
  '·': ['...', '...', '.X.', '...', '...'], ' ': ['...', '...', '...', '...', '...'],
};
function text(ctx: CanvasRenderingContext2D, s: string, cx: number, y: number, u: number, col: string) {
  const w = s.length * 4 * u - u; let x = Math.round(cx - w / 2);
  for (const ch of s) {
    (F[ch] ?? F[' ']).forEach((row, ry) => [...row].forEach((c, rx) => {
      if (c !== 'X') return;
      ctx.fillStyle = '#000'; ctx.fillRect(x + rx * u + u / 2, y + ry * u + u / 2, u, u);
      ctx.fillStyle = col; ctx.fillRect(x + rx * u, y + ry * u, u, u);
    }));
    x += 4 * u;
  }
}

async function og() {
  const W = 1200, H = 630;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#120a22'); g.addColorStop(1, '#05030a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // estrellas
  let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 140; i++) { ctx.fillStyle = `rgba(230,220,255,${0.2 + r() * 0.6})`; const z = r() < 0.15 ? 4 : 2; ctx.fillRect(Math.round(r() * W), Math.round(r() * H * 0.6), z, z); }
  // logo
  const lc = document.createElement('canvas'); document.body.appendChild(lc); startLogo(lc);
  await new Promise((res) => setTimeout(res, 1200));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(lc, (W - 220 * 3.4) / 2, 18, 220 * 3.4, 84 * 3.4);
  text(ctx, 'JUEGA GRATIS · 30 MONSTRUOS', W / 2, 318, 7, '#f0e0ff');
  // desfile de monstruos
  const row: CharacterId[] = ['werewolf', 'mummy', 'zombie', 'witch', 'vampire', 'candle', 'kthula', 'reaper', 'slime', 'alien', 'r800'];
  const sc = 3.6, sw = 26 * sc, gap = (W - row.length * sw) / (row.length + 1);
  row.forEach((id, i) => {
    const x = gap + i * (sw + gap), big = id === 'vampire';
    const k = big ? 4.4 : sc;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(x + sw / 2, 600, 34, 7, 0, 0, Math.PI * 2); ctx.fill();
    drawSprite(ctx, id, x + (sw - 26 * k) / 2, 604 - 34 * k, k);
  });
  text(ctx, 'MOOONSTERS.COM', W / 2, 400, 6, '#ffd860');
  lc.remove(); out['og-mooonsters'] = c.toDataURL('image/png');
}

og().then(() => { (window as any).out = out; });
