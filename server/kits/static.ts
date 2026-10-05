// 📺 Interferencia: control e hipnosis a través de las teles.
// - Si hay una Interferencia en la sala, se encienden las teles del mapa (escaparates, casas y teles abandonadas).
// - Estática (básico): proyectil corto que mete Ruido (hipnosis). Al llenarse la hipnosis, la víctima camina hacia
//   la Interferencia o la tele más cercana.
// - Pasiva: las teles cercanas repiten sus ataques (estática y señal pirata).
// - Señal pirata (Q): onda que ralentiza e hipnotiza (también desde las teles cercanas).
// - Cambio de canal (E): apunta a una tele y se mete dentro hasta 3 s (intocable). Con otra E sale donde apunte, cerca
//   de esa tele; si no hace nada, sale por una tele al azar. Al salir suelta un chispazo de estática que hipnotiza.
// - Nv. 5: más daño a quien esté hipnotizado o casi.
// - Emisión nacional (R): se encienden todas las teles del mapa y un rayo salta muy rápido de tele en tele quitando vida e hipnotizando.
// - Nv. 15: más radio en los ataques de las teles.
import { BAL } from '../../shared/balance';
import { distToSegment } from '../../shared/maps';
import { BTN_E } from '../../shared/constants';
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

const inTv = (room: Room, p: Player) => (p.k.tvEnd ?? 0) > room.time;

function enterTv(room: Room, p: Player, i: number) {
  const s = room.tvSpots()[i];
  room.fx('tvPop', p.x, p.y, { c: colorOf(p), n: 0 });
  p.x = s.x; p.y = s.y;
  p.k.tvEnd = room.time + B.channel.t; p.k.tvAt = i; p.k.eHeld = 1;
  p.mistT = Math.max(p.mistT, B.channel.t);
  p.dash = null; p.knock = null;
  room.tvChannel.set(room.map.tvs[i].id, { until: p.k.tvEnd, owner: p.id });
  room.setAnim(p, Anim.Cast, 0.4);
  room.fx('tvPop', s.x, s.y - 20, { c: colorOf(p), n: 1 });
  room.sfx('zap', s.x, s.y);
}

/** Sale de la tele: hacia el puntero (cerca de la tele) o por una tele al azar. */
function exitTv(room: Room, p: Player, toCursor: boolean) {
  const C = B.channel;
  const spots = room.tvSpots();
  const cur = spots[p.k.tvAt] ?? { x: p.x, y: p.y };
  let x: number, y: number;
  if (toCursor) {
    const d = Math.min(p.input.d, C.exitR);
    x = cur.x + Math.cos(p.input.a) * d; y = cur.y + Math.sin(p.input.a) * d;
  } else {
    const others = spots.filter((_, i) => i !== p.k.tvAt);
    const s = others.length ? others[Math.floor(Math.random() * others.length)] : cur;
    x = s.x; y = s.y + 10;
  }
  const f = room.findFreeSpot(x, y, p.r);
  room.tvChannel.delete(room.map.tvs[p.k.tvAt]?.id ?? -1);
  p.x = f.x; p.y = f.y;
  p.k.tvEnd = 0; p.mistT = 0;
  p.protectT = Math.max(p.protectT, 0.3);
  // chispazo de estática al salir
  room.forEachEnemyNear(p, p.x, p.y, C.popR, (m) => { if (!m.dead) room.addHypno(m, C.popHypno * room.powMult(p)); });
  room.fx('tvPop', p.x, p.y, { c: colorOf(p), n: 2, r: C.popR });
  room.sfx('zap', p.x, p.y);
}

export const staticKit: Kit = {
  basic(room, p, a) {
    if (inTv(room, p)) { p.cd[0] = 0.1; return; }
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

  ability(room, p, slot, a) {
    if (inTv(room, p)) { if (slot === 0) p.cd[1] = 0; return; }
    room.breakStealth(p);
    room.setAnim(p, Anim.Cast, 0.4);
    if (slot === 0) {
      // Señal pirata
      wave(room, p, p.x, p.y, B.wave.r);
      for (const tv of nearTvs(room, p, B.tvR).slice(0, B.tvMax)) wave(room, p, tv.x, tv.y, p.tier >= 3 ? B.wave.tvRT3 : B.wave.tvR);
      room.sfx('zap', p.x, p.y);
    } else {
      // Cambio de canal: se mete en la tele apuntada
      const C = B.channel;
      const ax = p.x + Math.cos(a) * Math.min(p.input.d, C.range), ay = p.y + Math.sin(a) * Math.min(p.input.d, C.range);
      const spots = room.tvSpots();
      let best = -1, bd = C.pick ** 2;
      spots.forEach((s, i) => { const d = (s.x - ax) ** 2 + (s.y - ay) ** 2; if (d < bd && (s.x - p.x) ** 2 + (s.y - p.y) ** 2 < (C.range + C.pick) ** 2) { bd = d; best = i; } });
      if (best < 0) { p.cd[2] = 0.3; return; } // sin tele no se gasta
      enterTv(room, p, best);
    }
  },

  ult(room, p) {
    room.broadcast = { until: room.time + B.ult.t, owner: p.id, color: colorOf(p) };
    p.ultT = B.ult.t;
    p.k.beamT = 0; p.k.boltAt = -1; p.k.boltPrev = -1;
    room.setAnim(p, Anim.Cast, 0.8);
    room.sfx('thunder', p.x, p.y);
    return true;
  },

  onDealDamage(_room, p, t: Mob, amount) {
    return p.tier >= 1 && (t.hypnoT > 0 || t.hypno >= 50) ? amount * B.hypnoDmgMul : amount;
  },

  speedMul: (room, p) => (inTv(room, p) ? 0 : 1),

  buffs(room, p, add) { if (inTv(room, p)) add('tvIn', p.k.tvEnd - room.time); },

  onProjectileHit(room, p, pr, m) {
    if (pr.type === 'noise' && !m.dead) room.addHypno(m, B.noise.hypno * room.powMult(p));
  },

  tick(room, p, dt) {
    // dentro de la tele: E otra vez sale hacia el puntero; si se acaba el tiempo, sale por una tele al azar
    const eDown = (p.input.b & BTN_E) !== 0;
    if ((p.k.tvAt ?? -1) >= 0 && p.k.tvEnd) {
      if (eDown && !p.k.eHeld) exitTv(room, p, true);
      else if (room.time >= p.k.tvEnd) exitTv(room, p, false);
      else { const s = room.tvSpots()[p.k.tvAt]; if (s) { p.x = s.x; p.y = s.y; } }
    }
    p.k.eHeld = eDown ? 1 : 0;
    // Emisión nacional: el rayo salta muy rápido de tele en tele
    if (room.broadcast?.owner !== p.id) return;
    const spots = room.tvSpots();
    if (spots.length < 2) return;
    p.k.beamT = (p.k.beamT ?? 0) - dt;
    if (p.k.beamT > 0) return;
    p.k.beamT = B.ult.hop;
    let at = p.k.boltAt ?? -1;
    if (at < 0 || at >= spots.length) {
      // empieza en la tele más cercana a la Interferencia
      let bd = Infinity;
      spots.forEach((s, i) => { const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2; if (d < bd) { bd = d; at = i; } });
    }
    const nb = neighbors(room, at).filter((j) => j !== p.k.boltPrev);
    const opts = nb.length ? nb : neighbors(room, at);
    // prefiere las teles con enemigos cerca
    const hot = opts.filter((j) => room.nearestEnemy(p, spots[j].x, spots[j].y, 260, -1));
    const pool = hot.length && Math.random() < 0.7 ? hot : opts;
    const to = pool[Math.floor(Math.random() * pool.length)] ?? at;
    const A = spots[at], Bp = spots[to];
    room.fx('tvBolt', A.x, A.y - 20, { tx: Math.round(Bp.x), ty: Math.round(Bp.y - 20), c: colorOf(p) });
    if (Math.random() < 0.3) room.sfx('zap', Bp.x, Bp.y);
    const cx = (A.x + Bp.x) / 2, cy = (A.y + Bp.y) / 2, half = Math.hypot(Bp.x - A.x, Bp.y - A.y) / 2 + B.ult.hitR;
    room.forEachEnemyNear(p, cx, cy, half, (m) => {
      if (m.dead) return;
      const onLine = distToSegment(m.x, m.y, A.x, A.y - 20, Bp.x, Bp.y - 20) <= B.ult.beamW + m.r;
      const atTv = (m.x - Bp.x) ** 2 + (m.y - Bp.y) ** 2 < B.ult.hitR ** 2;
      if (!onLine && !atTv) return;
      room.damage(m, room.calcDamage(p, B.ult.dmg * room.powMult(p)), room.src(p));
      room.addHypno(m, B.ult.hypno);
    });
    p.k.boltPrev = at; p.k.boltAt = to;
  },
};

/** Teles conectadas con la tele i (red de la Emisión nacional). */
function neighbors(room: Room, i: number): number[] {
  const out: number[] = [];
  for (const [a, b] of room.tvLinks) { if (a === i) out.push(b); else if (b === i) out.push(a); }
  return out;
}
