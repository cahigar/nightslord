// Fondo animado de la portada en pixel art: noche de terror con luna roja, castillo encantado en la colina,
// cementerio con árboles muertos, niebla que se arrastra, murciélagos, un fantasma, ojos que parpadean en la
// oscuridad y algún relámpago. Las capas fijas se pintan una vez (al cambiar de tamaño); lo demás, cada fotograma.

const S = 4; // píxeles de pantalla por píxel de arte

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function startMenuBg(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  let w = 0, h = 0;
  let scene: HTMLCanvasElement | null = null, fog: HTMLCanvasElement | null = null;
  let windows: { x: number; y: number; ph: number }[] = [];
  let eyes: { x: number; y: number; ph: number; c: string }[] = [];
  let groundY = 0, moon = { x: 0, y: 0, r: 0 };
  const bats = Array.from({ length: 9 }, (_, i) => ({ x: Math.random(), y: 0.1 + Math.random() * 0.35, sp: 0.03 + Math.random() * 0.04, ph: i * 1.7, dir: i % 3 ? 1 : -1 }));
  const embers = Array.from({ length: 26 }, () => ({ x: Math.random(), y: Math.random(), sp: 4 + Math.random() * 8, ph: Math.random() * 6 }));
  let ghost = { x: -0.2, y: 0.6, t: 3 };
  let flash = 0, nextBolt = 3, bolt: [number, number][] | null = null;

  const build = () => {
    w = Math.max(80, Math.ceil(window.innerWidth / S)); h = Math.max(60, Math.ceil(window.innerHeight / S));
    canvas.width = w; canvas.height = h;
    const r = rng(1234);
    scene = document.createElement('canvas'); scene.width = w; scene.height = h;
    const c = scene.getContext('2d')!;
    const px = (x: number, y: number, col: string) => { c.fillStyle = col; c.fillRect(x | 0, y | 0, 1, 1); };
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    // cielo en bandas tramadas: negro arriba, morado y un resplandor rojo sobre el horizonte
    const sky = ['#06030b', '#0b0614', '#12091c', '#1a0c22', '#260f28', '#34122c', '#4a1630'];
    groundY = Math.round(h * 0.72);
    for (let y = 0; y < groundY; y++) {
      const t = (y / groundY) * (sky.length - 1);
      const i = Math.floor(t), f = t - i;
      for (let x = 0; x < w; x++) px(x, y, f * 16 > bayer[(y & 3) * 4 + (x & 3)] ? sky[Math.min(sky.length - 1, i + 1)] : sky[i]);
    }
    // estrellas
    for (let i = 0; i < w * h * 0.004; i++) { const x = r() * w, y = r() * groundY * 0.6; px(x, y, r() < 0.2 ? '#d8c8f0' : '#6a5a8a'); }
    // luna roja enorme y baja
    moon = { x: Math.round(w * (w > h ? 0.8 : 0.72)), y: Math.round(groundY * 0.42), r: Math.round(Math.min(w, h) * 0.13) };
    for (let y = -moon.r - 6; y <= moon.r + 6; y++) for (let x = -moon.r - 6; x <= moon.r + 6; x++) {
      const d = Math.hypot(x, y);
      if (d <= moon.r) px(moon.x + x, moon.y + y, x + y * 0.4 > moon.r * 0.35 ? '#8a1a20' : d > moon.r - 1 ? '#9a2a24' : '#b8342a');
      else if (d < moon.r + 6 && (x + y) & 1 && d < moon.r + 3) px(moon.x + x, moon.y + y, '#5a1828');
    }
    for (const [cx, cy, cr] of [[-0.3, -0.2, 0.18], [0.25, 0.3, 0.22], [0.35, -0.35, 0.1], [-0.25, 0.45, 0.12]]) for (let y = -cr * moon.r; y <= cr * moon.r; y++) for (let x = -cr * moon.r; x <= cr * moon.r; x++) if (x * x + y * y <= (cr * moon.r) ** 2) px(moon.x + cx * moon.r + x, moon.y + cy * moon.r + y, '#7a1820');
    // montañas lejanas
    const ridge = (base: number, amp: number, freq: number, col: string, seed: number) => {
      for (let x = 0; x < w; x++) {
        const y = base - Math.abs(Math.sin(x * freq + seed) * amp + Math.sin(x * freq * 2.7 + seed * 3) * amp * 0.4);
        c.fillStyle = col; c.fillRect(x, Math.round(y), 1, h - Math.round(y));
      }
    };
    ridge(groundY - h * 0.08, h * 0.1, 0.035, '#1c0c22', 1);
    ridge(groundY - h * 0.02, h * 0.06, 0.05, '#150a1a', 4);
    // castillo encantado en la colina (silueta con torres puntiagudas)
    const cxs = Math.round(w * (w > h ? 0.3 : 0.32)), cBase = groundY - Math.round(h * 0.03), U = Math.max(2, Math.round(Math.min(w, h) / 60));
    const sil = '#0d0712';
    for (let x = -20 * U; x <= 20 * U; x++) { const hy = Math.round(Math.sqrt(Math.max(0, 1 - (x / (22 * U)) ** 2)) * 5 * U); c.fillStyle = sil; c.fillRect(cxs + x, cBase - hy, 1, h); } // colina
    windows = [];
    const tower = (x: number, tw: number, th: number) => {
      const top = cBase - 4 * U - th;
      c.fillStyle = sil; c.fillRect(x - tw / 2, top, tw, th + 4 * U);
      for (let i = 0; i <= tw / 2 + U; i++) c.fillRect(x - tw / 2 - U + i, top - Math.round(i * 1.8), tw + 2 * U - i * 2, 1); // tejado
      c.fillRect(x, top - Math.round((tw / 2 + U) * 1.8) - 2 * U, 1, 2 * U); // aguja
      for (let k = 0; k < Math.floor(th / (4 * U)); k++) if (r() < 0.6) windows.push({ x: Math.round(x - U / 2 + (r() - 0.5) * tw * 0.4), y: Math.round(top + 2 * U + k * 4 * U), ph: r() * 6 });
    };
    c.fillStyle = sil; c.fillRect(cxs - 12 * U, cBase - 14 * U, 24 * U, 14 * U); // muralla
    for (let x = cxs - 12 * U; x < cxs + 12 * U; x += 2 * U) c.fillRect(x, cBase - 15 * U, U, U); // almenas
    tower(cxs - 13 * U, 6 * U, 16 * U); tower(cxs + 13 * U, 6 * U, 14 * U); tower(cxs, 8 * U, 24 * U); tower(cxs - 5 * U, 4 * U, 10 * U);
    for (let k = 0; k < 4; k++) windows.push({ x: cxs - 9 * U + k * 6 * U, y: cBase - 9 * U, ph: r() * 6 });
    // árbol muerto (ramas recursivas)
    const tree = (x: number, y: number, len: number, a: number, depth: number, col: string) => {
      const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      const n = Math.ceil(len);
      for (let i = 0; i <= n; i++) { const tx = x + (ex - x) * (i / n), ty = y + (ey - y) * (i / n); c.fillStyle = col; c.fillRect(Math.round(tx), Math.round(ty), depth > 3 ? 2 : 1, 1); }
      if (depth <= 0 || len < 2) return;
      tree(ex, ey, len * 0.7, a - 0.4 - r() * 0.3, depth - 1, col);
      tree(ex, ey, len * 0.65, a + 0.35 + r() * 0.3, depth - 1, col);
    };
    // colina del cementerio en primer plano
    for (let x = 0; x < w; x++) { const y = groundY + Math.round(Math.sin(x * 0.02) * h * 0.02 + Math.sin(x * 0.07) * 2); c.fillStyle = '#08040c'; c.fillRect(x, y, 1, h - y); c.fillStyle = '#2a1430'; c.fillRect(x, y, 1, 1); }
    const nT = Math.max(3, Math.round(w / 70));
    for (let i = 0; i < nT; i++) { const x = (i + 0.3 + r() * 0.4) * (w / nT); if (Math.abs(x - cxs) < 26 * U) continue; tree(x, groundY + 2, h * (0.07 + r() * 0.06), -Math.PI / 2 + (r() - 0.5) * 0.3, 5, '#0a050e'); }
    // lápidas y cruces con un borde de luz de luna
    for (let i = 0; i < w / 9; i++) {
      const x = Math.round(r() * w), y = groundY + Math.round(r() * h * 0.08) + 2, k = r(), s2 = U;
      c.fillStyle = '#120a18';
      if (k < 0.4) { c.fillRect(x, y - 2 * s2, s2, 3 * s2); c.fillRect(x - s2, y - s2 - 1, 3 * s2, 1); } // cruz
      else { c.fillRect(x - s2, y - 2 * s2, 2 * s2 + 1, 2 * s2 + 1); c.fillRect(x - s2 + 1, y - 2 * s2 - 1, 2 * s2 - 1, 1); }
      c.fillStyle = '#3a2242'; c.fillRect(x + s2, y - 2 * s2, 1, s2); // brillo lateral
    }
    // ojos en la oscuridad del primer plano
    eyes = Array.from({ length: Math.max(4, Math.round(w / 60)) }, () => ({ x: Math.round(r() * w), y: groundY + Math.round(h * (0.08 + r() * 0.18)), ph: r() * 10, c: ['#ff3040', '#ffd040', '#80ff60', '#c060ff'][Math.floor(r() * 4)] }));
    // textura de niebla (repetible horizontalmente)
    fog = document.createElement('canvas'); fog.width = w * 2; fog.height = Math.round(h * 0.3);
    const f = fog.getContext('2d')!;
    for (let y = 0; y < fog.height; y++) for (let x = 0; x < fog.width; x++) {
      const v = Math.sin(x * 0.045) * 0.5 + Math.sin(x * 0.013 + y * 0.09) * 0.6 + Math.sin(x * 0.11 + y * 0.2) * 0.25 - Math.abs(y / fog.height - 0.5) * 2.2;
      if (v * 16 > bayer[(y & 3) * 4 + (x & 3)] - 6) { f.fillStyle = v > 0.5 ? '#6a5a7a' : '#3a2e4a'; f.fillRect(x, y, 1, 1); }
    }
  };

  let last = performance.now(), t = 0;
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    if (canvas.offsetParent === null && !canvas.getClientRects().length) return; // portada oculta: no se dibuja
    const dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt;
    if (!scene || w !== Math.max(80, Math.ceil(window.innerWidth / S)) || h !== Math.max(60, Math.ceil(window.innerHeight / S))) build();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scene!, 0, 0);
    const px = (x: number, y: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); };
    // relámpago: destello del cielo y rayo quebrado
    nextBolt -= dt;
    if (nextBolt <= 0) {
      nextBolt = 5 + Math.random() * 7; flash = 0.35;
      let x = w * (0.1 + Math.random() * 0.8), y = 0; bolt = [[x, y]];
      while (y < groundY * 0.8) { y += 3 + Math.random() * 5; x += (Math.random() - 0.5) * 9; bolt.push([x, y]); }
    }
    if (flash > 0) {
      ctx.globalAlpha = Math.min(0.35, flash) * (Math.random() < 0.7 ? 1 : 0.3);
      ctx.fillStyle = '#b8a8ff'; ctx.fillRect(0, 0, w, groundY);
      ctx.globalAlpha = 1;
      if (bolt && flash > 0.15) for (const [x, y] of bolt) { px(x, y, '#ffffff'); px(x + 1, y + 1, '#a0c8ff'); px(x, y + 1, '#ffffff'); }
      flash -= dt;
    }
    // ventanas del castillo que parpadean
    for (const win of windows) {
      const on = Math.sin(t * 0.7 + win.ph) > -0.3;
      if (!on) continue;
      const fl = Math.random() < 0.05 ? '#ff8030' : '#ffc050';
      ctx.fillStyle = fl; ctx.fillRect(win.x, win.y, 2, 3);
    }
    // murciélagos
    for (const b of bats) {
      b.x += b.sp * dt * b.dir;
      if (b.x > 1.1) b.x = -0.1; if (b.x < -0.1) b.x = 1.1;
      const x = b.x * w, y = (b.y + Math.sin(t * 1.3 + b.ph) * 0.03) * h, up = Math.floor(t * 8 + b.ph) % 2;
      ctx.fillStyle = '#05020a';
      ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
      ctx.fillRect(Math.round(x) - 2, Math.round(y) + (up ? -1 : 1), 2, 1); ctx.fillRect(Math.round(x) + 2, Math.round(y) + (up ? -1 : 1), 2, 1);
      ctx.fillRect(Math.round(x) - 3, Math.round(y) + (up ? -2 : 2), 1, 1); ctx.fillRect(Math.round(x) + 4, Math.round(y) + (up ? -2 : 2), 1, 1);
    }
    // niebla que se arrastra (dos capas a distinta velocidad)
    if (fog) {
      for (const [k, sp, a] of [[0, 6, 0.35], [1, -10, 0.25]] as [number, number, number][]) {
        const off = ((t * sp) % fog.width + fog.width) % fog.width;
        ctx.globalAlpha = a;
        const y = groundY - fog.height * 0.4 + k * fog.height * 0.35;
        ctx.drawImage(fog, -off, y); ctx.drawImage(fog, fog.width - off, y);
      }
      ctx.globalAlpha = 1;
    }
    // fantasma que cruza de vez en cuando
    ghost.t -= dt;
    if (ghost.t <= 0) {
      ghost.x += dt * 0.04;
      const gx = ghost.x * w, gy = groundY - h * 0.05 + Math.sin(t * 2) * 3;
      ctx.globalAlpha = 0.55 + Math.sin(t * 5) * 0.1;
      ctx.fillStyle = '#d8e0ff';
      ctx.fillRect(Math.round(gx) - 3, Math.round(gy) - 6, 7, 7); ctx.fillRect(Math.round(gx) - 2, Math.round(gy) - 7, 5, 1);
      for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(gx) - 3 + i * 2, Math.round(gy) + 1 + ((i + Math.floor(t * 6)) % 2), 1, 1);
      ctx.fillStyle = '#10081a'; ctx.fillRect(Math.round(gx) - 1, Math.round(gy) - 4, 1, 2); ctx.fillRect(Math.round(gx) + 1, Math.round(gy) - 4, 1, 2);
      ctx.globalAlpha = 1;
      if (ghost.x > 1.1) { ghost = { x: -0.1, y: 0.6, t: 10 + Math.random() * 10 }; }
    }
    // ojos que se abren y parpadean en la oscuridad
    for (const e of eyes) {
      const k = Math.sin(t * 0.5 + e.ph);
      if (k < 0.4 || Math.floor(t * 3 + e.ph) % 9 === 0) continue;
      px(e.x, e.y, e.c); px(e.x + 3, e.y, e.c);
    }
    // ascuas que suben
    for (const m of embers) {
      m.y -= (m.sp * dt) / h; if (m.y < 0.3) { m.y = 1; m.x = Math.random(); }
      const a = Math.sin(t * 2 + m.ph);
      if (a > 0) px(m.x * w + Math.sin(t + m.ph) * 3, m.y * h, a > 0.6 ? '#ff8040' : '#a03020');
    }
  };
  requestAnimationFrame(frame);
}
