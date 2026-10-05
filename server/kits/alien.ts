// 👽 El Visitante, el alien: control tecnológico y ataques desde el cielo.
// - Rayo de plasma: proyectil rápido de alcance medio.
// - Pasiva: 3 impactos seguidos sobre el mismo objetivo lo silencian 2 s.
// - Abducción (Q): un haz de OVNI levanta al enemigo de la zona y lo deja caer (nv. 15: a todos los de la zona, más grande).
// - Baliza (E): a los pocos segundos un OVNI dispara sobre ella; cerca de su baliza corre más (nv. 15: deja radiación).
// - Tecnología superior (nv. 5): recoger objetos le recorta los enfriamientos.
// - Invasión (R): pequeños OVNIs le acompañan y disparan rayos solos a los enemigos cercanos.
// Los rayos de los OVNIs son eléctricos: si caen cerca del agua, electrocutan a quien esté dentro.
import { BAL } from '../../shared/balance';
import { Anim } from '../../shared/protocol';
import type { Minion, Mob, Player } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.alien;
const hitsOn = new WeakMap<Player, Map<number, { n: number; t: number }>>();
const beacons = (room: Room, p: Player): Minion[] => room.minionsOf(p.id).filter((m) => m.variant === 'beacon');

/** Rayo desde el cielo sobre un punto: daño en área y electricidad. */
function skyRay(room: Room, p: Player, x: number, y: number, r: number, dmg: number) {
  room.fx('ufoRay', x, y, { o: p.id, r });
  room.sfx('zap', x, y);
  room.forEachEnemyNear(p, x, y, r, (m) => { if (!m.dead) room.damage(m, room.calcDamage(p, dmg * room.powMult(p)), room.src(p)); });
  room.electrify(x, y, p);
}

export const alienKit: Kit = {
  basic(room, p, a) {
    room.breakStealth(p);
    room.setAnim(p, Anim.Attack, 0.25);
    const pr = room.shoot('plasma', p.id, p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, a, B.plasma.speed, B.plasma.life, room.calcDamage(p, B.plasma.dmg));
    pr.hitR = 10;
    room.sfx('zap', p.x, p.y);
  },

  ability(room, p, slot, a) {
    room.breakStealth(p);
    if (slot === 0) {
      // Abducción
      const A = B.abduct, d = Math.min(p.input.d, A.range);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      const r = p.tier >= 3 ? A.rT3 : A.r;
      room.setAnim(p, Anim.Cast, 0.4);
      room.fx('ufoBeam', x, y, { o: p.id, r, d: A.delay + A.t });
      room.sfx('zap', x, y);
      room.later(A.delay, () => {
        if (p.dead) return;
        const caught: Mob[] = [];
        room.forEachEnemyNear(p, x, y, r, (m) => { if (!m.dead && m.entombT <= 0) caught.push(m); });
        caught.sort((m1, m2) => (m1.x - x) ** 2 + (m1.y - y) ** 2 - ((m2.x - x) ** 2 + (m2.y - y) ** 2));
        for (const m of p.tier >= 3 ? caught : caught.slice(0, 1)) {
          room.lift(m, A.t);
          room.later(A.t, () => { if (!m.dead && !p.dead) { room.damage(m, room.calcDamage(p, A.dmg * room.powMult(p)), room.src(p)); room.fx('leapLand', m.x, m.y, { r: 50 }); } });
        }
      });
    } else {
      // Baliza
      const d = Math.min(p.input.d, B.beacon.range);
      const f = room.findFreeSpot(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 12);
      room.spawnMinion(p, f.x, f.y, 'beacon', '', 0, B.beacon.life, false, 2);
      room.setAnim(p, Anim.Cast, 0.3);
      room.sfx('zap', f.x, f.y);
    }
  },

  ult(room, p) {
    p.ultT = B.ult.t;
    p.k.ufoT = 0;
    room.setAnim(p, Anim.Cast, 0.6);
    room.fx('ufoBeam', p.x, p.y, { o: p.id, r: 60, d: 0.6 });
    room.sfx('zap', p.x, p.y);
    return true;
  },

  speedMul: (room, p) => (beacons(room, p).some((m) => (m.x - p.x) ** 2 + (m.y - p.y) ** 2 < B.beacon.speedR ** 2) ? B.beacon.speedMul : 1),

  tick(room, p, dt) {
    // balizas: a los pocos segundos, rayo del OVNI (una vez por baliza)
    for (const m of beacons(room, p)) {
      if (m.lookSeed !== 0 || room.time - m.born < B.beacon.delay) continue;
      m.lookSeed = 1;
      skyRay(room, p, m.x, m.y, B.beacon.r, B.beacon.dmg);
      if (p.tier >= 3) room.addZone({ kind: 'radiation', ax: m.x, ay: m.y, bx: m.x, by: m.y, w: B.beacon.r * 1.6, until: room.time + B.beacon.radT, owner: p.id });
    }
    // Invasión: los OVNIs disparan solos
    if (p.ultT > 0) {
      p.k.ufoT = (p.k.ufoT ?? 0) - dt;
      if (p.k.ufoT <= 0) {
        p.k.ufoT = B.ult.every;
        const foes: Mob[] = [];
        room.forEachEnemyNear(p, p.x, p.y, B.ult.range, (m) => { if (!m.dead) foes.push(m); });
        const t = foes[Math.floor(Math.random() * foes.length)];
        if (t) skyRay(room, p, t.x, t.y, 34, B.ult.dmg);
      }
    }
  },

  onProjectileHit(room, p, pr, m) {
    if (pr.type !== 'plasma' || m.dead) return;
    // pasiva: 3 impactos seguidos sobre el mismo objetivo lo silencian
    let map = hitsOn.get(p);
    if (!map) { map = new Map(); hitsOn.set(p, map); }
    const h = map.get(m.id);
    const n = h && room.time - h.t < B.silence.window ? h.n + 1 : 1;
    if (n >= B.silence.hits) { map.delete(m.id); room.silence(m, B.silence.t); room.fx('spark', m.x, m.y, { r: 30, o: p.id }); }
    else map.set(m.id, { n, t: room.time });
    if (map.size > 60) for (const [id, v] of map) if (room.time - v.t > B.silence.window) map.delete(id);
  },

  onPickup(room, p) {
    if (p.tier < 1) return;
    for (const i of [1, 2]) p.cd[i] = Math.max(0, p.cd[i] - p.cdMax[i] * B.pickupCd);
  },
};
