// Integración con portales de juegos. Solo se activa en compilaciones especiales (VITE_PORTAL), p. ej.
// `npm run build:crazygames`; en mooonsters.com PORTAL está vacío y nada de esto se ejecuta.
const ENV = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
export const PORTAL = ENV.VITE_PORTAL ?? '';
export const isCrazy = PORTAL === 'crazygames';
/** Cualquier portal (CrazyGames, itch.io…): sin enlaces a fuera ni cuenta de Google; progreso guardado en el navegador. */
export const isPortal = PORTAL !== '';

interface CrazySdk {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  game: {
    gameplayStart(): void; gameplayStop(): void; loadingStart(): void; loadingStop(): void;
    isInstantMultiplayer?: boolean;
    inviteParams?: Record<string, string> | null;
    getInviteParam?(k: string): string | null;
    inviteLink?(p: Record<string, string>): string;
    addJoinRoomListener?(cb: (p: Record<string, string>) => void): void;
    updateRoom?(o: { roomId?: string; isJoinable?: boolean; inviteParams?: Record<string, string> }): void;
    leftRoom?(): void;
    settings: { muteAudio?: boolean };
    addSettingsChangeListener(cb: (s: { muteAudio?: boolean }) => void): void;
  };
  data: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
  user?: { getUser(): Promise<{ username: string } | null>; addAuthListener?(cb: (u: { username: string } | null) => void): void };
}
let sdk: CrazySdk | null = null;
let playing = false;

/** Carga e inicia el SDK del portal (como mucho 6 s: si falla, el juego sigue sin él). */
export async function initPortal(onMute: (m: boolean) => void): Promise<void> {
  if (!isPortal) return;
  document.body.classList.add('portal', `portal-${PORTAL === 'crazygames' ? 'crazy' : PORTAL}`);
  if (!isCrazy) { audioResume(); return; }
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
  audioResume();
}

/** iOS: el audio se corta al volver de segundo plano; hay que reanudarlo dentro de un gesto del usuario. */
function audioResume() {
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

// ---------------------------------------------------------------------------- multijugador (CrazyGames)
/** «Instant Multiplayer»: el jugador debe entrar directamente en una sala privada nueva. */
export const isInstantMultiplayer = () => !!sdk?.game.isInstantMultiplayer;
/** Código de sala si el juego se abrió desde una invitación. */
export function invitedRoom(): string | null {
  try { return (sdk?.game.getInviteParam?.('sala') ?? sdk?.game.inviteParams?.sala ?? null)?.toUpperCase() || null; } catch { return null; }
}
/** Invitación aceptada con el juego ya abierto. */
export function onInviteJoin(cb: (code: string) => void) {
  try { sdk?.game.addJoinRoomListener?.((p) => { if (p?.sala) cb(String(p.sala).toUpperCase()); }); } catch { /* */ }
}
/** Informa al portal de la sala actual (para el botón «Invita a tus amigos»); null = fuera de sala. */
export function reportRoom(code: string | null, joinable = true) {
  call((s) => {
    if (!code) { s.game.leftRoom?.(); return; }
    s.game.updateRoom?.({ roomId: code, isJoinable: joinable, inviteParams: { sala: code } });
  });
}
/** Enlace de invitación de CrazyGames a una sala (o null). */
export function portalInviteLink(code: string): string | null {
  try { return sdk?.game.inviteLink?.({ sala: code }) ?? null; } catch { return null; }
}

// ---------------------------------------------------------------------------- usuario (CrazyGames)
/** Nombre de usuario de CrazyGames si ha iniciado sesión (se muestra en el juego para que le reconozcan sus amigos). */
export async function portalUsername(): Promise<string | null> {
  try { const u = await sdk?.user?.getUser(); return u?.username?.trim() || null; } catch { return null; }
}
/** Avisa cuando el jugador inicia o cambia de sesión en CrazyGames. */
export function onPortalLogin(cb: (username: string) => void) {
  try { sdk?.user?.addAuthListener?.((u) => { if (u?.username) cb(u.username.trim()); }); } catch { /* */ }
}
