// Prueba del modo El Señor de la Noche (sin red): previa → partida → ectoplasma → trampas → podio → vuelta a la previa.
// Uso: npx tsx tools/nltest.ts
import { BTN_E, BTN_Q } from '../shared/constants';
import { NIGHTLORD } from '../shared/balance';
import { Room, type RoomHooks } from '../server/Room';
import type { Conn } from '../server/types';
import type { ServerMsg } from '../shared/protocol';
import type { CharacterId } from '../shared/characters';

const step = (r: Room, n = 1) => { for (let i = 0; i < n; i++) (r as unknown as { step(): void }).step(); };
const logs: string[] = [];
const conns: Conn[] = [];
const last = new Map<number, ServerMsg[]>();
function mk(id: number, name: string): Conn {
  const c: Conn = {
    id, name, roomCode: null,
    profile: { token: 't' + id, name, coins: 0, medals: [], chars: [], skins: [], stats: { npcKills: 0, hunterKills: 0, playerKills: 0, deaths: 0, games: 0, bestScore: 0 }, createdAt: 0 },
    send: (m) => { if (m.t === 'snap') return; const l = last.get(id) ?? []; l.push(m); last.set(id, l); },
  };
  conns.push(c);
  return c;
}
let br: Room | null = null;
let lobby: Room;
const hooks: RoomHooks = {
  startMatch(l) {
    br = new Room('BR', 'cityz', true, undefined, 'br'); br.destroy(); br.mgr = hooks; br.home = l.code;
    for (const c of [...l.conns.values()]) { const p = l.players.get(c.id)!; l.removeConn(c); br.addConn(c, p.char, p.skin); }
    br.beginMatch();
    logs.push(`partida con ${br.players.size}`);
  },
  toLobby(c: Conn, ch: CharacterId, sk: string) { lobby.addConn(c, ch, sk); logs.push(`vuelve ${c.name}`); },
};
lobby = new Room('LOB', 'cemetery', false, undefined, 'lobby'); lobby.destroy(); lobby.mgr = hooks;
const chars: CharacterId[] = ['vampire', 'zombie', 'mummy'];
const cs = chars.map((ch, i) => { const c = mk(i + 1, ch); lobby.addConn(c, ch, 'classic'); return c; });
const R = lobby.map.ready!;
for (const p of lobby.players.values()) { p.x = R.x + (p.id % 3) * 20; p.y = R.y; }
step(lobby, 20 * 4);
const nl = (id: number) => (last.get(id) ?? []).filter((m) => m.t === 'nl').pop();
console.log('previa', JSON.stringify(nl(1)));
step(lobby, 20 * 7);
if (!br) throw new Error('no empezó la partida');
const B = br as Room;
const P = () => [...B.players.values()];
console.log(logs.join(' | '), 'npcs', B.npcs.size, 'objetos', B.powerups.size, 'altares', B.map.altars.length, 'tamaño', B.map.size);
step(B, 20 * 2);
console.log('2 s: niveles', P().map((p) => p.level).join(','), JSON.stringify(nl(1)));
// trampa: mano sepulcral
const [a, b, c] = P();
for (const p of P()) { p.protectT = 0; p.hp = p.maxHp; }
for (const n of B.npcs.values()) B.npcs.delete(n.id); // sin zombis molestando
a.trap = 'hand'; B.onTrap(a.conn);
b.x = a.x + 200; b.y = a.y;
step(B, 20);
b.x = a.x; b.y = a.y; step(B, 2);
console.log('mano sepulcral: raíz', b.rootT.toFixed(1));
// sello de silencio y pentáculo
a.trap = 'blood'; a.x += 300; B.onTrap(a.conn); step(B, 20); const hp0 = c.hp; c.x = a.x; c.y = a.y; step(B, 2);
console.log('pentáculo: daño', Math.round(hp0 - c.hp));
// muerte → ectoplasma → resucita matando
B.damage(b, 99999, { name: 'test', kind: 1 });
console.log('b muerto', b.dead, 'ecto', b.ecto);
c.hp = 5; c.protectT = 0; c.shieldHp = 0; b.x = c.x; b.y = c.y; b.ectoCd = [0, 0];
B.onInput(b.conn, { q: 1, mx: 0, my: 0, a: 0, b: BTN_E }); step(B, 1);
console.log('tras vibrar: b vivo', !b.dead, 'c ecto', c.ecto, 'c dead', c.dead);
B.onInput(c.conn, { q: 1, mx: 0, my: 0, a: 0, b: BTN_Q }); step(B, 1);
// sol
step(B, 20 * 30);
const sunny = P().filter((p) => !p.dead && B.sunlit(p.x, p.y)).length;
console.log('t', Math.round(B.nl.t), 'al sol', sunny, 'niebla r', Math.round(B.fogR()), JSON.stringify(nl(1)));
// fin
for (const p of P()) if (p !== a && !p.dead) B.damage(p, 99999, { name: 'test', kind: 1 });
step(B, 2);
console.log('fase', B.nl.phase, JSON.stringify(nl(1)));
step(B, 20 * (NIGHTLORD.podiumT + 1));
console.log(logs.join(' | '), 'previa jugadores', lobby.players.size, 'monedas', cs.map((c) => c.profile.coins).join(','), 'medallas a', a.conn.profile.medals.join(','));
// Paciente Cero convierte a los zombis del mapa
{
  const Z = new Room('Z', 'cityz', true, undefined, 'br'); Z.destroy();
  const zc = mk(21, 'pz'); Z.addConn(zc, 'zombie', 'classic'); Z.beginMatch();
  const zp = [...Z.players.values()][0]; zp.protectT = 0;
  const zn = [...Z.npcs.values()].find((n) => n.variant.startsWith('z-'))!;
  zn.x = zp.x + 60; zn.y = zp.y;
  Z.onInput(zc, { q: 1, mx: 0, my: 0, a: 0, b: BTN_Q, d: 60 }); step(Z, 2);
  console.log('Paciente Cero: esbirros', Z.minions.size, 'look', [...Z.minions.values()][0]?.look);
}
// todo el partido sin intervención: ¿suben de nivel?
const t0 = performance.now();
const L2 = new Room('BR2', 'cityz', true, undefined, 'br'); L2.destroy();
const xs = [mk(11, 'x'), mk(12, 'y')];
xs.forEach((c, i) => L2.addConn(c, (['werewolf', 'witch'] as CharacterId[])[i], 'classic'));
L2.beginMatch();
for (let s = 0; s < 560 && L2.nl.phase === 'match'; s++) { for (const p of L2.players.values()) { p.protectT = 99; } step(L2, 20); if (s % 100 === 99) { let lit = 0; for (let i = 0; i < 400; i++) if (L2.sunlit(Math.random() * 5600, Math.random() * 5600)) lit++; console.log(`  t=${s + 1}s sol cubre ${Math.round(lit / 4)}% niebla r=${Math.round(L2.fogR())}`); } }
console.log('9:20 sin luchar (a salvo): niveles', [...L2.players.values()].map((p) => p.level).join(','), `(${Math.round(performance.now() - t0)} ms)`);
