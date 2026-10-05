import type { ClientMsg, ServerMsg } from '../shared/protocol';

type Handler = (m: ServerMsg) => void;

const ENV = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};

/**
 * Servidores de juego ("shards"). VITE_SHARDS="A,B,C,D" indica que hay varios procesos detrás del mismo
 * dominio, en las rutas /A/ws, /B/ws... (el proxy, p. ej. Caddy, reparte por ruta). Vacío = un solo servidor.
 * Cada sala vive en un shard: su código empieza por la letra del shard.
 */
export const SHARDS = (ENV.VITE_SHARDS ?? '').split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]$/.test(s));

/** Base HTTP del servidor: VITE_SERVER_URL permite alojar el cliente aparte (Cloudflare Pages, Vercel...). */
function httpBase(): string {
  if (ENV.VITE_SERVER_URL) return ENV.VITE_SERVER_URL.replace(/\/$/, '');
  return `${location.protocol}//${location.host}`;
}
const wsUrl = (shard: string) => httpBase().replace(/^http/, 'ws') + (shard ? `/${shard}` : '') + '/ws';

export class Net {
  ws: WebSocket | null = null;
  shard = '';
  private handlers: Handler[] = [];
  private pingTimer: number | null = null;
  private switching = false;
  rtt = 0;
  onClose: (() => void) | null = null;

  /** Elige el shard: el de más jugadores que aún tenga hueco cómodo (así las salas tienen ambiente), o el menos cargado. */
  async pickShard(): Promise<string> {
    if (!SHARDS.length) return '';
    const results = await Promise.all(SHARDS.map(async (s) => {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 1500);
        const r = await fetch(`${httpBase()}/${s}/health`, { signal: ctl.signal, cache: 'no-store' });
        clearTimeout(t);
        const h = await r.json() as { connections: number; maxConnections: number; full: boolean };
        return { s, load: h.connections / Math.max(1, h.maxConnections), full: h.full };
      } catch { return { s, load: 2, full: true }; }
    }));
    const ok = results.filter((r) => !r.full);
    if (!ok.length) return SHARDS[Math.floor(Math.random() * SHARDS.length)];
    const comfy = ok.filter((r) => r.load < 0.75).sort((a, b) => b.load - a.load);
    return (comfy[0] ?? ok.sort((a, b) => a.load - b.load)[0]).s;
  }

  connect(shard = this.shard): Promise<void> {
    this.shard = shard;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl(shard));
      this.ws = ws;
      ws.onopen = () => {
        resolve();
        if (this.pingTimer !== null) clearInterval(this.pingTimer);
        this.pingTimer = window.setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
      };
      ws.onerror = () => reject(new Error('No se pudo conectar con el servidor'));
      ws.onclose = () => { if (ws === this.ws && !this.switching) this.onClose?.(); };
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data) as ServerMsg;
        if (m.t === 'pong') { this.rtt = performance.now() - m.c; return; }
        for (const h of this.handlers) h(m);
      };
    });
  }

  /** Cambia de shard (p. ej. para entrar en una sala por código que vive en otro). */
  async switchTo(shard: string) {
    if (shard === this.shard && this.ws?.readyState === WebSocket.OPEN) return;
    this.switching = true;
    this.ws?.close();
    try { await this.connect(shard); } finally { this.switching = false; }
  }

  /** Shard al que pertenece un código de sala (o el actual). */
  shardOfCode(code: string) {
    const s = code.trim().toUpperCase()[0] ?? '';
    return SHARDS.includes(s) ? s : this.shard;
  }

  on(h: Handler) { this.handlers.push(h); }

  send(m: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
}

export const net = new Net();
