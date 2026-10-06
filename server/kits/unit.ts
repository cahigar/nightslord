// 👁️ Unidad: enjambre con identidad compartida.
// - Mirada compartida (básico): cuando dispara, todas sus Unidades vinculadas disparan a la vez hacia el mismo punto.
// - Asimilación (Q): convierte al humano más cercano en una Unidad vinculada que le sigue (máx. 4; nv. 15: 8).
// - Independencia (E): una Unidad vinculada se vuelve autónoma y recorre el mapa por libre (máx. 1; nv. 15: 2).
// - Somos Uno (pasiva): si muere y le queda otra Unidad viva, reaparece en ella y la muerte no cuenta.
//   Camuflaje: tras 5 s quieta, ella y su enjambre parecen humanos normales que pasean; al moverse o atacar se descubren.
// - Mente colectiva (nv. 5): más velocidad de movimiento y de ataque por cada Unidad activa.
// - Convergencia (R): su cuerpo y las Unidades vinculadas parpadean (ella sigue moviéndose con el grupo) y al final
//   explotan todos a la vez; entonces su conciencia salta a una Unidad independiente (hace falta tener una viva).
import { BAL } from '../../shared/balance';
import { Anim, Kind } from '../../shared/protocol';
import { NPC_VARIANTS } from '../../shared/maps';
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

/** Explosión de la Convergencia en un punto. */
function boom(room: Room, p: Player, x: number, y: number) {
  room.forEachEnemyNear(p, x, y, B.ult.r, (t) => {
    if (t.dead) return;
    room.damage(t, room.calcDamage(p, B.ult.dmg * room.powMult(p)), room.src(p));
    const d = Math.hypot(t.x - x, t.y - y) || 1;
    if (t.kind !== Kind.Player) room.knockback(t, (t.x - x) / d, (t.y - y) / d, 90);
  });
  room.fx('unitBoom', x, y, { r: B.ult.r, c: '#ff40c0' });
  room.sfx('explode', x, y);
}

/** Se acaba el camuflaje: ella y el enjambre recuperan su aspecto. */
function reveal(room: Room, p: Player) {
  if (!p.k.camo) return;
  p.k.camo = 0; p.k.stillT = 0;
  if (p.guise?.startsWith('npc:')) p.guise = null;
  for (const m of room.minionsOf(p.id)) m.camo = false;
  room.fx('mimic', p.x, p.y, { c: 'unit' });
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
      u.orig = n.variant;
      if (p.k.camo) u.camo = true;
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
      m.wx = undefined; m.wy = undefined; m.target = -1; m.camo = false;
      room.setAnim(p, Anim.Cast, 0.35);
      room.fx('blink', m.x, m.y, { c: '#ff40c0', n: 1 });
      room.sfx('zap', m.x, m.y);
    }
  },

  ult(room, p) {
    if (!free(room, p).length) return false; // hace falta una Unidad independiente viva
    reveal(room, p);
    const D = B.ult.delay;
    p.k.convergeAt = room.time + D;
    for (const m of linked(room, p)) m.boomAt = room.time + D;
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
    reveal(room, p);
    consume(room, host);
    room.fx('blink', p.x, p.y, { c: '#ff40c0', n: 1 });
    room.sfx('ult', p.x, p.y);
    return true;
  },

  tick(room, p, dt) {
    // Camuflaje: 5 s quieta (sin atacar) → ella y su enjambre parecen humanos normales
    const busy = p.moving || room.time - p.lastCombatT < 0.4 || (p.k.convergeAt ?? 0) > 0;
    if (p.k.camo && (busy || !p.guise)) reveal(room, p);
    if (busy || p.k.camo) p.k.stillT = 0;
    else {
      p.k.stillT = (p.k.stillT ?? 0) + dt;
      if (p.k.stillT >= B.camo.t) {
        const vs = NPC_VARIANTS[room.theme];
        p.guise = `npc:${vs[p.id % vs.length]}:${p.id % 97}`;
        p.k.camo = 1;
        for (const m of linked(room, p)) m.camo = true;
        room.fx('mimic', p.x, p.y, { c: 'npc' });
      }
    }
    // Convergencia: cuando acaba el parpadeo explotan su cuerpo y las vinculadas, y la conciencia salta
    if (p.k.convergeAt && room.time >= p.k.convergeAt) {
      p.k.convergeAt = 0;
      boom(room, p, p.x, p.y);
      for (const m of room.minionsOf(p.id)) if (m.boomAt !== undefined) { boom(room, p, m.x, m.y); consume(room, m); }
      const f = free(room, p);
      if (f.length) {
        const host = f.sort((a, b) => ((b.x - p.x) ** 2 + (b.y - p.y) ** 2) - ((a.x - p.x) ** 2 + (a.y - p.y) ** 2))[0];
        p.x = host.x; p.y = host.y; p.dash = null; p.knock = null;
        consume(room, host);
        room.fx('blink', p.x, p.y, { c: '#ff40c0', n: 1 });
      }
    }
  },

  buffs(room, p, add, list) {
    if ((p.k.convergeAt ?? 0) > room.time) add('converge', p.k.convergeAt - room.time);
    const l = linked(room, p).length, f = free(room, p).length;
    if (l) list.push({ t: 'units', r: l });
    if (f) list.push({ t: 'free', r: f });
  },
};
