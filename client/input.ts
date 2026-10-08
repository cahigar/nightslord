// Teclado + ratón + controles táctiles (joystick virtual) para móvil.
import { BTN_ATTACK, BTN_E, BTN_Q, BTN_R } from '../shared/constants';

export const input = {
  keys: new Set<string>(),
  pulses: new Set<string>(), // pulsaciones rápidas que no deben perderse entre envíos de input
  mouseX: 0,
  mouseY: 0,
  mouseDown: false,
  /** Táctil: joystick flotante (mueve) y botones que se arrastran para apuntar (y se sueltan para lanzar). */
  touch: {
    active: false, mx: 0, my: 0,
    moveAim: null as number | null, // última dirección del joystick
    aim: null as number | null, aimDist: 220, dragging: 0, // apuntado manual arrastrando un botón (bit del botón)
    buttons: 0, pulse: 0,
  },
  onKey: null as ((code: string) => void) | null,
};

export function setupInput(canvas: HTMLCanvasElement) {
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (!input.keys.has(e.code)) { input.onKey?.(e.code); input.pulses.add(e.code); }
    input.keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); input.mouseDown = false; });
  canvas.addEventListener('mousemove', (e) => { input.mouseX = e.clientX; input.mouseY = e.clientY; });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { input.mouseDown = true; input.pulses.add('Mouse0'); }
    if (e.button === 2) { input.keys.add('KeyQ'); input.pulses.add('KeyQ'); }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouseDown = false;
    if (e.button === 2) input.keys.delete('KeyQ');
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  setupTouch();
}

function setupTouch() {
  if (!('ontouchstart' in window) && !(navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches)) return;
  const pad = document.getElementById('touch')!;
  pad.hidden = false;
  input.touch.active = true;
  document.body.classList.add('touch');
  const stick = document.getElementById('stick')!;
  const knob = document.getElementById('knob')!;
  const MAX = 48;
  let stickId: number | null = null;
  let cx = 0, cy = 0;
  // joystick flotante: aparece donde apoyes el pulgar en la mitad izquierda de la pantalla
  const zone = document.getElementById('stickzone')!;
  const place = (x: number, y: number) => {
    cx = x; cy = y;
    stick.style.left = `${x - stick.offsetWidth / 2}px`; stick.style.top = `${y - stick.offsetHeight / 2}px`;
    stick.style.bottom = 'auto';
    stick.classList.add('on');
  };
  zone.addEventListener('touchstart', (e) => {
    if (stickId !== null) return;
    const t = e.changedTouches[0];
    stickId = t.identifier;
    place(t.clientX, t.clientY);
    e.preventDefault();
  }, { passive: false });
  // botones: pulsar = mantener (ataque) · arrastrar = apuntar · soltar = lanzar (Q, E, R)
  const drags = new Map<number, { bit: number; x: number; y: number; hold: boolean; el: HTMLElement }>();
  window.addEventListener('touchmove', (e) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === stickId) {
        let dx = t.clientX - cx, dy = t.clientY - cy;
        const d = Math.hypot(dx, dy);
        if (d > MAX * 1.6) { cx += (dx / d) * (d - MAX * 1.6); cy += (dy / d) * (d - MAX * 1.6); place(cx, cy); dx = t.clientX - cx; dy = t.clientY - cy; } // el joystick sigue al dedo
        const dd = Math.hypot(dx, dy);
        if (dd > MAX) { dx = (dx / dd) * MAX; dy = (dy / dd) * MAX; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        // zona muerta pequeña y velocidad máxima a poco más de media carrera (no hace falta llevar el pulgar al borde)
        const DEAD = 6, FULL = MAX * 0.55;
        const k = dd <= DEAD ? 0 : Math.min(1, (dd - DEAD) / (FULL - DEAD));
        input.touch.mx = dd > 0 ? (dx / dd) * k : 0; input.touch.my = dd > 0 ? (dy / dd) * k : 0;
        if (dd > 10) input.touch.moveAim = Math.atan2(dy, dx);
        e.preventDefault();
        continue;
      }
      const g = drags.get(t.identifier);
      if (!g) continue;
      const dx = t.clientX - g.x, dy = t.clientY - g.y, d = Math.hypot(dx, dy);
      if (d > 16) {
        input.touch.dragging = g.bit;
        input.touch.aim = Math.atan2(dy, dx);
        input.touch.aimDist = Math.max(60, Math.min(900, (d - 16) * 5));
        g.el.classList.add('aiming');
      }
      e.preventDefault();
    }
  }, { passive: false });
  const end = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === stickId) {
        stickId = null; input.touch.mx = 0; input.touch.my = 0; knob.style.transform = '';
        stick.classList.remove('on'); stick.style.left = ''; stick.style.top = ''; stick.style.bottom = '';
      }
      const g = drags.get(t.identifier);
      if (!g) continue;
      drags.delete(t.identifier);
      g.el.classList.remove('down', 'aiming');
      input.touch.buttons &= ~g.bit;
      if (!g.hold) input.touch.pulse |= g.bit; // Q, E y R se lanzan al soltar (hacia donde apuntaste)
      if (input.touch.dragging === g.bit) setTimeout(() => { if (input.touch.dragging === g.bit) { input.touch.dragging = 0; input.touch.aim = null; } }, 120);
    }
  };
  window.addEventListener('touchend', end);
  window.addEventListener('touchcancel', end);
  const bind = (id: string, bit: number, hold: boolean) => {
    const el = document.getElementById(id)!;
    el.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      const r = el.getBoundingClientRect();
      drags.set(t.identifier, { bit, x: r.left + r.width / 2, y: r.top + r.height / 2, hold, el });
      el.classList.add('down');
      if (hold) input.touch.buttons |= bit;
      if (navigator.vibrate) try { navigator.vibrate(8); } catch { /* */ }
      e.preventDefault();
    }, { passive: false });
  };
  bind('tb-atk', BTN_ATTACK, true); bind('tb-q', BTN_Q, false); bind('tb-e', BTN_E, false); bind('tb-r', BTN_R, false);
  document.getElementById('tb-emote')!.addEventListener('touchstart', (e) => { input.onKey?.('KeyT'); e.preventDefault(); }, { passive: false });
  document.getElementById('tb-trap')!.addEventListener('touchstart', (e) => { input.onKey?.('KeyX'); e.preventDefault(); }, { passive: false });
}

export function readMove(): { mx: number; my: number } {
  const k = input.keys;
  let mx = 0, my = 0;
  if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
  if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
  if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
  if (input.touch.active && (input.touch.mx || input.touch.my)) { mx = input.touch.mx; my = input.touch.my; }
  const l = Math.hypot(mx, my);
  return l > 1 ? { mx: mx / l, my: my / l } : { mx, my };
}

export function readButtons(): number {
  let b = input.touch.buttons | input.touch.pulse;
  input.touch.pulse = 0;
  const k = (c: string) => input.keys.has(c) || input.pulses.has(c);
  if (input.mouseDown || input.pulses.has('Mouse0') || k('Space')) b |= BTN_ATTACK;
  if (k('KeyQ')) b |= BTN_Q;
  if (k('KeyE')) b |= BTN_E;
  if (k('KeyR')) b |= BTN_R;
  input.pulses.clear();
  return b;
}
