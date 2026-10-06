// 🏹 La Cazadora: veterana desertora de la orden. Control, reclutamiento y hostigamiento.
// - Ballesta (básico): disparo preciso a distancia.
// - Armar a la población (pasiva): no mata humanos; al herirlos les da antorchas u horcas y se vuelven aliados
//   que van a su aire contra los monstruos (cada uno le da experiencia). La orden de cazadores no la ataca.
// - Culatazo (Q): golpe cercano que empuja con fuerza (nv. 15: a todos en un cono).
// - Repliegue (E): salto corto y se vuelve invisible unos segundos (atacar la descubre).
// - Experiencia de campo (nv. 5): matar a un enemigo o armar a un humano recupera enfriamiento de Q y E.
// - Círculo de caza (R): gira disparando contra todos los enemigos cercanos; los impactos ciegan.
// - Nv. 15: también reparte arcos.
import { BAL } from '../../shared/balance';
import { Anim, Kind } from '../../shared/protocol';
import type { Mob, Npc, Player } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.huntress;
const circling = (room: Room, p: Player) => (p.k.circleEnd ?? 0) > room.time;

function refund(p: Player) {
  if (p.tier < 1) return;
  p.cd[1] *= 1 - B.cdRefund; p.cd[2] *= 1 - B.cdRefund;
}

function shootBolt(room: Room, p: Player, a: number, blind: boolean) {
  const pr = room.shoot('bolt', p.id, p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18, a, B.bolt.speed, B.bolt.life, room.calcDamage(p, blind ? B.ult.dmg : B.bolt.dmg));
  pr.hitR = 10;
  if (blind) pr.v = 1;
}

/** Arma a un humano: deja de ser presa y se une a la caza de monstruos (a su aire). */
function arm(room: Room, p: Player, n: Npc) {
  room.npcs.delete(n.id);
  n.dead = true;
  const kit = p.tier >= 3 ? ['torch', 'pitchfork', 'bow'] : ['torch', 'pitchfork'];
  const held = kit[Math.floor(Math.random() * kit.length)];
  const m = room.spawnMinion(p, n.x, n.y, 'militia', `${n.variant}#${held}`, n.id % 97, B.militia.life, false, B.militia.max);
  m.anim = Anim.Cast; m.animUntil = room.time + 0.4;
  room.reward(p, B.militia.xp, B.militia.pts, 0);
  room.fx('arm', m.x, m.y, { o: m.id, c: held });
  room.sfx('pickup', m.x, m.y);
  refund(p);
}

export const huntressKit: Kit = {
  basic(room, p, a) {
    if (circling(room, p)) { p.cd[0] = 0.1; return; }
    room.breakStealth(p);
    room.setAnim(p, Anim.Attack, 0.3);
    shootBolt(room, p, a, false);
    room.sfx('bolt', p.x, p.y);
  },

  ability(room, p, slot, a) {
    room.breakStealth(p);
    if (slot === 0) {
      // Culatazo
      const C = B.butt, arc = p.tier >= 3 ? C.arcT3 : C.arc;
      const hits: Mob[] = [];
      room.forEachEnemyNear(p, p.x, p.y, C.r, (m) => {
        if (m.dead) return;
        const ang = Math.atan2(m.y - p.y, m.x - p.x);
        if (Math.abs(Math.atan2(Math.sin(ang - a), Math.cos(ang - a))) > arc && Math.hypot(m.x - p.x, m.y - p.y) > p.r + m.r + 6) return;
        hits.push(m);
      });
      hits.sort((m1, m2) => Math.hypot(m1.x - p.x, m1.y - p.y) - Math.hypot(m2.x - p.x, m2.y - p.y));
      for (const m of p.tier >= 3 ? hits : hits.slice(0, 1)) {
        room.damage(m, room.calcDamage(p, C.dmg * room.powMult(p)), room.src(p));
        if (m.dead) continue;
        const d = Math.hypot(m.x - p.x, m.y - p.y) || 1;
        room.knockback(m, (m.x - p.x) / d, (m.y - p.y) / d, C.knock);
      }
      room.setAnim(p, Anim.Attack, 0.3);
      room.fx('buttStroke', p.x + Math.cos(a) * 34, p.y + Math.sin(a) * 24, { r: +a.toFixed(2), n: p.tier >= 3 ? 1 : 0 });
      room.sfx('punch', p.x, p.y);
    } else {
      // Repliegue: salto corto (hacia donde camina, o hacia atrás) y se vuelve invisible
      const { mx, my } = p.input, ml = Math.hypot(mx, my);
      const dx = ml > 0.1 ? mx / ml : -Math.cos(a), dy = ml > 0.1 ? my / ml : -Math.sin(a);
      const R = B.retreat;
      p.dash = { t: R.t, dx, dy, hit: new Set(), speed: p.def.speed * R.speedMul, dmg: 0, knock: 0 };
      room.fx('dash', p.x, p.y, { r: Math.atan2(dy, dx) });
      p.invisKind = 'timed'; p.invisT = R.invisT; p.invisBonus = false;
      room.fx('vanish', p.x, p.y, { o: p.id });
      room.sfx('vanish', p.x, p.y);
    }
  },

  ult(room, p) {
    p.k.circleEnd = room.time + B.ult.t; p.k.circleNext = room.time; p.k.spin = p.input.a; p.k.spinI = 0;
    room.setAnim(p, Anim.Cast, 0.4);
    room.sfx('ult', p.x, p.y);
    p.ultT = B.ult.t;
    return true;
  },

  onDealDamage(room, p, t, amount) {
    // no mata humanos: los arma
    if (t.kind === Kind.Npc) {
      const n = t as Npc;
      if (!n.dead && !n.variant.startsWith('c_') && n.disguiseT <= 0 && n.infectT <= 0) { arm(room, p, n); return 0; }
    }
    return amount;
  },

  onProjectileHit(room, p, pr, m) {
    if (pr.type === 'bolt' && pr.v === 1 && !m.dead) { m.blindT = Math.max(m.blindT, B.ult.blindT); room.fx('heartHit', m.x, m.y, { o: m.id, c: 'blind' }); }
  },

  onKill(_room, p) { refund(p); },

  tick(room, p) {
    if (!circling(room, p) || room.time < (p.k.circleNext ?? 0)) return;
    p.k.circleNext = room.time + B.ult.every;
    // gira y dispara a cada enemigo cercano por turnos (si no hay nadie, en círculo)
    const list: Mob[] = [];
    room.forEachEnemyNear(p, p.x, p.y, B.ult.range, (m) => { if (!m.dead && !(m.kind === Kind.Npc && !(m as Npc).variant.startsWith('c_'))) list.push(m); });
    p.k.spin = (p.k.spin ?? 0) + 0.9;
    let a = p.k.spin;
    if (list.length) { const t = list[(p.k.spinI = ((p.k.spinI ?? 0) + 1)) % list.length]; a = Math.atan2(t.y - p.y, t.x - p.x); }
    p.facing = Math.cos(p.k.spin) >= 0 ? 1 : -1;
    room.setAnim(p, Anim.Attack, 0.12);
    shootBolt(room, p, a, true);
    if (Math.random() < 0.5) room.sfx('bolt', p.x, p.y);
    p.lastCombatT = room.time;
  },

  buffs(room, p, _add, list) {
    const n = room.minionsOf(p.id).filter((m) => m.variant === 'militia').length;
    if (n) list.push({ t: 'militia', r: n });
  },
};
