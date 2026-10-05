// 💋 Lilith, la súcubo: roba vida, enamora a los humanos (que luchan por ella), vuela y desata la pasión.
import { BAL, ULT } from '../../shared/balance';
import { Anim, Kind } from '../../shared/protocol';
import type { Minion, Mob, Npc, Player } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.succubus;

const thralls = (room: Room, p: Player): Minion[] => room.minionsOf(p.id).filter((m) => m.variant === 'thrall').sort((a, b) => a.born - b.born);
const capOf = (p: Player) => (p.tier >= 1 ? B.thrallCapT1 : B.thrallCap);
/** Humano que se puede engatusar (no los disfrazados de la Dama ni los infectados). */
const charmable = (m: Mob): m is Npc => m.kind === Kind.Npc && !m.dead && (m as Npc).disguiseT <= 0 && (m as Npc).infectT <= 0;

/** El humano golpeado no muere: se enamora y lucha por ella. Si ya tiene todos sus siervos, el más antiguo vuelve en sí. */
function enthrall(room: Room, p: Player, n: Npc) {
  const mine = thralls(room, p);
  if (mine.length >= capOf(p)) room.freeThrall(mine[0]);
  room.npcs.delete(n.id);
  n.dead = true;
  const t = room.spawnMinion(p, n.x, n.y, 'thrall', n.variant, n.id % 97, p.tier >= 1 ? B.thrallLifeT1 : B.thrallLife, false, capOf(p));
  room.fx('thrall', t.x, t.y, { o: t.id, tx: Math.round(p.x), ty: Math.round(p.y) });
  room.reward(p, 7, 6, 0); // cada conquista da algo de experiencia y puntos
  room.chargeUlt(p, ULT.npc);
}

export const succubusKit: Kit = {
  basic(room, p, a) {
    const res = room.meleeSwing(p, a, { sfx: 'charm' });
    for (const h of res.hits) if (charmable(h.m)) enthrall(room, p, h.m);
  },

  ability(room, p, slot, a) {
    room.breakStealth(p);
    if (slot === 0) {
      // Flechazo: corazón que daña, atrae al objetivo y lo deja embobado
      room.setAnim(p, Anim.Attack, 0.3);
      const pr = room.shoot('heart', p.id, p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16, a, B.heart.speed, B.heart.life, room.calcDamage(p, B.heart.dmg * room.powMult(p)));
      pr.hitR = 14;
      if (p.tier >= 3) { pr.pierce = true; pr.hitSet = new Set(); }
      room.sfx('charm', p.x, p.y);
    } else {
      // Alas: vuela por encima de los obstáculos, más rápida
      p.flyT = p.tier >= 3 ? B.wings.tT3 : B.wings.t;
      p.dash = null; p.knock = null;
      room.fx('wings', p.x, p.y, { o: p.id, n: 1 });
      room.sfx('bat', p.x, p.y);
    }
  },

  ult(room, p, a) {
    // Pasión desatada: en el área todos atacan a lo más cercano, pero nunca a ella. Las bajas cuentan para ella.
    const d = Math.min(p.input.d, B.ult.range);
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d, r2 = B.ult.r ** 2;
    const inside = (m: Mob) => (m.x - x) ** 2 + (m.y - y) ** 2 < r2;
    for (const n of room.npcs.values()) if (inside(n)) room.rage(n, B.ult.tOther, p);
    for (const h of room.hunters.values()) if (inside(h)) room.rage(h, B.ult.tOther, p);
    for (const m of room.minions.values()) if (m.owner !== p.id && inside(m)) room.rage(m, B.ult.tOther, p);
    for (const o of room.players.values()) if (o !== p && !o.dead && o.protectT <= 0 && inside(o)) room.rage(o, B.ult.tPlayer, p);
    room.setAnim(p, Anim.Cast, 0.6);
    room.fx('rage', x, y, { r: B.ult.r, o: p.id, c: 'love' });
    room.sfx('charm', x, y);
    p.ultT = B.ult.tOther;
    return true;
  },

  qCharges: (p) => (p.tier >= 3 ? B.heartChargesT3 : 1),
  speedMul: (_room, p) => (p.flyT > 0 ? B.wings.speedMul : 1),

  onDealDamage(_room, p, t, amount) {
    if (charmable(t)) return 0; // a los humanos no los mata: los enamora
    p.hp = Math.min(p.maxHp, p.hp + amount * (p.tier >= 1 ? B.lifestealT1 : B.lifesteal));
    return amount;
  },

  onProjectileHit(room, p, pr, m) {
    if (pr.type !== 'heart' || m.dead) return;
    if (charmable(m)) { enthrall(room, p, m); return; }
    const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy) || 1;
    room.knockback(m, dx / d, dy / d, Math.min(B.heart.pull, Math.max(0, d - 50)));
    room.charm(m, B.heart.charmT, p);
    room.fx('heartHit', m.x, m.y, { o: m.id });
  },
};
