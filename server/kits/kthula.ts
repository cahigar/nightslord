// 🐙 K'thula: horror abisal. Camina sobre agua profunda y llena el mapa de charcas.
import { BAL } from '../../shared/balance';
import { distToSegment } from '../../shared/maps';
import { Anim } from '../../shared/protocol';
import type { Player } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.kthula;

function surface(room: Room, p: Player) {
  p.submergeT = 0;
  room.fx('surface', p.x, p.y, { o: p.id });
  room.sfx('splash', p.x, p.y);
  if (p.tier >= 3) room.puddle(p.id, p.x, p.y, B.divePuddleR, B.puddleT);
}

export const kthulaKit: Kit = {
  basic(room, p, a) {
    // en el agua (profunda o charca) el ataque básico es un chorro a presión
    if (room.waterAt(p.x, p.y)) {
      p.jetT = B.jetT;
      p.jetTick = 0;
      p.cd[0] = B.jetT + B.jetCd;
      room.setAnim(p, Anim.Cast, B.jetT);
      room.sfx('splash', p.x, p.y);
      return;
    }
    room.meleeSwing(p, a, { sfx: 'tentacle' });
  },

  speedMul: (room, p) => (p.jetT > 0 ? B.jetMoveMul : 1),

  ability(room, p, slot, a) {
    if (slot === 0) {
      // Tentáculo abisal: aviso de burbujas y, tras un instante, surge y arrastra
      room.breakStealth(p);
      const d = Math.min(p.input.d, B.tentacleRange);
      const tx = p.x + Math.cos(a) * d, ty = p.y + Math.sin(a) * d;
      room.setAnim(p, Anim.Cast, 0.35);
      room.fx('tentacleWarn', tx, ty, { r: B.tentacleR, o: p.id, d: B.tentacleDelay });
      room.sfx('bubble', tx, ty);
      room.later(B.tentacleDelay, () => {
        if (p.dead) return;
        room.forEachEnemyNear(p, tx, ty, B.tentacleR, (m) => {
          room.damage(m, room.calcDamage(p, B.tentacleDmg * room.powMult(p)), room.src(p));
          const dx = tx - m.x, dy = ty - m.y, dd = Math.hypot(dx, dy) || 1;
          room.knockback(m, dx / dd, dy / dd, Math.min(dd, B.tentaclePull));
        });
        room.fx('tentacle', tx, ty, { r: B.tentacleR, o: p.id });
        room.sfx('tentacle', tx, ty);
      });
    } else {
      // Sumergirse: más tiempo en agua profunda (duración doble respecto a la propuesta inicial)
      const deep = room.waterAt(p.x, p.y) === 'deep';
      p.submergeT = (deep ? B.diveDeep : B.diveLand) * room.powMult(p);
      p.dash = null; p.knock = null;
      room.fx('dive', p.x, p.y, { o: p.id, d: p.submergeT });
      room.sfx('splash', p.x, p.y);
    }
  },

  ult(room, p, a) {
    room.setAnim(p, Anim.Cast, 0.6);
    const pr = room.shoot('wave', p.id, p.x, p.y, a, B.ult.speed, B.ult.life, room.calcDamage(p, B.ult.dmg));
    pr.pierce = true; pr.ghost = true; pr.hitR = B.ult.hitR; pr.hitSet = new Set();
    room.fx('splash', p.x, p.y, { r: 120, o: p.id });
    room.sfx('splash', p.x, p.y);
    return true;
  },

  tick(room, p, dt) {
    if (p.submergeT > 0) {
      p.submergeT -= dt;
      if (p.submergeT <= 0) surface(room, p);
    }
    // chorro: daña en línea hacia donde apunta, empuja un poco
    if (p.jetT > 0) {
      p.jetT -= dt;
      p.jetTick -= dt;
      if (p.jetTick <= 0 && !p.dead && p.submergeT <= 0) {
        p.jetTick = B.jetEvery;
        const a = p.input.a;
        const x0 = p.x + Math.cos(a) * 16, y0 = p.y + Math.sin(a) * 16;
        let len = B.jetRange;
        for (let k = 30; k <= B.jetRange; k += 30) if (room.grid.blocked(p.x + Math.cos(a) * k, p.y + Math.sin(a) * k, 3, true)) { len = k; break; }
        const x1 = p.x + Math.cos(a) * len, y1 = p.y + Math.sin(a) * len;
        room.forEachEnemyNear(p, (x0 + x1) / 2, (y0 + y1) / 2, len / 2 + B.jetW, (m) => {
          if (m.dead || distToSegment(m.x, m.y, x0, y0, x1, y1) > B.jetW / 2 + m.r) return;
          room.damage(m, room.calcDamage(p, B.jetDmg), room.src(p));
          room.knockback(m, Math.cos(a), Math.sin(a), B.jetPush);
        });
      }
    }
    // charca bajo ella: si está quieta FUERA del agua profunda, el agua va brotando y crece
    if (p.moving || p.submergeT > 0 || room.waterAt(p.x, p.y) === 'deep') { p.stillT = 0; p.growZone = -1; return; }
    p.stillT += dt;
    if (p.stillT < B.stillDelay) return;
    const max = p.tier >= 1 ? B.growMaxT1 : B.growMax;
    const rate = p.tier >= 1 ? B.growRateT1 : B.growRate;
    let z = room.zones.find((o) => o.id === p.growZone);
    if (z && Math.hypot(z.ax - p.x, z.ay - p.y) > 24) z = undefined;
    if (!z) {
      z = room.puddle(p.id, p.x, p.y + 4, B.growR0, B.growT) ?? undefined;
      p.growZone = z ? z.id : -1;
      if (z) room.sfx('bubble', p.x, p.y);
      return;
    }
    z.w = Math.min(max * 2, z.w + rate * 2 * dt);
    z.until = room.time + B.growT;
    z.born = room.time - 0.001;
  },

  qCharges: (p) => (p.tier >= 3 ? B.qChargesT3 : 1),

  onProjectileHit(room, p, pr, m) {
    if (pr.type !== 'wave') return;
    const sp = Math.hypot(pr.vx, pr.vy) || 1;
    room.knockback(m, pr.vx / sp, pr.vy / sp, B.ult.knock);
  },
};
