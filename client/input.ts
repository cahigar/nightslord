// Teclado + ratón + controles táctiles (joystick virtual) para móvil.
import { BTN_ATTACK, BTN_E, BTN_Q } from '../shared/constants';

export const input = {
  keys: new Set<string>(),
  mouseX: 0,
  mouseY: 0,
  mouseDown: false,
  touch: { active: false, mx: 0, my: 0, aim: null as number | null, buttons: 0 },
  onKey: null as ((code: string) => void) | null,
};

export function setupInput(canvas: HTMLCanvasElement) {
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (!input.keys.has(e.code)) input.onKey?.(e.code);
    input.keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); input.mouseDown = false; });
  canvas.addEventListener('mousemove', (e) => { input.mouseX = e.clientX; input.mouseY = e.clientY; });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.mouseDown = true;
    if (e.button === 2) input.keys.add('KeyQ');
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouseDown = false;
    if (e.button === 2) input.keys.delete('KeyQ');
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  setupTouch();
}

function setupTouch() {
  if (!('ontouchstart' in window)) return;
  const pad = document.getElementById('touch')!;
  pad.hidden = false;
  input.touch.active = true;
  const stick = document.getElementById('stick')!;
  const knob = document.getElementById('knob')!;
  let stickId: number | null = null;
  let cx = 0, cy = 0;
  stick.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    stickId = t.identifier;
    const r = stick.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    e.preventDefault();
  }, { passive: false });
  window.addEventListener('touchmove', (e) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== stickId) continue;
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const d = Math.hypot(dx, dy), max = 45;
      if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      input.touch.mx = dx / max; input.touch.my = dy / max;
      if (d > 10) input.touch.aim = Math.atan2(dy, dx);
    }
  }, { passive: false });
  window.addEventListener('touchend', (e) => {
    for (const t of Array.from(e.changedTouches)) if (t.identifier === stickId) {
      stickId = null; input.touch.mx = 0; input.touch.my = 0; knob.style.transform = '';
    }
  });
  const bind = (id: string, bit: number) => {
    const el = document.getElementById(id)!;
    el.addEventListener('touchstart', (e) => { input.touch.buttons |= bit; e.preventDefault(); }, { passive: false });
    el.addEventListener('touchend', () => { input.touch.buttons &= ~bit; });
  };
  bind('tb-atk', BTN_ATTACK); bind('tb-q', BTN_Q); bind('tb-e', BTN_E);
  document.getElementById('tb-emote')!.addEventListener('touchstart', () => input.onKey?.('KeyT'));
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
  let b = input.touch.buttons;
  if (input.mouseDown || input.keys.has('Space')) b |= BTN_ATTACK;
  if (input.keys.has('KeyQ')) b |= BTN_Q;
  if (input.keys.has('KeyE')) b |= BTN_E;
  return b;
}
