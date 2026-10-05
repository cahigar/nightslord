// 🟢 Baba, el slime: control del espacio y supervivencia.
// - Salpicadura: golpe corto que deja una mancha pegajosa que ralentiza.
// - Pasiva: al perder cada 30 % de la vida se separa en 2 slimes pequeños unos segundos; mientras tanto recibe menos
//   daño pero pega menos, y mientras quede alguno vivo se regenera.
// - Rastro de veneno (Q): él y sus copias corren más y dejan veneno a su paso.
// - Burbuja de ácido (E): explota al chocar o al llegar al final: envenena y aparta.
// - Absorber (nv. 5): los objetos que recoge y sus víctimas le curan.
// - Masa crítica (R): se vuelve enorme, atrapa y arrastra a los enemigos quitándoles vida y luego estalla.
// - Nv. 15: sus mitades revientan en baba al reunirse y sus charcos duran más.
import { BAL } from '../../shared/balance';
import { Anim, Kind } from '../../shared/protocol';
import type { Minion, Mob, Player } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.slime;
const copies = (room: Room, p: Player) => room.minionsOf(p.id).filter((m) => m.variant === 'slimelet');
/** Víctimas atrapadas por la Masa crítica: id → ángulo dentro del slime. */
const grabbed = new WeakMap<Player, Map<number, number>>();
const trailPos = new Map<number, { x: number; y: number }>();

function goo(room: Room, p: Player, x: number, y: number, r = B.goo.r) {
  room.addZone({ kind: 'goo', ax: x, ay: y, bx: x, by: y, w: r * 2, until: room.time + (p.tier >= 3 ? B.goo.tT3 : B.goo.t), owner: p.id });
}

function venomTrail(room: Room, p: Player, m: Mob) {
  const last = trailPos.get(m.id);
  if (!last) { trailPos.set(m.id, { x: m.x, y: m.y }); return; }
  if (Math.hypot(m.x - last.x, m.y - last.y) < B.trail.every) return;
  room.addZone({ kind: 'venom', ax: last.x, ay: last.y, bx: m.x, by: m.y, w: B.trail.r * 2, until: room.time + B.trail.zoneT, owner: p.id });
  trailPos.set(m.id, { x: m.x, y: m.y });
}

function burst(room: Room, p: Player, x: number, y: number, r: number, dmg: number, knock: number) {
  room.forEachEnemyNear(p, x, y, r, (m) => {
    if (m.dead) return;
    if (dmg > 0) room.damage(m, room.calcDamage(p, dmg * room.powMult(p)), room.src(p));
    room.poison(m, B.bubble.poisonT, B.bubble.poisonDps * room.powMult(p), p);
    if (knock > 0) { const d = Math.hypot(m.x - x, m.y - y) || 1; room.knockback(m, (m.x - x) / d, (m.y - y) / d, knock); }
  });
  room.fx('slimeBoom', x, y, { r, o: p.id });
  room.sfx('splash', x, y);
}

function endGiant(room: Room, p: Player) {
  p.k.giant = 0;
  const g = grabbed.get(p);
  g?.clear();
  p.maxHp -= p.k.bonusHp ?? 0; p.hp = Math.min(p.hp, p.maxHp); p.k.bonusHp = 0;
  burst(room, p, p.x, p.y, B.ult.boomR, B.ult.boomDmg, B.ult.boomKnock);
  goo(room, p, p.x, p.y, 70);
}

export const slimeKit: Kit = {
  basic(room, p, a) {
    room.meleeSwing(p, a, { sfx: 'splash' });
    goo(room, p, p.x + Math.cos(a) * 40, p.y + Math.sin(a) * 30);
  },

  ability(room, p, slot, a) {
    room.breakStealth(p);
    if (slot === 0) {
      p.k.trailEnd = room.time + B.trail.t;
      for (const m of [p, ...copies(room, p)]) trailPos.set(m.id, { x: m.x, y: m.y });
      room.fx('slimeSplit', p.x, p.y, { o: p.id, n: 0 });
      room.sfx('bubble', p.x, p.y);
    } else {
      room.setAnim(p, Anim.Attack, 0.3);
      const pr = room.shoot('bubble', p.id, p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18, a, B.bubble.speed, B.bubble.life, 0);
      pr.hitR = 16;
      room.sfx('bubble', p.x, p.y);
    }
  },

  ult(room, p) {
    p.k.giant = 1;
    p.k.bonusHp = Math.round(p.maxHp * B.ult.hpMul);
    p.maxHp += p.k.bonusHp; p.hp += p.k.bonusHp;
    grabbed.set(p, new Map());
    room.setAnim(p, Anim.Cast, 0.6);
    room.fx('slimeSplit', p.x, p.y, { o: p.id, n: 2 });
    room.sfx('splash', p.x, p.y);
    p.ultT = B.ult.t;
    return true;
  },

  speedMul: (room, p) => ((p.k.trailEnd ?? 0) > room.time ? B.trail.speedMul : 1),
  damageTakenMul: (room, p) => (copies(room, p).length ? B.split.dmgTakenMul : 1),
  onDealDamage: (room, p, _t, amount) => (copies(room, p).length ? amount * B.split.dmgMul : amount),

  tick(room, p, dt) {
    const mine = copies(room, p);
    // se divide al perder cada 30 % de la vida (cada umbral, una vez hasta que se recupere)
    const frac = p.hp / p.maxHp;
    B.split.steps.forEach((s, i) => {
      const key = `split${i}`;
      if (frac > s + 0.15) p.k[key] = 0;
      else if (frac < s && !p.k[key] && !p.k.giant) {
        p.k[key] = 1;
        for (let j = 0; j < 2; j++) {
          const ang = Math.random() * Math.PI * 2;
          const f = room.findFreeSpot(p.x + Math.cos(ang) * 30, p.y + Math.sin(ang) * 24, 12);
          room.spawnMinion(p, f.x, f.y, 'slimelet', p.skin, j, B.split.t, false, 4);
        }
        room.fx('slimeSplit', p.x, p.y, { o: p.id, n: 1 });
        room.sfx('splash', p.x, p.y);
      }
    });
    if (mine.length && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * B.split.regen * dt);
    // rastro de veneno
    const trail = (p.k.trailEnd ?? 0) > room.time;
    for (const m of mine) m.speed = B.slimelet.speed * (trail ? B.trail.speedMul : 1);
    if (trail) { venomTrail(room, p, p); for (const m of mine) venomTrail(room, p, m); }
    // masa crítica: atrapa y arrastra
    if (p.k.giant) {
      if (p.ultT <= 0 || p.dead) { endGiant(room, p); return; }
      const g = grabbed.get(p)!;
      room.forEachEnemyNear(p, p.x, p.y, B.ult.grabR, (m) => {
        if (m.dead || g.has(m.id) || m.kind === Kind.Minion && (m as Minion).speed === 0) return;
        g.set(m.id, Math.random() * Math.PI * 2);
      });
      for (const [id, ang] of g) {
        const m = room.npcs.get(id) ?? room.hunters.get(id) ?? room.minions.get(id) ?? room.findPlayerById(id);
        if (!m || m.dead) { g.delete(id); continue; }
        m.x = p.x + Math.cos(ang + room.time) * 22; m.y = p.y + Math.sin(ang + room.time) * 12;
        m.rootT = Math.max(m.rootT, 0.15); m.knock = null;
        if (m.kind === Kind.Player) (m as Player).k.engulfed = room.time + 0.3; // dentro del slime (el cliente lo tiñe)
        room.damage(m, B.ult.dps * dt, { ...room.src(p), raw: true }, false, true);
      }
    }
  },

  onProjectileEnd(room, p, pr) {
    if (pr.type === 'bubble') { burst(room, p, pr.x, pr.y, B.bubble.r, B.bubble.dmg, B.bubble.knock); goo(room, p, pr.x, pr.y); }
  },

  onMinionDeath(room, p, m) {
    if (m.variant !== 'slimelet') return;
    // nv. 15: al reunirse (se acaba su tiempo) revientan en baba
    if (p.tier >= 3 && m.life <= 0) { burst(room, p, m.x, m.y, 80, 0.5, 60); goo(room, p, m.x, m.y, 44); }
    else room.fx('slimeSplit', m.x, m.y, { o: m.id, n: -1 });
  },

  onPickup(room, p) { if (p.tier >= 1) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * B.absorb); },
  onKill(room, p, v) { if (p.tier >= 1 && v.kind !== Kind.Minion) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * B.absorb * 0.5); },
};
