// Logo animado del menú: «MOOONSTERS» en pixel art. La O del medio es la luna llena; detrás, nubes de tormenta
// que se desplazan, lluvia y algún relámpago. El conjunto late (se amplía y reduce) con CSS.

const W = 220, H = 84; // píxeles de arte
const G = 2; // cada píxel de la letra son 2×2 de arte

// letras de 7×9
const FONT: Record<string, string[]> = {
  M: ['XX...XX', 'XXX.XXX', 'XXXXXXX', 'XX.X.XX', 'XX...XX', 'XX...XX', 'XX...XX', 'XX...XX', 'XX...XX'],
  O: ['.XXXXX.', 'XXXXXXX', 'XX...XX', 'XX...XX', 'XX...XX', 'XX...XX', 'XX...XX', 'XXXXXXX', '.XXXXX.'],
  N: ['XX...XX', 'XXX..XX', 'XXXX.XX', 'XXXXXXX', 'XX.XXXX', 'XX..XXX', 'XX...XX', 'XX...XX', 'XX...XX'],
  S: ['.XXXXXX', 'XXXXXXX', 'XX.....', 'XXXXXX.', '.XXXXXX', '.....XX', '.....XX', 'XXXXXXX', 'XXXXXX.'],
  T: ['XXXXXXX', 'XXXXXXX', '..XXX..', '..XXX..', '..XXX..', '..XXX..', '..XXX..', '..XXX..', '..XXX..'],
  E: ['XXXXXXX', 'XXXXXXX', 'XX.....', 'XXXXXX.', 'XXXXXX.', 'XX.....', 'XX.....', 'XXXXXXX', 'XXXXXXX'],
  R: ['XXXXXX.', 'XXXXXXX', 'XX...XX', 'XX...XX', 'XXXXXXX', 'XXXXXX.', 'XX.XX..', 'XX..XX.', 'XX...XX'],
};
const WORD = 'MOOONSTERS';
const MOON = 2; // índice de la O que es la luna

interface Cloud { x: number; y: number; w: number; speed: number; seed: number; front: boolean }

export function startLogo(canvas: HTMLCanvasElement) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const px = (x: number, y: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); };

  // máscara de las letras (con la luna aparte)
  const LW = 7 * G, LH = 9 * G, GAP = 3;
  const totalW = WORD.length * LW + (WORD.length - 1) * GAP;
  const x0 = Math.floor((W - totalW) / 2), y0 = 44;
  const letters = new Uint8Array(W * H); // 1 = letra
  const off = (i: number) => (i < MOON ? -6 : i > MOON ? 6 : 0); // hueco para la luna
  const moonCx = x0 + MOON * (LW + GAP) + LW / 2, moonCy = y0 + LH / 2 - 1, moonR = 12;
  [...WORD].forEach((ch, i) => {
    if (i === MOON) return;
    FONT[ch].forEach((row, ry) => [...row].forEach((c, rx) => {
      if (c !== 'X') return;
      for (let dy = 0; dy < G; dy++) for (let dx = 0; dx < G; dx++) letters[(y0 + ry * G + dy) * W + x0 + i * (LW + GAP) + off(i) + rx * G + dx] = i === 1 || i === 3 ? 2 : 1;
    }));
  });

  // nubes de tormenta
  const rnd = (s: number) => { const n = Math.sin(s * 127.1) * 43758.5453; return n - Math.floor(n); };
  const clouds: Cloud[] = [];
  for (let i = 0; i < 9; i++) clouds.push({ x: rnd(i + 1) * W, y: 4 + rnd(i + 11) * 34, w: 34 + rnd(i + 21) * 40, speed: (0.6 + rnd(i + 31)) * (i % 2 ? 3 : -3), seed: i, front: false });
  for (let i = 0; i < 3; i++) clouds.push({ x: rnd(i + 41) * W, y: 68 + rnd(i + 51) * 8, w: 26 + rnd(i + 61) * 18, speed: 5 + rnd(i + 71) * 3, seed: 20 + i, front: true });
  const drops = Array.from({ length: 40 }, (_, i) => ({ x: rnd(i + 100) * W, y: rnd(i + 200) * H, v: 60 + rnd(i + 300) * 40 }));

  let bolt: [number, number][] | null = null, boltT = 0, nextBolt = 1.5, flash = 0;
  let last = performance.now(), t = 0;

  const drawCloud = (c: Cloud, lit: number) => {
    const n = Math.max(3, Math.round(c.w / 9));
    const pal = c.front ? ['#0c0912', '#16111f', '#241c32'] : ['#120e1c', '#1e1830', '#2e2644'];
    for (let pass = 0; pass < 3; pass++) for (let k = 0; k < n; k++) {
      const bx = c.x + (k / (n - 1) - 0.5) * c.w, by = c.y + Math.sin(k * 1.7 + c.seed) * 2;
      const r = (c.w / n) * (0.9 + 0.5 * rnd(c.seed * 10 + k)) - pass * 1.5;
      for (let y = -r; y <= r; y++) for (let x = -r * 1.3; x <= r * 1.3; x++) {
        if ((x / 1.3) ** 2 + y * y > r * r) continue;
        const col = pass === 2 && y < -r * 0.3 ? (lit > 0 ? '#8a7ab0' : pal[2]) : pal[pass === 0 ? 0 : 1];
        const xx = ((Math.round(bx + x) % (W + 80)) + W + 80) % (W + 80) - 40;
        px(xx, by + y, col);
      }
    }
  };

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt;
    if (!canvas.isConnected) return;
    if (canvas.offsetParent === null) { requestAnimationFrame(frame); return; } // menú oculto: no dibujar
    // cielo
    ctx.fillStyle = flash > 0 ? '#2a2240' : '#0a0712';
    ctx.fillRect(0, 0, W, H);
    // halo de la luna (tramado)
    for (let y = -moonR - 8; y <= moonR + 8; y++) for (let x = -moonR - 8; x <= moonR + 8; x++) {
      const d = Math.hypot(x, y);
      if (d < moonR || d > moonR + 8) continue;
      if (d < moonR + 3 && (x + y) & 1) px(moonCx + x, moonCy + y, '#4a4060');
      else if (d < moonR + 8 && ((x * 3 + y * 5) & 7) === 0) px(moonCx + x, moonCy + y, '#2e2640');
    }
    // nubes del fondo
    for (const c of clouds) { c.x += c.speed * dt; if (!c.front) drawCloud(c, flash); }
    // la luna llena (la O del medio)
    for (let y = -moonR; y <= moonR; y++) for (let x = -moonR; x <= moonR; x++) {
      const d = Math.hypot(x, y);
      if (d > moonR) continue;
      let col = '#f4ecd0';
      if (x + y * 0.3 > moonR * 0.45) col = '#d8c8a0'; // sombra
      if (d > moonR - 1.2) col = '#c8b888';
      px(moonCx + x, moonCy + y, col);
    }
    for (const [cx, cy, r] of [[-4, -3, 3], [4, 3, 3], [-3, 6, 2], [5, -5, 2], [-8, 2, 1]]) for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r) continue;
      px(moonCx + cx + x, moonCy + cy + y, x + y > 0 ? '#c8b888' : '#e0d4b0');
    }
    px(moonCx - 6, moonCy - 8, '#ffffff'); px(moonCx - 7, moonCy - 7, '#ffffff'); px(moonCx - 8, moonCy - 5, '#fffbe8');
    // relámpago
    nextBolt -= dt;
    if (nextBolt <= 0) {
      nextBolt = 2.5 + Math.random() * 4; boltT = 0.22; flash = 0.12;
      let bx = 20 + Math.random() * (W - 40), by = 6;
      if (Math.abs(bx - moonCx) < 24) bx += 50;
      bolt = [[bx, by]];
      while (by < y0 - 4) { by += 3 + Math.random() * 4; bx += (Math.random() - 0.5) * 8; bolt.push([bx, by]); }
    }
    if (boltT > 0 && bolt) {
      boltT -= dt;
      for (let i = 1; i < bolt.length; i++) {
        const [ax, ay] = bolt[i - 1], [bx, by] = bolt[i], n = Math.ceil(Math.max(Math.abs(bx - ax), by - ay));
        for (let k = 0; k <= n; k++) { px(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, '#ffffff'); px(ax + ((bx - ax) * k) / n + 1, ay + ((by - ay) * k) / n, '#80c0ff'); }
      }
    }
    flash = Math.max(0, flash - dt);
    // lluvia
    for (const d of drops) {
      d.y += d.v * dt; d.x -= d.v * 0.3 * dt;
      if (d.y > H) { d.y = -4; d.x = Math.random() * (W + 20); }
      px(d.x, d.y, '#4a4a70'); px(d.x - 1, d.y + 2, '#3a3a5a');
    }
    // letras: contorno negro, sombra roja, relleno degradado y brillo arriba
    const lit = (x: number, y: number) => letters[y * W + x];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (lit(x, y)) continue;
      let edge = false, shadow = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x - dx, yy = y - dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && lit(xx, yy)) edge = true; }
      if (!edge && x >= 2 && y >= 2 && lit(x - 2, y - 2)) shadow = true;
      if (edge) px(x, y, '#000000');
      else if (shadow) px(x, y, '#6a0a18');
    }
    for (let y = y0; y < y0 + LH; y++) for (let x = 0; x < W; x++) {
      const v = lit(x, y);
      if (!v) continue;
      const k = (y - y0) / LH;
      let col = v === 2 ? (k < 0.15 ? '#fff0a0' : k < 0.5 ? '#f0c040' : k < 0.8 ? '#d08a20' : '#a05a10') : (k < 0.15 ? '#ffffff' : k < 0.5 ? '#e8d8ff' : k < 0.8 ? '#b8a0e0' : '#7a5aa8');
      if (!lit(x, y - 1)) col = v === 2 ? '#fff8d0' : '#ffffff';
      if (flash > 0 && v === 1) col = '#ffffff';
      px(x, y, col);
    }
    // ojitos brillantes en las O doradas
    for (const i of [1, 3]) {
      const ox = x0 + i * (LW + GAP) + off(i);
      px(ox + 5, y0 + 7, '#ff3040'); px(ox + 8, y0 + 7, '#ff3040');
    }
    // nubes bajas que pasan por delante
    for (const c of clouds) if (c.front) drawCloud(c, 0);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
