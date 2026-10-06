// Prueba de las fieras y la corriente (sin red): Nilo (cocodrilos) y Jungla jurásica (raptores, T-rex, río con corriente).
// Uso: npx tsx tools/beasttest.ts
import { Room } from '../server/Room';
import type { Conn } from '../server/types';
import type { MapThemeId } from '../shared/maps';

function makeConn(name: string): Conn {
  return {
    id: 1, name, roomCode: null,
    profile: { token: 't', name, coins: 0, medals: [], chars: [], skins: [], stats: { npcKills: 0, hunterKills: 0, playerKills: 0, deaths: 0, games: 0, bestScore: 0 }, createdAt: 0 },
    send: () => {},
  };
}

function test(theme: MapThemeId) {
  for (let seed = 0; seed < 6; seed++) {
    const room = new Room('T' + seed, theme, true);
    room.destroy();
    const step = () => (room as unknown as { step(): void }).step();
    const beasts = [...room.hunters.values()].filter((h) => ['croc', 'raptor', 'rex'].includes(h.type));
    const counts: Record<string, number> = {};
    for (const b of beasts) counts[b.type] = (counts[b.type] ?? 0) + 1;
    const conn = makeConn('vamp');
    room.addConn(conn, 'vampire', 'classic');
    const p = [...room.players.values()][0];
    p.protectT = 0;
    // al lado de una fiera
    const b = beasts[0];
    let hurt = 0, pushed = 0;
    if (b) {
      p.x = b.x + 60; p.y = b.y;
      if (room.grid.blocked(p.x, p.y, p.r)) { const f = room.findFreeSpot(p.x, p.y, p.r); p.x = f.x; p.y = f.y; }
      const hp0 = p.hp;
      for (let i = 0; i < 80; i++) { room.onInput(conn, { q: i + 1, mx: 0, my: 0, a: 0, b: 0 }); step(); if (p.dead) break; }
      hurt = Math.round(hp0 - p.hp);
    }
    // corriente: colocar al jugador en el río poco profundo
    const sh = room.map.rivers.find((r) => r.shallow);
    if (sh) {
      p.hp = p.maxHp; p.dead = false;
      const pt = sh.pts[Math.floor(sh.pts.length / 2)];
      p.x = pt[0]; p.y = pt[1];
      for (const h of room.hunters.values()) { h.x = 50; h.y = 50; }
      const x0 = p.x, y0 = p.y;
      for (let i = 0; i < 20; i++) { room.onInput(conn, { q: 200 + i, mx: 0, my: 0, a: 0, b: 0 }); step(); }
      pushed = Math.round(Math.hypot(p.x - x0, p.y - y0));
    }
    const obs: Record<string, number> = {};
    for (const o of room.map.obstacles) obs[o.type] = (obs[o.type] ?? 0) + 1;
    console.log(`${theme} #${seed}: fieras ${JSON.stringify(counts)} daño junto a ${b?.type ?? '-'}=${hurt} corriente=${pushed}px  obst ${JSON.stringify(obs)}`);
  }
}

test('nile');
test('jungle');
