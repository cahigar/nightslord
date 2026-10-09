// Graba las tomas de juego de un trailer y guarda un .webm continuo + marcas de tiempo (JSON).
// Uso: node tools/trailer/record.mjs <werewolf|kthula|doppy> <carpeta de salida>
import { writeFileSync, mkdirSync } from 'node:fs';
import { openGame, joinRoom, installPilot, pilot, cheat, sleep, lockView, startRecording, press, approach, addBot, myPos } from './harness.mjs';

const [char, outDir = '/tmp/trailer'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

// Cada toma: prepara (fuera de cámara), marca el inicio y ejecuta la acción. El montaje usa [inicio + off, + len].
const SCRIPTS = {
  werewolf: {
    theme: 'transylvania',
    takes: [
      { id: 'basic', prep: (p) => approach(p, ['npc'], 90, { minGroup: 2 }), run: async (p) => { await pilot(p, { mode: 'hunt', want: ['npc'] }); await sleep(4200); } },
      { id: 'q', prep: (p) => approach(p, ['npc'], 170, { minGroup: 2 }), run: async (p) => { await pilot(p, { mode: 'stay' }); await aimNearest(p); await sleep(400); await press(p, 'KeyQ'); await sleep(900); await pilot(p, { mode: 'hunt' }); await sleep(2200); } },
      { id: 'e', prep: (p) => approach(p, ['npc'], 90, { minGroup: 2 }), run: async (p) => { await pilot(p, { mode: 'stay' }); await sleep(300); await press(p, 'KeyE'); await sleep(700); await pilot(p, { mode: 'hunt' }); await sleep(2600); } },
      { id: 'evo5', prep: (p) => approach(p, ['npc'], 90), run: async (p) => { await pilot(p, { mode: 'hunt' }); await sleep(500); await cheat(p, { lvl: 5 }); await sleep(3000); } },
      { id: 'evo15', prep: (p) => approach(p, ['npc'], 90), run: async (p) => { await pilot(p, { mode: 'hunt' }); await sleep(500); await cheat(p, { lvl: 10 }); await sleep(900); await cheat(p, { lvl: 15, heal: true }); await sleep(2600); } },
      { id: 'r', prep: async (p) => { await cheat(p, { ult: true, heal: true }); await approach(p, ['npc'], 110, { minGroup: 2 }); }, run: async (p) => { await pilot(p, { mode: 'stay' }); await sleep(300); await press(p, 'KeyR'); await sleep(500); await pilot(p, { mode: 'hunt' }); await sleep(3200); } },
      { id: 'hunter', prep: (p) => huntersNear(p), run: async (p) => { await pilot(p, { mode: 'hunt', want: ['hunter'] }); await sleep(600); await press(p, 'KeyQ'); await sleep(3600); } },
    ],
  },
  kthula: {
    theme: 'swamp',
    takes: [
      { id: 'basic', prep: (p) => approach(p, ['npc'], 90, { minGroup: 2 }), run: async (p) => { await pilot(p, { mode: 'hunt', want: ['npc'] }); await sleep(4200); } },
      { id: 'water', prep: (p) => toWaterNearNpcs(p), run: async (p) => { await pilot(p, { mode: 'hunt', want: ['npc'], keepDist: 170 }); await sleep(4200); await pilot(p, { keepDist: 0 }); } },
      { id: 'q', prep: (p) => approach(p, ['npc'], 170, { minGroup: 2 }), run: async (p) => { await pilot(p, { mode: 'stay' }); await aimNearest(p); await sleep(400); await press(p, 'KeyQ'); await sleep(1200); await pilot(p, { mode: 'hunt' }); await sleep(2000); } },
      { id: 'e', prep: (p) => approach(p, ['npc'], 230), run: async (p) => { await pilot(p, { mode: 'stay' }); await aimNearest(p); await pilot(p, { mode: 'walk', dir: await dirToNearest(p) }); await sleep(250); await press(p, 'KeyE'); await sleep(1500); await pilot(p, { mode: 'hunt' }); await sleep(1800); } },
      { id: 'evo5', prep: (p) => approach(p, ['npc'], 90), run: async (p) => { await pilot(p, { mode: 'hunt' }); await sleep(500); await cheat(p, { lvl: 5 }); await sleep(3000); } },
      { id: 'evo15', prep: (p) => approach(p, ['npc'], 90), run: async (p) => { await pilot(p, { mode: 'hunt' }); await sleep(500); await cheat(p, { lvl: 10 }); await sleep(900); await cheat(p, { lvl: 15, heal: true }); await sleep(2600); } },
      { id: 'r', prep: async (p) => { await cheat(p, { ult: true, heal: true }); await approach(p, ['npc'], 170, { minGroup: 2 }); }, run: async (p) => { await pilot(p, { mode: 'stay' }); await aimNearest(p); await sleep(300); await press(p, 'KeyR'); await sleep(2200); await pilot(p, { mode: 'hunt' }); await sleep(1500); } },
      { id: 'hunter', prep: (p) => huntersNear(p), run: async (p) => { await pilot(p, { mode: 'hunt', want: ['hunter'] }); await sleep(500); await aimNearest(p, ['hunter']); await press(p, 'KeyQ'); await sleep(3700); } },
    ],
  },
  doppy: {
    theme: 'elm',
    bot: 'werewolf',
    takes: [
      { id: 'disguise', prep: async (p) => { await sleep(4000); await approach(p, ['npc'], 80, { minGroup: 2 }); }, run: async (p) => { await pilot(p, { mode: 'idle' }); await sleep(900); await pilot(p, { mode: 'hunt', want: ['npc'] }); await sleep(3000); } },
      { id: 'q', prep: async (p, ctx) => { await approach(p, ['npc'], 120); const [x, y] = await myPos(p); ctx.bot.tp(x + 10, y - 140); await sleep(900); }, run: async (p) => { await pilot(p, { mode: 'stay' }); await aimNearest(p, ['player']); await sleep(300); await press(p, 'KeyQ'); await sleep(900); await pilot(p, { mode: 'hunt', want: ['npc'] }); await sleep(2600); } },
      { id: 'e', prep: async (p, ctx) => { ctx.bot.tp(3000, 3000); await sleep(10500); await approach(p, ['npc'], 100, { minGroup: 2 }); }, run: async (p) => { await pilot(p, { mode: 'stay' }); await sleep(300); await press(p, 'KeyE'); await sleep(500); await pilot(p, { mode: 'walk', dir: -0.6 }); await sleep(2600); await pilot(p, { mode: 'hunt' }); await sleep(800); } },
      { id: 'evo5', prep: (p) => approach(p, ['npc'], 90), run: async (p) => { await pilot(p, { mode: 'hunt' }); await sleep(500); await cheat(p, { lvl: 5 }); await sleep(3000); } },
      { id: 'evo15', prep: (p) => approach(p, ['npc'], 90), run: async (p) => { await pilot(p, { mode: 'hunt' }); await sleep(500); await cheat(p, { lvl: 10 }); await sleep(900); await cheat(p, { lvl: 15, heal: true }); await sleep(2600); } },
      { id: 'r', prep: async (p, ctx) => { await cheat(p, { ult: true, heal: true }); await approach(p, ['npc'], 110, { minGroup: 2 }); const [x, y] = await myPos(p); ctx.bot.tp(x - 10, y - 170); await sleep(700); }, run: async (p) => { await pilot(p, { mode: 'stay' }); await sleep(300); await press(p, 'KeyR'); await sleep(600); await pilot(p, { mode: 'hunt', want: ['npc'] }); await sleep(3200); } },
      { id: 'hunter', prep: async (p, ctx) => { ctx.bot.tp(3000, 3000); await sleep(9000); await huntersNear(p); }, run: async (p) => { await pilot(p, { mode: 'hunt', want: ['hunter'] }); await sleep(4200); } },
    ],
  },
};

async function aimNearest(p, kinds = ['npc']) {
  await p.evaluate((k) => { const t = window.pilot.nearest(k); if (t) window.pilot.aimAt(t.e.rx, t.e.ry); }, kinds);
}
async function dirToNearest(p, kinds = ['npc']) {
  return p.evaluate((k) => { const me = window.pilot.me(), t = window.pilot.nearest(k); return t ? Math.atan2(t.e.ry - me.ry, t.e.rx - me.rx) : 0; }, kinds);
}
/** Espera a que haya Cazadores y se acerca a uno. */
async function huntersNear(p) {
  await cheat(p, { heal: true });
  // los Cazadores van a por los jugadores quietos de la esquina: empezamos a buscar por allí
  await cheat(p, { tp: [420, 420] }); await sleep(900);
  for (let i = 0; i < 40; i++) {
    if (await approach(p, ['hunter'], 150)) return true;
    await sleep(800);
  }
  return false;
}
/** K'thula: al borde de una charca con humanos cerca. */
async function toWaterNearNpcs(p) {
  for (let i = 0; i < 12; i++) {
    await approach(p, ['npc'], 200);
    const spot = await p.evaluate(() => {
      const g = window.__nl.game, me = window.pilot.me();
      let best = null;
      for (const w of g.map.water ?? []) {
        const cx = w.x + w.w / 2, cy = w.y + w.h / 2, d = Math.hypot(cx - me.rx, cy - me.ry);
        if (!best || d < best.d) best = { d, x: cx, y: cy };
      }
      return best;
    });
    if (spot && spot.d < 700) { await cheat(p, { tp: [Math.round(spot.x), Math.round(spot.y)] }); await sleep(700); return true; }
  }
}

const S = SCRIPTS[char];
const { browser, page } = await openGame();
const code = await joinRoom(page, { char, theme: S.theme });
await installPilot(page);
await lockView(page);
const ctx = {};
if (S.bot) ctx.bot = await addBot(code, S.bot, 'Aullador');
// jugadores quietos en una esquina: la sala genera más humanos (y más cazadores)
const extras = [];
for (let i = 0; i < 6; i++) { const b = await addBot(code, 'scarecrow', ' ', { respawn: false }); extras.push(b); }
await sleep(800);
for (const b of extras) b.tp(120 + Math.random() * 80, 120 + Math.random() * 80);
await sleep(1500);
const rec = await startRecording(page, `${outDir}/${char}.webm`);
for (const t of S.takes) {
  await pilot(page, { mode: 'idle', want: ['npc'], keepDist: 0 });
  await t.prep(page, ctx);
  await sleep(300); // que la cámara llegue
  await rec.mark(t.id);
  await t.run(page, ctx);
  await rec.mark(t.id + ':end');
  console.log('toma', t.id);
}
const marks = await rec.stop();
writeFileSync(`${outDir}/${char}.json`, JSON.stringify({ char, theme: S.theme, marks }, null, 1));
ctx.bot?.close(); for (const b of extras) b.close();
await browser.close();
console.log('ok', marks.length, 'marcas');
process.exit(0);
