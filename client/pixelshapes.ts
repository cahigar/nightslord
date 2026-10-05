// Formas pixeladas: ningún círculo, anillo ni arco liso en el mundo.
// Se "parchea" el contexto 2D principal: cuando un trazado está hecho SOLO de arcos/elipses
// (beginPath → arc/ellipse → fill/stroke), se dibuja con rectángulos alineados a la rejilla de
// píxeles del mundo (PIXEL), igual que los sprites. Los trazados mixtos (con moveTo/lineTo) se
// dibujan como siempre (solo se usan para la luz, que ya es un degradado).
import { PIXEL } from '../shared/constants';

interface Shape { x: number; y: number; rx: number; ry: number; a0: number; a1: number; ccw: boolean }
type PxCtx = CanvasRenderingContext2D & { __px?: boolean };

const P = PIXEL;
const snap = (v: number) => Math.floor(v / P) * P;
const TAU = Math.PI * 2;

/** ¿El ángulo a está dentro del arco a0→a1? */
function inArc(a: number, s: Shape) {
  let span = s.ccw ? s.a0 - s.a1 : s.a1 - s.a0;
  if (span >= TAU - 1e-3 || span <= -TAU + 1e-3) return true;
  span = ((span % TAU) + TAU) % TAU;
  const from = s.ccw ? s.a1 : s.a0;
  const d = (((a - from) % TAU) + TAU) % TAU;
  return d <= span;
}
const fullCircle = (s: Shape) => Math.abs(s.a1 - s.a0) >= TAU - 1e-3;

/** Relleno pixelado de una elipse (o sector). */
export function pxFillEllipse(ctx: CanvasRenderingContext2D, s: Shape, fillRect: (x: number, y: number, w: number, h: number) => void) {
  const rx = Math.abs(s.rx), ry = Math.abs(s.ry);
  if (rx < 0.5 || ry < 0.5) return;
  const y0 = snap(s.y - ry), y1 = s.y + ry;
  if (fullCircle(s)) {
    for (let py = y0; py < y1; py += P) {
      const dy = (py + P / 2 - s.y) / ry;
      if (Math.abs(dy) > 1) continue;
      const half = rx * Math.sqrt(1 - dy * dy);
      const x0 = snap(s.x - half + P / 2), x1 = snap(s.x + half + P / 2);
      if (x1 > x0) fillRect(x0, py, x1 - x0, P);
    }
    return;
  }
  // sector: celda a celda
  for (let py = y0; py < y1; py += P) for (let px = snap(s.x - rx); px < s.x + rx; px += P) {
    const dx = (px + P / 2 - s.x) / rx, dy = (py + P / 2 - s.y) / ry;
    if (dx * dx + dy * dy > 1) continue;
    if (inArc(Math.atan2(dy * ry, dx * rx), s)) fillRect(px, py, P, P);
  }
}

/** Contorno pixelado de una elipse o arco, con grosor en píxeles del mundo. */
export function pxStrokeEllipse(ctx: CanvasRenderingContext2D, s: Shape, lineWidth: number, fillRect: (x: number, y: number, w: number, h: number) => void) {
  const t = Math.max(P, Math.round(lineWidth / P) * P);
  const ox = Math.abs(s.rx) + t / 2, oy = Math.abs(s.ry) + t / 2;
  const ix = Math.max(0, Math.abs(s.rx) - t / 2), iy = Math.max(0, Math.abs(s.ry) - t / 2);
  if (ox < 1 || oy < 1) return;
  const full = fullCircle(s);
  for (let py = snap(s.y - oy); py < s.y + oy; py += P) {
    const cy = py + P / 2 - s.y;
    const dyo = cy / oy;
    if (Math.abs(dyo) > 1) continue;
    const ho = ox * Math.sqrt(1 - dyo * dyo);
    const dyi = iy > 0 ? cy / iy : 2;
    const hi = Math.abs(dyi) < 1 ? ix * Math.sqrt(1 - dyi * dyi) : -1;
    const segs: [number, number][] = hi < 0 ? [[s.x - ho, s.x + ho]] : [[s.x - ho, s.x - hi], [s.x + hi, s.x + ho]];
    for (const [a, b] of segs) {
      let x0 = snap(a + P / 2), x1 = snap(b + P / 2);
      if (x1 <= x0) x1 = x0 + P;
      if (full) { fillRect(x0, py, x1 - x0, P); continue; }
      for (let px = x0; px < x1; px += P) if (inArc(Math.atan2(py + P / 2 - s.y, px + P / 2 - s.x), s)) fillRect(px, py, P, P);
    }
  }
}

/** Activa las formas pixeladas en un contexto (idempotente). */
export function pixelizeShapes(ctx: CanvasRenderingContext2D) {
  const c = ctx as PxCtx;
  if (c.__px) return;
  c.__px = true;
  const o = {
    beginPath: ctx.beginPath.bind(ctx), arc: ctx.arc.bind(ctx), ellipse: ctx.ellipse.bind(ctx),
    moveTo: ctx.moveTo.bind(ctx), lineTo: ctx.lineTo.bind(ctx), rect: ctx.rect.bind(ctx),
    quadraticCurveTo: ctx.quadraticCurveTo.bind(ctx), bezierCurveTo: ctx.bezierCurveTo.bind(ctx),
    fill: ctx.fill.bind(ctx) as (...a: unknown[]) => void, stroke: ctx.stroke.bind(ctx) as (...a: unknown[]) => void,
    fillRect: ctx.fillRect.bind(ctx),
  };
  let shapes: Shape[] | null = [];
  const mixed = () => { shapes = null; };
  ctx.beginPath = () => { shapes = []; o.beginPath(); };
  ctx.moveTo = (x, y) => { mixed(); o.moveTo(x, y); };
  ctx.lineTo = (x, y) => { mixed(); o.lineTo(x, y); };
  ctx.rect = (x, y, w, h) => { mixed(); o.rect(x, y, w, h); };
  ctx.quadraticCurveTo = (a, b, cc, d) => { mixed(); o.quadraticCurveTo(a, b, cc, d); };
  ctx.bezierCurveTo = (a, b, cc, d, e, f) => { mixed(); o.bezierCurveTo(a, b, cc, d, e, f); };
  ctx.arc = (x, y, r, a0, a1, ccw = false) => { shapes?.push({ x, y, rx: r, ry: r, a0, a1, ccw }); o.arc(x, y, r, a0, a1, ccw); };
  ctx.ellipse = (x, y, rx, ry, rot, a0, a1, ccw = false) => {
    if (rot) mixed(); else shapes?.push({ x, y, rx, ry, a0, a1, ccw });
    o.ellipse(x, y, rx, ry, rot, a0, a1, ccw);
  };
  ctx.fill = ((...args: unknown[]) => {
    if (!shapes?.length || args.length) { o.fill(...args); return; }
    for (const s of shapes) pxFillEllipse(ctx, s, o.fillRect);
  }) as typeof ctx.fill;
  ctx.stroke = ((...args: unknown[]) => {
    if (!shapes?.length || args.length) { o.stroke(...args); return; }
    const prev = ctx.fillStyle;
    ctx.fillStyle = ctx.strokeStyle;
    for (const s of shapes) pxStrokeEllipse(ctx, s, ctx.lineWidth, o.fillRect);
    ctx.fillStyle = prev;
  }) as typeof ctx.stroke;
}
