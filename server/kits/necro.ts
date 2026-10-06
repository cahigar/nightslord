// 💀 El Nigromante: invocador de huesos y magia oscura.
// - Orbe oscuro (básico): bola de magia a distancia.
// - Alzar huesos (Q): esqueleto guerrero o arquero que le sigue (máx. 3; nv. 15: 5). A veces, un perro esqueleto rapidísimo.
// - Marcha de los muertos (E): él y sus esqueletos corren y atacan más rápido; él levita y cruza el agua.
// - Pasiva: se cura un poco con cada baja de sus esqueletos.
// - Nv. 5: Alzar huesos con 2 cargas. Último conjuro: al morir, al cabo de 1 s vuelve 3 s como fantasma inmóvil y
//   maneja un largo rayo que quema hasta desintegrarse.
// - Portales del osario (R): puños y pies de hueso gigantes caen del cielo alrededor del punto elegido.
// - Nv. 15: hasta 5 esqueletos, un 30 % más grandes y con más vida.
import { BAL } from '../../shared/balance';
import { Anim } from '../../shared/protocol';
import { Kind } from '../../shared/protocol';
import type { Minion, MinionVariant, Mob, Player } from '../entities';
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

/** Un puño o pie de hueso cae del cielo cerca del punto de la definitiva (preferiblemente sobre un enemigo). */
function ossuaryTick(room: Room, p: Player) {
  const U = B.ult;
  if ((p.k.ossEnd ?? 0) <= room.time || room.time < (p.k.ossNext ?? 0)) return;
  p.k.ossNext = room.time + U.every * (0.7 + Math.random() * 0.6);
  const cx = p.k.ossX, cy = p.k.ossY;
  const list: Mob[] = [];
  room.forEachEnemyNear(p, cx, cy, U.area, (m) => { if (!m.dead) list.push(m); });
  let x: number, y: number;
  if (list.length && Math.random() < 0.75) { const t = list[Math.floor(Math.random() * list.length)]; x = t.x + (Math.random() - 0.5) * 30; y = t.y + (Math.random() - 0.5) * 20; }
  else { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * U.area; x = cx + Math.cos(a) * d; y = cy + Math.sin(a) * d * 0.7; }
  room.fx('boneWarn', x, y, { r: U.r, d: U.warn });
  room.later(U.warn, () => slam(room, p, x, y));
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
      const big = p.tier >= 3;
      const m = room.spawnMinion(p, f.x, f.y, v, v, big ? 1 : 0, 1e9, false, big ? B.maxT3 : B.max);
      if (big) { m.maxHp = m.hp = Math.round(m.maxHp * B.bigT3.hpMul); m.r = Math.round(m.r * 1.15); } // nv. 15: más grandes y duros
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
    const d = Math.min(p.input.d, 380);
    p.k.ossX = p.x + Math.cos(a) * d; p.k.ossY = p.y + Math.sin(a) * d;
    p.k.ossEnd = room.time + B.ult.t; p.k.ossNext = room.time + 0.25;
    room.setAnim(p, Anim.Cast, 0.8);
    room.fx('raise', p.k.ossX, p.k.ossY, { o: p.id, n: 2 });
    room.sfx('ult', p.x, p.y);
    p.ultT = B.ult.t;
    return true;
  },

  qCharges: (p) => (p.tier >= 1 ? 2 : 1),

  onMinionKill(room, p, m, victim) {
    if (!SKELS.has(m.variant) || p.dead) return;
    const big = victim.kind === Kind.Player || victim.kind === Kind.Hunter;
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * (big ? B.heal.big : B.heal.small));
    room.fx('drain', victim.x, victim.y, { tx: Math.round(p.x), ty: Math.round(p.y), o: p.id, n: big ? 5 : 2, c: 'bone' });
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
    ossuaryTick(room, p);
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
