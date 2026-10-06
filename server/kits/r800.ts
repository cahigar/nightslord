// 🤖 R-800: androide perseguidor con arsenal integrado.
// - Puño eléctrico (básico): golpes muy fuertes cuerpo a cuerpo que descargan electricidad; si no hay nadie a mano,
//   dispara bolas de energía eléctrica.
// - Máquina implacable (pasiva): inmune al miedo, al enamoramiento y a la hipnosis; las ralentizaciones le afectan la mitad.
// - Adquisición de objetivo (Q): fija al enemigo más cercano; lo ve aunque se vuelva invisible, corre más hacia él
//   y su siguiente golpe le hace mucho más daño.
// - Lanzacohetes integrado (E): 3 s disparando cohetes hacia el puntero que explotan al impactar; camina más despacio.
// - Autorreparación (nv. 5): se repara si lleva un rato sin recibir daño. Al morir explota al cabo de 1 s.
// - Protocolo de exterminio (R): 5 s de láser ancho guiado cuyo daño sube cuanto más tiempo siga sobre el objetivo.
// - Nv. 15: si elimina a su objetivo fijado, fija al siguiente; los cohetes duran más, salen más seguidos y explotan más grande.
import { BAL } from '../../shared/balance';
import { distToSegment } from '../../shared/maps';
import { Anim } from '../../shared/protocol';
import type { Mob, Player, Zone } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.r800;
const locked = (room: Room, p: Player) => ((p.k.lockEnd ?? 0) > room.time ? p.k.lockId : -1);
const firing = (room: Room, p: Player) => (p.k.burstEnd ?? 0) > room.time;
/** Tiempo que cada objetivo lleva bajo el láser (y daño acumulado aún sin mostrar). */
const beamOn = new Map<number, Map<number, { t: number; acc: number; last: number }>>();

function mobById(room: Room, id: number): Mob | null {
  return room.npcs.get(id) ?? room.hunters.get(id) ?? room.minions.get(id) ?? room.findPlayerById(id);
}

function acquire(room: Room, p: Player, except = -1) {
  const t = room.nearestEnemy(p, p.x, p.y, B.lock.range, except);
  if (!t) return false;
  p.k.lockId = t.id; p.k.lockEnd = room.time + B.lock.t; p.k.lockBonus = 1;
  room.fx('lockOn', t.x, t.y, { o: t.id, d: B.lock.t });
  room.sfx('zap', p.x, p.y);
  return true;
}

/** Bola de energía eléctrica (básico a distancia). */
function zapball(room: Room, p: Player, a: number) {
  const S = B.shot;
  const pr = room.shoot('zapball', p.id, p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22, a, S.speed, S.life, room.calcDamage(p, S.dmg));
  pr.hitR = 11;
}

/** Cohete del lanzacohetes integrado: explota al impactar o al acabar su recorrido. */
function rocket(room: Room, p: Player, a: number) {
  const S = B.burst;
  const pr = room.shoot('rocket', p.id, p.x + Math.cos(a) * 24, p.y - 6 + Math.sin(a) * 24, a, S.speed, S.life, room.calcDamage(p, 0.15));
  pr.hitR = 12;
}

function explodeRocket(room: Room, p: Player, x: number, y: number) {
  const S = B.burst, R = p.tier >= 3 ? S.rT3 : S.r;
  room.forEachEnemyNear(p, x, y, R, (m) => {
    if (m.dead) return;
    room.damage(m, room.calcDamage(p, S.dmg * room.powMult(p)), room.src(p));
    const d = Math.hypot(m.x - x, m.y - y) || 1;
    if (!m.dead) room.knockback(m, (m.x - x) / d, (m.y - y) / d, 70);
  });
  room.fx('rocketBoom', x, y, { r: R });
  room.sfx('explode', x, y);
}

export const r800Kit: Kit = {
  basic(room, p, a) {
    if (p.ultT > 0) { p.cd[0] = 0.1; return; } // durante el protocolo solo dispara el láser
    const near = room.nearestEnemy(p, p.x, p.y, p.def.range + p.r + B.shot.meleeCheck, -1);
    if (near) {
      const res = room.meleeSwing(p, a, { sfx: 'punch' });
      for (const h of res.hits) { room.fx('zapHit', h.m.x, h.m.y, { o: h.m.id }); if (!h.m.dead) room.knockback(h.m, Math.cos(a), Math.sin(a), 60); }
      room.sfx('zap', p.x, p.y);
      return;
    }
    // nadie a mano: bolas de energía eléctrica
    room.breakStealth(p);
    room.setAnim(p, Anim.Attack, 0.25);
    zapball(room, p, a);
    p.cd[0] = B.shot.cd;
    room.sfx('zap', p.x, p.y);
  },

  ability(room, p, slot) {
    room.breakStealth(p);
    if (slot === 0) { if (!acquire(room, p)) p.cd[1] = 0.3; room.setAnim(p, Anim.Cast, 0.3); return; }
    p.k.burstEnd = room.time + (p.tier >= 3 ? B.burst.tT3 : B.burst.t);
    p.k.burstNext = room.time;
    room.setAnim(p, Anim.Attack, 0.3);
  },

  ult(room, p, a) {
    const U = B.ult;
    p.k.laserA = a;
    beamOn.set(p.id, new Map());
    room.addZone({ kind: 'laser', ax: p.x, ay: p.y, bx: p.x + Math.cos(a) * U.len, by: p.y + Math.sin(a) * U.len, w: U.w, until: room.time + U.t, owner: p.id });
    room.setAnim(p, Anim.Cast, 0.5);
    room.sfx('ult', p.x, p.y);
    p.ultT = U.t;
    return true;
  },

  speedMul(room, p) {
    let m = p.slowT > 0 && p.slowMul < 1 ? (1 + p.slowMul) / (2 * p.slowMul) : 1; // las ralentizaciones le afectan la mitad
    if (firing(room, p)) m *= B.burst.speedMul;
    if (p.ultT > 0) m *= B.ult.speedMul;
    const lk = locked(room, p);
    if (lk >= 0) {
      const t = mobById(room, lk);
      const { mx, my } = p.input, ml = Math.hypot(mx, my);
      if (t && !t.dead && ml > 0.1) {
        const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy) || 1;
        if ((dx * mx + dy * my) / (d * ml) > B.lock.dot) m *= B.lock.speedMul;
      }
    }
    return m;
  },

  onProjectileHit(room, p, pr, m) {
    if (pr.type === 'zapball') room.fx('zapHit', m.x, m.y, { o: m.id });
  },
  onProjectileEnd(room, p, pr) {
    if (pr.type === 'rocket') explodeRocket(room, p, pr.x, pr.y);
  },

  onDealDamage(room, p, t, amount) {
    if (p.k.lockBonus && t.id === locked(room, p)) { p.k.lockBonus = 0; room.fx('lockOn', t.x, t.y, { o: t.id, d: 0, n: 1 }); return amount * B.lock.bonus; }
    return amount;
  },

  onKill(room, p, victim) {
    if (victim.id !== p.k.lockId) return;
    p.k.lockEnd = 0;
    if (p.tier >= 3) acquire(room, p, victim.id); // salta al siguiente objetivo
  },

  onDeath(room, p) {
    if (p.tier < 1) return;
    const x = p.x, y = p.y;
    room.fx('lockOn', x, y, { o: -1, d: B.boom.delay, n: 2 });
    room.later(B.boom.delay, () => {
      room.forEachEnemyNear(p, x, y, B.boom.r, (m) => { if (!m.dead) room.damage(m, room.calcDamage(p, B.boom.dmg), { ...room.src(p), raw: true }); });
      room.fx('fireBoom', x, y, { r: B.boom.r, o: p.id });
      room.sfx('explode', x, y);
    });
  },

  tick(room, p, dt) {
    // Máquina implacable
    p.fearT = 0; p.charmT = 0; p.hypno = 0; p.hypnoT = 0;
    // Autorreparación
    if (p.tier >= 1 && room.time - p.lastHurtT >= B.repair.safeT && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * B.repair.rate * dt);
    // objetivo fijado que desaparece
    const lk = locked(room, p);
    if (lk >= 0) { const t = mobById(room, lk); if (!t || t.dead) p.k.lockEnd = 0; }
    // lanzacohetes
    if (firing(room, p) && room.time >= (p.k.burstNext ?? 0)) {
      p.k.burstNext = room.time + (p.tier >= 3 ? B.burst.everyT3 : B.burst.every);
      rocket(room, p, p.input.a + (Math.random() - 0.5) * B.burst.spread * 2);
      room.setAnim(p, Anim.Attack, 0.15);
      room.sfx('dash', p.x, p.y);
      p.lastCombatT = room.time;
    }
    // láser del protocolo de exterminio
    const z: Zone | undefined = room.zones.find((o) => o.kind === 'laser' && o.owner === p.id);
    if (!z) return;
    const U = B.ult;
    let a = p.k.laserA ?? p.input.a;
    const diff = Math.atan2(Math.sin(p.input.a - a), Math.cos(p.input.a - a));
    a += Math.max(-U.turn * dt, Math.min(U.turn * dt, diff));
    p.k.laserA = a;
    const ox = p.x + Math.cos(a) * 26, oy = p.y - 34 + Math.sin(a) * 18;
    let len = U.len;
    for (let k = 30; k <= U.len; k += 20) if (room.grid.blocked(ox + Math.cos(a) * k, oy + 34 + Math.sin(a) * k, 3, true)) { len = k; break; }
    z.ax = ox; z.ay = oy + 34; z.bx = ox + Math.cos(a) * len; z.by = oy + 34 + Math.sin(a) * len;
    const on = beamOn.get(p.id) ?? new Map();
    beamOn.set(p.id, on);
    room.forEachEnemyNear(p, (z.ax + z.bx) / 2, (z.ay + z.by) / 2, len / 2 + U.w, (m) => {
      if (m.dead || distToSegment(m.x, m.y, z.ax, z.ay, z.bx, z.by) > U.w / 2 + m.r) return;
      const s = on.get(m.id) ?? { t: 0, acc: 0, last: room.time };
      if (room.time - s.last > 0.3) s.t = 0; // si se escapa, el daño vuelve a empezar
      s.t += dt; s.last = room.time;
      s.acc += U.dps * dt * Math.min(U.maxMul, 1 + s.t * U.ramp) * (1 + 0.03 * (p.level - 1)) * room.powMult(p);
      if (s.acc >= 6) { room.damage(m, s.acc, { ...room.src(p), raw: true }, s.t > 1.5); s.acc = 0; }
      on.set(m.id, s);
    });
    p.lastCombatT = room.time;
  },

  buffs(room, p, add) {
    if (locked(room, p) >= 0) add('lock', p.k.lockEnd - room.time);
    if (firing(room, p)) add('burst', p.k.burstEnd - room.time);
  },
};
