// 🪞 Bloody Mary: espejos por el mapa, viajar entre ellos y hacerlos estallar.
import { BAL } from '../../shared/balance';
import { Anim } from '../../shared/protocol';
import type { Player, Zone } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.mary;

const mirrorsOf = (room: Room, p: Player) => room.zones.filter((z) => z.kind === 'mirror' && z.owner === p.id);

/** Un espejo estalla: daño en área con cristales (y, a nivel 15, deja cristales que ralentizan). */
function shatter(room: Room, p: Player, z: Zone, mul = 1) {
  room.zones = room.zones.filter((o) => o !== z);
  const R = p.tier >= 3 ? B.boom.rT3 : B.boom.r;
  const dmg = (p.tier >= 3 ? B.boom.dmgT3 : B.boom.dmg) * mul;
  room.forEachEnemyNear(p, z.ax, z.ay, R, (m) => {
    room.damage(m, room.calcDamage(p, dmg), room.src(p));
    const d = Math.hypot(m.x - z.ax, m.y - z.ay) || 1;
    room.knockback(m, (m.x - z.ax) / d, (m.y - z.ay) / d, 60);
  });
  room.fx('mirrorBoom', z.ax, z.ay, { r: R, o: p.id });
  room.sfx('glass', z.ax, z.ay);
  if (p.tier >= 3) room.addZone({ kind: 'glass', ax: z.ax, ay: z.ay, bx: z.ax, by: z.ay, w: R * 1.6, until: room.time + B.shardsT, owner: p.id });
}

export const maryKit: Kit = {
  basic(room, p, a) {
    const res = room.meleeSwing(p, a, { sfx: 'glass' });
    for (const h of res.hits) room.fx('shards', h.m.x, h.m.y, { n: 5 });
  },

  ability(room, p, slot) {
    room.breakStealth(p);
    if (slot === 0) {
      // A través del espejo: al más cercano, que estalla al llegar
      let best: Zone | null = null, bd = Infinity;
      for (const z of mirrorsOf(room, p)) { const d = Math.hypot(z.ax - p.x, z.ay - p.y); if (d < bd) { bd = d; best = z; } }
      if (!best) { p.cd[1] = 0.3; return; } // sin espejos no se gasta
      const z = best as Zone;
      room.fx('dreamwalk', p.x, p.y, { o: p.id, n: 0, c: 'mary' });
      const spot = room.findFreeSpot(z.ax, z.ay + 4, p.r);
      p.x = spot.x; p.y = spot.y; p.dash = null; p.knock = null;
      room.setAnim(p, Anim.Cast, 0.3);
      shatter(room, p, z);
    } else {
      // Espejo de sangre: lo coloca y gana un impulso
      const max = p.tier >= 3 ? B.maxMirrorsT3 : B.maxMirrors;
      const mine = mirrorsOf(room, p);
      while (mine.length >= max) { const old = mine.shift()!; room.zones = room.zones.filter((o) => o !== old); room.fx('shards', old.ax, old.ay, { n: 8 }); }
      room.addZone({ kind: 'mirror', ax: p.x, ay: p.y + 2, bx: p.x, by: p.y + 2, w: 36, until: room.time + B.mirrorLife, owner: p.id });
      p.k.buffEnd = room.time + B.eBuff.t;
      room.setAnim(p, Anim.Cast, 0.3);
      room.fx('mirror', p.x, p.y, { o: p.id });
      room.sfx('glass', p.x, p.y);
    }
  },

  ult(room, p) {
    const mine = mirrorsOf(room, p);
    if (!mine.length) return false; // sin espejos no hay de dónde salir
    room.setAnim(p, Anim.Cast, 0.6);
    for (const z of mine) {
      shatter(room, p, z);
      const c = room.spawnMinion(p, z.ax, z.ay, 'clone', `mary:${p.skin}`, 0, B.ult.cloneLife, false, B.ult.clonesCap);
      room.fx('maryOut', c.x, c.y, { o: c.id });
    }
    p.ultT = B.ult.cloneLife;
    return true;
  },

  speedMul(room, p) {
    let m = (p.k.buffEnd ?? 0) > room.time ? B.eBuff.speedMul : 1;
    if (p.tier >= 1 && mirrorsOf(room, p).length >= 2) m *= B.speed2;
    return m;
  },
  atkSpeedMul: (room, p) => ((p.k.buffEnd ?? 0) > room.time ? B.eBuff.atkSpeedMul : 1),

  onDealDamage(room, p, target, amount) {
    const n = p.tier >= 1 ? mirrorsOf(room, p).length : 0;
    const ls = ((p.k.buffEnd ?? 0) > room.time ? B.eBuff.lifesteal : 0) + (n >= 1 ? B.lifesteal1 : 0);
    if (ls > 0) p.hp = Math.min(p.maxHp, p.hp + amount * ls);
    if (n >= 3) room.bleed(target, B.bleed3.t, B.bleed3.dps, p);
    return amount;
  },
};
