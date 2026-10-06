// 🦖 Dinozombie: cambiaformas jurásico. La Q cambia de forma; cada forma tiene su básico, su pasiva y su E.
// - Velociraptor: mordiscos rápidos · corre más al perseguir · E: salta sobre un objetivo (daño en área).
// - Tricerátops: cornada amplia y lenta · muy resistente (y casi no le frenan ni aturden) · E: carga que empuja y aturde.
// - Pterodáctilo: dispara huevos · vuela por encima del agua y los obstáculos · E: remolino que daña poco y empuja.
// - Carne prehistórica (nv. 5): cambiar de forma cura un poco y da un bonus breve según la nueva forma.
// - Extinción (R): se convierte en huevo (intocable) y cae un asteroide que quema una gran zona; sale con otra forma.
// - Nv. 15: cada forma mejora su E y el cambio de forma recarga antes.
import { BAL } from '../../shared/balance';
import { Anim } from '../../shared/protocol';
import type { Mob, Player } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.dino;
export const RAPTOR = 0, TRIKE = 1, PTERO = 2;
const form = (p: Player) => p.k.form ?? RAPTOR;
const inEgg = (room: Room, p: Player) => (p.k.eggEnd ?? 0) > room.time;
const bonus = (room: Room, p: Player) => (p.k.bonusEnd ?? 0) > room.time;
/** Las ralentizaciones le afectan la mitad: compensa el multiplicador que ya aplicó la sala. */
const halfSlow = (p: Player) => (p.slowT > 0 && p.slowMul < 1 ? (1 + p.slowMul) / (2 * p.slowMul) : 1);

function setForm(room: Room, p: Player, f: number) {
  if (form(p) === PTERO && f !== PTERO) p.flyT = Math.min(p.flyT, 0.01); // aterriza
  p.k.form = f;
  room.fx('shapeshift', p.x, p.y, { o: p.id, n: f });
  room.sfx('poof', p.x, p.y);
  if (p.tier >= 1) {
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * B.shiftHeal);
    p.k.bonusEnd = room.time + B.bonusT;
  }
}

export const dinoKit: Kit = {
  basic(room, p, a) {
    if (inEgg(room, p)) { p.cd[0] = 0.1; return; }
    const f = form(p);
    if (f === PTERO) {
      room.breakStealth(p);
      room.setAnim(p, Anim.Attack, 0.3);
      const E = B.ptero.egg;
      const pr = room.shoot('egg', p.id, p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16, a, E.speed, E.life, room.calcDamage(p, E.dmg));
      pr.hitR = 12;
      room.sfx('poof', p.x, p.y);
      return;
    }
    p.k.swing = 1;
    room.meleeSwing(p, a, { sfx: f === TRIKE ? 'punch' : 'bite', rangeMul: f === TRIKE ? B.trike.rangeMul : 1 });
    p.k.swing = 0;
  },

  ability(room, p, slot, a) {
    if (inEgg(room, p)) { p.cd[slot + 1] = 0.2; return; }
    room.breakStealth(p);
    if (slot === 0) {
      setForm(room, p, (form(p) + 1) % 3);
      if (p.tier >= 3) p.cd[1] = Math.min(p.cd[1], B.shiftCdT3);
      return;
    }
    const f = form(p);
    if (f === RAPTOR) {
      // salto sobre el enemigo más cercano al puntero
      const L = B.raptor.leap;
      const d = Math.min(p.input.d, L.range);
      const ax = p.x + Math.cos(a) * d, ay = p.y + Math.sin(a) * d;
      let best: Mob | null = null, bd = L.pick ** 2;
      room.forEachEnemyNear(p, ax, ay, L.pick, (m) => { if (m.dead) return; const dd = (m.x - ax) ** 2 + (m.y - ay) ** 2; if (dd < bd && Math.hypot(m.x - p.x, m.y - p.y) < L.range + 60) { bd = dd; best = m; } });
      const t = best as Mob | null;
      room.leapTo(p, t ? t.x : ax, t ? t.y : ay, L.t);
      p.k.pounce = 1;
      room.setAnim(p, Anim.Attack, L.t);
      room.sfx('dash', p.x, p.y);
    } else if (f === TRIKE) {
      // carga frontal larga: empuja y aturde
      const C = B.trike.charge;
      p.dash = { t: p.tier >= 3 ? C.tT3 : C.t, dx: Math.cos(a), dy: Math.sin(a), hit: new Set(), speed: p.def.speed * C.speedMul, dmg: C.dmg * room.powMult(p), knock: C.knock, stun: C.stun };
      room.setAnim(p, Anim.Attack, 0.5);
      room.fx('dash', p.x, p.y, { r: a });
      room.sfx('dash', p.x, p.y);
    } else {
      // remolino (nv. 15: dos)
      const T = B.ptero.twister;
      const n = p.tier >= 3 ? T.nT3 : 1;
      for (let i = 0; i < n; i++) {
        const aa = a + (n > 1 ? (i - 0.5) * 0.45 : 0);
        const pr = room.shoot('twister', p.id, p.x + Math.cos(aa) * 20, p.y + Math.sin(aa) * 20, aa, T.speed, T.life, room.calcDamage(p, T.dmg));
        pr.pierce = true; pr.ghost = true; pr.hitSet = new Set(); pr.hitR = 30;
      }
      room.setAnim(p, Anim.Cast, 0.4);
      room.sfx('poof', p.x, p.y);
    }
  },

  ult(room, p) {
    // Extinción: huevo, asteroide y forma nueva
    const U = B.ult;
    p.k.eggEnd = room.time + U.egg;
    p.mistT = Math.max(p.mistT, U.egg + 0.1);
    p.dash = null; p.leap = null;
    p.flyT = Math.min(p.flyT, 0.01);
    const x = p.x, y = p.y;
    room.fx('asteroid', x, y, { r: U.r, d: U.egg, o: p.id });
    room.sfx('thunder', x, y);
    room.later(U.egg, () => {
      room.forEachEnemyNear(p, x, y, U.r, (m) => {
        if (m.dead) return;
        room.damage(m, room.calcDamage(p, U.dmg * room.powMult(p)), room.src(p));
        room.burn(m, U.burnT, U.burnDps, p);
        const d = Math.hypot(m.x - x, m.y - y) || 1;
        room.knockback(m, (m.x - x) / d, (m.y - y) / d, 140);
      });
      room.addZone({ kind: 'fire', ax: x, ay: y, bx: x, by: y, w: U.r * 1.5, until: room.time + U.fireT, owner: p.id, v: U.burnDps });
      room.ignite(x, y, U.r, p.id);
      room.fx('fireBoom', x, y, { r: U.r, o: p.id });
      room.sfx('explode', x, y);
      if (p.dead) return;
      const next = [RAPTOR, TRIKE, PTERO].filter((f) => f !== form(p));
      setForm(room, p, next[Math.floor(Math.random() * next.length)]);
      room.fx('hatch', p.x, p.y, { o: p.id });
    });
    room.setAnim(p, Anim.Cast, U.egg);
    p.ultT = U.egg;
    return true;
  },

  speedMul(room, p) {
    if (inEgg(room, p)) return 0;
    const f = form(p);
    let m = 1;
    if (f === RAPTOR) {
      if (room.chasingWounded(p, B.raptor.chaseR, 1.01, B.raptor.chaseDot)) m *= B.raptor.chaseMul;
      if (bonus(room, p)) m *= 1.25;
    }
    if (f === TRIKE) m *= halfSlow(p);
    return m;
  },
  atkSpeedMul: (room, p) => {
    const f = form(p);
    const base = f === RAPTOR ? B.raptor.atkMul : f === TRIKE ? B.trike.atkMul : B.ptero.atkMul;
    return base * (f === PTERO && bonus(room, p) ? 0.7 : 1);
  },
  damageTakenMul: (room, p) => (form(p) === TRIKE ? B.trike.armorMul * (bonus(room, p) ? 0.7 : 1) : 1),
  onDealDamage: (_room, p, _t, amount) => (p.k.swing ? amount * (form(p) === TRIKE ? B.trike.dmgMul : B.raptor.dmgMul) : amount),

  onLand(room, p) {
    if (!p.k.pounce) return;
    p.k.pounce = 0;
    const L = B.raptor.leap, R = p.tier >= 3 ? L.rT3 : L.r;
    room.forEachEnemyNear(p, p.x, p.y, R, (m) => { if (!m.dead) room.damage(m, room.calcDamage(p, L.dmg * room.powMult(p)), room.src(p)); });
    room.fx('leapLand', p.x, p.y, { o: p.id, r: R });
    room.sfx('bite', p.x, p.y);
  },

  onProjectileHit(room, p, pr, m) {
    if (pr.type !== 'twister' || m.dead) return;
    const sp = Math.hypot(pr.vx, pr.vy) || 1;
    room.knockback(m, pr.vx / sp, pr.vy / sp, B.ptero.twister.knock);
  },

  tick(room, p, dt) {
    // tricerátops: los aturdimientos se le pasan antes
    if (form(p) === TRIKE && p.stunT > 0) p.stunT = Math.max(0, p.stunT - dt * (1 / B.trike.ccMul - 1));
    // pterodáctilo: vuela (por encima del agua y los obstáculos)
    if (form(p) === PTERO && !inEgg(room, p) && !p.dead) p.flyT = Math.max(p.flyT, 0.3);
  },

  buffs(room, p, add, list) {
    list.push({ t: ['raptor', 'trike', 'ptero'][form(p)], r: 999 });
    if (inEgg(room, p)) add('egg', p.k.eggEnd - room.time);
    if (bonus(room, p)) add('prehistoric', p.k.bonusEnd - room.time);
  },
};
