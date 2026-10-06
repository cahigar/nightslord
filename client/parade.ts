// Desfile de la portada: por la parte baja de la pantalla pasan persecuciones en pixel art.
// Humanos huyendo de monstruos y, a veces, un Cazador persiguiendo a un monstruo que escapa.
import { CHARACTER_IDS, type CharacterId } from '../shared/characters';
import { NPC_VARIANTS } from '../shared/maps';
import { Anim } from '../shared/protocol';
import { ANIMS, getFrame, SH, SW } from './sprites';

type Kind = 'monster' | 'npc' | 'hunter';
interface Actor { kind: Kind; variant: string; skin: string; seed: number; x: number; v: number; dir: 1 | -1; anim: Anim; t: number; hop: number; tauntAt: number }

const H = 52; // alto del lienzo en píxeles de arte
const HUMANS = [...new Set(Object.values(NPC_VARIANTS).flat())];
const HUNTERS = ['cazador', 'inquisidor', 'exorcista'];
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

export function startParade(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  let k = 3, W = 200;
  const resize = () => {
    k = Math.max(2, Math.min(5, Math.round(window.innerHeight / 210)));
    W = Math.ceil(window.innerWidth / k);
    canvas.width = W; canvas.height = H;
    canvas.style.height = `${H * k}px`;
  };
  resize();
  window.addEventListener('resize', resize);

  let actors: Actor[] = [];
  let next = 0.4, last = performance.now(), flip = 0;

  const spawn = () => {
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const start = dir === 1 ? -SW : W + SW;
    const add = (kind: Kind, variant: string, gap: number, v: number, taunt = false) => actors.push({
      kind, variant, skin: 'classic', seed: Math.floor(Math.random() * 999), x: start - dir * gap, v, dir, anim: Anim.Walk, t: Math.random(), hop: Math.random() * 6,
      tauntAt: taunt ? W * (0.35 + Math.random() * 0.3) : -1,
    });
    const mon = () => pick(CHARACTER_IDS.filter((c) => c !== 'invisible')) as CharacterId;
    flip++;
    if (flip % 3 === 0) {
      // la tortilla se da la vuelta: un Cazador persigue a un monstruo
      add('monster', mon(), 0, 62);
      add('hunter', pick(HUNTERS), 34, 60);
    } else {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) add('npc', pick(HUMANS), i * 13 + Math.random() * 6, 56 + Math.random() * 6);
      add('monster', mon(), n * 13 + 26, 58, Math.random() < 0.5);
      if (Math.random() < 0.3) add('monster', mon(), n * 13 + 50, 58);
    }
  };

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!canvas.isConnected) return;
    requestAnimationFrame(frame);
    if (!canvas.getClientRects().length) return; // portada oculta
    next -= dt;
    if (next <= 0 && actors.length < 14) { spawn(); next = 2.6 + Math.random() * 2.4; }
    ctx.clearRect(0, 0, W, H);
    // sombra de la tierra para que los pies no floten
    const g = ctx.createLinearGradient(0, H - 16, 0, H);
    g.addColorStop(0, 'rgba(5,3,10,0)'); g.addColorStop(1, 'rgba(5,3,10,0.85)');
    ctx.fillStyle = g; ctx.fillRect(0, H - 16, W, 16);
    actors.sort((a, b) => a.hop - b.hop);
    for (const a of actors) {
      a.t += dt;
      if (a.anim === Anim.Taunt) {
        if (a.t > 1.1) { a.anim = Anim.Walk; a.t = 0; a.v *= 1.25; }
      } else {
        a.x += a.v * a.dir * dt;
        if (a.tauntAt > 0 && (a.dir === 1 ? a.x > a.tauntAt : a.x < W - a.tauntAt)) { a.anim = Anim.Taunt; a.t = 0; a.tauntAt = -1; }
      }
      const def = ANIMS[a.anim];
      const f = Math.floor(a.t / def.dur) % def.frames.length;
      const fr = getFrame(a.kind, a.variant, a.skin, a.anim, f, a.seed);
      const y = H - SH - 4 - Math.round(a.hop / 2);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(Math.round(a.x - 6), y + SH - 3, 12, 2);
      ctx.save();
      ctx.translate(Math.round(a.x), y);
      if (a.dir === -1) ctx.scale(-1, 1);
      ctx.drawImage(fr.base, -SW / 2, 0);
      if (fr.glow) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(fr.glow, -SW / 2, 0); }
      ctx.restore();
      // signos: «!» sobre los que huyen, nota musical en el taunt
      if (a.kind === 'npc' || (a.kind === 'monster' && actors.some((o) => o.kind === 'hunter' && o.dir === a.dir))) {
        if (Math.floor(a.t * 4) % 2 === 0) { ctx.fillStyle = '#ffd040'; ctx.fillRect(Math.round(a.x), y - 6, 1, 3); ctx.fillRect(Math.round(a.x), y - 2, 1, 1); }
      }
    }
    actors = actors.filter((a) => (a.dir === 1 ? a.x < W + SW * 2 : a.x > -SW * 2));
  };
  requestAnimationFrame(frame);
}
