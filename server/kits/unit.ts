// 👁️ Unidad: enjambre con identidad compartida.
// - Mirada compartida (básico): cuando dispara, todas sus Unidades vinculadas disparan a la vez hacia el mismo punto.
// - Asimilación (Q): convierte al humano más cercano en una Unidad vinculada que le sigue (máx. 4; nv. 15: 8).
// - Independencia (E): una Unidad vinculada se vuelve autónoma y recorre el mapa por libre (máx. 1; nv. 15: 2).
// - Somos Uno (pasiva): si muere y le queda otra Unidad viva, reaparece en ella y la muerte no cuenta.
// - Mente colectiva (nv. 5): más velocidad de movimiento y de ataque por cada Unidad activa.
// - Convergencia (R): las Unidades vinculadas (y su cuerpo) parpadean y explotan a los 2 s; su conciencia salta a una
//   Unidad independiente (hace falta tener una viva).
import { BAL } from '../../shared/balance';
import { Anim, Kind } from '../../shared/protocol';
import type { Minion, Npc, Player } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.unit;
const linked = (room: Room, p: Player) => room.minionsOf(p.id).filter((m) => m.variant === 'unit' && m.boomAt === undefined);
const free = (room: Room, p: Player) => room.minionsOf(p.id).filter((m) => m.variant === 'unitfree');
const maxLinked = (p: Player) => (p.tier >= 3 ? B.link.maxT3 : B.link.max);
const maxFree = (p: Player) => (p.tier >= 3 ? B.free.maxT3 : B.free.max);
const active = (room: Room, p: Player) => Math.min(B.hive.max, linked(room, p).length + free(room, p).length);

function shootEye(room: Room, p: Player, x: number, y: number, tx: number, ty: number, mult: number) {
  const pr = room.shoot('eye', p.id, x, y - 14, Math.atan2(ty - y, tx - x), B.eye.speed, B.eye.life, room.calcDamage(p, mult));
  pr.hitR = 10;
}

/** Quita una Unidad del mapa sin dejar cadáver. */
function consume(room: Room, m: Minion) {
  room.minions.delete(m.id);
  m.dead = true;
}

export const unitKit: Kit = {
  basic(room, p, a) {
    room.breakStealth(p);
    room.setAnim(p, Anim.Attack, 0.3);
    const d = Math.max(80, Math.min(p.input.d, 320));
    const tx = p.x + Math.cos(a) * d, ty = p.y + Math.sin(a) * d;
    shootEye(room, p, p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14, tx, ty, B.eye.dmg);
    for (const m of linked(room, p)) {
      room.setAnim(m, Anim.Attack, 0.3);
      m.facing = tx >= m.x ? 1 : -1;
      shootEye(room, p, m.x, m.y, tx, ty, B.eye.unitDmg);
    }
    room.sfx('zap', p.x, p.y);
  },

  ability(room, p, slot) {
    room.breakStealth(p);
    if (slot === 0) {
      // Asimilación
      if (linked(room, p).length >= maxLinked(p)) { p.cd[1] = 0.3; return; }
      let best: Npc | null = null, bd = B.link.range ** 2;
      for (const n of room.npcs.values()) {
        if (n.dead || n.disguiseT > 0 || n.infectT > 0 || n.entombT > 0 || n.variant.startsWith('c_')) continue;
        const d = (n.x - p.x) ** 2 + (n.y - p.y) ** 2;
        if (d < bd) { bd = d; best = n; }
      }
      if (!best) { p.cd[1] = 0.3; return; }
      const n = best as Npc;
      room.npcs.delete(n.id); n.dead = true;
      const u = room.spawnMinion(p, n.x, n.y, 'unit', `unit:${p.skin}`, n.id % 97, 1e9, false, 99);
      room.setAnim(p, Anim.Cast, 0.35);
      room.fx('assimilate', u.x, u.y, { o: u.id, tx: Math.round(p.x), ty: Math.round(p.y), c: n.variant });
      room.sfx('charm', u.x, u.y);
    } else {
      // Independencia
      const l = linked(room, p);
      if (!l.length || free(room, p).length >= maxFree(p)) { p.cd[2] = 0.3; return; }
      const m = l.sort((a, b) => a.born - b.born)[0];
      m.variant = 'unitfree';
      m.speed = B.freeDrone.speed; m.maxHp = B.freeDrone.hp; m.hp = Math.max(m.hp, B.freeDrone.hp * 0.8);
      m.wx = undefined; m.wy = undefined; m.target = -1;
      room.setAnim(p, Anim.Cast, 0.35);
      room.fx('blink', m.x, m.y, { c: '#ff40c0', n: 1 });
      room.sfx('zap', m.x, m.y);
    }
  },

  ult(room, p) {
    const f = free(room, p);
    if (!f.length) return false; // hace falta una Unidad independiente viva
    const D = B.ult.delay;
    for (const m of linked(room, p)) m.boomAt = room.time + D;
    // su cuerpo se queda atrás y también explota
    const husk = room.spawnMinion(p, p.x, p.y, 'unit', `unit:${p.skin}`, p.id % 97, D + 1, false, 99);
    husk.boomAt = room.time + D;
    room.fx('blink', p.x, p.y, { c: '#ff40c0', n: 0 });
    // la conciencia salta a la Unidad independiente más lejana
    const host = f.sort((a, b) => ((b.x - p.x) ** 2 + (b.y - p.y) ** 2) - ((a.x - p.x) ** 2 + (a.y - p.y) ** 2))[0];
    p.x = host.x; p.y = host.y; p.dash = null; p.knock = null;
    consume(room, host);
    room.fx('blink', p.x, p.y, { c: '#ff40c0', n: 1 });
    room.setAnim(p, Anim.Cast, 0.5);
    room.sfx('ult', p.x, p.y);
    p.ultT = D;
    return true;
  },

  speedMul: (room, p) => (p.tier >= 1 ? 1 + active(room, p) * B.hive.speed : 1),
  atkSpeedMul: (room, p) => (p.tier >= 1 ? 1 / (1 + active(room, p) * B.hive.atk) : 1),

  preventDeath(room, p) {
    const all = [...linked(room, p), ...free(room, p)];
    if (!all.length) return false;
    const host = all[Math.floor(Math.random() * all.length)];
    room.fx('blink', p.x, p.y, { c: '#ff40c0', n: 0 });
    p.x = host.x; p.y = host.y;
    p.hp = p.maxHp * B.rebirthHp;
    p.burnT = 0; p.poisonT = 0; p.bleedT = 0; p.stunT = 0; p.rootT = 0; p.hexT = 0; p.sleepT = 0; p.dash = null; p.knock = null;
    p.protectT = Math.max(p.protectT, 1);
    consume(room, host);
    room.fx('blink', p.x, p.y, { c: '#ff40c0', n: 1 });
    room.sfx('ult', p.x, p.y);
    return true;
  },

  tick(room, p) {
    for (const m of room.minionsOf(p.id)) {
      if (m.boomAt === undefined || room.time < m.boomAt) continue;
      room.forEachEnemyNear(p, m.x, m.y, B.ult.r, (t) => {
        if (t.dead || t === m) return;
        room.damage(t, room.calcDamage(p, B.ult.dmg * room.powMult(p)), room.src(p));
        const d = Math.hypot(t.x - m.x, t.y - m.y) || 1;
        if (t.kind !== Kind.Player) room.knockback(t, (t.x - m.x) / d, (t.y - m.y) / d, 90);
      });
      room.fx('unitBoom', m.x, m.y, { r: B.ult.r, c: '#ff40c0' });
      room.sfx('explode', m.x, m.y);
      consume(room, m);
    }
  },

  buffs(room, p, _add, list) {
    const l = linked(room, p).length, f = free(room, p).length;
    if (l) list.push({ t: 'units', r: l });
    if (f) list.push({ t: 'free', r: f });
  },
};
