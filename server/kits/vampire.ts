// 🧛 El Conde: equilibrado, móvil y centrado en el robo de vida.
import { BAL } from '../../shared/balance';
import { Anim, Kind } from '../../shared/protocol';
import type { Kit } from './types';

const B = BAL.vampire;

export const vampireKit: Kit = {
  basic(room, p, a) {
    const heal = (p.tier >= 1 ? B.biteHealT1 : B.biteHeal) + (p.ultT > 0 ? B.ult.lifesteal : 0);
    const { hits } = room.meleeSwing(p, a, { sfx: 'bite' });
    for (const h of hits) {
      if (h.dealt <= 0) continue;
      p.hp = Math.min(p.maxHp, p.hp + h.dealt * heal);
      // corriente de sangre de la víctima hacia el Conde (solo visual)
      room.fx('drain', h.m.x, h.m.y, { tx: Math.round(p.x), ty: Math.round(p.y), o: p.id, n: Math.min(6, Math.round(h.dealt / 6) + 2) });
    }
  },

  ability(room, p, slot, a) {
    if (slot === 0) {
      room.breakStealth(p);
      room.setAnim(p, Anim.Cast, 0.35);
      const n = p.tier >= 3 ? B.batsT3 : B.bats;
      const spread = p.tier >= 3 ? B.batSpreadT3 : B.batSpread;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * spread;
        room.shoot('bat', p.id, p.x, p.y, a + off, B.batSpeed, B.batLife, room.calcDamage(p, B.batDmg * room.powMult(p)));
      }
      room.sfx('bat', p.x, p.y);
    } else {
      const from = { x: p.x, y: p.y };
      const ca = Math.cos(a), sa = Math.sin(a);
      let d = B.mistDist;
      while (d > 0 && room.grid.blocked(p.x + ca * d, p.y + sa * d, p.r)) d -= 20;
      p.x += ca * d; p.y += sa * d;
      p.mistT = B.mistInvuln;
      p.knock = null; p.stunT = 0;
      room.fx('mist', from.x, from.y, { o: p.id, n: p.tier });
      room.fx('mist', p.x, p.y, { o: p.id, n: p.tier });
      if (p.tier >= 3 && d > 20) {
        room.addZone({ kind: 'mistTrail', ax: from.x, ay: from.y, bx: p.x, by: p.y, w: B.mistTrailW, until: room.time + B.mistTrailT, owner: p.id });
        room.fx('mistTrail', from.x, from.y, { tx: Math.round(p.x), ty: Math.round(p.y), d: B.mistTrailT });
      }
      room.sfx('mist', p.x, p.y);
    }
  },

  ult(room, p) {
    p.ultT = B.ult.dur;
    p.cd[1] *= 1 - B.ult.cdCutOnCast;
    p.cd[2] *= 1 - B.ult.cdCutOnCast;
    room.setAnim(p, Anim.Cast, 0.6);
    room.panicAround(p.x, p.y, B.ult.panicR, B.ult.panicT);
    room.fx('crimson', p.x, p.y, { o: p.id, r: B.ult.panicR, d: B.ult.dur });
    return true;
  },

  tick(room, p, dt) {
    p.killSpeedT = Math.max(0, p.killSpeedT - dt);
    if (p.ultT > 0 && Math.floor(p.ultT / B.ult.pulse) !== Math.floor((p.ultT + dt) / B.ult.pulse)) {
      room.panicAround(p.x, p.y, B.ult.panicR * 0.7, 2);
    }
    for (let i = 0; i < p.orbit.length; i++) p.orbit[i] = Math.max(0, p.orbit[i] - dt);
  },

  speedMul: (_r, p) => (p.killSpeedT > 0 ? B.killSpeedMul : 1),
  cdRate: (_r, p) => (p.ultT > 0 ? B.ult.cdRate : 1),

  onKill(_room, p, victim) {
    if (p.tier >= 1 && victim.kind === Kind.Npc) p.killSpeedT = B.killSpeedT;
  },

  onProjectileHit(room, p, pr, _target, dealt) {
    if (pr.type === 'bat' && dealt > 0) {
      p.hp = Math.min(p.maxHp, p.hp + dealt * B.batHeal * (p.ultT > 0 ? B.ult.batHealMul : 1));
      room.fx('drain', pr.x, pr.y, { tx: Math.round(p.x), ty: Math.round(p.y), o: p.id, n: 2 });
    }
  },

  blockProjectile(room, p, pr) {
    if (p.tier < 3) return false;
    const i = p.orbit.findIndex((t) => t <= 0);
    if (i < 0) return false;
    if ((pr.x - p.x) ** 2 + (pr.y - p.y) ** 2 > B.orbitBlockR ** 2) return false;
    p.orbit[i] = B.orbitRegen;
    room.fx('orbitBlock', pr.x, pr.y, { o: p.id });
    room.sfx('bat', pr.x, pr.y);
    return true;
  },

  onTier(_room, p, tier) {
    if (tier >= 3 && p.orbit.length === 0) p.orbit = new Array(B.orbitBats).fill(0);
  },
};
