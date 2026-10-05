// 🕷️ Aracne, la mujer araña: movilidad y captura.
// - Veneno (pasiva): sus mordiscos envenenan; desde el nivel 5 los golpes seguidos al mismo enemigo acumulan veneno.
// - Telaraña (Q, 2 cargas): proyectil que ralentiza y queda en el suelo 45 s (máximo 4).
// - Salto arácnido (E): salta por encima de todo hasta un punto cercano (nv. 15: 2 cargas y al caer aterroriza).
// - Gran telaraña (R): cubre la zona y une con hilos sus telarañas del suelo; los enemigos quedan muy lentos,
//   ella corre más y salen arañitas venenosas que los persiguen.
import { BAL } from '../../shared/balance';
import { Anim } from '../../shared/protocol';
import type { Minion, Mob, Player, Zone } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.spider;
/** Golpes recientes por objetivo (para acumular veneno). */
const stacks = new WeakMap<Player, Map<number, { n: number; t: number }>>();

function envenom(room: Room, p: Player, m: Mob, base = 1) {
  let map = stacks.get(p);
  if (!map) { map = new Map(); stacks.set(p, map); }
  const s = map.get(m.id);
  const n = p.tier >= 1 && s && room.time - s.t < B.poison.window ? Math.min(B.poison.maxStacks, s.n + 1) : 1;
  map.set(m.id, { n, t: room.time });
  if (map.size > 60) for (const [id, v] of map) if (room.time - v.t > B.poison.window) map.delete(id);
  room.poison(m, B.poison.t, B.poison.dps * base * (1 + B.poison.stackMul * (n - 1)) * room.powMult(p), p);
}

const myWebs = (room: Room, p: Player) => room.zones.filter((z) => z.kind === 'web' && z.owner === p.id);
const inBigWeb = (room: Room, p: Player) => room.zones.some((z) => z.kind === 'bigweb' && z.owner === p.id && (p.x - z.ax) ** 2 + (p.y - z.ay) ** 2 < (z.w / 2) ** 2);

export const spiderKit: Kit = {
  basic(room, p, a) {
    const res = room.meleeSwing(p, a, { sfx: 'bite' });
    for (const h of res.hits) if (!h.m.dead) envenom(room, p, h.m);
  },

  ability(room, p, slot, a) {
    room.breakStealth(p);
    if (slot === 0) {
      room.setAnim(p, Anim.Attack, 0.3);
      const pr = room.shoot('web', p.id, p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16, a, B.web.speed, B.web.life, room.calcDamage(p, B.web.dmg));
      pr.hitR = 16;
      room.sfx('poof', p.x, p.y);
    } else {
      const d = Math.min(Math.max(p.input.d, 60), B.leap.range);
      room.leapTo(p, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, B.leap.t);
      room.setAnim(p, Anim.Cast, B.leap.t);
      room.sfx('dash', p.x, p.y);
    }
  },

  ult(room, p) {
    const U = B.ult;
    room.addZone({ kind: 'bigweb', ax: p.x, ay: p.y, bx: p.x, by: p.y, w: U.r * 2, until: room.time + U.t, owner: p.id });
    // une con hilos sus telarañas del suelo (en orden alrededor de ella)
    const webs = myWebs(room, p).filter((z) => Math.hypot(z.ax - p.x, z.ay - p.y) < U.linkR)
      .sort((a, b) => Math.atan2(a.ay - p.y, a.ax - p.x) - Math.atan2(b.ay - p.y, b.ax - p.x));
    const link = (a: Zone | { ax: number; ay: number }, b: Zone) => room.addZone({ kind: 'thread', ax: a.ax, ay: a.ay, bx: b.ax, by: b.ay, w: 36, until: room.time + U.t, owner: p.id });
    for (let i = 0; i < webs.length; i++) { link({ ax: p.x, ay: p.y }, webs[i]); if (webs.length > 2 || i < webs.length - 1) link(webs[i], webs[(i + 1) % webs.length]); }
    // arañitas venenosas
    for (let i = 0; i < U.n; i++) {
      const ang = (i / U.n) * Math.PI * 2;
      room.spawnMinion(p, p.x + Math.cos(ang) * 30, p.y + Math.sin(ang) * 24, 'spiderling', '', i, U.life, false, U.n * 2);
    }
    room.setAnim(p, Anim.Cast, 0.6);
    room.fx('bramble', p.x, p.y, { r: U.r, o: p.id, c: 'web' });
    room.sfx('poof', p.x, p.y);
    p.ultT = U.t;
    return true;
  },

  qCharges: () => B.web.charges,
  eCharges: (p) => (p.tier >= 3 ? B.leap.chargesT3 : 1),
  speedMul: (room, p) => (p.ultT > 0 && inBigWeb(room, p) ? B.ult.speedMul : 1),

  onProjectileHit(room, p, pr, m) {
    if (pr.type === 'web') room.slow(m, B.web.slowT, B.web.slowMul);
  },

  onProjectileEnd(room, p, pr) {
    if (pr.type !== 'web') return;
    // la telaraña se queda en el suelo
    let x = pr.x, y = pr.y;
    if (room.grid.blocked(x, y, 4, true)) { x -= pr.vx * 0.04; y -= pr.vy * 0.04; }
    room.addZone({ kind: 'web', ax: x, ay: y, bx: x, by: y, w: B.web.r * 2, until: room.time + B.web.t, owner: p.id });
    const mine = myWebs(room, p);
    if (mine.length > B.web.max) { const old = mine[0]; room.zones = room.zones.filter((z) => z !== old); }
  },

  onLand(room, p) {
    room.fx('leapLand', p.x, p.y, { o: p.id, r: B.leap.fearR });
    if (p.tier < 3) return;
    room.forEachEnemyNear(p, p.x, p.y, B.leap.fearR, (m) => room.scare(m, B.leap.fearT, p.x, p.y));
  },

  onMinionHit(room, p, m: Minion, t) {
    if (m.variant === 'spiderling' && !t.dead) envenom(room, p, t, 0.6);
  },
};
