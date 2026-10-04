// Colisiones círculo-rectángulo con rejilla espacial de obstáculos (compartido servidor/cliente para predicción).
import { MAP_SIZE } from './constants';
import type { GameMap, Obstacle } from './maps';

const CELL = 200;

export class ObstacleGrid {
  cols: number;
  cells: Obstacle[][];
  constructor(public map: GameMap) {
    this.cols = Math.ceil(MAP_SIZE / CELL);
    this.cells = Array.from({ length: this.cols * this.cols }, () => []);
    for (const o of map.obstacles) {
      const x0 = Math.max(0, Math.floor(o.x / CELL)), x1 = Math.min(this.cols - 1, Math.floor((o.x + o.w) / CELL));
      const y0 = Math.max(0, Math.floor(o.y / CELL)), y1 = Math.min(this.cols - 1, Math.floor((o.y + o.h) / CELL));
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) this.cells[cy * this.cols + cx].push(o);
    }
  }

  near(x: number, y: number, r: number): Obstacle[] {
    const x0 = Math.max(0, Math.floor((x - r) / CELL)), x1 = Math.min(this.cols - 1, Math.floor((x + r) / CELL));
    const y0 = Math.max(0, Math.floor((y - r) / CELL)), y1 = Math.min(this.cols - 1, Math.floor((y + r) / CELL));
    if (x0 === x1 && y0 === y1) return this.cells[y0 * this.cols + x0];
    const set = new Set<Obstacle>();
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) for (const o of this.cells[cy * this.cols + cx]) set.add(o);
    return [...set];
  }

  /** Mueve un círculo resolviendo colisiones. Devuelve la nueva posición. */
  move(x: number, y: number, dx: number, dy: number, r: number, overWater = false): { x: number; y: number; hit: boolean } {
    let nx = x + dx, ny = y + dy, hit = false;
    for (let iter = 0; iter < 2; iter++) {
      for (const o of this.near(nx, ny, r + 4)) {
        if (overWater && o.type === 'water') continue; // las criaturas acuáticas cruzan el agua profunda
        const cx = Math.max(o.x, Math.min(nx, o.x + o.w));
        const cy = Math.max(o.y, Math.min(ny, o.y + o.h));
        let ex = nx - cx, ey = ny - cy;
        const d2 = ex * ex + ey * ey;
        if (d2 < r * r) {
          hit = true;
          if (d2 > 0.0001) {
            const d = Math.sqrt(d2);
            nx = cx + (ex / d) * r;
            ny = cy + (ey / d) * r;
          } else {
            // centro dentro del rectángulo: empujar por el lado más cercano
            const left = nx - o.x, right = o.x + o.w - nx, top = ny - o.y, bottom = o.y + o.h - ny;
            const m = Math.min(left, right, top, bottom);
            if (m === left) nx = o.x - r; else if (m === right) nx = o.x + o.w + r;
            else if (m === top) ny = o.y - r; else ny = o.y + o.h + r;
          }
        }
      }
    }
    nx = Math.max(r, Math.min(MAP_SIZE - r, nx));
    ny = Math.max(r, Math.min(MAP_SIZE - r, ny));
    return { x: nx, y: ny, hit };
  }

  /** ¿Hay agua profunda (obstáculo de agua) bajo este punto? */
  deepWater(x: number, y: number): boolean {
    for (const o of this.near(x, y, 1)) if (o.type === 'water' && x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return true;
    return false;
  }

  blocked(x: number, y: number, r: number, ignoreWater = false): boolean {
    for (const o of this.near(x, y, r)) {
      if (ignoreWater && o.type === 'water') continue;
      const cx = Math.max(o.x, Math.min(x, o.x + o.w));
      const cy = Math.max(o.y, Math.min(y, o.y + o.h));
      const ex = x - cx, ey = y - cy;
      if (ex * ex + ey * ey < r * r) return true;
    }
    return x < r || y < r || x > MAP_SIZE - r || y > MAP_SIZE - r;
  }

  /** Línea de visión (el agua no bloquea). */
  lineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(dist / 30);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.blocked(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 2, true)) return false;
    }
    return true;
  }
}
