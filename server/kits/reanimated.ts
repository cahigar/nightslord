// ⚡ Reanimado: cadáver cosido y galvanizado. Aguanta, empuja y atrae rayos.
import { BAL } from '../../shared/balance';
import { Anim } from '../../shared/protocol';
import type { Player, Projectile, Zone } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.reanimated;
const BOULDERS: Record<string, number> = { elm: 0, transylvania: 1, camp: 2 }; // piedra · lápida · tronco

/** Rayo sobre un clavo: daña alrededor y, si el dueño está cerca, el clavo vuelve a él atravesando enemigos. */
function strike(room: Room, p: Player, z: Zone) {
  room.fx('lightning', z.ax, z.ay, { o: p.id });
  room.sfx('thunder', z.ax, z.ay);
  room.forEachEnemyNear(p, z.ax, z.ay, B.nail.strikeR, (m) => room.damage(m, room.calcDamage(p, B.nail.strikeDmg), room.src(p)));
  room.electrify(z.ax, z.ay, p);
  if (Math.hypot(p.x - z.ax, p.y - z.ay) > B.nail.returnR || p.dead) return;
  room.zones = room.zones.filter((o) => o !== z);
  const a = Math.atan2(p.y - z.ay, p.x - z.ax);
  const pr = room.shoot('nailback', p.id, z.ax, z.ay, a, B.nail.returnSpeed, 3, room.calcDamage(p, B.nail.returnDmg));
  pr.pierce = true; pr.ghost = true; pr.hitSet = new Set(); pr.home = p.id; pr.hitR = 16;
}

export const reanimatedKit: Kit = {
  basic(room, p, a) {
    // nivel 15: si no hay nadie a mano, lanza lo que tenga cerca (piedra, lápida o tronco)
    if (p.tier >= 3 && !room.nearestEnemy(p, p.x, p.y, B.boulder.meleeCheck + p.def.range, -1)) {
      room.breakStealth(p);
      room.setAnim(p, Anim.Attack, 0.35);
      const pr = room.shoot('boulder', p.id, p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, a, B.boulder.speed, B.boulder.life, room.calcDamage(p, B.boulder.dmg));
      pr.v = BOULDERS[room.theme] ?? 0;
      room.sfx('slam', p.x, p.y);
      return;
    }
    room.meleeSwing(p, a, { sfx: 'punch' });
  },

  ability(room, p, slot, a) {
    room.breakStealth(p);
    if (slot === 0) {
      // Sacudida: golpe al suelo que aleja
      room.setAnim(p, Anim.Attack, 0.4);
      room.forEachEnemyNear(p, p.x, p.y, B.slam.r, (m) => {
        room.damage(m, room.calcDamage(p, B.slam.dmg * room.powMult(p)), room.src(p));
        const d = Math.hypot(m.x - p.x, m.y - p.y) || 1;
        room.knockback(m, (m.x - p.x) / d, (m.y - p.y) / d, B.slam.knock);
      });
      room.fx('slam', p.x, p.y, { r: B.slam.r, o: p.id });
      room.sfx('slam', p.x, p.y);
    } else {
      // Clavo pararrayos
      room.setAnim(p, Anim.Attack, 0.3);
      const pr = room.shoot('nail', p.id, p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16, a, B.nail.speed, B.nail.life, room.calcDamage(p, B.nail.dmg));
      pr.hitR = 10;
      room.sfx('stake', p.x, p.y);
    }
  },

  ult(room, p) {
    room.setAnim(p, Anim.Cast, 0.8);
    room.addZone({ kind: 'storm', ax: p.x, ay: p.y, bx: p.x, by: p.y, w: B.ult.r * 2, until: room.time + B.ult.t, owner: p.id });
    room.fx('storm', p.x, p.y, { r: B.ult.r, d: B.ult.t, o: p.id });
    room.sfx('thunder', p.x, p.y);
    p.ultT = B.ult.t;
    return true;
  },

  eCharges: () => B.qChargesNail,

  tick(room, p, dt) {
    // regeneración galvánica si lleva un rato sin recibir daño
    if (room.time - p.lastHurtT >= B.regenSafeT && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * B.regen * dt);
    // rayos sobre los clavos (cada 5 s)
    for (const z of room.zones) {
      if (z.kind !== 'nail' || z.owner !== p.id) continue;
      if (z.next === undefined) z.next = z.born + B.nail.every;
      if (room.time >= z.next) { z.next += B.nail.every; strike(room, p, z); }
    }
    // relámpagos aleatorios dentro de su tormenta (solo visual + un poco de daño extra)
    if (p.ultT > 0 && Math.random() < dt * 2.5) {
      const st = room.zones.find((z) => z.kind === 'storm' && z.owner === p.id);
      if (st) {
        const ang = Math.random() * Math.PI * 2, r = Math.random() * st.w * 0.45;
        const x = st.ax + Math.cos(ang) * r, y = st.ay + Math.sin(ang) * r * 0.7;
        room.fx('lightning', x, y, { o: p.id, n: 1 });
        room.forEachEnemyNear(p, x, y, 50, (m) => room.damage(m, room.calcDamage(p, 0.5), room.src(p)));
        room.electrify(x, y, p);
      }
    }
  },

  // Sobrecarga (nv. 5): al acumular daño, descarga eléctrica que aturde
  onHurt(room, p, amount) {
    if (p.tier < 1) return;
    p.k.hurt = (p.k.hurt ?? 0) + amount;
    if (p.k.hurt < p.maxHp * B.overload.frac) return;
    p.k.hurt = 0;
    room.forEachEnemyNear(p, p.x, p.y, B.overload.r, (m) => {
      room.damage(m, room.calcDamage(p, B.overload.dmg), room.src(p));
      m.stunT = Math.max(m.stunT, B.overload.stun);
    });
    room.fx('spark', p.x, p.y, { r: B.overload.r, o: p.id });
    room.electrify(p.x, p.y, p);
    room.sfx('zap', p.x, p.y);
  },

  onProjectileEnd(room, p, pr: Projectile) {
    if (pr.type !== 'nail') return;
    // el clavo se queda clavado donde termina
    let x = pr.x, y = pr.y;
    if (room.grid.blocked(x, y, 4, true)) { x -= pr.vx * 0.03; y -= pr.vy * 0.03; }
    room.addZone({ kind: 'nail', ax: x, ay: y, bx: x, by: y, w: 20, until: room.time + B.nail.stayT, owner: p.id });
    room.fx('shards', x, y, { n: 3 });
  },
};
