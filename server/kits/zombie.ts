// 🧟 Paciente Cero: infección y una pequeña horda de zombis.
import { BAL } from '../../shared/balance';
import { Anim, Kind } from '../../shared/protocol';
import type { Npc } from '../entities';
import type { Kit } from './types';

const B = BAL.zombie;

export const zombieKit: Kit = {
  basic(room, p, a) {
    room.meleeSwing(p, a, { sfx: 'bite' });
  },

  ability(room, p, slot, a) {
    room.breakStealth(p);
    if (slot === 0) {
      // Contagio: el humano más cercano al cursor (dentro de un cono y alcance)
      const aimD = Math.min(p.input.d, B.contagionRange);
      const ax = p.x + Math.cos(a) * aimD, ay = p.y + Math.sin(a) * aimD;
      let best: Npc | null = null, bd = Infinity;
      for (const n of room.npcs.values()) {
        if (n.dead || n.entombT > 0 || n.infectT > 0 || n.disguiseT > 0) continue;
        const dp = Math.hypot(n.x - p.x, n.y - p.y);
        if (dp > B.contagionRange + 40) continue;
        const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(n.y - p.y, n.x - p.x) - a), Math.cos(Math.atan2(n.y - p.y, n.x - p.x) - a)));
        if (ang > B.contagionCone && dp > 60) continue;
        const d = Math.hypot(n.x - ax, n.y - ay);
        if (d < bd) { bd = d; best = n; }
      }
      if (!best) { p.cd[1] = 0.3; return; } // sin objetivo no se gasta
      const n = best as Npc;
      // la vida del humano baja poco a poco (~5 s) y al llegar a cero se levanta como zombi
      n.infectT = B.infectT;
      n.infectBy = p.id;
      n.fleeing = true;
      room.setAnim(p, Anim.Cast, 0.35);
      room.fx('infect', n.x, n.y, { o: n.id, n: 0, tx: Math.round(p.x), ty: Math.round(p.y) });
      room.sfx('groan', n.x, n.y);
    } else {
      // Carne fresca: lanzada hacia el cursor; los zombis acuden
      const d = Math.min(p.input.d, B.meatRange);
      let mx = p.x + Math.cos(a) * d, my = p.y + Math.sin(a) * d;
      for (let k = d; k > 0 && room.grid.blocked(mx, my, 8); k -= 20) { mx = p.x + Math.cos(a) * k; my = p.y + Math.sin(a) * k; }
      room.zones = room.zones.filter((z) => !(z.kind === 'meat' && z.owner === p.id));
      room.addZone({ kind: 'meat', ax: mx, ay: my, bx: mx, by: my, w: 40, until: room.time + B.meatT, owner: p.id });
      room.setAnim(p, Anim.Attack, 0.3);
      room.fx('meat', p.x, p.y, { tx: Math.round(mx), ty: Math.round(my), o: p.id, d: B.meatT });
      room.sfx('splash', mx, my);
    }
  },

  ult(room, p) {
    p.ultT = B.ult.capT; // durante este tiempo el máximo de zombis sube
    room.setAnim(p, Anim.Cast, 0.8);
    const spots = [[-70, -30], [70, -30], [-50, 50], [55, 45]];
    for (let i = 0; i < B.ult.normals + B.ult.fats; i++) {
      const [ox, oy] = spots[i % spots.length];
      let x = p.x + ox, y = p.y + oy;
      if (room.grid.blocked(x, y, 16)) { x = p.x; y = p.y; }
      const fat = i >= B.ult.normals;
      const look = ['teen', 'neighbor', 'jock', 'nerd', 'villager', 'camper'][Math.floor(Math.random() * 6)];
      const z = room.spawnMinion(p, x, y, fat ? 'fat' : room.minionVariant(p), look, Math.floor(Math.random() * 97), B.ult.life, !fat);
      room.fx('emerge', z.x, z.y, { o: z.id });
    }
    room.sfx('groan', p.x, p.y);
    return true;
  },

  speedMul(room, p) {
    // ir hacia la carne acelera
    const meat = room.zones.find((z) => z.kind === 'meat' && z.owner === p.id);
    if (!meat || !p.moving) return 1;
    const { mx, my } = p.input;
    const dx = meat.ax - p.x, dy = meat.ay - p.y, d = Math.hypot(dx, dy) || 1, ml = Math.hypot(mx, my) || 1;
    return (dx * mx + dy * my) / (d * ml) > 0.6 && d > 30 ? B.meatSpeedMul : 1;
  },

  // Epidemia: al morir, el zombi deja una zona contaminada
  onMinionDeath(room, p, m) {
    if (p.tier < 1) return;
    room.addZone({ kind: 'toxic', ax: m.x, ay: m.y, bx: m.x, by: m.y, w: B.toxicR * 2, until: room.time + B.toxicT, owner: p.id });
    void Kind;
  },
};
