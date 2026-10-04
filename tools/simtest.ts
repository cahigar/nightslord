// Prueba rápida de servidor (sin red): para cada monstruo crea una sala, lo sube a nivel 15 y usa todo su kit.
// Uso: npx tsx tools/simtest.ts
import { BTN_ATTACK, BTN_E, BTN_Q, BTN_R } from '../shared/constants';
import { CHARACTER_IDS, type CharacterId } from '../shared/characters';
import { Room } from '../server/Room';
import type { Conn } from '../server/types';

function run(char: CharacterId) {
  const room = new Room('TEST', 'camp', true);
  room.destroy();
  const step = () => (room as unknown as { step(): void }).step();
  const fx = new Map<string, number>();
  const conn: Conn = {
    id: 1, name: char, roomCode: null,
    profile: { token: 't', name: char, coins: 0, medals: [], chars: [], skins: [], stats: { npcKills: 0, helsingKills: 0, playerKills: 0, deaths: 0, games: 0, bestScore: 0 }, createdAt: 0 },
    send: (m) => { if (m.t === 'snap') for (const e of m.ev) if (e.e === 'fx') fx.set(e.f, (fx.get(e.f) ?? 0) + 1); },
  };
  room.addConn(conn, char, 'classic');
  const p = [...room.players.values()][0];
  p.x = 1500; p.y = 1500; p.protectT = 0;
  let k = 0;
  for (const n of room.npcs.values()) { n.x = 1560 + (k % 6) * 30; n.y = 1460 + Math.floor(k / 6) * 25; k++; }
  for (const h of room.helsings.values()) { h.x = 1650; h.y = 1520; }
  room.onCheat(conn, 15, true);
  let q = 0;
  const press = (b: number, a = 0) => { room.onInput(conn, { q: ++q, mx: 0, my: 0, a, b }); step(); };
  const states: string[] = [];
  const npcs = () => [...room.npcs.values()];
  press(BTN_E); for (let i = 0; i < 5; i++) press(0);
  states.push(`trasE presa=${npcs().filter((n) => n.preyT > 0).length} lenta=${npcs().filter((n) => n.slowT > 0).length}`);
  press(BTN_R); for (let i = 0; i < 25; i++) press(0);
  states.push(`trasR ultT=${p.ultT.toFixed(1)} sarcófagos=${npcs().filter((n) => n.entombT > 0).length + [...room.helsings.values()].filter((h) => h.entombT > 0).length} disfrazados=${npcs().filter((n) => n.disguiseT > 0).length} pánico=${npcs().filter((n) => n.panicT > 0).length}`);
  for (let i = 0; i < 40; i++) press(BTN_ATTACK);
  states.push(`trasAtk maldición=${npcs().filter((n) => n.curseMarkT > 0).length} vivos=${npcs().length} hp=${Math.round(p.hp)}`);
  press(BTN_Q); press(0); press(BTN_Q);
  for (let i = 0; i < 260; i++) press(0); // 13 s sin combatir
  states.push(`final invis=${p.invisKind} orbit=${p.orbit.join('/')} qc=${p.qCharges} tier=${p.tier}`);
  console.log(`\n== ${char}\n  ${states.join('\n  ')}\n  fx: ${[...fx.entries()].map(([f, n]) => `${f}×${n}`).join(' ')}`);
}
for (const c of CHARACTER_IDS) run(c);
console.log('\nOK');
