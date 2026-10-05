// 🎭 Doppy, el Doppelgänger: engaño e imitación.
// - Mil caras (pasiva): sin luchar un rato, se convierte en un humano cualquiera; su primer golpe aturde.
// - Robar rostro (Q): copia a un monstruo cercano (aspecto, nombre y kit: básico, Q y E) unos segundos.
// - Engatusar (E): se vuelve un humano irresistible; humanos y cazadores le siguen embobados, los monstruos se acercan.
// - Doble perfecto (R): imita la definitiva del monstruo más cercano (o una al azar) convirtiéndose en él.
import { BAL } from '../../shared/balance';
import { CHARACTERS, CHARACTER_IDS, type CharacterId } from '../../shared/characters';
import { Anim, Kind } from '../../shared/protocol';
import type { Npc, Player } from '../entities';
import type { Room } from '../Room';
import type { Kit } from './types';

const B = BAL.doppy;
const VARIANTS: Record<string, string[]> = {
  elm: ['teen', 'neighbor', 'jock', 'nerd'],
  transylvania: ['villager', 'priest', 'maid'],
  camp: ['camper', 'counselor', 'jock', 'nerd'],
};
// orden fijo de personajes para guardar el imitado como número en p.k
const IDS = CHARACTER_IDS;

let kitsRef: Record<CharacterId, Kit> | null = null;
/** Registro de kits (se inyecta desde kits/index.ts para evitar dependencias circulares). */
export function setKits(k: Record<CharacterId, Kit>) { kitsRef = k; }

const mimicChar = (room: Room, p: Player): CharacterId | null => ((p.k.mimicEnd ?? 0) > room.time ? IDS[p.k.mimic] : null);
const mimicKit = (room: Room, p: Player): Kit | null => { const c = mimicChar(room, p); return c && kitsRef ? kitsRef[c] : null; };

/** Se convierte en otro monstruo durante t segundos (aspecto + kit). */
function becomeMonster(room: Room, p: Player, char: CharacterId, skin: string, name: string, level: number, t: number) {
  p.k.mimic = IDS.indexOf(char);
  p.k.mimicEnd = room.time + t;
  p.def = CHARACTERS[char];
  p.cdMax = [p.def.attackCd, p.def.abilities[0].cooldown * (1 - 0.08 * p.ups.pow), p.def.abilities[1].cooldown * (1 - 0.08 * p.ups.pow)];
  p.guise = `char:${char}:${skin}:${name}:${level}`;
  room.fx('mimic', p.x, p.y, { o: p.id, c: char });
  room.sfx('poof', p.x, p.y);
}

function endMimic(room: Room, p: Player) {
  p.k.mimicEnd = 0;
  p.def = CHARACTERS.doppy;
  p.cdMax = [p.def.attackCd, p.def.abilities[0].cooldown * (1 - 0.08 * p.ups.pow), p.def.abilities[1].cooldown * (1 - 0.08 * p.ups.pow)];
  p.qCharges = 1;
  p.cd[1] = Math.max(p.cd[1], 6); // Robar rostro vuelve a estar disponible poco después
  p.jetT = 0; p.submergeT = 0; p.flyT = Math.min(p.flyT, 0.01); p.phaseT = Math.min(p.phaseT, 0.001);
  if (p.guise?.startsWith('char:')) p.guise = null;
  room.fx('mimic', p.x, p.y, { o: p.id, c: 'doppy' });
}

/** Monstruo más cercano que se pueda copiar. */
function nearestMonster(room: Room, p: Player, R: number): Player | null {
  let best: Player | null = null, bd = R * R;
  for (const o of room.players.values()) {
    if (o === p || o.dead || o.char === 'doppy' || o.invisKind === 'full') continue;
    const d = (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

export const doppyKit: Kit = {
  basic(room, p, a) {
    const mk = mimicKit(room, p);
    if (mk) { mk.basic(room, p, a); return; }
    // golpe por sorpresa desde el disfraz de humano
    const surprise = !!p.guise?.startsWith('npc:');
    if (surprise) { p.guise = null; room.fx('mimic', p.x, p.y, { o: p.id, c: 'doppy' }); }
    const mul = surprise ? (p.tier >= 1 ? B.surpriseMulT1 : B.surpriseMul) : 1;
    const res = room.meleeSwing(p, a, { sfx: 'punch', dmgFor: (m) => mul * (m.charmT > 0 && m.charmBy === p.id ? B.charm.dmgTakenMul : 1) });
    if (surprise) for (const h of res.hits) { h.m.stunT = Math.max(h.m.stunT, B.surpriseStun); room.fx('surprise', h.m.x, h.m.y, { o: h.m.id }); }
  },

  ability(room, p, slot, a) {
    const mk = mimicKit(room, p);
    if (mk) { mk.ability(room, p, slot, a); return; }
    room.breakStealth(p);
    if (p.guise?.startsWith('npc:')) p.guise = null;
    if (slot === 0) {
      // Robar rostro
      const t = nearestMonster(room, p, B.steal.range);
      if (!t) { p.cd[1] = 0.3; return; }
      room.fx('faceSteal', t.x, t.y, { o: p.id, tx: Math.round(p.x), ty: Math.round(p.y) });
      becomeMonster(room, p, t.char, t.skin, t.name, t.level, p.tier >= 3 ? B.steal.tT3 : B.steal.t);
      p.cd[1] = 0; p.cd[2] = 0; // la Q y la E prestadas empiezan listas
    } else {
      // Engatusar: un humano irresistible
      const R = p.tier >= 3 ? B.charm.rT3 : B.charm.r;
      p.guise = `npc:${Math.random() < 0.5 ? 'hunk' : 'belle'}:${Math.floor(Math.random() * 97)}`;
      p.k.charmEnd = room.time + B.charm.buffT;
      room.setAnim(p, Anim.Taunt, 0.8);
      for (const n of room.npcs.values()) if ((n.x - p.x) ** 2 + (n.y - p.y) ** 2 < R * R) { room.charm(n, B.charm.tNpc, p); (n as Npc).fleeing = false; }
      for (const h of room.hunters.values()) if ((h.x - p.x) ** 2 + (h.y - p.y) ** 2 < R * R) { room.charm(h, B.charm.tNpc, p); h.target = -1; }
      for (const o of room.players.values()) if (o !== p && !o.dead && o.protectT <= 0 && (o.x - p.x) ** 2 + (o.y - p.y) ** 2 < R * R) room.charm(o, B.charm.tPlayer, p);
      room.fx('charm', p.x, p.y, { o: p.id, r: R });
      room.sfx('charm', p.x, p.y);
    }
  },

  ult(room, p, a) {
    if (mimicChar(room, p)) endMimic(room, p);
    // copia la definitiva del monstruo más cercano; si no hay, una al azar
    const near = nearestMonster(room, p, B.ult.range);
    const pool = IDS.filter((c) => c !== 'doppy' && c !== 'mary' && c !== 'nightmare');
    const order: { char: CharacterId; skin: string; name: string; level: number }[] = [];
    if (near && near.char !== 'mary' && near.char !== 'nightmare') order.push({ char: near.char, skin: near.skin, name: near.name, level: near.level });
    for (let i = 0; i < 3; i++) { const c = pool[Math.floor(Math.random() * pool.length)]; order.push({ char: c, skin: 'classic', name: p.name, level: p.level }); }
    for (const o of order) {
      becomeMonster(room, p, o.char, o.skin, o.name, o.level, 2);
      const ok = kitsRef?.[o.char].ult(room, p, a);
      if (ok) {
        p.k.mimicEnd = room.time + Math.max(p.ultT, 2) + B.ult.extra;
        p.ultT = Math.max(p.ultT, 0.5);
        return true;
      }
      endMimic(room, p);
    }
    return false;
  },

  tick(room, p, dt) {
    const mc = mimicChar(room, p);
    if (!mc && (p.k.mimicEnd ?? 0) > 0) endMimic(room, p);
    const mk = mimicKit(room, p);
    if (mk) mk.tick?.(room, p, dt);
    // fin del engatusamiento
    if ((p.k.charmEnd ?? 0) > 0 && room.time > p.k.charmEnd) { p.k.charmEnd = 0; if (p.guise?.startsWith('npc:')) { p.guise = null; room.fx('mimic', p.x, p.y, { o: p.id, c: 'doppy' }); } }
    // Mil caras: disfraz automático de humano si no lucha
    const after = p.tier >= 1 ? B.disguiseAfterT1 : B.disguiseAfter;
    if (!p.guise && !mc && room.time - p.lastCombatT > after && room.time - p.lastHurtT > after && p.protectT <= 0) {
      const v = VARIANTS[room.theme] ?? VARIANTS.elm;
      p.guise = `npc:${v[Math.floor(Math.random() * v.length)]}:${Math.floor(Math.random() * 97)}`;
      room.fx('mimic', p.x, p.y, { o: p.id, c: 'npc' });
      room.sfx('poof', p.x, p.y);
    }
    void Kind;
  },

  // mientras imita a otro, todos sus ganchos son los del imitado
  speedMul: (room, p) => mimicKit(room, p)?.speedMul?.(room, p) ?? 1,
  atkSpeedMul: (room, p) => mimicKit(room, p)?.atkSpeedMul?.(room, p) ?? 1,
  cdRate: (room, p) => mimicKit(room, p)?.cdRate?.(room, p) ?? 1,
  qCharges: (p) => (kitsRef && (p.k.mimicEnd ?? 0) > 0 ? kitsRef[IDS[p.k.mimic]].qCharges?.(p) ?? 1 : 1),
  onKill: (room, p, v) => mimicKit(room, p)?.onKill?.(room, p, v),
  onDealDamage: (room, p, t, amount) => {
    const mk = mimicKit(room, p);
    const a = mk?.onDealDamage ? mk.onDealDamage(room, p, t, amount) : amount;
    return t.charmT > 0 && t.charmBy === p.id && !mk ? a * B.charm.dmgTakenMul : a;
  },
  onProjectileHit: (room, p, pr, t, dealt) => mimicKit(room, p)?.onProjectileHit?.(room, p, pr, t, dealt),
  onProjectileEnd: (room, p, pr) => mimicKit(room, p)?.onProjectileEnd?.(room, p, pr),
  blockProjectile: (room, p, pr) => mimicKit(room, p)?.blockProjectile?.(room, p, pr) ?? false,
  onMinionDeath: (room, p, m) => mimicKit(room, p)?.onMinionDeath?.(room, p, m),
  onHurt: (room, p, amount) => mimicKit(room, p)?.onHurt?.(room, p, amount),
  onSleep: (room, p, t) => mimicKit(room, p)?.onSleep?.(room, p, t),
};
