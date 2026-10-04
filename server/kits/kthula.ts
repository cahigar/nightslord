// 🐙 K'thula: horror abisal. Camina sobre agua profunda y llena el mapa de charcas.
import { BAL } from '../../shared/balance';
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
    room.meleeSwing(p, a, { sfx: 'tentacle' });
  },

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
    // Señor de las profundidades: sobre agua va derramando charcas alrededor
    if (p.tier >= 1 && room.waterAt(p.x, p.y)) {
      p.spillT -= dt;
      if (p.spillT <= 0) {
        p.spillT = B.spillEvery;
        const ang = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 40;
        room.puddle(p.id, p.x + Math.cos(ang) * dist, p.y + Math.sin(ang) * dist, B.spillR, B.spillT);
      }
    }
  },

  qCharges: (p) => (p.tier >= 3 ? B.qChargesT3 : 1),

  onProjectileHit(room, p, pr, m) {
    if (pr.type !== 'wave') return;
    const sp = Math.hypot(pr.vx, pr.vy) || 1;
    room.knockback(m, pr.vx / sp, pr.vy / sp, B.ult.knock);
  },
};
