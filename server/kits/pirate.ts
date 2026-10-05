// 🏴‍☠️ Capitán Ahogado, el pirata fantasma: control y saqueo.
// - Botín maldito (pasiva): sus víctimas pueden soltar monedas o sangre.
// - Garfio (Q): atrae al enemigo hacia él (nv. 15: se impulsa hacia lo que engancha, enemigo u obstáculo).
// - Barril de pólvora (E): explota tras unos segundos o al recibir un golpe (y prende los árboles).
// - Nv. 5: anda sobre el agua en un barco fantasma, desde el que ataca a cañonazos.
// - ¡Al abordaje! (R): tres bucaneros fantasma luchan a su lado.
import { BAL } from '../../shared/balance';
import { Anim, Kind, type PowerUpType } from '../../shared/protocol';
import type { Minion, Mob, Player, Projectile } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.pirate;
const onShip = (room: Room, p: Player) => p.tier >= 1 && room.grid.deepWater(p.x, p.y);

/** Engancha: se impulsa hasta justo antes del punto (nv. 15). */
function grapple(room: Room, p: Player, x: number, y: number) {
  const d = Math.hypot(x - p.x, y - p.y);
  if (d < 50) return;
  const k = (d - 36) / d;
  room.leapTo(p, p.x + (x - p.x) * k, p.y + (y - p.y) * k, B.hook.leapT);
  room.sfx('dash', p.x, p.y);
}

export const pirateKit: Kit = {
  basic(room, p, a) {
    if (onShip(room, p)) {
      // desde el barco fantasma: cañonazo
      room.breakStealth(p);
      room.setAnim(p, Anim.Attack, 0.3);
      const pr = room.shoot('cannon', p.id, p.x + Math.cos(a) * 24, p.y + Math.sin(a) * 24, a, B.cannon.speed, B.cannon.life, room.calcDamage(p, B.cannon.dmg));
      pr.hitR = 12;
      room.sfx('explode', p.x, p.y);
      return;
    }
    room.meleeSwing(p, a, { sfx: 'claw' });
  },

  ability(room, p, slot, a) {
    room.breakStealth(p);
    if (slot === 0) {
      room.setAnim(p, Anim.Attack, 0.3);
      const pr = room.shoot('hook', p.id, p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18, a, B.hook.speed, B.hook.life, room.calcDamage(p, B.hook.dmg * room.powMult(p)));
      pr.hitR = 14;
      room.sfx('stake', p.x, p.y);
    } else {
      // barril de pólvora a sus pies, un poco por delante
      const f = room.findFreeSpot(p.x + Math.cos(a) * 36, p.y + Math.sin(a) * 36, 14);
      const m = room.spawnMinion(p, f.x, f.y, 'barrel', '', 0, B.barrel.fuse, false, B.barrel.cap);
      m.anim = Anim.Idle;
      room.sfx('slam', f.x, f.y);
    }
  },

  ult(room, p) {
    for (let i = 0; i < B.ult.n; i++) {
      const ang = (i / B.ult.n) * Math.PI * 2;
      const f = room.findFreeSpot(p.x + Math.cos(ang) * 50, p.y + Math.sin(ang) * 40, 14);
      const m = room.spawnMinion(p, f.x, f.y, 'buccaneer', p.skin, i, B.ult.life, false, B.ult.n);
      room.fx('summon', m.x, m.y, { n: 2 });
    }
    room.setAnim(p, Anim.Cast, 0.6);
    room.sfx('chant', p.x, p.y);
    p.ultT = B.ult.life;
    return true;
  },

  walksWater: (p) => p.tier >= 1,

  onProjectileHit(room, p, pr: Projectile, m: Mob) {
    if (pr.type !== 'hook' || m.dead) return;
    pr.v = 1;
    const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy) || 1;
    if (p.tier >= 3) { grapple(room, p, m.x, m.y); room.knockback(m, dx / d, dy / d, B.hook.pull * 0.4); }
    else room.knockback(m, dx / d, dy / d, Math.min(B.hook.pull, Math.max(0, d - 45)));
    room.fx('heartHit', m.x, m.y, { o: m.id, c: 'hook' });
  },

  onProjectileEnd(room, p, pr) {
    // nv. 15: si el garfio se clava en un obstáculo, se impulsa hasta él
    if (pr.type === 'hook' && pr.v !== 1 && p.tier >= 3 && room.grid.blocked(pr.x, pr.y, 6, true)) grapple(room, p, pr.x - pr.vx * 0.03, pr.y - pr.vy * 0.03);
  },

  onMinionDeath(room, p, m: Minion) {
    if (m.variant !== 'barrel') return;
    // ¡BUM!: daña y aparta a los enemigos y prende lo que pille
    const R = p.tier >= 3 ? B.barrel.rT3 : B.barrel.r;
    room.forEachEnemyNear(p, m.x, m.y, R, (t) => {
      if (t === m || t.dead) return;
      room.damage(t, room.calcDamage(p, B.barrel.dmg * room.powMult(p)), room.src(p));
      const d = Math.hypot(t.x - m.x, t.y - m.y) || 1;
      room.knockback(t, (t.x - m.x) / d, (t.y - m.y) / d, B.barrel.knock);
    });
    room.ignite(m.x, m.y, R * 0.7, p.id);
    room.fx('fatboom', m.x, m.y, { r: R, o: m.id, c: 'powder' });
    room.sfx('explode', m.x, m.y);
  },

  onKill(room, p, v) {
    // Botín maldito
    if (v.kind === Kind.Minion || Math.random() > B.lootChance) return;
    const type: PowerUpType = Math.random() < 0.5 ? 'coin' : 'blood';
    room.dropPowerUp(v.x, v.y, type);
    room.fx('mimic', v.x, v.y, { c: 'loot' });
  },
};
