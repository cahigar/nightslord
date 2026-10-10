// 🔥 Azufre, el demonio de fuego: daño sostenido y control con llamas. Inmune al fuego.
// - Golpe ígneo: deja una pequeña quemadura.
// - Bola infernal (Q): explota y deja el suelo en llamas (nv. 15: suelta llamas secundarias).
// - Paso ardiente (E): unos segundos corriendo muchísimo más rápido, quemando a quien toca y dejando un rastro de llamas.
// - Combustión (nv. 5): quien ya arde recibe más daño de sus habilidades de fuego.
// - Infierno (R): se rodea de llamas que queman alrededor, sus golpes lanzan ondas de fuego hacia delante; ataca y corre más rápido.
// - Nv. 15: el fuego le cura.
import { BAL } from '../../shared/balance';
import { Anim } from '../../shared/protocol';
import type { Mob, Player, Projectile } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.demon;
/** A quién ha quemado ya cada Azufre durante su Paso ardiente. */
const burned = new Map<number, Set<number>>();
const blazing = (room: Room, p: Player) => (p.k.blazeEnd ?? 0) > room.time;

/** Daño de fuego de una habilidad: con Combustión (nv. 5) pega más a quien ya arde. */
function fireHit(room: Room, p: Player, m: Mob, mult: number) {
  const combust = p.tier >= 1 && m.burnT > 0 ? B.combustMul : 1;
  room.damage(m, room.calcDamage(p, mult * combust * room.powMult(p)), room.src(p), combust > 1);
  room.burn(m, B.burn.t, B.burn.dps, p);
}

function explode(room: Room, p: Player, x: number, y: number, r: number, dmg: number, zoneT: number) {
  room.forEachEnemyNear(p, x, y, r, (m) => { if (!m.dead) fireHit(room, p, m, dmg); });
  room.addZone({ kind: 'fire', ax: x, ay: y, bx: x, by: y, w: r * 1.6, until: room.time + zoneT, owner: p.id, v: B.fireball.dps });
  room.fx('fireBoom', x, y, { r, o: p.id });
  room.sfx('explode', x, y);
}

export const demonKit: Kit = {
  basic(room, p, a) {
    const res = room.meleeSwing(p, a, { sfx: 'punch' });
    for (const h of res.hits) if (!h.m.dead) room.burn(h.m, B.burn.t, B.burn.dps, p);
    if (p.ultT > 0) {
      // Infierno: cada golpe lanza una onda de fuego hacia delante
      const w = B.ult.wave;
      const pr = room.shoot('firewave', p.id, p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, a, w.speed, w.life, 0);
      pr.pierce = true; pr.hitSet = new Set(); pr.ghost = true; pr.hitR = 26;
    }
  },

  ability(room, p, slot, a) {
    room.breakStealth(p);
    if (slot === 0) {
      room.setAnim(p, Anim.Cast, 0.35);
      const pr = room.shoot('fireball', p.id, p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18, a, B.fireball.speed, B.fireball.life, 0);
      pr.hitR = 14;
      room.sfx('explode', p.x, p.y);
    } else {
      // Paso ardiente: carrera envuelta en llamas
      p.k.blazeEnd = room.time + B.dash.t;
      p.k.lx = p.x; p.k.ly = p.y;
      burned.set(p.id, new Set());
      room.setAnim(p, Anim.Attack, 0.3);
      room.fx('fireBoom', p.x, p.y, { r: 50, o: p.id });
      room.fx('dash', p.x, p.y, { r: a });
      room.sfx('dash', p.x, p.y);
    }
  },

  ult(room, p) {
    p.ultT = B.ult.t;
    room.setAnim(p, Anim.Cast, 0.6);
    room.fx('fireBoom', p.x, p.y, { r: 140, o: p.id });
    room.sfx('explode', p.x, p.y);
    return true;
  },

  speedMul: (room, p) => (p.ultT > 0 ? B.ult.speedMul : 1) * (blazing(room, p) ? B.dash.speedMul : 1),
  atkSpeedMul: (_room, p) => (p.ultT > 0 ? B.ult.atkMul : 1),
  buffs(room, p, add) { if (blazing(room, p)) add('blaze', p.k.blazeEnd - room.time); },

  tick(room, p, dt) {
    // Infierno: aura de llamas que quema alrededor
    if (p.ultT > 0) {
      p.k.auraT = (p.k.auraT ?? 0) - dt;
      if (p.k.auraT <= 0) {
        const A = B.ult.aura;
        p.k.auraT = A.every;
        room.forEachEnemyNear(p, p.x, p.y, A.r, (m) => { if (!m.dead) fireHit(room, p, m, A.dmg); });
      }
    }
    // Paso ardiente: rastro de llamas y quema a quien toca (una vez por enemigo)
    if (blazing(room, p) && p.k.lx !== undefined) {
      const d = Math.hypot(p.x - p.k.lx, p.y - p.k.ly);
      if (d >= B.dash.every) {
        room.addZone({ kind: 'fire', ax: p.k.lx, ay: p.k.ly, bx: p.x, by: p.y, w: 34, until: room.time + B.dash.trailT, owner: p.id, v: B.fireball.dps });
        p.k.lx = p.x; p.k.ly = p.y;
      }
      const hit = burned.get(p.id) ?? new Set<number>();
      room.forEachEnemyNear(p, p.x, p.y, p.r + 22, (m) => { if (m.dead || hit.has(m.id)) return; hit.add(m.id); fireHit(room, p, m, B.dash.dmg); });
      burned.set(p.id, hit);
    } else if (p.k.lx !== undefined && !blazing(room, p)) { delete p.k.lx; burned.delete(p.id); }
    // nv. 15: el fuego le cura
    if (p.tier >= 3 && room.zones.some((z) => z.kind === 'fire' && (p.x - z.ax) ** 2 + (p.y - z.ay) ** 2 < (z.w / 2 + p.r) ** 2)) {
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * B.fireHealT3 * dt);
    }
  },

  onProjectileHit(room, p, pr: Projectile, m) {
    if (pr.type === 'firewave' && !m.dead) fireHit(room, p, m, B.ult.wave.dmg);
  },

  onProjectileEnd(room, p, pr) {
    if (pr.type === 'fireball') {
      explode(room, p, pr.x, pr.y, B.fireball.r, B.fireball.dmg, B.fireball.zoneT);
      if (p.tier >= 3) for (let i = 0; i < B.fireball.sparks; i++) {
        const a = (i / B.fireball.sparks) * Math.PI * 2 + Math.random() * 0.5;
        const e = room.shoot('ember', p.id, pr.x, pr.y, a, 380, 0.35, 0);
        e.ghost = true; e.land = true;
      }
    } else if (pr.type === 'ember') explode(room, p, pr.x, pr.y, 40, 0.4, 2);
  },
};
