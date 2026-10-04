// Prueba sin red de la orden de cazadores (aparición por nivel medio), del contagio y del chorro de K'thula.
// Uso: npx tsx tools/ordertest.ts
import { BTN_Q, BTN_ATTACK } from '../shared/constants';
import { Room } from '../server/Room';
import type { Conn } from '../server/types';
import type { CharacterId } from '../shared/characters';

function mk(id: number, char: CharacterId, sink: Map<string, number>, toasts: string[]): Conn {
  return { id, name: 'P' + id, roomCode: null,
    profile: { token: 't' + id, name: 'P' + id, coins: 0, medals: [], chars: [], skins: [], stats: { npcKills: 0, hunterKills: 0, playerKills: 0, deaths: 0, games: 0, bestScore: 0 }, createdAt: 0 },
    send: (m: any) => { if (m.t === 'snap') for (const e of m.ev) if (e.e === 'fx') sink.set(e.f, (sink.get(e.f) ?? 0) + 1); if (m.t === 'toast') toasts.push(m.text); } } as Conn;
}
function scenario(levels: number[], secs: number) {
  const room = new Room('T', 'camp', true); room.destroy();
  const step = () => (room as any).step();
  const fx = new Map<string, number>(); const toasts: string[] = [];
  const conns = levels.map((l, i) => { const c = mk(i + 1, 'werewolf', fx, toasts); room.addConn(c, 'werewolf', 'classic'); room.onCheat(c, l, false); return c; });
  const ps = [...room.players.values()];
  let maxCount: Record<string, number> = {};
  for (let t = 0; t < secs * 20; t++) {
    for (const p of ps) { p.protectT = Math.min(p.protectT, 0); if (p.dead) { p.dead = false; p.hp = p.maxHp; } if (p.hp < 30) p.hp = p.maxHp; }
    step();
    const c: Record<string, number> = {};
    for (const h of room.hunters.values()) c[h.type] = (c[h.type] ?? 0) + 1;
    for (const k in c) maxCount[k] = Math.max(maxCount[k] ?? 0, c[k]);
  }
  console.log(`niveles ${levels.join(',')} → max por tipo ${JSON.stringify(maxCount)} quiere ${JSON.stringify(room.hunterWants())} fx: ${['descend','smite','holysplash','summon'].map(f=>f+'×'+(fx.get(f)??0)).join(' ')} invocaciones=${toasts.length}`);
}
scenario([1, 2, 3], 30);
scenario([6, 5, 4], 30);
scenario([12, 10, 9, 11], 40);
scenario([15], 60);
scenario([22, 20, 25, 3, 2], 60);
scenario(Array.from({ length: 12 }, () => 22), 60);

// contagio
{
  const room = new Room('T', 'camp', true); room.destroy();
  const step = () => (room as any).step();
  const c = mk(1, 'zombie', new Map(), []);
  room.addConn(c, 'zombie', 'classic');
  const p = [...room.players.values()][0]; p.x = 1500; p.y = 1500;
  const n = [...room.npcs.values()][0]; n.x = 1600; n.y = 1500;
  for (const h of room.hunters.values()) { h.x = 100; h.y = 100; }
  room.onInput(c, { q: 1, mx: 0, my: 0, a: 0, b: BTN_Q, d: 100 }); step();
  room.onInput(c, { q: 2, mx: 0, my: 0, a: 0, b: 0, d: 100 });
  const hp: number[] = [];
  for (let t = 0; t < 120; t++) { step(); if (t % 20 === 0) hp.push(Math.round(n.hp)); }
  console.log(`contagio: vida npc cada s ${hp.join(' → ')} · esbirros=${room.minions.size}`);
}
// K'thula: chorro en agua
{
  const room = new Room('T', 'camp', true); room.destroy();
  const step = () => (room as any).step();
  const c = mk(1, 'kthula', new Map(), []);
  room.addConn(c, 'kthula', 'classic');
  const p = [...room.players.values()][0]; p.protectT = 0;
  // charca bajo ella estando quieta
  for (let t = 0; t < 40; t++) { room.onInput(c, { q: t + 1, mx: 0, my: 0, a: 0, b: 0 }); step(); }
  const z = room.zones.find((z) => z.kind === 'puddle');
  console.log(`charca quieta: ${z ? 'r=' + Math.round(z.w / 2) : 'NO'} agua=${room.waterAt(p.x, p.y)}`);
  const n = [...room.npcs.values()][0]; n.x = p.x + 120; n.y = p.y; n.hp = 999; n.maxHp = 999;
  room.onInput(c, { q: 100, mx: 0, my: 0, a: 0, b: BTN_ATTACK }); step();
  const cd0 = p.cd[0];
  for (let t = 0; t < 40; t++) { room.onInput(c, { q: 101 + t, mx: 0, my: 0, a: 0, b: 0 }); n.x = p.x + 120; n.y = p.y; step(); }
  console.log(`chorro: jetT inicial ok cd=${cd0.toFixed(2)} daño al npc=${999 - Math.round(n.hp)}`);
}
