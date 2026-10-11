// Guía del primer minuto: en las primeras partidas, dibuja los controles y el objetivo sobre el juego
// (teclas, ratón y una flecha hacia el humano más cercano). Cada paso se completa haciéndolo; se puede saltar.
import { Kind, type YouState } from '../shared/protocol';
import { input } from './input';
import { t } from './i18n';
import { quality } from './quality';
import type { Game } from './game';

type Step = 'move' | 'hunt' | 'abil' | 'grow';
const ORDER: Step[] = ['move', 'hunt', 'abil', 'grow'];
const KEY = 'nl_coach';

const kc = (k: string, wide = false) => `<span class="kc${wide ? ' wide' : ''}">${k}</span>`;
const mouse = `<span class="mouse"><i></i></span>`;

export class Coach {
  private el: HTMLDivElement;
  private arrow: HTMLDivElement;
  private step = -1;
  private stepT = 0;
  private moved = 0;
  private last: { x: number; y: number } | null = null;
  private lastT = 0;

  private t0 = 0; // cuándo empezó la guía (para las estadísticas)
  /** onStep: paso completado (move, hunt, abil, done) o saltado (skip), con los segundos desde que empezó. */
  onStep: (step: string, s: number) => void = () => {};

  constructor(private game: Game, private canvas: HTMLCanvasElement, private store: { get(k: string): string | null; set(k: string, v: string): void }) {
    this.el = document.createElement('div');
    this.el.id = 'coach';
    this.el.hidden = true;
    this.arrow = document.createElement('div');
    this.arrow.id = 'coach-arrow';
    this.arrow.hidden = true;
    document.getElementById('hud')!.append(this.el, this.arrow);
    this.step = this.store.get(KEY) === 'done' ? ORDER.length : 0;
  }

  get active() { return this.step >= 0 && this.step < ORDER.length; }

  private finish(skipped = false) {
    if (skipped) this.report('skip');
    this.step = ORDER.length; this.store.set(KEY, 'done'); this.hide();
  }
  private report(step: string) { this.onStep(step, this.t0 ? performance.now() / 1000 - this.t0 : 0); }
  private hide() { this.el.hidden = true; this.arrow.hidden = true; }
  private next() {
    this.report(ORDER[this.step] === 'grow' ? 'done' : ORDER[this.step]);
    this.step++; this.stepT = 0;
    if (this.step >= ORDER.length) this.finish();
    else this.render();
  }

  private render() {
    const touch = input.touch.active;
    const s = ORDER[this.step];
    let keys = '', text = '';
    if (s === 'move') { keys = touch ? `<span class="stick"><i></i></span>` : `<span class="wasd">${kc('W')}<br>${kc('A')}${kc('S')}${kc('D')}</span>`; text = t('coachMove'); }
    if (s === 'hunt') { keys = touch ? `<span class="tbtn">🦷</span>` : mouse; text = t('coachHunt'); }
    if (s === 'abil') { keys = touch ? `<span class="tbtn">Q</span><span class="tbtn">E</span>` : `${kc('Q')}${kc('E')}`; text = t('coachAbil'); }
    if (s === 'grow') { keys = `<span class="grow">⬆</span>`; text = `${t('coachGrow')}<small>5 · 10 · 15</small><em>⚠ ${t('coachHunters')}</em>`; }
    this.el.innerHTML = `<div class="coach-keys">${keys}</div><div class="coach-text">${text}</div>
      <div class="coach-dots">${ORDER.map((_, i) => `<b class="${i < this.step ? 'ok' : i === this.step ? 'on' : ''}"></b>`).join('')}</div>
      <button class="coach-skip" type="button">${t('coachSkip')} ✕</button>`;
    this.el.querySelector<HTMLButtonElement>('.coach-skip')!.onclick = () => this.finish(true);
    this.el.hidden = false;
    this.el.classList.remove('pop'); void this.el.offsetWidth; this.el.classList.add('pop');
  }

  /** Llamar en cada actualización del HUD. `on` = partida normal en curso (no tutorial, no previa). */
  update(y: YouState | null, on: boolean) {
    if (!this.active) return;
    if (!on || !y || !this.game.alive) { this.hide(); return; }
    const now = performance.now() / 1000;
    const dt = this.lastT ? Math.min(0.5, now - this.lastT) : 0;
    this.lastT = now;
    if (!this.t0) this.t0 = now;
    if (this.el.hidden) this.render();
    this.stepT += dt;
    const s = ORDER[this.step];
    const me = this.game.ents.get(this.game.youId);
    if (me && this.last) this.moved += Math.hypot(me.rx - this.last.x, me.ry - this.last.y);
    if (me) this.last = { x: me.rx, y: me.ry };

    if (s === 'move' && this.moved > 140) this.next();
    else if (s === 'hunt' && (y.pts > 0 || y.lvl > 1)) this.next();
    else if (s === 'abil' && (y.cd[1] > 0 || y.cd[2] > 0 || this.stepT > 14)) this.next();
    else if (s === 'grow' && this.stepT > 6) this.next();
    this.pointArrow(me, ORDER[this.step] === 'hunt');
  }

  /** Flecha que gira alrededor del jugador señalando al humano más cercano. */
  private pointArrow(me: { rx: number; ry: number } | undefined, show: boolean) {
    if (!show || !me) { this.arrow.hidden = true; return; }
    let best: { rx: number; ry: number } | null = null, bd = Infinity;
    for (const e of this.game.ents.values()) {
      if (e.k !== Kind.Npc || (e.h ?? 100) <= 0) continue;
      const d = (e.rx - me.rx) ** 2 + (e.ry - me.ry) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best || bd < 70 ** 2) { this.arrow.hidden = true; return; }
    const g = this.game, z = g.cam.zoom, sc = quality.scale || 1;
    const px = (this.canvas.width / 2 + (me.rx - g.cam.x) * z) / sc;
    const py = (this.canvas.height * g.focusY + (me.ry - 30 - g.cam.y) * z) / sc;
    const a = Math.atan2(best.ry - me.ry, best.rx - me.rx);
    const R = 40 * z / sc + 26;
    this.arrow.style.transform = `translate(${px + Math.cos(a) * R}px, ${py + Math.sin(a) * R}px) rotate(${a}rad)`;
    this.arrow.hidden = false;
  }
}
