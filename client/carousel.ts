// Carrusel horizontal de monstruos: la ficha centrada es la elegida; las vecinas se ven más pequeñas y apagadas.
// Se mueve con las flechas ◀ ▶, deslizando el dedo, con la rueda/trackpad horizontal o con las teclas ← →.
export class Carousel {
  readonly root: HTMLElement;
  readonly track: HTMLElement;
  private cards: HTMLElement[] = [];
  private idx = 0;
  private raf = 0;
  private settleT = 0;
  private programmatic = false;

  constructor(root: HTMLElement, private onChange: (i: number) => void, private onActivate: (i: number) => void) {
    this.root = root;
    root.classList.add('carousel');
    root.innerHTML = '<button class="cprev" aria-label="◀">◀</button><div class="ctrack"></div><button class="cnext" aria-label="▶">▶</button>';
    this.track = root.querySelector('.ctrack')!;
    (root.querySelector('.cprev') as HTMLElement).onclick = () => this.go(this.idx - 1);
    (root.querySelector('.cnext') as HTMLElement).onclick = () => this.go(this.idx + 1);
    this.track.addEventListener('scroll', () => {
      if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.paint(); });
      clearTimeout(this.settleT);
      this.settleT = window.setTimeout(() => this.settle(), 120);
    }, { passive: true });
    window.addEventListener('resize', () => this.recenter());
  }

  get index() { return this.idx; }

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
    if (same) { this.track.scrollLeft = keep; this.paint(); } else this.recenter();
  }

  /** Vuelve a centrar la elegida (tras mostrarse la pantalla o cambiar el tamaño). */
  recenter() {
    requestAnimationFrame(() => { this.scrollTo(this.idx, false); this.paint(); });
  }

  go(i: number, smooth = true) {
    i = Math.max(0, Math.min(this.cards.length - 1, i));
    if (i !== this.idx) { this.idx = i; this.onChange(i); }
    this.scrollTo(i, smooth);
  }

  private scrollTo(i: number, smooth: boolean) {
    const c = this.cards[i];
    if (!c || !this.track.clientWidth) return;
    this.programmatic = smooth;
    this.track.scrollTo({ left: c.offsetLeft + c.offsetWidth / 2 - this.track.clientWidth / 2, behavior: smooth ? 'smooth' : 'auto' });
  }

  private nearest() {
    const mid = this.track.scrollLeft + this.track.clientWidth / 2;
    let best = 0, bd = Infinity;
    this.cards.forEach((c, i) => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  /** Tamaño y brillo de cada ficha según lo lejos que esté del centro. */
  private paint() {
    const mid = this.track.scrollLeft + this.track.clientWidth / 2;
    for (const c of this.cards) {
      const d = Math.min(3, Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid) / (c.offsetWidth || 1));
      c.style.setProperty('--d', d.toFixed(3));
      c.classList.toggle('center', d < 0.5);
    }
  }

  private settle() {
    if (this.programmatic) { this.programmatic = false; }
    const n = this.nearest();
    if (n !== this.idx) { this.idx = n; this.onChange(n); }
  }
}
