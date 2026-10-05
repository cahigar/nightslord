// ☠️ La Parca: asesina que escala con las bajas.
// - Guadañazo: tajo amplio de corto alcance.
// - Cosecha de almas (pasiva): cada baja le da almas (+daño) hasta que muere; al morir las pierde todas.
// - Paso fúnebre (Q): teletransporte corto hacia el puntero (nv. 15: 2 cargas).
// - Marca de muerte (E): marca al enemigo más cercano al puntero; corre más hacia él y el siguiente guadañazo le hace mucho daño.
// - Almas inquietas (nv. 5): las almas también dan velocidad de movimiento y de ataque.
// - Danza de la Parca (R): 10 s; cada 0,75 s aparece junto a un enemigo al azar y lanza un gran tajo. Al terminar vuelve a su sitio.
import { BAL } from '../../shared/balance';
import { Anim, Kind } from '../../shared/protocol';
import type { Mob, Player } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.reaper;
const souls = (p: Player) => p.k.souls ?? 0;
const marked = (room: Room, p: Player) => ((p.k.markEnd ?? 0) > room.time ? p.k.markId : -1);

/** Busca un enemigo cualquiera por id (para la marca). */
function findMob(room: Room, id: number): Mob | null {
  return room.npcs.get(id) ?? room.hunters.get(id) ?? room.minions.get(id) ?? room.findPlayerById(id);
}

export const reaperKit: Kit = {
  basic(room, p, a) {
    const mk = marked(room, p);
    const res = room.meleeSwing(p, a, { sfx: 'claw', dmgFor: (m) => (m.id === mk ? B.mark.bonus : 1) });
    if (mk >= 0 && res.hits.some((h) => h.m.id === mk)) {
      p.k.markEnd = 0;
      const m = res.hits.find((h) => h.m.id === mk)!.m;
      room.fx('reap', m.x, m.y, { r: 60, o: p.id, n: 1 });
    }
  },

  ability(room, p, slot, a) {
    room.breakStealth(p);
    if (slot === 0) {
      // Paso fúnebre
      const d = Math.min(Math.max(60, p.input.d), B.step.range);
      const f = room.findFreeSpot(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, p.r);
      room.fx('blink', p.x, p.y, { c: '#60ffd0', n: 0 });
      p.x = f.x; p.y = f.y; p.dash = null; p.knock = null;
      room.fx('blink', p.x, p.y, { c: '#60ffd0', n: 1 });
      room.sfx('vanish', p.x, p.y);
    } else {
      // Marca de muerte: el enemigo más cercano al puntero
      const M = B.mark;
      const d = Math.min(p.input.d, M.range);
      const ax = p.x + Math.cos(a) * d, ay = p.y + Math.sin(a) * d;
      let best: Mob | null = null, bd = M.pick ** 2;
      room.forEachEnemyNear(p, ax, ay, M.pick, (m) => {
        if (m.dead || m.entombT > 0) return;
        const dd = (m.x - ax) ** 2 + (m.y - ay) ** 2;
        if (dd < bd) { bd = dd; best = m; }
      });
      if (!best) { p.cd[2] = 0.3; return; }
      const t = best as Mob;
      p.k.markId = t.id; p.k.markEnd = room.time + M.t;
      room.setAnim(p, Anim.Cast, 0.35);
      room.fx('deathMark', t.x, t.y, { o: t.id, d: M.t });
      room.sfx('curse', t.x, t.y);
    }
  },

  ult(room, p) {
    p.k.danceEnd = room.time + B.ult.t; p.k.danceNext = room.time + 0.2;
    p.k.homeX = p.x; p.k.homeY = p.y;
    p.ultT = B.ult.t;
    room.setAnim(p, Anim.Cast, 0.5);
    room.fx('blink', p.x, p.y, { c: '#60ffd0', n: 0 });
    room.sfx('ult', p.x, p.y);
    return true;
  },

  qCharges: (p) => (p.tier >= 3 ? B.step.chargesT3 : 1),

  speedMul(room, p) {
    let m = p.tier >= 1 ? 1 + souls(p) * B.soul.spd : 1;
    const mk = marked(room, p);
    if (mk >= 0) {
      const t = findMob(room, mk);
      const { mx, my } = p.input, ml = Math.hypot(mx, my);
      if (t && !t.dead && ml > 0.1) {
        const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy) || 1;
        if ((dx * mx + dy * my) / (d * ml) > B.mark.dot) m *= B.mark.speedMul;
      }
    }
    return m;
  },
  atkSpeedMul: (_room, p) => (p.tier >= 1 ? 1 / (1 + souls(p) * B.soul.atk) : 1),
  onDealDamage: (_room, p, _t, amount) => amount * (1 + souls(p) * B.soul.dmg),

  onKill(room, p, victim) {
    const gain = victim.kind === Kind.Player || victim.kind === Kind.Hunter ? B.soul.big : B.soul.npc;
    p.k.souls = Math.min(B.soul.max, souls(p) + gain);
    room.fx('drain', victim.x, victim.y, { tx: Math.round(p.x), ty: Math.round(p.y), o: p.id, n: gain + 1, c: 'soul' });
  },

  tick(room, p) {
    if (!p.k.danceEnd) return;
    if (room.time >= p.k.danceEnd) {
      // vuelve exactamente a donde empezó
      p.k.danceEnd = 0;
      room.fx('blink', p.x, p.y, { c: '#60ffd0', n: 0 });
      const f = room.findFreeSpot(p.k.homeX, p.k.homeY, p.r);
      p.x = f.x; p.y = f.y; p.dash = null; p.knock = null;
      room.fx('blink', p.x, p.y, { c: '#60ffd0', n: 1 });
      return;
    }
    if (room.time < p.k.danceNext) return;
    p.k.danceNext = room.time + B.ult.every;
    const list: Mob[] = [];
    room.forEachEnemyNear(p, p.k.homeX, p.k.homeY, B.ult.range, (m) => { if (!m.dead && m.entombT <= 0) list.push(m); });
    if (!list.length) return;
    // a veces prefiere a otros monstruos (a los cazadores no los busca a propósito)
    const big = list.filter((m) => m.kind === Kind.Player);
    const pool = big.length && Math.random() < 0.5 ? big : list;
    const t = pool[Math.floor(Math.random() * pool.length)];
    const side = Math.random() < 0.5 ? -1 : 1;
    room.fx('blink', p.x, p.y, { c: '#60ffd0', n: 0 });
    const f = room.findFreeSpot(t.x + side * (t.r + p.r + 6), t.y, p.r);
    p.x = f.x; p.y = f.y; p.dash = null; p.knock = null;
    p.facing = t.x >= p.x ? 1 : -1;
    room.setAnim(p, Anim.Attack, 0.35);
    const R = p.tier >= 3 ? B.ult.rT3 : B.ult.r;
    room.forEachEnemyNear(p, p.x, p.y, R, (m) => { if (!m.dead) room.damage(m, room.calcDamage(p, B.ult.dmg * room.powMult(p)), room.src(p)); });
    room.fx('reap', p.x, p.y, { r: R, o: p.id, n: 2, d: +Math.atan2(t.y - p.y, t.x - p.x).toFixed(2) });
    room.sfx('claw', p.x, p.y);
  },

  buffs(room, p, add, list) {
    if (souls(p)) list.push({ t: 'souls', r: souls(p) });
    if (marked(room, p) >= 0) add('deathMark', p.k.markEnd - room.time);
    if (p.k.danceEnd) add('dance', p.k.danceEnd - room.time);
  },
};
