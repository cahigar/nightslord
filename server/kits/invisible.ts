// 👻 La Dama Velada: la Mujer Invisible. Paciencia, invisibilidad, movilidad y emboscada.
import { BAL } from '../../shared/balance';
import { Anim } from '../../shared/protocol';
import type { Player } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.invisible;

function goInvisible(room: Room, p: Player, kind: 'timed' | 'auto' | 'full', t: number) {
  p.invisKind = kind;
  p.invisT = t;
  p.invisBonus = true;
  p.protectT = 0;
  if (kind !== 'full') room.fx('vanish', p.x, p.y, { o: p.id });
}

export const invisibleKit: Kit = {
  basic(room, p, a) {
    const { total, fromInvis } = room.meleeSwing(p, a, { sfx: 'punch' });
    p.lastAtkFromInvis = fromInvis;
    // al golpear se intuye un instante su silueta transparente
    if (total > 0) room.fx('ghosthit', p.x, p.y, { r: +a.toFixed(2), o: p.id, s: p.skin });
  },

  ability(room, p, slot) {
    if (slot === 0) {
      // Desvestirse: la ropa cae al suelo y queda totalmente invisible
      room.fx('undress', p.x, p.y, { o: p.id, s: p.skin, r: p.facing });
      goInvisible(room, p, 'full', B.undressT * room.powMult(p));
      room.sfx('vanish', p.x, p.y);
    } else {
      // Frenesí invisible: no rompe la invisibilidad
      p.frenzyT = B.frenzyT * room.powMult(p);
      if (p.invisKind === 'none') { room.fx('frenzy', p.x, p.y, { o: p.id }); room.sfx('dash', p.x, p.y); }
    }
  },

  ult(room, p) {
    const n = room.disguiseAround(p, B.ult.radius, B.ult.dur);
    room.setAnim(p, Anim.Cast, 0.6);
    room.fx('disguise', p.x, p.y, { r: B.ult.radius, o: p.id, n });
    return true;
  },

  tick(room, p, dt) {
    p.frenzyT = Math.max(0, p.frenzyT - dt);
    // Presencia Ausente: invisible indefinidamente tras un rato sin combatir
    if (p.tier >= 1 && p.invisKind === 'none' && p.reinvisT <= 0 && room.time - p.lastCombatT >= B.autoInvisAfter) {
      goInvisible(room, p, 'auto', Infinity);
    }
    if (p.reinvisT > 0) {
      p.reinvisT -= dt;
      if (p.reinvisT <= 0 && p.invisKind === 'none') goInvisible(room, p, 'timed', B.killInvisT);
    }
  },

  speedMul: (_r, p) => (p.frenzyT > 0 ? B.frenzySpeedMul : 1),
  atkSpeedMul: (_r, p) => (p.frenzyT > 0 ? B.frenzyAtkSpeedMul : 1),

  // Desaparición Perfecta
  onKill(room, p) {
    if (p.tier < 3) return;
    if (p.lastAtkFromInvis) { p.reinvisT = B.reappearT; room.fx('reveal', p.x, p.y, { o: p.id }); }
    else if (p.invisKind === 'none') goInvisible(room, p, 'timed', B.killInvisT);
  },
};
