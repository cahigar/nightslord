// 🧟 Ramsés: tanque y controlador. Ataca a distancia con escarabajos que ralentizan.
import { BAL } from '../../shared/balance';
import { Anim, Kind } from '../../shared/protocol';
import type { Mob, Player } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.mummy;

function entomb(room: Room, p: Player, m: Mob) {
  if (m.entombT > 0) return;
  m.entombT = m.kind === Kind.Player ? B.ult.entombPlayerT : B.ult.entombT;
  m.entombBy = p.id;
  m.entombDot = B.ult.dotEvery;
  m.knock = null;
  room.fx('entomb', m.x, m.y, { o: m.id, d: m.entombT });
  room.sfx('tomb', m.x, m.y);
}

export const mummyKit: Kit = {
  basic(room, p, a) {
    room.breakStealth(p);
    room.setAnim(p, Anim.Attack, 0.25);
    room.shoot('scarab', p.id, p.x, p.y, a, B.scarabSpeed, B.scarabLife, room.calcDamage(p, B.scarabDmg));
    room.sfx('scarab', p.x, p.y);
  },

  ability(room, p, slot, a) {
    room.breakStealth(p);
    if (slot === 0) {
      room.setAnim(p, Anim.Cast, 0.35);
      room.shoot('bandage', p.id, p.x, p.y, a, B.bandageSpeed, B.bandageLife, room.calcDamage(p, room.powMult(p)));
      room.sfx('bat', p.x, p.y);
    } else {
      room.setAnim(p, Anim.Cast, 0.6);
      const R = p.tier >= 3 ? B.curseRT3 : B.curseR;
      room.forEachEnemyNear(p, p.x, p.y, R, (m) => {
        room.damage(m, room.calcDamage(p, room.powMult(p)), room.src(p));
        room.slow(m, B.curseSlowT, B.curseSlowMul);
      });
      room.fx('curse', p.x, p.y, { r: R, o: p.id, n: p.tier });
      room.sfx('curse', p.x, p.y);
    }
  },

  ult(room, p, a) {
    p.ultT = B.ult.dur;
    room.setAnim(p, Anim.Cast, 0.7);
    const pr = room.shoot('sandstorm', p.id, p.x, p.y, a, B.ult.stormSpeed, B.ult.stormLife, room.calcDamage(p, B.ult.stormDmg));
    pr.pierce = true; pr.ghost = true; pr.hitR = B.ult.stormHitR; pr.hitSet = new Set();
    room.fx('storm', p.x, p.y, { r: +a.toFixed(2), o: p.id, d: B.ult.stormLife });
    room.sfx('sand', p.x, p.y);
    return true;
  },

  speedMul: (_r, p) => (p.ultT > 0 ? B.ult.speedMul : 1),
  atkSpeedMul: (_r, p) => (p.ultT > 0 ? B.ult.atkSpeedMul : 1),

  onProjectileHit(room, p, pr, m) {
    if (pr.type === 'scarab') {
      room.slow(m, B.scarabSlowT, B.scarabSlowMul);
      if (p.tier >= 1 && m.curseMarkT <= 0) {
        const n = (p.hits.get(m.id) ?? 0) + 1;
        if (n >= B.curseEvery) {
          p.hits.delete(m.id);
          m.curseMarkT = B.curseMarkT;
          m.curseBy = p.id;
          room.fx('curseMark', m.x, m.y, { o: m.id });
        } else p.hits.set(m.id, n);
        if (p.hits.size > 64) p.hits.clear();
      }
    } else if (pr.type === 'bandage') {
      m.stunT = Math.max(m.stunT, B.bandageRoot);
      if (p.tier >= 3 && !pr.bounced) {
        const next = room.nearestEnemy(p, m.x, m.y, B.bounceR, m.id);
        if (next) {
          const b = room.shoot('bandage', p.id, m.x, m.y, Math.atan2(next.y - m.y, next.x - m.x), B.bandageSpeed, B.bandageLife, pr.dmg * 0.8);
          b.bounced = true;
          b.hitSet = new Set([m.id]);
        }
      }
    } else if (pr.type === 'sandstorm') {
      entomb(room, p, m);
    }
  },

  // Maldición del faraón: el siguiente daño consume la marca y ralentiza mucho más
  onDealDamage(room, p, m, amount) {
    if (m.curseMarkT > 0 && m.curseBy === p.id) {
      m.curseMarkT = 0;
      m.curseBy = -1;
      room.slow(m, B.curseMarkSlowT, B.curseMarkSlowMul);
      room.fx('curseMark', m.x, m.y, { o: m.id, n: 1 });
      return amount * (1 + B.curseMarkBonus);
    }
    return amount;
  },
};
