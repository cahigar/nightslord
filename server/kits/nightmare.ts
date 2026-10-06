// 🌙 Pesadilla: sueño, acecho y emboscadas.
import { BAL } from '../../shared/balance';
import { Anim, Kind } from '../../shared/protocol';
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
    const empowered = (p.k.nextT ?? 0) > room.time;
    const mult = ambush * (empowered ? B.ult.nextMul : 1);
    if (empowered) p.k.nextT = 0;
    const res = room.meleeSwing(p, a, { sfx: 'claw', dmgFor: () => mult });
    const extra = (ambush > 1 ? B.stalk.drowsyBonus * (ambush - 1) / B.stalk.bonusMax : 0) + (empowered ? B.ult.nextDrowsy : 0);
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

  ult(room, p, a) {
    // Entre sueños: aparece junto al enemigo dormido más cercano al cursor
    const aimD = Math.min(p.input.d, 900);
    const ax = p.x + Math.cos(a) * aimD, ay = p.y + Math.sin(a) * aimD;
    let best: Mob | null = null, bd = Infinity;
    room.forEachEnemyNear(p, p.x, p.y, B.ult.range, (m) => {
      if (m.sleepT <= 0 || m.dead) return;
      const d = Math.hypot(m.x - ax, m.y - ay);
      if (d < bd) { bd = d; best = m; }
    });
    if (!best) return false; // sin nadie dormido no se gasta la carga
    const t = best as Mob;
    leaveProp(room, p, false);
    room.fx('dreamwalk', p.x, p.y, { o: p.id, n: 0 });
    const side = t.x > p.x ? -1 : 1;
    const spot = room.findFreeSpot(t.x + side * (t.r + p.r + 8), t.y, p.r);
    p.x = spot.x; p.y = spot.y; p.dash = null; p.knock = null;
    p.facing = t.x >= p.x ? 1 : -1;
    p.k.nextT = room.time + B.ult.buffT;
    p.ultT = B.ult.buffT;
    room.fx('dreamwalk', p.x, p.y, { o: p.id, n: 1 });
    room.sfx('lullaby', p.x, p.y);
    void Kind;
    return true;
  },

  tick(room, p, dt) {
    if (!p.guise?.startsWith('prop:')) return;
    if (p.moving || room.time > (p.k.stalkEnd ?? 0)) { leaveProp(room, p, false); return; }
    p.k.still = (p.k.still ?? 0) + dt;
  },
};
