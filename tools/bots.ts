// Bots de prueba: conectan N clientes que se mueven y atacan al azar.
// Uso: npm run bots -- 8 ws://localhost:3000/ws [CODIGO_SALA]
import WebSocket from 'ws';
import { CHARACTER_IDS } from '../shared/characters';
import type { ServerMsg } from '../shared/protocol';

const N = Number(process.argv[2] ?? 6);
const URL = process.argv[3] ?? 'ws://localhost:3000/ws';
const CODE = process.argv[4];

let snaps = 0, bytes = 0;
for (let i = 0; i < N; i++) {
  const ws = new WebSocket(URL);
  let q = 0, ang = Math.random() * 6.28;
  ws.on('open', () => {
    ws.send(JSON.stringify({ t: 'hello', name: `Bot${i + 1}` }));
    const char = CHARACTER_IDS[i % CHARACTER_IDS.length]; // en modo dev todos están desbloqueados
    ws.send(JSON.stringify(CODE ? { t: 'join', mode: 'code', code: CODE, char, skin: 'classic' } : { t: 'join', mode: 'random', char, skin: 'classic' }));
    setInterval(() => {
      if (Math.random() < 0.05) ang += (Math.random() - 0.5) * 3;
      const b = (Math.random() < 0.3 ? 1 : 0) | (Math.random() < 0.02 ? 2 : 0) | (Math.random() < 0.02 ? 4 : 0);
      ws.send(JSON.stringify({ t: 'input', q: ++q, mx: Math.cos(ang), my: Math.sin(ang), a: ang, b }));
      if (Math.random() < 0.003) ws.send(JSON.stringify({ t: 'emote', e: 'taunt' }));
      if (Math.random() < 0.01) ws.send(JSON.stringify({ t: 'upgrade', u: ['vit', 'str', 'spd', 'pow'][Math.floor(Math.random() * 4)] }));
    }, 50);
  });
  ws.on('message', (raw) => {
    bytes += (raw as Buffer).length;
    const m = JSON.parse(raw.toString()) as ServerMsg;
    if (m.t === 'snap') snaps++;
    if (m.t === 'died') setTimeout(() => ws.send(JSON.stringify({ t: 'respawn' })), 1500);
    if (m.t === 'joined' && i === 0) console.log(`sala ${m.code} (${m.theme})`);
  });
}
setInterval(() => {
  console.log(`snaps/s por bot: ${(snaps / N / 5).toFixed(1)} · KB/s por bot: ${(bytes / N / 5 / 1024).toFixed(1)}`);
  snaps = 0; bytes = 0;
}, 5000);
