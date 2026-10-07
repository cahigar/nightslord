// 🌳 Raíz Negra, el árbol maldito: un ent que hace brotar plantas del terreno.
// - Raíces profundas (pasiva): si se queda quieto echa raíces: regenera y recibe menos daño.
// - Zarzas (Q): las raíces revientan bajo el objetivo: dañan, enredan y dejan espinos que ralentizan.
// - Brotar (E): lo que crece depende de dónde apunta: junto a él una flor que le cura,
//   sobre un árbol o seto del mapa lo despierta como torreta, y en campo abierto levanta un muro de raíces.
// - Bosque maldito (R): un bosque crece a su alrededor: ralentiza, enreda una y otra vez y le cura a él y a sus plantas.
import { BAL } from '../../shared/balance';
import { Anim, Kind } from '../../shared/protocol';
import type { Minion, Mob, Player } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.tree;
type PlantKind = 'wall' | 'turret' | 'flower';
const VEGETATION = new Set(['tree', 'pine', 'deadtree', 'hedge', 'cypress', 'palm', 'jtree']); // también palmeras (Nilo) y árboles de la jungla

const plants = (room: Room, p: Player, kind?: PlantKind): Minion[] =>
  room.minionsOf(p.id).filter((m) => (kind ? m.variant === kind : m.variant === 'wall' || m.variant === 'turret' || m.variant === 'flower'));

function grow(room: Room, p: Player, kind: PlantKind, x: number, y: number, awake = false) {
  const life = p.tier >= 1 ? B.plantLifeT1 : B.plantLife;
  const m = room.spawnMinion(p, x, y, kind, '', awake ? 1 : 0, life, false, B[kind].cap); // lookSeed 1: árbol del mapa despertado
  if (awake) { m.maxHp = Math.round(m.maxHp * B.turret.awakenedMul); m.hp = m.maxHp; }
  m.atkCd = 0.6;
  room.fx('sprout', x, y, { o: m.id, c: kind });
  room.sfx('slam', x, y);
  return m;
}

/** Árbol o seto del mapa bajo (o junto a) un punto: se puede despertar como torreta. */
function vegetationAt(room: Room, x: number, y: number) {
  for (const o of room.map.obstacles) {
    if (!VEGETATION.has(o.type)) continue;
    if (x > o.x - 30 && x < o.x + o.w + 30 && y > o.y - 30 && y < o.y + o.h + 30) return o;
  }
  return null;
}

function nearestEnemy(room: Room, p: Player, x: number, y: number, r: number): Mob | null {
  let best: Mob | null = null, bd = r * r;
  room.forEachEnemyNear(p, x, y, r, (m) => {
    if (m.dead || m.entombT > 0 || m.hexT > 0) return;
    const d = (m.x - x) ** 2 + (m.y - y) ** 2;
    if (d < bd) { bd = d; best = m; }
  });
  return best;
}

export const treeKit: Kit = {
  basic(room, p, a) {
    const res = room.meleeSwing(p, a, { sfx: 'slam' });
    if (p.tier >= 3) for (const h of res.hits) room.root(h.m, B.lashRootT3); // nivel 15: el ramazo enreda un instante
  },

  ability(room, p, slot, a) {
    room.breakStealth(p);
    const d = Math.min(p.input.d, slot === 0 ? B.bramble.range : B.seedRange);
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    if (slot === 0) {
      // Zarzas: enredan y dañan; dejan espinos
      room.setAnim(p, Anim.Cast, 0.4);
      room.forEachEnemyNear(p, x, y, B.bramble.r, (m) => {
        room.damage(m, room.calcDamage(p, B.bramble.dmg * room.powMult(p)), room.src(p));
        room.root(m, p.tier >= 1 ? B.bramble.rootT1 : B.bramble.root);
      });
      room.addZone({ kind: 'thorns', ax: x, ay: y, bx: x, by: y, w: B.bramble.r * 2, until: room.time + B.bramble.zoneT, owner: p.id });
      room.fx('bramble', x, y, { r: B.bramble.r, o: p.id });
      room.sfx('slam', x, y);
      return;
    }
    // Brotar: qué crece depende de dónde apunta
    room.setAnim(p, Anim.Cast, 0.4);
    if (d < B.selfR) { grow(room, p, 'flower', p.x + Math.cos(a) * 40, p.y + Math.sin(a) * 40 + 10); return; }
    const veg = vegetationAt(room, x, y);
    if (veg) {
      // despierta un árbol del mapa: la torreta sale a su pie, del lado del Árbol
      const tx = Math.max(veg.x, Math.min(veg.x + veg.w, p.x)), ty = veg.y + veg.h + B.turret.r + 4;
      const f = room.findFreeSpot(tx, ty, B.turret.r);
      grow(room, p, 'turret', f.x, f.y, true);
      return;
    }
    const f = room.findFreeSpot(x, y, B.wall.r);
    if (Math.hypot(f.x - x, f.y - y) > 60) { grow(room, p, 'turret', f.x, f.y); return; } // sin sitio para un muro: brota una torreta
    grow(room, p, 'wall', f.x, f.y);
  },

  ult(room, p) {
    room.setAnim(p, Anim.Cast, 0.8);
    room.addZone({ kind: 'forest', ax: p.x, ay: p.y, bx: p.x, by: p.y, w: B.ult.r * 2, until: room.time + B.ult.t, owner: p.id });
    room.fx('forest', p.x, p.y, { r: B.ult.r, o: p.id, d: B.ult.t });
    room.sfx('slam', p.x, p.y);
    p.ultT = B.ult.t;
    p.k.forestTick = 0;
    return true;
  },

  eCharges: (p) => (p.tier >= 3 ? B.chargesT3 : B.charges),

  tick(room, p, dt) {
    // Raíces profundas: quieto un rato, echa raíces
    p.k.still = p.moving || p.flyT > 0 ? 0 : (p.k.still ?? 0) + dt;
    const rooted = p.k.still >= B.rootAfter;
    if (rooted && !p.k.rooted) p.k.rootFx = 0;
    p.k.rooted = rooted ? 1 : 0;
    if (rooted) {
      // atacar no rompe las raíces: es una fortaleza
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * B.rootRegen * dt);
      p.k.rootFx -= dt;
      if (p.k.rootFx <= 0) { p.k.rootFx = 1; room.fx('rooted', p.x, p.y, { o: p.id, d: 1.2, n: 1 }); }
    }

    const forest = p.ultT > 0 ? room.zones.find((z) => z.kind === 'forest' && z.owner === p.id) : undefined;
    const inForest = (m: Mob) => !!forest && (m.x - forest.ax) ** 2 + (m.y - forest.ay) ** 2 < (forest.w / 2) ** 2;

    // plantas
    for (const m of plants(room, p)) {
      if (inForest(m)) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * B.ult.heal * 2 * dt);
      if (m.variant === 'turret') {
        m.atkCd -= dt * (inForest(m) ? 1.6 : 1);
        if (m.atkCd > 0) continue;
        const t = nearestEnemy(room, p, m.x, m.y, B.turret.range);
        if (!t) continue;
        const awake = m.lookSeed === 1 ? B.turret.awakenedMul : 1;
        m.atkCd = B.turret.cd / awake;
        const shots = p.tier >= 3 ? 2 : 1;
        for (let i = 0; i < shots; i++) {
          const a = Math.atan2(t.y - m.y, t.x - m.x) + (i - (shots - 1) / 2) * 0.15;
          const pr = room.shoot('thorn', p.id, m.x, m.y - 10, a, B.turret.speed, B.turret.range / B.turret.speed + 0.1, room.calcDamage(p, B.turret.dmg * awake));
          pr.hitR = 10;
        }
        room.setAnim(m, Anim.Attack, 0.3);
      } else if (m.variant === 'flower') {
        if ((p.x - m.x) ** 2 + (p.y - m.y) ** 2 < B.flower.healR ** 2) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * (p.tier >= 1 ? B.flower.healT1 : B.flower.heal) * dt);
      } else if (m.variant === 'wall') {
        // el muro de raíces no deja pasar a los enemigos: los empuja fuera
        room.forEachEnemyNear(p, m.x, m.y, m.r + 4, (e) => {
          if (e === m || e.dead || e.kind === Kind.Minion && (e as Minion).owner === p.id) return;
          const dx = e.x - m.x, dy = e.y - m.y, dd = Math.hypot(dx, dy) || 1, min = m.r + e.r;
          if (dd >= min) return;
          const nx = m.x + (dx / dd) * min, ny = m.y + (dy / dd) * min;
          if (!room.grid.blocked(nx, ny, e.r)) { e.x = nx; e.y = ny; }
        });
      }
    }

    // Bosque maldito: le cura y enreda a enemigos al azar una y otra vez
    if (forest) {
      if (inForest(p)) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * B.ult.heal * dt);
      p.k.forestTick = (p.k.forestTick ?? 0) - dt;
      if (p.k.forestTick <= 0) {
        p.k.forestTick = B.ult.every;
        const foes: Mob[] = [];
        room.forEachEnemyNear(p, forest.ax, forest.ay, forest.w / 2, (m) => { if (!m.dead) foes.push(m); });
        for (const m of foes.sort(() => Math.random() - 0.5).slice(0, 4)) {
          room.damage(m, room.calcDamage(p, B.ult.dmg), room.src(p));
          room.root(m, B.ult.root);
        }
      }
    }
  },

  damageTakenMul: (_room, p) => ((p.k.rooted ?? 0) > 0 ? 1 - B.rootArmor : 1),
};
