// 🌾 El Segador, el espantapájaros: control mediante miedo y zonas.
// - Acecho (pasiva): si se queda quieto 5 s, su siguiente golpe hace mucho más daño (aguanta hasta 3 s después de moverse).
// - Cuervos (Q): una bandada en línea recta que daña y ciega (nv. 15: vuelve hacia él).
// - Plantarse (E): se clava en el suelo, inmóvil y muy resistente; los enemigos cercanos huyen aterrorizados (nv. 15: 2 cargas).
// - Nv. 5: aparecen por el mapa espantapájaros iguales a él que no hacen nada (y asustan un poco al aparecer).
// - La Cosecha (R): crece trigo alto a su alrededor; dentro es rápido, pega más y es invisible hasta que ataca.
import { BAL } from '../../shared/balance';
import { Anim } from '../../shared/protocol';
import type { Player } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.scarecrow;

const inWheat = (room: Room, p: Player) => p.ultT > 0 && room.zones.some((z) => z.kind === 'wheat' && z.owner === p.id && (p.x - z.ax) ** 2 + (p.y - z.ay) ** 2 < (z.w / 2) ** 2);
const planted = (room: Room, p: Player) => (p.k.plantEnd ?? 0) > room.time;
/** ¿El golpe va cargado por el acecho? */
const charged = (room: Room, p: Player) => (p.k.still ?? 0) >= B.still.t || (p.k.graceEnd ?? 0) > room.time;

function attacked(room: Room, p: Player) { p.k.lastAtk = room.time; p.k.still = 0; p.k.graceEnd = 0; }

export const scarecrowKit: Kit = {
  basic(room, p, a) {
    const mul = charged(room, p) ? B.still.mul : 1;
    const res = room.meleeSwing(p, a, { sfx: 'claw', dmgFor: () => mul });
    if (mul > 1) room.fx('curseMark', p.x, p.y, { n: 1 });
    attacked(room, p);
    void res;
  },

  ability(room, p, slot, a) {
    room.breakStealth(p);
    if (slot === 0) {
      room.setAnim(p, Anim.Cast, 0.4);
      const pr = room.shoot('crows', p.id, p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, a, B.crows.speed, B.crows.life, room.calcDamage(p, B.crows.dmg * room.powMult(p)));
      pr.pierce = true; pr.hitSet = new Set(); pr.ghost = true; pr.hitR = 22;
      room.sfx('bat', p.x, p.y);
      attacked(room, p);
    } else {
      // Plantarse: inmóvil y muy resistente; los de alrededor huyen aterrorizados
      p.k.plantEnd = room.time + B.plant.t;
      p.rootT = Math.max(p.rootT, B.plant.t);
      p.dash = null;
      room.setAnim(p, Anim.Taunt, 0.5);
      room.forEachEnemyNear(p, p.x, p.y, B.plant.fearR, (m) => room.scare(m, B.plant.fearT, p.x, p.y));
      room.fx('scare', p.x, p.y, { o: p.id, r: B.plant.fearR });
      room.sfx('scream', p.x, p.y);
    }
  },

  ult(room, p) {
    room.addZone({ kind: 'wheat', ax: p.x, ay: p.y, bx: p.x, by: p.y, w: B.ult.r * 2, until: room.time + B.ult.t, owner: p.id });
    room.setAnim(p, Anim.Cast, 0.6);
    room.fx('forest', p.x, p.y, { r: B.ult.r, o: p.id, c: 'wheat' });
    room.sfx('howl', p.x, p.y);
    p.ultT = B.ult.t;
    p.k.lastAtk = -99;
    return true;
  },

  eCharges: (p) => (p.tier >= 3 ? B.plant.chargesT3 : 1),
  speedMul: (room, p) => (inWheat(room, p) ? B.ult.speedMul : 1),
  damageTakenMul: (room, p) => (planted(room, p) ? B.plant.dmgMul : 1),
  onDealDamage: (room, p, _t, amount) => (inWheat(room, p) ? amount * B.ult.dmgMul : amount),

  tick(room, p, dt) {
    // acecho: cuenta el tiempo quieto; al echar a andar conserva la carga unos segundos
    if (!p.moving) {
      const was = (p.k.still ?? 0) >= B.still.t;
      p.k.still = (p.k.still ?? 0) + dt;
      if (!was && p.k.still >= B.still.t) room.fx('curseMark', p.x, p.y, { n: 0 });
    } else {
      if ((p.k.still ?? 0) >= B.still.t) p.k.graceEnd = room.time + B.still.grace;
      p.k.still = 0;
    }
    // la Cosecha: invisible dentro del trigo hasta que ataca (y vuelve a esconderse al rato)
    if (inWheat(room, p) && room.time - (p.k.lastAtk ?? -99) > B.ult.reinvis) {
      if (p.invisKind === 'none') room.fx('vanish', p.x, p.y, { o: p.id });
      p.invisKind = 'timed'; p.invisT = Math.max(p.invisT, 0.3);
    }
    // nv. 5: espantapájaros por el mapa
    if (p.tier < 1) return;
    p.k.decoyT = (p.k.decoyT ?? B.decoy.every * 0.5) - dt;
    if (p.k.decoyT > 0) return;
    p.k.decoyT = B.decoy.every;
    if (room.minionsOf(p.id).filter((m) => m.variant === 'decoy').length >= B.decoy.max) return;
    const a = Math.random() * Math.PI * 2, d = 200 + Math.random() * (B.decoy.spawnR - 200);
    const f = room.findFreeSpot(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 18);
    const m = room.spawnMinion(p, f.x, f.y, 'decoy', '', 0, B.decoy.life, false, B.decoy.max);
    m.facing = Math.random() < 0.5 ? 1 : -1;
    room.fx('prop', m.x, m.y, { o: m.id });
    room.forEachEnemyNear(p, m.x, m.y, B.decoy.fearR, (e) => { if (e !== m) room.scare(e, B.decoy.fearT, m.x, m.y); });
    room.fx('scare', m.x, m.y, { r: B.decoy.fearR });
  },

  onProjectileHit(room, p, pr, m) {
    if (pr.type === 'crows' || pr.type === 'crowsback') room.blind(m, B.crows.blindT);
  },

  onProjectileEnd(room, p, pr) {
    // nv. 15: la bandada vuelve hacia él atravesando enemigos
    if (pr.type !== 'crows' || p.tier < 3 || p.dead) return;
    const back = room.shoot('crowsback', p.id, pr.x, pr.y, Math.atan2(p.y - pr.y, p.x - pr.x), B.crows.speed, 3, pr.dmg);
    back.pierce = true; back.hitSet = new Set(); back.ghost = true; back.home = p.id; back.hitR = 22;
  },
};
