// Integración con portales de juegos. Solo se activa en compilaciones especiales (VITE_PORTAL), p. ej.
// `npm run build:crazygames`; en mooonsters.com PORTAL está vacío y nada de esto se ejecuta.
const ENV = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
export const PORTAL = ENV.VITE_PORTAL ?? '';
export const isCrazy = PORTAL === 'crazygames';

interface CrazySdk {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  game: {
    gameplayStart(): void; gameplayStop(): void; loadingStart(): void; loadingStop(): void;
    settings: { muteAudio?: boolean };
    addSettingsChangeListener(cb: (s: { muteAudio?: boolean }) => void): void;
  };
  data: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
}
let sdk: CrazySdk | null = null;
let playing = false;

/** Carga e inicia el SDK del portal (como mucho 6 s: si falla, el juego sigue sin él). */
export async function initPortal(onMute: (m: boolean) => void): Promise<void> {
  if (!isCrazy) return;
  document.body.classList.add('portal', 'portal-crazy');
  try {
    await new Promise<void>((ok, fail) => {
      const s = document.createElement('script');
      s.src = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
      s.onload = () => ok(); s.onerror = () => fail(new Error('sdk'));
      document.head.appendChild(s);
      setTimeout(() => fail(new Error('timeout')), 6000);
    });
    const s = (window as unknown as { CrazyGames?: { SDK: CrazySdk } }).CrazyGames?.SDK;
    if (!s) return;
    await Promise.race([s.init(), new Promise((_, f) => setTimeout(() => f(new Error('init')), 6000))]);
    if (s.environment === 'disabled') return;
    sdk = s;
    onMute(!!s.game.settings.muteAudio);
    s.game.addSettingsChangeListener((st) => onMute(!!st.muteAudio));
  } catch { /* sin SDK: se juega igual */ }
  // iOS: el audio se corta al volver de segundo plano; hay que reanudarlo dentro de un gesto del usuario
  const resume = () => { const ac = (window as unknown as { __nlAudio?: AudioContext }).__nlAudio; if (ac && ac.state !== 'running') ac.resume(); };
  document.addEventListener('touchend', resume, { passive: true });
  document.addEventListener('click', resume);
}

const call = (f: (s: CrazySdk) => void) => { try { if (sdk) f(sdk); } catch { /* */ } };
export const loadingStart = () => call((s) => s.game.loadingStart());
export const loadingStop = () => call((s) => s.game.loadingStop());
/** Avisa al portal de cuándo se está jugando (para anuncios y estadísticas). */
export function setPlaying(on: boolean) {
  if (on === playing) return;
  playing = on;
  call((s) => (on ? s.game.gameplayStart() : s.game.gameplayStop()));
}

/** Guardado del invitado en el portal (sustituye al inicio de sesión con Google). */
export function portalGet(k: string): string | null { try { return sdk ? sdk.data.getItem(k) : null; } catch { return null; } }
export function portalSet(k: string, v: string) { call((s) => s.data.setItem(k, v)); }
