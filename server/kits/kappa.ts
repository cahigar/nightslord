// 🥒 Kappa: luchador acuático y ladrón travieso.
// - Criatura del agua (pasiva): cruza el agua profunda y en cualquier agua (también charcas y su remolino) corre más y se regenera.
// - Zarpazo de río: ataque rápido cuerpo a cuerpo.
// - Lengua acuática (Q): atrae ligeramente al objetivo.
// - Cuenco sagrado (E): se agacha y rellena el agua de su cabeza: se cura y aguanta más; un golpe fuerte lo interrumpe.
// - Ladrón travieso (nv. 5): al golpear por la espalda roba parte de la velocidad del enemigo.
// - Remolino del río (R): un gran remolino arrastra a los enemigos al centro; él se mueve libre dentro.
// - Nv. 15: de vez en cuando una nube llueve cerca de él y deja una poza.
import { BAL } from '../../shared/balance';
import { Anim } from '../../shared/protocol';
import type { Mob, Player } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.kappa;
const bowling = (room: Room, p: Player) => (p.k.bowlEnd ?? 0) > room.time;

function stopBowl(room: Room, p: Player) {
  p.k.bowlEnd = 0; p.rootT = 0;
  room.fx('splash', p.x, p.y, { r: 50 });
}

export const kappaKit: Kit = {
  basic(room, p, a) {
    if (bowling(room, p)) stopBowl(room, p);
    const res = room.meleeSwing(p, a, { sfx: 'claw' });
    if (p.tier < 1) return;
    // Ladrón travieso: golpe por la espalda (el objetivo mira hacia el otro lado)
    for (const h of res.hits) {
      const m: Mob = h.m;
      if (m.dead || (p.x - m.x) * m.facing >= 0) continue;
      room.slow(m, B.steal.t, B.steal.slowMul);
      p.k.stealEnd = room.time + B.steal.t;
      room.fx('drain', m.x, m.y, { tx: Math.round(p.x), ty: Math.round(p.y), o: p.id, n: 1, c: 'water' });
    }
  },

  ability(room, p, slot, a) {
    room.breakStealth(p);
    if (slot === 0) {
      if (bowling(room, p)) stopBowl(room, p);
      room.setAnim(p, Anim.Attack, 0.3);
      const pr = room.shoot('tongue', p.id, p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16, a, B.tongue.speed, B.tongue.life, room.calcDamage(p, B.tongue.dmg * room.powMult(p)));
      pr.hitR = 12;
      room.sfx('splash', p.x, p.y);
    } else {
      // Cuenco sagrado
      p.k.bowlEnd = room.time + B.bowl.t;
      p.rootT = Math.max(p.rootT, B.bowl.t);
      p.dash = null;
      room.setAnim(p, Anim.Cast, B.bowl.t);
      room.fx('bowl', p.x, p.y, { o: p.id, d: B.bowl.t });
      room.sfx('bubble', p.x, p.y);
    }
  },

  ult(room, p) {
    room.addZone({ kind: 'whirl', ax: p.x, ay: p.y, bx: p.x, by: p.y, w: B.ult.r * 2, until: room.time + B.ult.t, owner: p.id });
    room.setAnim(p, Anim.Cast, 0.6);
    room.fx('splash', p.x, p.y, { r: B.ult.r });
    room.sfx('splash', p.x, p.y);
    p.ultT = B.ult.t;
    return true;
  },

  speedMul: (room, p) => ((p.k.stealEnd ?? 0) > room.time ? B.steal.speedMul : 1),
  damageTakenMul: (room, p) => (bowling(room, p) ? B.bowl.armorMul : 1),

  onHurt(room, p, amount) {
    if (bowling(room, p) && amount >= p.maxHp * B.bowl.breakFrac) stopBowl(room, p); // un golpe fuerte vuelca el cuenco
  },

  onProjectileHit(room, p, pr, m) {
    if (pr.type !== 'tongue' || m.dead) return;
    const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy) || 1;
    room.knockback(m, dx / d, dy / d, Math.min(B.tongue.pull, Math.max(0, d - 45)));
  },

  tick(room, p, dt) {
    if (bowling(room, p)) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * B.bowl.heal * dt);
    // nv. 15: nubes que llueven cerca y dejan una poza
    if (p.tier < 3) return;
    p.k.rainT = (p.k.rainT ?? B.rain.every) - dt;
    if (p.k.rainT > 0) return;
    p.k.rainT = B.rain.every * (0.7 + Math.random() * 0.6);
    const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * B.rain.near;
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d * 0.7;
    room.fx('rain', x, y, { r: B.rain.r, d: B.rain.t, o: p.id });
    room.later(B.rain.t, () => { room.puddle(p.id, x, y, B.rain.r, B.rain.puddleT); room.fx('splash', x, y, { r: B.rain.r }); });
  },
};
