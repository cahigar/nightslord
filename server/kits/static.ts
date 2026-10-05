// 📺 Interferencia: control e hipnosis a través de las teles.
// - Si hay una Interferencia en la sala, se encienden las teles del mapa (escaparates, casas y teles abandonadas).
// - Estática (básico): proyectil corto que mete Ruido (hipnosis). Al llenarse la hipnosis, la víctima camina hacia
//   la Interferencia o la tele más cercana.
// - Pasiva: las teles cercanas repiten sus ataques (estática y señal pirata).
// - Señal pirata (Q): onda que ralentiza e hipnotiza (también desde las teles cercanas).
// - Cambio de canal (E): las teles cercanas emiten una señal perturbadora unos segundos: quien esté frente a ellas se hipnotiza muy rápido.
// - Nv. 5: más daño a quien esté hipnotizado o casi.
// - Emisión nacional (R): se encienden todas las teles del mapa y un rayo salta de una a otra quitando vida e hipnotizando.
// - Nv. 15: más radio en los ataques de las teles.
import { BAL } from '../../shared/balance';
import { distToSegment } from '../../shared/maps';
import { Anim } from '../../shared/protocol';
import type { Mob, Player } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.static;
const PALETTE = ['#40ff90', '#ff4080', '#40c0ff', '#ffd040', '#c060ff', '#ff8030', '#80ffff', '#ffffff'];
/** Color propio de cada Interferencia (para su Emisión nacional). */
const colorOf = (p: Player) => PALETTE[p.id % PALETTE.length];

/** Teles cercanas a la Interferencia (índice y punto de emisión), las más cercanas primero. */
function nearTvs(room: Room, p: Player, r: number) {
  return room.tvSpots().map((s, i) => ({ i, ...s, d: Math.hypot(s.x - p.x, s.y - p.y) })).filter((t) => t.d < r).sort((a, b) => a.d - b.d);
}

function noise(room: Room, p: Player, x: number, y: number, a: number, dmgMul: number) {
  const pr = room.shoot('noise', p.id, x, y, a, B.noise.speed, B.noise.life, room.calcDamage(p, B.noise.dmg * dmgMul));
  pr.hitR = 12;
}

function wave(room: Room, p: Player, x: number, y: number, r: number) {
  room.forEachEnemyNear(p, x, y, r, (m) => {
    if (m.dead) return;
    room.slow(m, B.wave.slowT, B.wave.slowMul);
    room.addHypno(m, B.wave.hypno * room.powMult(p));
  });
  room.fx('tvWave', x, y, { r, c: colorOf(p) });
}

export const staticKit: Kit = {
  basic(room, p, a) {
    room.breakStealth(p);
    room.setAnim(p, Anim.Attack, 0.25);
    noise(room, p, p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18, a, 1);
    room.sfx('zap', p.x, p.y);
    // las teles cercanas disparan también al enemigo más cercano a ellas
    const R = p.tier >= 3 ? B.tvShotRT3 : B.tvShotR;
    for (const tv of nearTvs(room, p, B.tvR).slice(0, B.tvMax)) {
      const t = room.nearestEnemy(p, tv.x, tv.y, R, -1);
      if (t) noise(room, p, tv.x, tv.y - 20, Math.atan2(t.y - tv.y + 20, t.x - tv.x), B.tvDmg);
    }
  },

  ability(room, p, slot) {
    room.breakStealth(p);
    room.setAnim(p, Anim.Cast, 0.4);
    if (slot === 0) {
      // Señal pirata
      wave(room, p, p.x, p.y, B.wave.r);
      for (const tv of nearTvs(room, p, B.tvR).slice(0, B.tvMax)) wave(room, p, tv.x, tv.y, p.tier >= 3 ? B.wave.tvRT3 : B.wave.tvR);
      room.sfx('zap', p.x, p.y);
    } else {
      // Cambio de canal
      const until = room.time + B.channel.t;
      for (const tv of nearTvs(room, p, B.channel.r)) room.tvChannel.set(room.map.tvs[tv.i].id, { until, owner: p.id });
      room.fx('tvWave', p.x, p.y, { r: B.channel.r, c: colorOf(p), n: 1 });
      room.sfx('chant', p.x, p.y);
    }
  },

  ult(room, p) {
    room.broadcast = { until: room.time + B.ult.t, owner: p.id, color: colorOf(p) };
    p.ultT = B.ult.t;
    p.k.beamT = 0;
    room.setAnim(p, Anim.Cast, 0.8);
    room.sfx('thunder', p.x, p.y);
    return true;
  },

  onDealDamage(_room, p, t: Mob, amount) {
    return p.tier >= 1 && (t.hypnoT > 0 || t.hypno >= 50) ? amount * B.hypnoDmgMul : amount;
  },

  onProjectileHit(room, p, pr, m) {
    if (pr.type === 'noise' && !m.dead) room.addHypno(m, B.noise.hypno * room.powMult(p));
  },

  tick(room, p, dt) {
    const spots = room.tvSpots();
    // Cambio de canal: frente a las teles perturbadas la hipnosis sube muy rápido
    const R = p.tier >= 3 ? B.channel.tvRT3 : B.channel.tvR;
    for (const [id, c] of room.tvChannel) {
      if (c.owner !== p.id) continue;
      const i = room.map.tvs.findIndex((t) => t.id === id);
      if (i < 0) continue;
      room.forEachEnemyNear(p, spots[i].x, spots[i].y, R, (m) => room.addHypno(m, B.channel.rate * dt));
    }
    // Emisión nacional: el rayo salta de tele en tele por todo el mapa
    if (room.broadcast?.owner === p.id) {
      p.k.beamT = (p.k.beamT ?? 0) - dt;
      if (p.k.beamT > 0) return;
      p.k.beamT = B.ult.every;
      const hit = new Set<number>();
      for (const [a, b] of room.tvLinks) {
        const A = spots[a], Bp = spots[b];
        const cx = (A.x + Bp.x) / 2, cy = (A.y + Bp.y) / 2, half = Math.hypot(Bp.x - A.x, Bp.y - A.y) / 2 + B.ult.beamW;
        room.forEachEnemyNear(p, cx, cy, half, (m) => {
          if (m.dead || hit.has(m.id) || distToSegment(m.x, m.y, A.x, A.y - 20, Bp.x, Bp.y - 20) > B.ult.beamW + m.r) return;
          hit.add(m.id);
          room.damage(m, room.calcDamage(p, B.ult.dmg * room.powMult(p)), room.src(p));
          room.addHypno(m, B.ult.hypno);
        });
      }
    }
  },
};
