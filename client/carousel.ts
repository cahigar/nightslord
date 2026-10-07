// Carrusel horizontal de monstruos: la ficha centrada es la elegida; las vecinas se ven más pequeñas y apagadas.
// Se mueve con las flechas ◀ ▶ (también manteniéndolas pulsadas), deslizando el dedo, con la rueda/trackpad
// horizontal o con las teclas ← →.
//
// Para que vaya fluido aunque se pulse muchas veces seguidas:
//  - el desplazamiento lo anima el propio carrusel (una sola animación que se re-dirige, no varias que se pisan),
//    con el «imán» (scroll-snap) apagado mientras dura;
//  - las posiciones de las fichas se miden una vez y se guardan (pintar no fuerza recálculos de la página);
//  - avisa del cambio de ficha al momento, y quien lo usa puede retrasar lo pesado (ver main.ts).
export class Carousel {
  readonly root: HTMLElement;
  readonly track: HTMLElement;
  private cards: HTMLElement[] = [];
  private centers: number[] = [];
  private cardW = 1;
  private idx = 0;
  private raf = 0;
  private settleT = 0;
  private anim: { from: number; to: number; t0: number; dur: number } | null = null;
  private animRaf = 0;
  private holdT = 0;

  constructor(root: HTMLElement, private onChange: (i: number) => void, private onActivate: (i: number) => void) {
    this.root = root;
    root.classList.add('carousel');
    root.innerHTML = '<button class="cprev" aria-label="◀">◀</button><div class="ctrack"></div><button class="cnext" aria-label="▶">▶</button>';
    this.track = root.querySelector('.ctrack')!;
    this.holdButton(root.querySelector('.cprev') as HTMLElement, -1);
    this.holdButton(root.querySelector('.cnext') as HTMLElement, 1);
    this.track.addEventListener('scroll', () => {
      if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.paint(); });
      if (this.anim) return; // lo movemos nosotros: no hay que «asentar»
      clearTimeout(this.settleT);
      this.settleT = window.setTimeout(() => this.settle(), 120);
    }, { passive: true });
    window.addEventListener('resize', () => this.recenter());
  }

  get index() { return this.idx; }

  /** Flecha: un paso al pulsar y, si se mantiene, pasos seguidos a ritmo constante. */
  private holdButton(b: HTMLElement, dir: number) {
    const stop = () => { clearTimeout(this.holdT); this.holdT = 0; };
    const step = (delay: number) => { this.go(this.idx + dir); this.holdT = window.setTimeout(() => step(130), delay); };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); stop(); step(380); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) b.addEventListener(ev, stop);
    b.addEventListener('click', (e) => { if (e.detail === 0) this.go(this.idx + dir); }); // teclado (Enter/Espacio sobre el botón)
  }

  /** Cambia las fichas conservando la posición (la elegida sigue en el centro). */
  setCards(nodes: HTMLElement[], idx: number) {
    const keep = this.track.scrollLeft;
    // huecos a los lados para que la primera y la última ficha también puedan quedar en el centro
    const sp = () => { const d = document.createElement('div'); d.className = 'cspace'; return d; };
    this.track.replaceChildren(sp(), ...nodes, sp());
    this.cards = nodes;
    nodes.forEach((n, i) => n.addEventListener('click', () => (i === this.idx ? this.onActivate(i) : this.go(i))));
    const same = idx === this.idx && keep > 0;
    this.idx = Math.max(0, Math.min(nodes.length - 1, idx));
    this.measure();
    if (same) { this.track.scrollLeft = keep; this.paint(); } else this.recenter();
  }

  /** Mide (una vez) dónde queda el centro de cada ficha. */
  private measure() {
    this.centers = this.cards.map((c) => c.offsetLeft + c.offsetWidth / 2);
    this.cardW = this.cards[0]?.offsetWidth || 1;
  }

  /** Vuelve a centrar la elegida (tras mostrarse la pantalla o cambiar el tamaño). */
  recenter() {
    requestAnimationFrame(() => { this.measure(); this.stopAnim(); this.track.scrollLeft = this.targetLeft(this.idx); this.paint(); });
  }

  go(i: number, smooth = true) {
    i = Math.max(0, Math.min(this.cards.length - 1, i));
    if (i !== this.idx) { this.idx = i; this.onChange(i); }
    if (!this.track.clientWidth) return;
    if (!this.centers.length || !this.centers[this.centers.length - 1]) this.measure();
    if (!smooth) { this.stopAnim(); this.track.scrollLeft = this.targetLeft(i); this.paint(); return; }
    this.animateTo(this.targetLeft(i));
  }

  private targetLeft(i: number) { return (this.centers[i] ?? 0) - this.track.clientWidth / 2; }

  /** Animación propia: si llega otro destino a mitad, sigue desde donde va (sin tirones). */
  private animateTo(to: number) {
    const from = this.track.scrollLeft;
    if (Math.abs(to - from) < 1) { this.stopAnim(); return; }
    this.anim = { from, to, t0: performance.now(), dur: Math.min(320, 160 + Math.abs(to - from) * 0.35) };
    this.root.classList.add('moving');
    if (this.animRaf) return;
    const tick = (now: number) => {
      const a = this.anim;
      if (!a) { this.animRaf = 0; return; }
      const k = Math.min(1, (now - a.t0) / a.dur), e = 1 - (1 - k) ** 3;
      this.track.scrollLeft = a.from + (a.to - a.from) * e;
      this.paint();
      if (k < 1) this.animRaf = requestAnimationFrame(tick);
      else { this.animRaf = 0; this.stopAnim(); }
    };
    this.animRaf = requestAnimationFrame(tick);
  }

  private stopAnim() {
    this.anim = null;
    if (this.animRaf) { cancelAnimationFrame(this.animRaf); this.animRaf = 0; }
    this.root.classList.remove('moving');
  }

  private nearest() {
    const mid = this.track.scrollLeft + this.track.clientWidth / 2;
    let best = 0, bd = Infinity;
    this.centers.forEach((c, i) => { const d = Math.abs(c - mid); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  /** Tamaño y brillo de cada ficha según lo lejos que esté del centro (solo escribe estilos, no mide nada). */
  private paint() {
    const mid = this.track.scrollLeft + this.track.clientWidth / 2;
    for (let i = 0; i < this.cards.length; i++) {
      const d = Math.min(3, Math.abs(this.centers[i] - mid) / this.cardW);
      const c = this.cards[i];
      const v = d.toFixed(2);
      if (c.style.getPropertyValue('--d') !== v) c.style.setProperty('--d', v);
      const center = d < 0.5;
      if (c.classList.contains('center') !== center) c.classList.toggle('center', center);
    }
  }

  private settle() {
    if (this.anim) return;
    const n = this.nearest();
    if (n !== this.idx) { this.idx = n; this.onChange(n); }
  }
}
