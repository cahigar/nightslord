// 🌙 Pesadilla: sueño, acecho y emboscadas.
import { BAL } from '../../shared/balance';
import { BTN_R } from '../../shared/constants';
import { Anim } from '../../shared/protocol';
import type { Mob, Player } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.nightmare;

/** Objetos del escenario en los que se convierte (según el mapa). */
const PROPS: Record<string, string[]> = {
  elm: ['tree', 'lamp', 'mailbox'],
  transylvania: ['tomb', 'deadtree', 'statue'],
  camp: ['pine', 'rock', 'log'],
  swamp: ['cypress', 'deadtree', 'log'],
  nile: ['palm', 'obelisk', 'rock'],
  jungle: ['jtree', 'palm', 'crate'],
};

/** A quién ha dormido ya la zona de cada Pesadilla (solo una vez por definitiva). */
const fielded = new Map<number, Set<number>>();

/** Salta junto al dormido más cercano al cursor y le ataca potenciado. */
function hop(room: Room, p: Player): boolean {
  const a = p.input.a, aimD = Math.min(p.input.d, 900);
  const ax = p.x + Math.cos(a) * aimD, ay = p.y + Math.sin(a) * aimD;
  let best: Mob | null = null, bd = Infinity;
  room.forEachEnemyNear(p, p.x, p.y, B.ult.range, (m) => {
    if (m.sleepT <= 0 || m.dead) return;
    const d = Math.hypot(m.x - ax, m.y - ay);
    if (d < bd) { bd = d; best = m; }
  });
  if (!best) return false;
  const t = best as Mob;
  room.fx('dreamwalk', p.x, p.y, { o: p.id, n: 0 });
  const side = t.x > p.x ? -1 : 1;
  const spot = room.findFreeSpot(t.x + side * (t.r + p.r + 8), t.y, p.r);
  p.x = spot.x; p.y = spot.y; p.dash = null; p.knock = null;
  p.facing = t.x >= p.x ? 1 : -1;
  room.fx('dreamwalk', p.x, p.y, { o: p.id, n: 1 });
  room.sfx('lullaby', p.x, p.y);
  const res = room.meleeSwing(p, Math.atan2(t.y - p.y, t.x - p.x), { sfx: 'claw', dmgFor: () => B.ult.hopMul });
  for (const h of res.hits) room.addDrowsy(h.m, B.basicDrowsy, p, suscept(p));
  room.fx('ambush', p.x, p.y, { o: p.id, r: +Math.atan2(t.y - p.y, t.x - p.x).toFixed(2) });
  return true;
}

const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const suscept = (p: Player) => (p.tier >= 1 ? B.susceptMul : 1);

/** Sale del objeto. Devuelve el multiplicador de emboscada (1 = sin bonus). */
function leaveProp(room: Room, p: Player, attacking: boolean): number {
  if (!p.guise?.startsWith('prop:')) return 1;
  const charge = p.tier >= 3 ? B.stalk.chargeTT3 : B.stalk.chargeT;
  const k = Math.min(1, (p.k.still ?? 0) / charge);
  p.guise = null;
  room.fx('prop', p.x, p.y, { o: p.id, n: -1 });
  room.sfx('poof', p.x, p.y);
  return attacking ? 1 + B.stalk.bonusMax * k : 1;
}

export const nightmareKit: Kit = {
  basic(room, p, a) {
    const ambush = leaveProp(room, p, true);
    const res = room.meleeSwing(p, a, { sfx: 'claw', dmgFor: () => ambush });
    const extra = ambush > 1 ? B.stalk.drowsyBonus * (ambush - 1) / B.stalk.bonusMax : 0;
    for (const h of res.hits) room.addDrowsy(h.m, B.basicDrowsy + extra, p, suscept(p));
    if (ambush > 1) room.fx('ambush', p.x, p.y, { o: p.id, r: +a.toFixed(2) });
  },

  ability(room, p, slot, a) {
    if (slot === 0) {
      // Arrullo: nana en cono
      leaveProp(room, p, false);
      room.breakStealth(p);
      const R = p.tier >= 3 ? B.lullaby.rangeT3 : B.lullaby.range;
      const cone = p.tier >= 3 ? B.lullaby.coneT3 : B.lullaby.cone;
      room.setAnim(p, Anim.Cast, 0.4);
      room.forEachEnemyNear(p, p.x, p.y, R, (m) => {
        if (angleDiff(Math.atan2(m.y - p.y, m.x - p.x), a) > cone / 2 && Math.hypot(m.x - p.x, m.y - p.y) > 50) return;
        room.damage(m, room.calcDamage(p, B.lullaby.dmg), room.src(p));
        room.addDrowsy(m, B.lullaby.drowsy * room.powMult(p), p, suscept(p));
      });
      room.fx('lullaby', p.x, p.y, { o: p.id, r: +a.toFixed(2), d: R, n: Math.round(cone * 100) });
      room.sfx('lullaby', p.x, p.y);
    } else {
      // Acecho: se convierte en un objeto del escenario (o sale de él)
      if (p.guise?.startsWith('prop:')) { leaveProp(room, p, false); p.cd[2] = 1; return; }
      const list = PROPS[room.theme] ?? PROPS.elm;
      p.guise = `prop:${list[Math.floor(Math.random() * list.length)]}`;
      p.k.still = 0;
      p.k.stalkEnd = room.time + B.stalk.maxT;
      p.dash = null;
      room.fx('prop', p.x, p.y, { o: p.id, n: 1 });
      room.sfx('poof', p.x, p.y);
    }
  },

  ult(room, p) {
    // Entre sueños: una gran zona de sueño a su alrededor y, durante unos segundos, saltos entre los dormidos
    leaveProp(room, p, false);
    p.k.dreamEnd = room.time + B.ult.window;
    p.k.fieldEnd = room.time + B.ult.fieldT;
    p.k.hops = B.ult.hops;
    p.k.rHeld = 1; // la misma pulsación que lanza la definitiva no cuenta como salto
    p.ultT = B.ult.window;
    fielded.set(p.id, new Set());
    room.setAnim(p, Anim.Cast, 0.6);
    room.fx('dreamField', p.x, p.y, { o: p.id, r: B.ult.fieldR, d: B.ult.fieldT });
    room.sfx('lullaby', p.x, p.y);
    return true;
  },

  tick(room, p, dt) {
    const dreaming = (p.k.dreamEnd ?? 0) > room.time;
    if (dreaming) {
      // zona de sueño: todos los de alrededor se van durmiendo (una vez cada uno)
      if ((p.k.fieldEnd ?? 0) > room.time) {
        const done = fielded.get(p.id) ?? new Set<number>();
        room.forEachEnemyNear(p, p.x, p.y, B.ult.fieldR, (m) => {
          if (m.dead || done.has(m.id)) return;
          room.addDrowsy(m, B.ult.fieldRate * dt, p, 1);
          if (m.sleepT > 0) done.add(m.id);
        });
        fielded.set(p.id, done);
      } else fielded.delete(p.id);
      // R otra vez: salto al dormido más cercano al cursor
      const rDown = (p.input.b & BTN_R) !== 0;
      if (rDown && !p.k.rHeld && (p.k.hops ?? 0) > 0 && hop(room, p)) {
        p.k.hops--;
        if (p.k.hops <= 0) { p.k.dreamEnd = 0; p.ultT = 0; }
      }
      p.k.rHeld = rDown ? 1 : 0;
    } else if (p.k.dreamEnd) { p.k.dreamEnd = 0; fielded.delete(p.id); }
    if (!p.guise?.startsWith('prop:')) return;
    if (p.moving || room.time > (p.k.stalkEnd ?? 0)) { leaveProp(room, p, false); return; }
    p.k.still = (p.k.still ?? 0) + dt;
  },
};
