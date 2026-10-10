// 🤖 Bots de relleno: monstruos controlados por el servidor para que una sala nunca parezca vacía.
// - Sala libre / previa: hasta 3 bots; cada jugador real que entra quita uno (con 4 reales no hay bots).
// - Su nivel no pasa de 2-3 al principio y, después, del nivel de los jugadores reales.
// - En la previa de El Señor de la Noche solo van al círculo de velas si hay algún jugador real.
// - De vez en cuando saludan o se burlan.
import { BOTS } from '../shared/balance';
import { BTN_ATTACK, BTN_E, BTN_Q, BTN_R } from '../shared/constants';
import { UPGRADES, upgradeMax, type CharacterId } from '../shared/characters';
import type { Mob, Player } from './entities';
import type { Room } from './Room';
import type { Conn } from './types';

export interface Brain {
  cap: number; // nivel máximo propio (2-3) mientras los jugadores no le superen
  tgt: number; // id del objetivo (-1 = ninguno)
  retargetT: number;
  wanderT: number; wx: number; wy: number;
  stuckT: number; lx: number; ly: number;
  emoteT: number; upT: number; q: number;
  pauseT: number; // quieto un momento (emote)
  aggro: number; // ganas de pelear con otros monstruos (0-1)
  spot: { x: number; y: number } | null; // sitio en el círculo de velas
}

let nextBotId = -1;
const used = new Set<string>();

function pickName(): string {
  const free = BOTS.names.filter((n) => !used.has(n));
  const n = free.length ? free[Math.floor(Math.random() * free.length)] : `Monstruo${Math.floor(Math.random() * 900 + 100)}`;
  used.add(n);
  return n;
}
export function releaseName(n: string) { used.delete(n); }

/** Conexión ficticia: no envía nada y su perfil no se guarda. */
export function botConn(): Conn {
  const id = nextBotId--;
  const name = pickName();
  return {
    id, name, roomCode: null,
    profile: { token: `bot${id}`, name, coins: 0, medals: [], chars: [], skins: [], stats: { npcKills: 0, hunterKills: 0, playerKills: 0, deaths: 0, games: 0, bestScore: 0 }, createdAt: 0 },
    send() {},
  } as Conn;
}

/** Monstruo para un bot nuevo: distinto de los de los demás bots de la sala. */
export function pickChar(room: Room): CharacterId {
  const taken = new Set([...room.players.values()].filter((p) => p.bot).map((p) => p.char));
  const free = BOTS.chars.filter((c) => !taken.has(c));
  const pool = free.length ? free : BOTS.chars;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function newBrain(): Brain {
  return {
    cap: BOTS.capMin + Math.floor(Math.random() * (BOTS.capMax - BOTS.capMin + 1)),
    tgt: -1, retargetT: 0, wanderT: 0, wx: 0, wy: 0, stuckT: 0, lx: 0, ly: 0,
    emoteT: BOTS.emoteMin + Math.random() * (BOTS.emoteMax - BOTS.emoteMin), upT: 2, q: 0,
    pauseT: 0, aggro: 0.35 + Math.random() * 0.4, spot: null,
  };
}

const d2 = (a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

function findMob(room: Room, id: number): Mob | undefined {
  return room.npcs.get(id) ?? room.hunters.get(id) ?? [...room.players.values()].find((p) => p.id === id);
}

/** Elige a quién perseguir: humanos primero; monstruos cercanos según su agresividad; Cazadores solo con buena vida. */
function chooseTarget(room: Room, p: Player, br: Brain): Mob | null {
  let best: Mob | null = null, bs = Infinity;
  const healthy = p.hp > p.maxHp * 0.55;
  const consider = (m: Mob, w: number) => {
    if (m.dead || w <= 0) return;
    const s = Math.sqrt(d2(p, m)) / w;
    if (s < bs) { bs = s; best = m; }
  };
  for (const n of room.npcs.values()) if (d2(p, n) < 1400 ** 2) consider(n, 1);
  for (const h of room.hunters.values()) if (d2(p, h) < 700 ** 2) consider(h, healthy ? 0.7 : 0);
  for (const o of room.players.values()) {
    if (o === p || o.dead || o.protectT > 0 || p.allies.has(o.id)) continue;
    if (room.mode === 'lobby') continue;
    const near = d2(p, o) < BOTS.fightR ** 2;
    const w = room.mode === 'br' ? 1.2 : near ? br.aggro * (healthy ? 1 : 0.3) : 0;
    consider(o, w);
  }
  return best;
}

/** Calcula la entrada del bot para este tick (la misma que mandaría un cliente). */
export function botInput(room: Room, p: Player, br: Brain, dt: number, real: number) {
  let mx = 0, my = 0, a = p.input.a, b = 0, d = 200;
  const go = (x: number, y: number, stop = 8) => {
    const dx = x - p.x, dy = y - p.y, L = Math.hypot(dx, dy);
    if (L > stop) { mx = dx / L; my = dy / L; }
    a = Math.atan2(dy, dx);
    return L;
  };

  if (br.pauseT > 0) { br.pauseT -= dt; br.lx = p.x; br.ly = p.y; return { mx, my, a, b, d }; }
  // atascado: un paseo corto en otra dirección
  const moved = Math.hypot(p.x - br.lx, p.y - br.ly);
  br.lx = p.x; br.ly = p.y;
  br.stuckT = moved < 1.5 && (p.input.mx || p.input.my) ? br.stuckT + dt : 0;
  if (br.stuckT > 0.5 && br.wanderT <= 0) { br.wanderT = 0.8; const ang = Math.random() * Math.PI * 2; br.wx = Math.cos(ang); br.wy = Math.sin(ang); br.tgt = -1; }
  if (br.wanderT > 0) { br.wanderT -= dt; return { mx: br.wx, my: br.wy, a: Math.atan2(br.wy, br.wx), b: 0, d }; }

  // previa: al círculo de velas solo si hay alguien real; si no, pasean por fuera
  if (room.mode === 'lobby') {
    const R = room.map.ready;
    if (R) {
      if (real > 0) {
        br.spot ??= (() => { const ang = Math.random() * Math.PI * 2, rr = R.r * (0.25 + Math.random() * 0.45); return { x: R.x + Math.cos(ang) * rr, y: R.y + Math.sin(ang) * rr }; })();
        go(br.spot.x, br.spot.y, 10);
      } else {
        br.spot = null;
        const L = Math.sqrt(d2(p, R));
        if (L < R.r + 90) { const ang = Math.atan2(p.y - R.y, p.x - R.x); go(R.x + Math.cos(ang) * (R.r + 200), R.y + Math.sin(ang) * (R.r + 200)); }
        else if (Math.random() < dt * 0.4) { br.wanderT = 1 + Math.random() * 1.5; const ang = Math.random() * Math.PI * 2; br.wx = Math.cos(ang); br.wy = Math.sin(ang); }
      }
    }
    return { mx, my, a, b, d };
  }

  // ectoplasma (El Señor de la Noche): a por el vivo más cercano para resucitar
  if (p.ecto) {
    let t: Player | null = null, bd = Infinity;
    for (const o of room.players.values()) if (!o.dead && o.protectT <= 0 && d2(p, o) < bd) { bd = d2(p, o); t = o; }
    if (t) {
      const L = go(t.x, t.y, 30);
      if (L < 110) b |= BTN_E;
      if (L < 200 && Math.random() < dt * 0.5) b |= BTN_Q;
    }
    return { mx, my, a, b, d };
  }

  // El Señor de la Noche: si le da el sol, corre a la niebla
  if (room.mode === 'br' && room.sunlit(p.x, p.y)) {
    go(room.nl.fogX, room.nl.fogY);
    return { mx, my, a, b, d };
  }

  // huir de los Cazadores con poca vida
  if (p.hp < p.maxHp * 0.3) {
    for (const h of room.hunters.values()) {
      if (h.dead || d2(p, h) > 380 ** 2) continue;
      const dx = p.x - h.x, dy = p.y - h.y, L = Math.hypot(dx, dy) || 1;
      return { mx: dx / L, my: dy / L, a: Math.atan2(dy, dx), b: 0, d };
    }
  }

  br.retargetT -= dt;
  let t = br.tgt >= 0 ? findMob(room, br.tgt) : undefined;
  if (!t || t.dead || br.retargetT <= 0) {
    t = chooseTarget(room, p, br) ?? undefined;
    br.tgt = t?.id ?? -1;
    br.retargetT = 0.6 + Math.random() * 0.5;
  }
  if (!t) {
    // nadie a la vista: pasea hacia el centro del mapa con algo de azar
    if (Math.random() < dt * 0.5) { br.wanderT = 1 + Math.random() * 2; const S = room.map.size, ang = Math.atan2(S / 2 - p.y, S / 2 - p.x) + (Math.random() - 0.5) * 2.4; br.wx = Math.cos(ang); br.wy = Math.sin(ang); }
    return { mx, my, a, b, d };
  }
  const L = Math.sqrt(d2(p, t));
  const reach = p.def.range + p.r + t.r;
  const keep = p.def.rangedBasic ? Math.max(60, p.def.range * 0.7) : 18;
  if (L > keep + 10) go(t.x, t.y);
  else { a = Math.atan2(t.y - p.y, t.x - p.x); if (p.def.rangedBasic && L < keep * 0.6) { mx = -Math.cos(a); my = -Math.sin(a); } }
  d = Math.round(L);
  if (L < reach + 12) b |= BTN_ATTACK;
  // habilidades: con algo de azar para que no parezcan máquinas
  if (L < 320 && p.cd[1] <= 0 && Math.random() < dt * 1.2) b |= BTN_Q;
  if (L < 280 && p.cd[2] <= 0 && Math.random() < dt * 0.6) b |= BTN_E;
  if (p.tier >= 2 && L < 300 && Math.random() < dt * 0.8) b |= BTN_R;
  return { mx, my, a, b, d };
}

/** Lo que hace el bot fuera del combate: repartir mejoras y algún emote. */
export function botChores(room: Room, p: Player, br: Brain, dt: number) {
  br.upT -= dt;
  if (br.upT <= 0) {
    br.upT = 1.5 + Math.random() * 2;
    if (p.upPts > 0) {
      const opts = UPGRADES.filter((u) => p.ups[u.id] < upgradeMax(u, p.level));
      const u = opts[Math.floor(Math.random() * opts.length)];
      if (u) room.onUpgrade(p.conn, u.id);
    }
  }
  br.emoteT -= dt;
  if (br.emoteT <= 0) {
    br.emoteT = BOTS.emoteMin + Math.random() * (BOTS.emoteMax - BOTS.emoteMin);
    // saluda a quien tenga cerca; si no, a veces se burla
    const busy = room.mode !== 'lobby' && [...room.hunters.values(), ...room.players.values()].some((o) => o !== p && !o.dead && d2(p, o) < 260 ** 2);
    if (busy) { br.emoteT = 4; return; }
    const someone = [...room.players.values()].some((o) => o !== p && !o.dead && d2(p, o) < 600 ** 2);
    room.onEmote(p.conn, someone && Math.random() < 0.6 ? 'wave' : 'taunt');
    br.pauseT = 1.4;
  }
}

