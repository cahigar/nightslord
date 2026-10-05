// 🧹 Hécuba, la bruja del pantano: pociones al azar, escoba y maleficio.
import { BAL } from '../../shared/balance';
import { Anim, Kind, type ProjectileType } from '../../shared/protocol';
import type { Player, Projectile } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.witch;
/** Tipos de poción: 0 fuego · 1 ácido · 2 rabia (la rabia solo sale en la Q). */
const FIRE = 0, ACID = 1, RAGE = 2;

/** Lanza un frasco que revienta en el punto apuntado. */
function throwPotion(room: Room, p: Player, a: number, big: boolean) {
  const kind = Math.floor(Math.random() * (big ? 3 : 2));
  const d = Math.max(60, Math.min(p.input.d, B.potion.range));
  const type = `${big ? 'bigpotion' : 'potion'}${kind}` as ProjectileType;
  const pr = room.shoot(type, p.id, p.x, p.y, a, B.potion.speed, d / B.potion.speed, 0);
  pr.land = true; pr.ghost = true; pr.v = kind;
  room.setAnim(p, Anim.Attack, 0.3);
  room.sfx('brew', p.x, p.y);
}

function splash(room: Room, p: Player, pr: Projectile) {
  const big = pr.type.startsWith('big');
  const kind = pr.v ?? FIRE;
  const mul = (big ? B.big.mul : 1) * room.powMult(p);
  const R = big ? (p.tier >= 3 ? B.big.rT3 : B.big.r) : p.tier >= 3 ? B.potion.rT3 : B.potion.r;
  if (kind === FIRE) {
    // fuego: el suelo arde unos segundos
    const t = p.tier >= 1 ? B.fire.tT1 : B.fire.t;
    room.addZone({ kind: 'fire', ax: pr.x, ay: pr.y, bx: pr.x, by: pr.y, w: R * 2, until: room.time + t, owner: p.id, v: B.fire.dps * mul });
  }
  room.forEachEnemyNear(p, pr.x, pr.y, R, (m) => {
    if (kind === ACID) {
      room.damage(m, room.calcDamage(p, B.acid.dmg * mul), room.src(p));
      room.poison(m, p.tier >= 1 ? B.acid.poisonTT1 : B.acid.poisonT, B.acid.poisonDps * mul, p);
    } else if (kind === RAGE) {
      // todos atacan a lo más cercano... y eso la incluye a ella
      room.rage(m, m.kind === Kind.Player ? B.rage.tPlayer : B.rage.tOther, p, false);
    }
  });
  room.fx(kind === RAGE ? 'rage' : 'potion', pr.x, pr.y, { r: R, n: kind, o: p.id });
  room.sfx('glass', pr.x, pr.y);
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
      if (p.flyT > 0 && p.tier < 3) { p.qCharges++; return; } // no gasta la carga
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
    // Maleficio: un gran charco embrujado; quien lo pisa se convierte en animalillo. Recarga las 3 pociones.
    const d = Math.min(p.input.d, B.ult.range);
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    room.addZone({ kind: 'hex', ax: x, ay: y, bx: x, by: y, w: B.ult.r * 2, until: room.time + B.ult.zoneT, owner: p.id });
    p.qCharges = B.big.charges;
    p.cd[1] = 0;
    room.setAnim(p, Anim.Cast, 0.6);
    room.fx('hexzone', x, y, { r: B.ult.r, o: p.id });
    room.sfx('brew', x, y);
    p.ultT = B.ult.zoneT;
    return true;
  },

  qCharges: () => B.big.charges,
  speedMul: (_room, p) => (p.flyT > 0 ? B.broom.speedMul : 1),
  powerupTimeMul: (p) => (p.tier >= 3 ? B.powerupTimeT3 : 1),

  onProjectileEnd(room, p, pr) {
    if (pr.land) splash(room, p, pr);
  },
};
