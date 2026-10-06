// 🕯️ Candle Man: control de luz, fuego y cera.
// - Llama de vela (básico): llamarada corta que quema un momento (y prende la cera que toca).
// - Cuerpo de cera (pasiva): al moverse deja gotas de cera. Quien pisa cera se ralentiza y acumula «encerado»;
//   al llenar la barra queda pegado al suelo 1 s (puede atacar). Cerca del fuego ataca más rápido.
// - Cera ardiente (Q): masa de cera que se pega al suelo, ralentiza mucho y encera. Si le llega fuego se prende:
//   deja de encerar y quema a quien la pisa. (Nv. 15: 2 cargas y el fuego salta a la cera cercana.)
// - Apagar la llama (E): 5 s apagado: menos daño, mucha más velocidad y casi invisible fuera de la luz.
//   Otra E para encenderse de golpe con una pequeña explosión de fuego.
// - Mecha interminable (nv. 5): los enemigos que mueren quemados dejan una vela que le cura al recogerla.
// - Se apagaron las luces (R): apaga todas las luces de una gran zona; los demás casi no ven, él corre y ataca más rápido.
import { BAL } from '../../shared/balance';
import { BTN_E } from '../../shared/constants';
import { Anim } from '../../shared/protocol';
import type { Player, Zone } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.candle;
const dark = (room: Room, p: Player) => (p.k.darkEnd ?? 0) > room.time;
const inZone = (z: Zone, x: number, y: number, pad = 0) => (x - z.ax) ** 2 + (y - z.ay) ** 2 < (z.w / 2 + pad) ** 2;
const myZones = (room: Room, p: Player, kind: Zone['kind']) => room.zones.filter((z) => z.kind === kind && z.owner === p.id && z.until > room.time);
const inDarkness = (room: Room, p: Player) => myZones(room, p, 'lightsout').some((z) => inZone(z, p.x, p.y));

/** La cera prende: deja de encerar y pasa a quemar un rato. */
function ignite(room: Room, z: Zone) {
  if (z.kind !== 'wax') return;
  z.kind = 'waxfire';
  z.born = room.time;
  z.until = room.time + (z.w > 60 ? B.glob.fireT : B.glob.fireT * 0.6);
  room.fx('waxIgnite', z.ax, z.ay, { r: Math.round(z.w / 2) });
}

/** Explosión al volver a encenderse. */
function relight(room: Room, p: Player, boom: boolean) {
  p.k.darkEnd = 0;
  room.fx('relight', p.x, p.y, { o: p.id, r: boom ? B.dark.boomR : 0 });
  if (!boom) return;
  room.forEachEnemyNear(p, p.x, p.y, B.dark.boomR, (m) => {
    if (m.dead) return;
    room.damage(m, room.calcDamage(p, B.dark.boomDmg * room.powMult(p)), room.src(p));
    room.burn(m, B.dark.burnT, B.dark.burnDps, p);
  });
  for (const z of myZones(room, p, 'wax')) if (inZone(z, p.x, p.y, B.dark.boomR)) ignite(room, z);
  room.sfx('explode', p.x, p.y);
}

/** ¿Hay fuego cerca? (hogueras, braseros, árboles ardiendo, zonas de fuego y cera encendida) */
function nearFire(room: Room, p: Player) {
  const R = B.nearFire.r;
  for (const z of room.zones) if ((z.kind === 'fire' || z.kind === 'waxfire') && inZone(z, p.x, p.y, R)) return true;
  for (const [i, b] of room.burning) { const o = room.map.obstacles[i]; if (o && b.flame > room.time && Math.hypot(o.x + o.w / 2 - p.x, o.y + o.h / 2 - p.y) < R + o.w / 2) return true; }
  for (const o of room.grid.near(p.x, p.y, R)) if ((o.type === 'firepit' || o.type === 'brazier' || o.type === 'cauldron') && Math.hypot(o.x + o.w / 2 - p.x, o.y + o.h / 2 - p.y) < R) return true;
  return false;
}

export const candleKit: Kit = {
  basic(room, p, a) {
    room.breakStealth(p);
    room.setAnim(p, Anim.Attack, 0.3);
    const F = B.flame;
    const pr = room.shoot('candleflame', p.id, p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16, a, F.speed, F.life, room.calcDamage(p, F.dmg));
    pr.hitR = 12;
    room.sfx('bolt', p.x, p.y);
  },

  ability(room, p, slot, a) {
    if (slot === 0) {
      // Cera ardiente: la masa cae donde apunta (hasta su alcance)
      room.breakStealth(p);
      const G = B.glob, d = Math.max(60, Math.min(p.input.d, G.range));
      const pr = room.shoot('waxglob', p.id, p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14, a, G.speed, d / G.speed, 0);
      pr.land = true; pr.ghost = true;
      room.setAnim(p, Anim.Cast, 0.35);
      room.sfx('splash', p.x, p.y);
      return;
    }
    // Apagar la llama
    p.k.darkEnd = room.time + B.dark.t; p.k.eAt = room.time; p.k.eHeld = 1;
    room.fx('snuff', p.x, p.y, { o: p.id });
    room.sfx('vanish', p.x, p.y);
  },

  ult(room, p) {
    const U = B.ult;
    room.addZone({ kind: 'lightsout', ax: p.x, ay: p.y, bx: p.x, by: p.y, w: U.r * 2, until: room.time + U.t, owner: p.id });
    room.fx('lightsOut', p.x, p.y, { r: U.r, o: p.id });
    room.setAnim(p, Anim.Cast, 0.6);
    room.sfx('ult', p.x, p.y);
    p.ultT = U.t;
    return true;
  },

  qCharges: (p) => (p.tier >= 3 ? 2 : 1),
  speedMul: (room, p) => (dark(room, p) ? B.dark.speedMul : 1) * (inDarkness(room, p) ? B.ult.speedMul : 1),
  atkSpeedMul: (room, p) => (p.k.nearFire ? B.nearFire.atkMul : 1) * (inDarkness(room, p) ? B.ult.atkMul : 1),
  onDealDamage: (room, p, _t, amount) => (dark(room, p) ? amount * B.dark.dmgMul : amount),

  onProjectileHit(room, p, pr, m) {
    if (pr.type === 'candleflame' && !m.dead) room.burn(m, B.flame.burnT, B.flame.burnDps, p);
  },

  onProjectileEnd(room, p, pr) {
    if (pr.type !== 'waxglob') return;
    const G = B.glob;
    const z = room.addZone({ kind: 'wax', ax: pr.x, ay: pr.y, bx: pr.x, by: pr.y, w: G.r * 2, until: room.time + G.t, owner: p.id });
    // cae sobre fuego: se prende al momento
    if (room.zones.some((o) => (o.kind === 'fire' || o.kind === 'waxfire') && o !== z && inZone(o, pr.x, pr.y, G.r))) ignite(room, z);
    room.fx('waxed', pr.x, pr.y, { r: G.r, n: 1 });
  },

  onKill(room, p, victim) {
    // Mecha interminable: los quemados dejan una vela
    if (p.tier < 1 || victim.burnT <= 0) return;
    room.addZone({ kind: 'candle', ax: victim.x, ay: victim.y, bx: victim.x, by: victim.y, w: 24, until: room.time + B.candle.life, owner: p.id });
  },

  tick(room, p, dt) {
    // E otra vez: encenderse de golpe (si no, se enciende sola al acabar)
    const eDown = (p.input.b & BTN_E) !== 0;
    if (dark(room, p) && eDown && !p.k.eHeld && room.time - (p.k.eAt ?? 0) > 0.3) relight(room, p, true);
    else if (p.k.darkEnd && !dark(room, p)) relight(room, p, false);
    p.k.eHeld = eDown ? 1 : 0;
    // gotas de cera al moverse
    if (p.moving && p.flyT <= 0) {
      p.k.drip = (p.k.drip ?? 0) + room.calcSpeed(p) * dt;
      if (p.k.drip >= B.drip.every) {
        p.k.drip = 0;
        room.addZone({ kind: 'wax', ax: p.x - p.facing * 8, ay: p.y + 4, bx: p.x - p.facing * 8, by: p.y + 4, w: B.drip.r * 2, until: room.time + B.drip.t, owner: p.id });
      }
    }
    // pasiva: fuego cerca (se comprueba cada medio segundo)
    if (room.time >= (p.k.fireCheck ?? 0)) { p.k.fireCheck = room.time + 0.5; p.k.nearFire = nearFire(room, p) ? 1 : 0; }
    // la cera: encera y ralentiza; encendida, quema
    const waxes = myZones(room, p, 'wax'), fires = myZones(room, p, 'waxfire');
    for (const z of waxes) {
      const big = z.w > 60;
      room.forEachEnemyNear(p, z.ax, z.ay, z.w / 2, (m) => {
        if (m.dead || !inZone(z, m.x, m.y, m.r * 0.5)) return;
        room.slow(m, 0.3, big ? B.glob.slowMul : B.slowMul);
        m.wax += (big ? B.glob.wax : B.drip.wax) * dt;
        if (m.wax >= 100) {
          m.wax = 0;
          m.rootT = Math.max(m.rootT, B.waxRoot);
          if ('dash' in m) (m as Player).dash = null;
          room.fx('waxed', m.x, m.y, { o: m.id });
        }
      });
    }
    for (const z of fires) room.forEachEnemyNear(p, z.ax, z.ay, z.w / 2, (m) => {
      if (m.dead || !inZone(z, m.x, m.y, m.r * 0.5)) return;
      room.damage(m, B.glob.fireDps * dt * (1 + 0.03 * (p.level - 1)), { ...room.src(p), raw: true }, false, true);
      m.wax = 0;
      if (m.burnT < 0.5) room.burn(m, 1, B.flame.burnDps, p);
    });
    // la llama prende la cera que toca (y cualquier fuego que la alcance)
    if (waxes.length) {
      for (const pr of room.projectiles.values()) if (pr.owner === p.id && pr.type === 'candleflame') for (const z of waxes) if (inZone(z, pr.x, pr.y)) ignite(room, z);
      for (const z of waxes) if (z.kind === 'wax' && room.zones.some((o) => o.kind === 'fire' && inZone(o, z.ax, z.ay, z.w / 2))) ignite(room, z);
    }
    // nv. 15: el fuego salta a la cera cercana
    if (p.tier >= 3 && fires.length && room.time >= (p.k.spreadAt ?? 0)) {
      p.k.spreadAt = room.time + B.spread.every;
      for (const f of fires) for (const z of myZones(room, p, 'wax')) if (Math.hypot(z.ax - f.ax, z.ay - f.ay) < f.w / 2 + z.w / 2 + B.spread.r) ignite(room, z);
    }
    // velas de los quemados
    for (const z of myZones(room, p, 'candle')) {
      if (Math.hypot(z.ax - p.x, z.ay - p.y) > B.candle.pickR + p.r) continue;
      z.until = 0;
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * B.candle.heal);
      room.fx('candlePick', z.ax, z.ay, { o: p.id });
      room.sfx('pickup', z.ax, z.ay);
    }
  },

  buffs(room, p, add, list) {
    if (dark(room, p)) add('snuffed', p.k.darkEnd - room.time);
    if (p.k.nearFire) list.push({ t: 'nearFire', r: 999 });
    if (inDarkness(room, p)) list.push({ t: 'lightsOut', r: 999 });
  },
};
