// 💀 El Nigromante: invocador de huesos y magia oscura.
// - Orbe oscuro (básico): bola de magia a distancia.
// - Alzar huesos (Q): esqueleto guerrero o arquero que le sigue (máx. 3; nv. 15: 5). A veces, un perro esqueleto rapidísimo.
// - Marcha de los muertos (E): él y sus esqueletos corren y atacan más rápido; él levita y cruza el agua.
// - Último conjuro (nv. 5): al morir, al cabo de 1 s vuelve 3 s como fantasma inmóvil y gira un largo rayo que quema.
// - Portales del osario (R): tres portales de los que salen puños y pies de hueso gigantes que aplastan y empujan.
import { BAL } from '../../shared/balance';
import { Anim } from '../../shared/protocol';
import type { Minion, MinionVariant, Player, Zone } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.necro;
const SKELS = new Set<MinionVariant>(['skel', 'skelarcher', 'skeldog']);
const marching = (room: Room, p: Player) => (p.k.marchEnd ?? 0) > room.time;

function slam(room: Room, p: Player, x: number, y: number) {
  const U = B.ult;
  room.forEachEnemyNear(p, x, y, U.r, (m) => {
    if (m.dead) return;
    room.damage(m, room.calcDamage(p, U.dmg * room.powMult(p)), room.src(p));
    const d = Math.hypot(m.x - x, m.y - y) || 1;
    room.knockback(m, (m.x - x) / d, (m.y - y) / d, U.knock);
  });
  room.fx('boneSlam', x, y, { r: U.r, n: Math.random() < 0.5 ? 0 : 1, o: p.id });
  room.sfx('slam', x, y);
}

function portalTick(room: Room, p: Player, z: Zone) {
  if (z.next === undefined) z.next = z.born + 0.4;
  if (room.time < z.next) return;
  const U = B.ult;
  z.next = room.time + U.every * (0.8 + Math.random() * 0.4);
  const t = room.nearestEnemy(p, z.ax, z.ay, U.reach, -1);
  let x: number, y: number;
  if (t) { x = t.x; y = t.y; }
  else { const a = Math.random() * Math.PI * 2, d = Math.random() * U.reach; x = z.ax + Math.cos(a) * d; y = z.ay + Math.sin(a) * d * 0.7; }
  room.fx('boneWarn', x, y, { r: U.r, d: U.warn });
  room.later(U.warn, () => { if (!p.dead) slam(room, p, x, y); });
}

export const necroKit: Kit = {
  basic(room, p, a) {
    room.breakStealth(p);
    room.setAnim(p, Anim.Attack, 0.3);
    const pr = room.shoot('orb', p.id, p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16, a, B.orb.speed, B.orb.life, room.calcDamage(p, B.orb.dmg));
    pr.hitR = 12;
    room.sfx('curse', p.x, p.y);
  },

  ability(room, p, slot, a) {
    room.breakStealth(p);
    if (slot === 0) {
      // Alzar huesos
      const r = Math.random();
      const v: MinionVariant = r < B.dogChance ? 'skeldog' : r < B.dogChance + (1 - B.dogChance) / 2 ? 'skel' : 'skelarcher';
      const d = 50 + Math.random() * 30;
      const f = room.findFreeSpot(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.7, 14);
      const m = room.spawnMinion(p, f.x, f.y, v, v, p.id % 97, 1e9, false, p.tier >= 3 ? B.maxT3 : B.max);
      room.setAnim(p, Anim.Cast, 0.4);
      room.fx('raise', m.x, m.y, { o: m.id, n: v === 'skeldog' ? 1 : 0 });
      room.sfx('groan', m.x, m.y);
    } else {
      // Marcha de los muertos
      p.k.marchEnd = room.time + B.march.t;
      p.k.hover = 1;
      room.setAnim(p, Anim.Cast, 0.4);
      room.fx('raise', p.x, p.y, { o: p.id, n: 2 });
      for (const m of room.minionsOf(p.id)) if (SKELS.has(m.variant)) room.fx('frenzy', m.x, m.y);
      room.sfx('chant', p.x, p.y);
    }
  },

  ult(room, p, a) {
    const U = B.ult;
    const d = Math.min(p.input.d, 380);
    const cx = p.x + Math.cos(a) * d, cy = p.y + Math.sin(a) * d;
    for (let i = 0; i < U.portals; i++) {
      const ang = a + (i / U.portals) * Math.PI * 2;
      const x = cx + Math.cos(ang) * U.spread, y = cy + Math.sin(ang) * U.spread * 0.7;
      room.addZone({ kind: 'portal', ax: x, ay: y, bx: x, by: y, w: 110, until: room.time + U.t, owner: p.id });
    }
    room.setAnim(p, Anim.Cast, 0.8);
    room.sfx('ult', p.x, p.y);
    p.ultT = U.t;
    return true;
  },

  speedMul: (room, p) => (marching(room, p) ? B.march.speedMul : 1),
  atkSpeedMul: (room, p) => (marching(room, p) ? B.march.atkMul : 1),
  minionMul: (room, p, m: Minion) => (marching(room, p) && SKELS.has(m.variant) ? B.march.speedMul : 1),
  walksWater: (p) => p.k.hover === 1,

  tick(room, p) {
    if (p.k.hover && !marching(room, p)) {
      p.k.hover = 0;
      if (room.grid.blocked(p.x, p.y, p.r, false)) { const f = room.findFreeSpot(p.x, p.y, p.r); p.x = f.x; p.y = f.y; } // no se queda en el agua
    }
    for (const z of room.zones) if (z.kind === 'portal' && z.owner === p.id) portalTick(room, p, z);
  },

  onDeath(room, p) {
    if (p.tier < 1) return;
    const x = p.x, y = p.y, a = p.input.a;
    room.later(B.last.delay, () => {
      room.addZone({ kind: 'lastspell', ax: x, ay: y, bx: x, by: y, w: B.last.w, until: room.time + B.last.t, owner: p.id, v: a });
      room.fx('ghostRise', x, y, { o: p.id, s: p.skin, d: B.last.t });
      room.sfx('chant', x, y);
    });
  },

  buffs(room, p, add, list) {
    const n = room.minionsOf(p.id).filter((m) => SKELS.has(m.variant)).length;
    if (n) list.push({ t: 'skeletons', r: n });
    if (marching(room, p)) add('march', p.k.marchEnd - room.time);
  },
};
