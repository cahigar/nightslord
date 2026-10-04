import type { ClientMsg, ServerMsg } from '../shared/protocol';

type Handler = (m: ServerMsg) => void;

/** URL del servidor: VITE_SERVER_URL permite alojar el cliente (p. ej. en Vercel) y el servidor en otro sitio. */
function serverUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SERVER_URL;
  if (env) return env.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws';
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

export class Net {
  ws: WebSocket | null = null;
  private handlers: Handler[] = [];
  rtt = 0;
  onClose: (() => void) | null = null;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(serverUrl());
      this.ws = ws;
      ws.onopen = () => {
        resolve();
        setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
      };
      ws.onerror = () => reject(new Error('No se pudo conectar con el servidor'));
      ws.onclose = () => this.onClose?.();
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data) as ServerMsg;
        if (m.t === 'pong') { this.rtt = performance.now() - m.c; return; }
        for (const h of this.handlers) h(m);
      };
    });
  }

  on(h: Handler) { this.handlers.push(h); }

  send(m: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
}

export const net = new Net();
