// 🐺 Lobo de Luna: el más agresivo; persigue, entra en combate y encadena bajas.
import { BAL } from '../../shared/balance';
import { Anim } from '../../shared/protocol';
import type { Kit } from './types';

const B = BAL.werewolf;

export const werewolfKit: Kit = {
  basic(room, p, a) {
    room.meleeSwing(p, a, {
      sfx: 'claw',
      rangeMul: p.ultT > 0 ? B.ult.rangeMul : 1,
      // Bestia Alfa: el primer zarpazo a una Presa hace daño extra y consume la marca
      dmgFor: (m) => {
        if (m.preyT > 0) { m.preyT = 0; room.fx('prey', m.x, m.y, { o: p.id, n: 1 }); return 1 + B.preyBonus; }
        return 1;
      },
    });
  },

  ability(room, p, slot, a) {
    if (slot === 0) {
      room.breakStealth(p);
      const ca = Math.cos(a), sa = Math.sin(a);
      p.dash = { t: B.dashT, dx: ca, dy: sa, hit: new Set(), speed: p.def.speed * B.dashSpeedMul, dmg: B.dashDmg, knock: B.dashKnock };
      room.setAnim(p, Anim.Attack, B.dashT);
      room.fx('dash', p.x, p.y, { r: +a.toFixed(2), o: p.id });
      room.sfx('dash', p.x, p.y);
    } else {
      p.howlT = B.howlT * room.powMult(p);
      room.setAnim(p, Anim.Cast, 0.8);
      for (const n of room.npcs.values()) if ((p.x - n.x) ** 2 + (p.y - n.y) ** 2 < B.howlR ** 2) n.fearT = B.fearNpcT;
      for (const h of room.hunters.values()) if ((p.x - h.x) ** 2 + (p.y - h.y) ** 2 < B.fearHunterR ** 2) h.fearT = B.fearHunterT;
      if (p.tier >= 3) {
        room.forEachEnemyNear(p, p.x, p.y, B.howlR, (m) => {
          m.preyT = B.preyMarkT;
          room.fx('prey', m.x, m.y, { o: p.id, n: 0 });
        });
      }
      room.fx('howl', p.x, p.y, { r: B.howlR, o: p.id, n: p.tier });
      room.sfx('howl', p.x, p.y);
    }
  },

  ult(room, p) {
    p.ultT = B.ult.dur;
    p.ultExt = 0;
    room.setAnim(p, Anim.Cast, 0.8);
    room.fx('moon', p.x, p.y, { o: p.id, d: B.ult.dur });
    room.sfx('howl', p.x, p.y);
    return true;
  },

  speedMul(room, p) {
    let m = p.ultT > 0 ? B.ult.speedMul : 1;
    // Instinto depredador: perseguir a una presa herida acelera
    if (p.tier >= 1 && p.moving && room.chasingWounded(p, B.chaseR, B.preyHpFrac, B.chaseDot)) m *= B.chaseSpeedMul;
    return m;
  },
  atkSpeedMul: (_r, p) => (p.ultT > 0 ? B.ult.atkSpeedMul : 1),
  qCharges: (p) => (p.tier >= 3 ? B.qChargesT3 : 1),

  onKill(room, p) {
    if (p.ultT > 0 && p.ultExt < B.ult.maxExtend) {
      p.ultT += B.ult.extendPerKill;
      p.ultExt += B.ult.extendPerKill;
      room.fx('moon', p.x, p.y, { o: p.id, d: 0 });
    }
  },
};
