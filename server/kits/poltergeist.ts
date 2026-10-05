// 👻 Poltergeist: fantasma que levita, se vuelve intangible y hace volar los objetos de la zona.
import { BAL } from '../../shared/balance';
import { Anim, type ProjectileType } from '../../shared/protocol';
import type { Mob, Player } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.poltergeist;

/** Un objeto sale disparado desde un punto cualquiera alrededor del objetivo (no desde el fantasma). */
function hurl(room: Room, p: Player, tx: number, ty: number, dmgMul: number) {
  let sx = tx, sy = ty;
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2, d = B.obj.spawnMin + Math.random() * (B.obj.spawnMax - B.obj.spawnMin);
    sx = tx + Math.cos(a) * d; sy = ty + Math.sin(a) * d * 0.8;
    if (!room.grid.blocked(sx, sy, 6, true)) break;
  }
  const type = `obj${Math.floor(Math.random() * 4)}` as ProjectileType;
  const life = Math.hypot(tx - sx, ty - sy) / B.obj.speed + 0.2;
  const pr = room.shoot(type, p.id, sx, sy, Math.atan2(ty - sy, tx - sx), B.obj.speed, life, room.calcDamage(p, B.obj.dmg * dmgMul));
  pr.ghost = true; pr.hitR = 12;
  room.fx('objSpawn', sx, sy, { o: p.id });
}

/** Enemigo vivo más cercano a un punto (o null). */
function nearestTo(room: Room, p: Player, x: number, y: number, r: number): Mob | null {
  let best: Mob | null = null, bd = r * r;
  room.forEachEnemyNear(p, x, y, r, (m) => {
    if (m.dead || m.entombT > 0) return;
    const d = (m.x - x) ** 2 + (m.y - y) ** 2;
    if (d < bd) { bd = d; best = m; }
  });
  return best;
}

/** Atacar le devuelve al mundo material (aterriza en un sitio libre). */
function solidify(p: Player) { if (p.phaseT > 0) p.phaseT = 0.001; }

export const poltergeistKit: Kit = {
  basic(room, p, a) {
    room.breakStealth(p);
    solidify(p);
    const d = Math.min(p.input.d, B.obj.range);
    const ax = p.x + Math.cos(a) * d, ay = p.y + Math.sin(a) * d;
    const t = nearestTo(room, p, ax, ay, 150) ?? nearestTo(room, p, p.x, p.y, Math.min(B.obj.range, d + 60));
    const n = p.tier >= 3 ? B.obj.countT3 : 1;
    for (let i = 0; i < n; i++) room.later(i * 0.12, () => { if (!p.dead) hurl(room, p, t && !t.dead ? t.x : ax, t && !t.dead ? t.y : ay, 1); });
    room.setAnim(p, Anim.Cast, 0.3);
    room.sfx('poof', p.x, p.y);
  },

  ability(room, p, slot, a) {
    room.breakStealth(p);
    if (slot === 0) {
      // Revuelo: una lluvia de objetos sale de todas partes hacia los enemigos de la zona señalada
      solidify(p);
      const d = Math.min(p.input.d, B.obj.range);
      const cx = p.x + Math.cos(a) * d, cy = p.y + Math.sin(a) * d;
      const targets: Mob[] = [];
      room.forEachEnemyNear(p, cx, cy, B.storm.r, (m) => { if (!m.dead && m.entombT <= 0) targets.push(m); });
      for (let i = 0; i < B.storm.count; i++) {
        room.later(i * 0.09, () => {
          if (p.dead) return;
          const t = targets.length ? targets[i % targets.length] : null;
          const ang = Math.random() * Math.PI * 2, rr = Math.random() * B.storm.r * 0.6;
          hurl(room, p, t && !t.dead ? t.x : cx + Math.cos(ang) * rr, t && !t.dead ? t.y : cy + Math.sin(ang) * rr, B.storm.dmg * room.powMult(p));
        });
      }
      room.setAnim(p, Anim.Cast, 0.5);
      room.fx('objSpawn', cx, cy, { o: p.id, r: B.storm.r });
      room.sfx('poof', cx, cy);
    } else {
      // Intangible: atraviesa ataques y obstáculos (dentro de uno, nadie lo ve)
      p.phaseT = p.tier >= 3 ? B.phase.tT3 : B.phase.t;
      p.dash = null; p.knock = null;
      room.fx('phase', p.x, p.y, { o: p.id, n: 1 });
      room.sfx('vanish', p.x, p.y);
    }
  },

  ult(room, p) {
    // Drenaje: unos segundos quitando vida alrededor y curándose lo drenado
    p.ultT = B.ult.t;
    p.k.drainTick = 0;
    room.setAnim(p, Anim.Cast, 0.6);
    room.fx('drainBeam', p.x, p.y, { o: p.id, r: B.ult.r, n: 0 });
    room.sfx('vanish', p.x, p.y);
    return true;
  },

  tick(room, p, dt) {
    if (p.ultT <= 0) return;
    let drained = 0;
    room.forEachEnemyNear(p, p.x, p.y, B.ult.r, (m) => { if (!m.dead) drained += room.damage(m, B.ult.dps * room.powMult(p) * dt, { ...room.src(p), raw: true }, false, true); });
    if (drained > 0) p.hp = Math.min(p.maxHp, p.hp + drained);
    p.k.drainTick = (p.k.drainTick ?? 0) - dt;
    if (p.k.drainTick <= 0) {
      p.k.drainTick = 0.35;
      room.forEachEnemyNear(p, p.x, p.y, B.ult.r, (m) => { if (!m.dead) room.fx('drainBeam', m.x, m.y, { o: p.id, tx: Math.round(p.x), ty: Math.round(p.y), n: 1 }); });
    }
  },

  onProjectileHit(room, p, pr, m) {
    if (p.tier >= 1 && pr.type.startsWith('obj')) room.slow(m, B.objSlow.t, B.objSlow.mul);
  },
};
