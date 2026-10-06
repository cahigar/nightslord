// 🪱 Gusarena: emboscada y control bajo tierra.
// - Mordisco sísmico (básico): gran mordisco frontal, lento pero muy potente, que empuja.
// - Coloso (pasiva): más grande, más vida y empuje, pero le cuesta arrancar y girar.
// - Sumergirse (Q): se entierra (intocable); bajo tierra solo percibe las pisadas de quien se mueve cerca.
//   Otra Q para emerger mordiendo; si no, sale solo a los 5 s (nv. 15: 8 s).
// - Arenas movedizas (E): un círculo de arena a su alrededor que ralentiza y arrastra a los enemigos hacia él.
// - Vibraciones (nv. 5): percibe pisadas desde más lejos y se cura bajo tierra.
// - Devorador (R): avanza sin parar, engulle a quien choque con su boca (silenciados), los arrastra quitándoles
//   vida y al final los escupe.
import { BAL } from '../../shared/balance';
import { BTN_Q } from '../../shared/constants';
import { Anim, Kind } from '../../shared/protocol';
import type { Minion, Mob, Player } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.worm;
/** Engullidos por cada Gusarena durante el Devorador. */
const swallowed = new Map<number, Set<number>>();
const underground = (p: Player) => p.submergeT > 0;
const devouring = (room: Room, p: Player) => (p.k.devourEnd ?? 0) > room.time;

function mobById(room: Room, id: number): Mob | null {
  return room.npcs.get(id) ?? room.hunters.get(id) ?? room.minions.get(id) ?? room.findPlayerById(id);
}

/** Sale de la arena de golpe: muerde y aparta a quien esté encima. */
function emerge(room: Room, p: Player) {
  p.submergeT = 0;
  const D = B.dig;
  room.forEachEnemyNear(p, p.x, p.y, D.emergeR, (m) => {
    if (m.dead) return;
    room.damage(m, room.calcDamage(p, D.emergeDmg * room.powMult(p)), room.src(p));
    const d = Math.hypot(m.x - p.x, m.y - p.y) || 1;
    room.knockback(m, (m.x - p.x) / d, (m.y - p.y) / d, D.emergeKnock);
  });
  room.setAnim(p, Anim.Attack, 0.45);
  room.fx('burrow', p.x, p.y, { o: p.id, n: 1, r: D.emergeR });
  room.sfx('slam', p.x, p.y);
}

/** Escupe a todos los engullidos hacia delante. */
function spit(room: Room, p: Player) {
  const set = swallowed.get(p.id);
  swallowed.delete(p.id);
  p.k.devourEnd = 0;
  p.dash = null;
  if (!set) return;
  const a = Math.atan2(p.input.my || Math.sin(p.input.a), p.input.mx || Math.cos(p.input.a));
  for (const id of set) {
    const m = mobById(room, id);
    if (!m || m.dead) continue;
    room.damage(m, room.calcDamage(p, B.ult.spit * room.powMult(p)), room.src(p));
    room.knockback(m, Math.cos(a), Math.sin(a), B.ult.spitKnock);
    m.stunT = Math.max(m.stunT, 0.5);
  }
  room.fx('spit', p.x, p.y, { o: p.id, r: +a.toFixed(2) });
  room.sfx('splash', p.x, p.y);
}

export const wormKit: Kit = {
  basic(room, p, a) {
    const res = room.meleeSwing(p, a, { sfx: 'bite' });
    for (const h of res.hits) if (!h.m.dead) room.knockback(h.m, Math.cos(a), Math.sin(a), B.knock); // empuje de coloso
    room.fx('quake', p.x + Math.cos(a) * 50, p.y + Math.sin(a) * 30, { r: 50 });
  },

  ability(room, p, slot) {
    room.breakStealth(p);
    if (slot === 0) {
      // Sumergirse
      p.submergeT = p.tier >= 3 ? B.dig.tT3 : B.dig.t;
      p.k.digAt = room.time; p.k.qHeld = 1;
      p.dash = null;
      room.fx('burrow', p.x, p.y, { o: p.id, n: 0 });
      room.sfx('slam', p.x, p.y);
    } else {
      // Arenas movedizas (le siguen)
      const R = p.tier >= 3 ? B.sand.rT3 : B.sand.r;
      room.addZone({ kind: 'quicksand', ax: p.x, ay: p.y, bx: p.x, by: p.y, w: R * 2, until: room.time + B.sand.t, owner: p.id });
      room.setAnim(p, Anim.Cast, 0.5);
      room.fx('quake', p.x, p.y, { r: R });
      room.sfx('slam', p.x, p.y);
    }
  },

  ult(room, p, a) {
    if (underground(p)) emerge(room, p);
    p.k.devourEnd = room.time + B.ult.t;
    swallowed.set(p.id, new Set());
    p.dash = { t: B.ult.t, dx: Math.cos(a), dy: Math.sin(a), hit: new Set(), speed: p.def.speed * B.ult.speedMul, dmg: 0, knock: 0 };
    room.setAnim(p, Anim.Attack, 0.6);
    room.fx('quake', p.x, p.y, { r: 90 });
    room.sfx('groan', p.x, p.y);
    p.ultT = B.ult.t;
    return true;
  },

  speedMul(room, p) {
    const acc = B.accel.min + (1 - B.accel.min) * (p.k.acc ?? 0);
    return acc * (underground(p) ? B.dig.speedMul : 1);
  },

  tick(room, p, dt) {
    // Coloso: arranca despacio y al girar bruscamente pierde impulso
    const { mx, my } = p.input, ml = Math.hypot(mx, my);
    if (ml > 0.1) {
      const dot = p.k.mx !== undefined ? (mx * p.k.mx + my * p.k.my) / ml : 1;
      p.k.acc = dot < B.accel.turnDot ? Math.max(0, (p.k.acc ?? 0) * 0.55) : Math.min(1, (p.k.acc ?? 0) + dt / B.accel.t);
      p.k.mx = mx / ml; p.k.my = my / ml;
    } else p.k.acc = 0;
    // bajo tierra: otra Q para emerger, o se acaba el tiempo
    const qDown = (p.input.b & BTN_Q) !== 0;
    if (underground(p)) {
      p.submergeT -= dt;
      if (p.tier >= 1) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * B.dig.healT1 * dt);
      if ((qDown && !p.k.qHeld && room.time - (p.k.digAt ?? 0) > 0.3) || p.submergeT <= 0) emerge(room, p);
      else if (p.moving && Math.random() < dt * 6) room.fx('burrow', p.x, p.y, { o: p.id, n: 2 });
    }
    p.k.qHeld = qDown ? 1 : 0;
    // las arenas movedizas le siguen
    for (const z of room.zones) if (z.kind === 'quicksand' && z.owner === p.id) { z.ax = z.bx = p.x; z.ay = z.by = p.y; }
    // Devorador
    if (!p.k.devourEnd) return;
    if (!devouring(room, p)) { spit(room, p); return; }
    const want = p.input.a;
    if (!p.dash) p.dash = { t: p.k.devourEnd - room.time, dx: Math.cos(want), dy: Math.sin(want), hit: new Set(), speed: p.def.speed * B.ult.speedMul, dmg: 0, knock: 0 };
    // gira poco a poco hacia el puntero
    const cur = Math.atan2(p.dash.dy, p.dash.dx);
    const diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
    const na = cur + Math.max(-B.ult.turn * dt, Math.min(B.ult.turn * dt, diff));
    p.dash.dx = Math.cos(na); p.dash.dy = Math.sin(na);
    const set = swallowed.get(p.id) ?? new Set<number>();
    swallowed.set(p.id, set);
    const mx2 = p.x + p.dash.dx * (p.r + 16), my2 = p.y + p.dash.dy * (p.r + 16);
    if (set.size < B.ult.max) room.forEachEnemyNear(p, mx2, my2, B.ult.mouthR, (m) => {
      if (m.dead || m.entombT > 0 || set.size >= B.ult.max) return;
      if (m.kind === Kind.Minion && ((m as Minion).variant === 'wall' || (m as Minion).variant === 'turret' || (m as Minion).variant === 'flower' || (m as Minion).variant === 'beacon')) return;
      set.add(m.id);
      room.fx('heartHit', m.x, m.y, { o: m.id, c: 'worm' });
    });
    let i = 0;
    for (const id of set) {
      const m = mobById(room, id);
      if (!m || m.dead) { set.delete(id); continue; }
      const off = (i++ - (set.size - 1) / 2) * 14;
      m.x = mx2 - p.dash.dy * off; m.y = my2 + p.dash.dx * off;
      m.knock = null; m.stunT = Math.max(m.stunT, 0.2); m.silenceT = Math.max(m.silenceT, 0.3);
      room.damage(m, B.ult.dps * dt * (1 + 0.03 * (p.level - 1)), { ...room.src(p), raw: true }, false, true);
    }
  },

  buffs(room, p, add) {
    if (devouring(room, p)) add('devour', p.k.devourEnd - room.time);
  },
};
