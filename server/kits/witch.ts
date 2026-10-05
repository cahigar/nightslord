// 🧹 Hécuba, la bruja del pantano: pociones que cambian, escoba y rabia.
import { BAL } from '../../shared/balance';
import { Anim, type ProjectileType } from '../../shared/protocol';
import type { Player, Projectile } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.witch;
/** 0 fuego · 1 ácido · 2 maleficio */
const NAMES = ['fuego', 'ácido', 'maleficio'];

/** Lanza un frasco que revienta en el punto apuntado. */
function throwPotion(room: Room, p: Player, a: number, big: boolean) {
  const kind = (p.k.cycle ?? 0) % 3;
  p.k.cycle = kind + 1;
  const d = Math.max(60, Math.min(p.input.d, B.potion.range));
  const type = `${big ? 'bigpotion' : 'potion'}${kind}` as ProjectileType;
  const pr = room.shoot(type, p.id, p.x, p.y, a, B.potion.speed, d / B.potion.speed, 0);
  pr.land = true; pr.ghost = true; pr.v = kind;
  room.setAnim(p, Anim.Attack, 0.3);
  room.sfx('brew', p.x, p.y);
}

function splash(room: Room, p: Player, pr: Projectile) {
  const big = pr.type.startsWith('big');
  const kind = pr.v ?? 0;
  const mul = (big ? B.big.mul : 1) * room.powMult(p);
  const R = big ? B.big.r : p.tier >= 1 ? B.potion.rT1 : B.potion.r;
  const longer = p.tier >= 1 ? 1.4 : 1;
  if (kind === 0) {
    // fuego: charco en llamas
    const t = (p.tier >= 1 ? B.fire.tT1 : B.fire.t);
    room.addZone({ kind: 'fire', ax: pr.x, ay: pr.y, bx: pr.x, by: pr.y, w: R * 2, until: room.time + t, owner: p.id, v: B.fire.dps * mul });
  }
  room.forEachEnemyNear(p, pr.x, pr.y, R, (m) => {
    if (kind === 1) { room.damage(m, room.calcDamage(p, B.acid.dmg * mul), room.src(p)); room.slow(m, B.acid.slowT * longer, B.acid.slowMul); }
    else if (kind === 2) {
      room.damage(m, room.calcDamage(p, B.hex.dmg * mul), room.src(p));
      m.weakT = Math.max(m.weakT, B.hex.weakT * longer);
      m.vulnT = Math.max(m.vulnT, B.hex.vulnT * longer); m.vulnMul = Math.max(m.vulnMul, B.hex.vulnMul);
    }
  });
  room.fx('potion', pr.x, pr.y, { r: R, n: kind, o: p.id });
  room.sfx('glass', pr.x, pr.y);
  void NAMES;
}

export const witchKit: Kit = {
  basic(room, p, a) {
    if (p.flyT > 0 && p.tier < 3) { p.cd[0] = 0.1; return; } // en escoba solo a nivel 15
    room.breakStealth(p);
    throwPotion(room, p, a, false);
  },

  ability(room, p, slot, a) {
    room.breakStealth(p);
    if (slot === 0) {
      if (p.flyT > 0 && p.tier < 3) { p.cd[1] = 0.2; return; }
      throwPotion(room, p, a, true);
    } else {
      // Escoba: vuela por encima de todo y aterriza en un hueco libre
      p.flyT = p.tier >= 3 ? B.broom.tT3 : B.broom.t;
      p.dash = null; p.knock = null;
      room.fx('broom', p.x, p.y, { o: p.id, n: 1 });
      room.sfx('poof', p.x, p.y);
    }
  },

  ult(room, p, a) {
    // Poción de rabia: todos en el área atacan a lo más cercano; sus bajas cuentan para ella
    const d = Math.min(p.input.d, B.ult.range);
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    const R = B.ult.r;
    for (const n of room.npcs.values()) if ((n.x - x) ** 2 + (n.y - y) ** 2 < R * R) room.rage(n, B.ult.tOther, p);
    for (const h of room.hunters.values()) if ((h.x - x) ** 2 + (h.y - y) ** 2 < R * R) room.rage(h, B.ult.tOther, p);
    for (const m of room.minions.values()) if ((m.x - x) ** 2 + (m.y - y) ** 2 < R * R) room.rage(m, B.ult.tOther, p);
    for (const o of room.players.values()) if (o !== p && !o.dead && o.protectT <= 0 && (o.x - x) ** 2 + (o.y - y) ** 2 < R * R) room.rage(o, B.ult.tPlayer, p);
    room.setAnim(p, Anim.Cast, 0.6);
    room.fx('rage', x, y, { r: R, o: p.id, tx: Math.round(p.x), ty: Math.round(p.y) });
    room.sfx('brew', x, y);
    p.ultT = B.ult.tOther;
    return true;
  },

  speedMul: (_room, p) => (p.flyT > 0 ? B.broom.speedMul : 1),
  powerupMul: () => B.powerupMul,

  onProjectileEnd(room, p, pr) {
    if (pr.land) splash(room, p, pr);
  },
};
