// Punto de entrada del cliente: menús, HUD y bucle de render.
import { CHARACTERS, CHARACTER_IDS, SKINS, UPGRADES, upgradeMax, type CharacterId, type UpgradeId } from '../shared/characters';
import { CHARACTER_UNLOCK, hasCharacter, hasSkin, MEDALS, MEDAL_BY_ID, unlockPrice, type Profile } from '../shared/catalog';
import { THEMES, type MapThemeId } from '../shared/maps';
import { Anim, Flag2, Kind, type GameEvent, type ServerMsg } from '../shared/protocol';
import { DAILY, NIGHTLORD } from '../shared/balance';
import { initAudio, isMuted, playSfx, setForcedMute, startMusic, toggleMute, setMusicKey } from './audio';
import { Game } from './game';
import { startLogo } from './logo';
import { startMenuBg } from './menubg';
import { startParade } from './parade';
import { Carousel } from './carousel';
import { adaptQuality, quality } from './quality';
import { Coach } from './coach';
import { LESSONS, stepText, TUT_CHARS, tt2, type TutChar, type TutCtx } from './tutorial';
import { input, setupInput } from './input';
import { net } from './net';
import { MONSTER_PAGE } from '../shared/monsterPages';
import { invitedRoom, isCrazy, isPortal, PORTAL, initPortal, isInstantMultiplayer, loadingStop, onInviteJoin, onPortalLogin, portalGet, portalInviteLink, portalSet, portalUsername, reportRoom, setPlaying } from './portal';
import { ANIMS, getFrame, getItem, SH, SW } from './sprites';
import { applyStatic, buildLangPicker, lang, onLangChange, setLang, t, tb, tc, th, tk, tm, tpu, tt, tu, tw } from './i18n';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const game = new Game(canvas);
// acceso de depuración desde la consola (solo útil en modo desarrollo)
(window as unknown as { __nl: unknown }).__nl = { game, net, screen: (w: 'splash' | 'menu' | 'game' | 'death') => showScreen(w), quality, tut: () => tut };

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* */ } },
};
const coach = new Coach(game, canvas, store);
coach.onStep = (step, s) => net.send({ t: 'coach', step, s: Math.round(s) });
/** Invitado: su token vive solo en esta pestaña/navegador abierto (al cerrarlo se pierde el progreso).
 *  Con cuenta de Google: el token se guarda y el progreso se recupera desde cualquier sitio. */
const session = {
  get(k: string) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { sessionStorage.setItem(k, v); } catch { /* */ } },
  del(k: string) { try { sessionStorage.removeItem(k); } catch { /* */ } },
};
/** De dónde viene el jugador (solo para las estadísticas): web de origen, ?utm_source= / ?ref= e idioma. */
const origin = () => {
  let ref = '';
  try { const h = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; if (h && h !== location.hostname.replace(/^www\./, '')) ref = h; } catch { /* */ }
  const qs = new URLSearchParams(location.search);
  return { ref, utm: isPortal ? PORTAL : qs.get('utm_source') ?? qs.get('ref') ?? '', lang: navigator.language ?? '' };
};
const savedToken = () => (isPortal ? portalGet('nl_token') ?? store.get('nl_token') : store.get('nl_token') ?? session.get('nl_token')) ?? undefined;
let googleClientId = '';

let profile: Profile | null = null;
let selChar = (store.get('nl_char') as CharacterId) || 'vampire';
let selSkin = store.get('nl_skin') || 'classic';
let inGame = false;
let myId = -1;
let devMode = false;

// ---------------------------------------------------------------------------
// Canvas y bucle
// ---------------------------------------------------------------------------
function resize() {
  canvas.width = Math.floor(innerWidth * quality.scale);
  canvas.height = Math.floor(innerHeight * quality.scale);
}
addEventListener('resize', resize);
resize();
setupInput(canvas);

/** Centro vertical de la zona de juego que no tapan el HUD ni los controles (el personaje se dibuja ahí). */
function measureFocus(): number {
  const H = innerHeight, W = innerWidth;
  let top = 0, bottom = H;
  for (const id of ['bottom', 'upgrades', 'tbuttons', 'topleft']) {
    const el = document.getElementById(id);
    if (!el || el.hidden || el.offsetParent === null) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 4 || r.right < W / 2 - 70 || r.left > W / 2 + 70) continue; // solo lo que tapa la columna central
    if (r.top + r.height / 2 < H / 2) top = Math.max(top, r.bottom); else bottom = Math.min(bottom, r.top);
  }
  return Math.max(0.32, Math.min(0.62, (top + bottom) / 2 / H));
}

let last = performance.now();
let mmT = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.render(dt);
  if (inGame && !document.hidden && adaptQuality(dt)) resize();
  mmT -= dt;
  if (inGame && mmT <= 0) { game.minimap($<HTMLCanvasElement>('minimap')); mmT = 0.2; game.focusY += (measureFocus() - game.focusY) * 0.5; }
  animatePreviews(now);
  // sin noticias del servidor hace rato: avisar (la red se ha atascado o cortado)
  const stale = inGame && game.lastSnap > 0 && performance.now() - game.lastSnap > 1200;
  if (stale !== !$('lagwarn').hidden) { $('lagwarn').hidden = !stale; $('lagwarn').textContent = t('reconnecting'); }
  requestAnimationFrame(frame);
}
// pestaña o app en segundo plano: el personaje se para
document.addEventListener('visibilitychange', () => { if (document.hidden) game.stopInput(); });
requestAnimationFrame(frame);

// ---------------------------------------------------------------------------
// Previsualizaciones animadas de personajes
// ---------------------------------------------------------------------------
const previews: { cv: HTMLCanvasElement; char: CharacterId; skin: () => string; anim: Anim | (() => Anim); last?: string }[] = [];
function animatePreviews(now: number) {
  for (const p of previews) {
    if (!p.cv.isConnected || p.cv.offsetParent === null) continue; // pantalla oculta: no se dibuja
    const anim = typeof p.anim === 'function' ? p.anim() : p.anim;
    const def = ANIMS[anim];
    const f = Math.floor(now / 1000 / def.dur) % def.frames.length;
    const key = `${anim}|${f}|${p.skin()}`;
    if (p.last === key) continue; // mismo fotograma que ya está pintado
    p.last = key;
    const c = p.cv.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, p.cv.width, p.cv.height);
    const fr = getFrame('monster', p.char, p.skin(), anim, f);
    c.drawImage(fr.base, 0, 0, p.cv.width, p.cv.height);
    if (fr.glow) { c.globalCompositeOperation = 'lighter'; c.drawImage(fr.glow, 0, 0, p.cv.width, p.cv.height); c.globalCompositeOperation = 'source-over'; }
  }
}

// ---------------------------------------------------------------------------
// Menú
// ---------------------------------------------------------------------------
const isOwned = (id: CharacterId) => devMode || (profile ? hasCharacter(profile, id) : CHARACTER_UNLOCK[id].price === 0);

/** Intenta desbloquear un monstruo (con confirmación) o explica qué hace falta. */
function tryUnlock(id: CharacterId) {
  const price = unlockPrice(profile);
  if (profile && profile.coins >= price && confirm(t('confirmUnlock', { n: tc(id).name, p: price }))) net.send({ t: 'buy', item: `char:${id}` });
  else showError(t('needCoins', { p: price }) + (CHARACTER_UNLOCK[id].medal ? t('orMedal', { m: tm(CHARACTER_UNLOCK[id].medal!).name }) : '') + '.');
}

// Dos carruseles: el del menú y el de la pantalla de muerte. La ficha centrada es la elegida.
const carousels = new Map<string, Carousel>();
function carouselFor(container: HTMLElement) {
  let c = carousels.get(container.id);
  if (!c) {
    c = new Carousel(container, (i) => selectChar(CHARACTER_IDS[i]), (i) => { const id = CHARACTER_IDS[i]; if (!isOwned(id)) tryUnlock(id); else if (container.id === 'death-chars') $('respawn').click(); else $('play').click(); });
    carousels.set(container.id, c);
  }
  return c;
}

function buildChars(container: HTMLElement, small = false) {
  const nodes: HTMLElement[] = [];
  for (const id of CHARACTER_IDS) {
    const owned = isOwned(id);
    const el = document.createElement('div');
    el.className = `char${selChar === id ? ' sel' : ''}${owned ? '' : ' locked'}`;
    el.dataset.id = id;
    const cv = document.createElement('canvas');
    cv.width = SW * 3; cv.height = SH * 3;
    previews.push({ cv, char: id, skin: () => (selChar === id ? selSkin : 'classic'), anim: () => (selChar === id ? Anim.Taunt : Anim.Idle) });
    el.appendChild(cv);
    const tx = tc(id);
    el.insertAdjacentHTML('beforeend', `<div class="cname">${tx.name}</div>${small ? '' : `<div class="ctitle">${tx.title}</div>`}`);
    if (!owned) {
      const u = CHARACTER_UNLOCK[id];
      const medal = u.medal ? MEDAL_BY_ID[u.medal] : null;
      const price = unlockPrice(profile);
      el.insertAdjacentHTML('beforeend', `<div class="lock">🔒 ${price}🪙${medal ? ` ${t('or')} ${medal.icon}` : ''}</div>`);
      el.title = t('unlockFor', { p: price }) + (medal ? t('orMedalLong', { m: tm(medal.id).name }) : '');
    }
    nodes.push(el);
  }
  carouselFor(container).setCards(nodes, Math.max(0, CHARACTER_IDS.indexOf(selChar)));
}

/** Cambio de monstruo elegido sin reconstruir los carruseles (no corta el desplazamiento). */
function selectChar(id: CharacterId) {
  if (id === selChar) return;
  selChar = id;
  selSkin = 'classic';
  store.set('nl_char', selChar); store.set('nl_skin', selSkin);
  for (const [cid, c] of carousels) {
    c.root.querySelectorAll<HTMLElement>('.char').forEach((el) => el.classList.toggle('sel', el.dataset.id === id));
    if (c.index !== CHARACTER_IDS.indexOf(id)) c.go(CHARACTER_IDS.indexOf(id), !$(cid === 'chars' ? 'menu' : 'death').hidden);
  }
  updatePlayButtons();
  // la ficha y las skins se rehacen cuando el carrusel se para (si no, al pasar rápido va a tirones)
  clearTimeout(selDetailT);
  selDetailT = window.setTimeout(() => { buildCharInfo(); buildSkins(); }, 140);
}
let selDetailT = 0;

/** «Jugar» y «Volver a la noche» avisan si el monstruo elegido aún está bloqueado. */
function updatePlayButtons() {
  const owned = isOwned(selChar);
  const lock = `🔒 ${t('unlockFor', { p: unlockPrice(profile) })}`;
  $('playtxt').textContent = owned ? t('play') : lock;
  $('respawn').textContent = owned ? t('respawn') : lock;
  $('play').classList.toggle('locked', !owned);
  $('respawn').classList.toggle('locked', !owned);
}

// flechas del teclado para mover el carrusel visible
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
  if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
  const c = !$('menu').hidden ? carousels.get('chars') : !$('death').hidden ? carousels.get('death-chars') : null;
  if (!c) return;
  e.preventDefault();
  // tecla mantenida: como mucho un paso cada 120 ms (la repetición del teclado va mucho más rápido)
  const now = performance.now();
  if (e.repeat && now - lastArrowAt < 120) return;
  lastArrowAt = now;
  c.go(c.index + (e.code === 'ArrowLeft' ? -1 : 1));
});
let lastArrowAt = 0;

// ---------------------------------------------------------------------------
// Cuenta: invitado o Google
// ---------------------------------------------------------------------------
let gsiLoaded: Promise<void> | null = null;
function loadGoogle(): Promise<void> {
  return (gsiLoaded ??= new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = () => ok(); s.onerror = () => fail();
    document.head.appendChild(s);
  }));
}
type GoogleId = { accounts: { id: { initialize(o: object): void; renderButton(el: HTMLElement, o: object): void; disableAutoSelect(): void } } };

function buildAccount() {
  const box = $('account');
  if (isPortal) { box.innerHTML = ''; box.hidden = true; return; } // en portales: solo invitado (progreso guardado en el navegador / SDK)
  if (profile?.google) {
    box.innerHTML = `<div class="who">${t('savedIn', { email: escapeHtml(profile.google.email) })}${profile.master ? ' · <span class="master">MASTER</span> · <a class="stats-link" href="/admin/" target="_blank" rel="noopener">📊 Estadísticas</a>' : ''}</div><button id="logout" class="btn tiny">${t('logout')}</button>`;
    $('logout').onclick = () => {
      store.del('nl_token'); session.del('nl_token');
      (window as unknown as { google?: GoogleId }).google?.accounts.id.disableAutoSelect();
      location.reload();
    };
    return;
  }
  box.innerHTML = `<div class="who">${t('guest')}</div><div id="gbtn"></div>
    <div class="note">${t('accountNote')} <a href="/privacidad.html" target="_blank">${t('privacy')}</a> · <a href="/condiciones.html" target="_blank">${t('terms')}</a></div>`;
  if (!googleClientId) { $('gbtn').textContent = t('loginUnavailable'); return; }
  loadGoogle().then(() => {
    const g = (window as unknown as { google: GoogleId }).google;
    g.accounts.id.initialize({ client_id: googleClientId, callback: (r: { credential: string }) => net.send({ t: 'login', credential: r.credential }) });
    const el = document.getElementById('gbtn');
    if (el) g.accounts.id.renderButton(el, { theme: 'filled_black', size: 'medium', text: 'signin_with', shape: 'pill', locale: lang });
  }).catch(() => { const el = document.getElementById('gbtn'); if (el) el.textContent = t('googleFail'); });
}

/** Enlace a la ficha del monstruo (historia, habilidades, trailer). En CrazyGames no se permiten enlaces a fuera. */
function monsterLink(id: CharacterId) {
  if (isCrazy) return '';
  const path = MONSTER_PAGE[lang === 'es' || lang === 'ca' || lang === 'eu' ? 'es' : 'en'][id];
  if (!path) return '';
  const href = (isPortal ? 'https://mooonsters.com' : '') + path;
  return `<a class="charpage" href="${href}" target="_blank" rel="noopener">${t('monsterPage')}</a>`;
}

function buildCharInfo() {
  const d = CHARACTERS[selChar], x = tc(selChar);
  $('charinfo').innerHTML = `
    <div><b>${x.attack}</b> · ${x.passive}</div>
    <div><b>Q ${x.q[0]}</b> · ${x.q[1]}</div>
    <div><b>E ${x.e[0]}</b> · ${x.e[1]}</div>
    <div><b>R ${x.r[0]}</b> · ${x.r[1]}</div>
    <div class="evo">${d.evolution.map((ev, i) => `<span><b>${t('lvlShort')} ${ev.lvl}</b> ${x.evo[i]?.[0] ?? ev.name}</span>`).join('')}</div>
    <div class="stats">${t('stats', { hp: d.hp, sp: d.speed, dm: d.damage })}${d.armor ? t('armor', { a: Math.round(d.armor * 100) }) : ''}</div>
    ${monsterLink(selChar)}`;
  $('charinfo').title = d.evolution.map((ev, i) => `${t('levelLong')} ${ev.lvl} · ${x.evo[i]?.[0] ?? ev.name}: ${x.evo[i]?.[1] ?? ev.desc}`).join('\n');
}

function buildSkins() {
  const box = $('skins');
  box.innerHTML = '';
  for (const s of SKINS[selChar]) {
    const owned = devMode || (profile ? hasSkin(profile, selChar, s) : s.price === 0 && !s.medal);
    const el = document.createElement('div');
    el.className = `skin${selSkin === s.id ? ' sel' : ''}${owned ? '' : ' locked'}`;
    const medal = s.medal ? MEDAL_BY_ID[s.medal] : null;
    el.innerHTML = `<span class="sw" style="background:${s.palette.cloth};box-shadow:inset -6px 0 0 ${s.palette.accent}"></span>${s.name}${owned ? '' : medal ? ` <span class="price">${medal.icon}</span>` : ` <span class="price">${s.price}🪙</span>`}`;
    el.title = owned ? s.name : medal ? t('skinByMedal', { m: tm(medal.id).name }) : t('coinsN', { p: s.price });
    el.onclick = () => {
      if (!owned) {
        if (medal) return showError(t('skinMedalErr', { m: tm(medal.id).name, d: tm(medal.id).desc }));
        if (profile && profile.coins >= s.price && confirm(t('confirmSkin', { s: s.name, p: s.price }))) net.send({ t: 'buy', item: `skin:${selChar}:${s.id}` });
        else showError(t('needCoins', { p: s.price }) + '.');
        return;
      }
      selSkin = s.id;
      store.set('nl_skin', selSkin);
      refreshMenu();
    };
    box.appendChild(el);
  }
}

function buildMedals() {
  const got = new Set(profile?.medals ?? []);
  $('medal-count').textContent = `${got.size}/${MEDALS.length}`;
  $('medals').innerHTML = MEDALS.map((m) => { const x = tm(m.id); return `<div class="medal${got.has(m.id) ? ' got' : ''}"><span class="mi">${m.icon}</span><b>${x.name}</b>${x.desc} <span style="color:var(--gold)">+${m.coins}🪙</span></div>`; }).join('');
}

function refreshMenu() {
  previews.length = 0;
  if (profile && !devMode && hasCharacter(profile, selChar)) {
    const sk = SKINS[selChar].find((s) => s.id === selSkin);
    if (!sk || !hasSkin(profile, selChar, sk)) selSkin = 'classic';
  }
  buildChars($('chars'));
  buildChars($('death-chars'), true);
  buildCharInfo();
  updatePlayButtons();
  buildSkins();
  buildMedals();
  $('coins').textContent = String(profile?.coins ?? 0);
}

function showError(msg: string) {
  const el = inGame ? null : $('menu-error');
  if (el) { el.textContent = msg; setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 4000); }
  else toast(msg);
}

function toast(html: string) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = html;
  const box = $('toast');
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild?.remove();
  setTimeout(() => t.remove(), 4600);
}

const nameInput = $<HTMLInputElement>('name');
nameInput.value = store.get('nl_name') ?? '';

async function join(mode: 'random' | 'code' | 'create' | 'nightlord', code?: string, opts: { priv?: boolean; fill?: boolean; anyTheme?: boolean } = {}) {
  if (!isOwned(selChar)) { tryUnlock(selChar); return; }
  initAudio();
  startMusic();
  const name = nameInput.value.trim();
  store.set('nl_name', name);
  // con varios servidores, la sala vive en el suyo (su código empieza por esa letra)
  if (mode === 'code' && code && net.shardOfCode(code) !== net.shard) {
    try { await net.switchTo(net.shardOfCode(code)); } catch { showError(t('connectRoomFail')); return; }
  }
  // re-hello por si cambió el nombre
  net.send({ t: 'hello', token: savedToken(), name, ...origin() });
  const th = $<HTMLSelectElement>('theme').value;
  if (mode === 'create' && th === 'nightlord') mode = 'nightlord'; // crear una previa de El Señor de la Noche
  net.send({
    t: 'join', mode, code, char: selChar, skin: selSkin,
    priv: opts.priv ?? (mode === 'nightlord' ? mode === 'nightlord' && $<HTMLSelectElement>('theme').value === 'nightlord' && $<HTMLInputElement>('priv').checked : $<HTMLInputElement>('priv').checked),
    theme: opts.anyTheme ? undefined : (th && th !== 'nightlord' ? th : undefined) as MapThemeId | undefined,
    fill: opts.fill,
  });
}

$('play').onclick = () => join('random');
$('playnl').onclick = () => join('nightlord');
$('join').onclick = () => {
  const code = $<HTMLInputElement>('code').value.trim().toUpperCase();
  if (code.length !== 4) return showError(t('code4'));
  join('code', code);
};
$('create').onclick = () => join('create');
$<HTMLInputElement>('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('join').click(); });
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('play').click(); });

// enlace directo ?sala=ABCD
const urlCode = new URLSearchParams(location.search).get('sala');
if (urlCode) $<HTMLInputElement>('code').value = urlCode.toUpperCase();
// opciones de sala: abiertas en pantallas anchas o si se llega con un código; plegadas en móvil
$<HTMLDetailsElement>('modes').open = !!urlCode || (innerWidth > 860 && innerHeight > 520);

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function buildAbilities() {
  const d = CHARACTERS[tut?.char ?? selChar];
  const items = game.you?.ecto ? [
    { key: '🖱', name: '—' },
    { key: 'Q', name: t('ectoQ') },
    { key: 'E', name: t('ectoE') },
    { key: 'R', name: '—' },
  ] : [
    { key: '🖱', name: tc(d.id).attack },
    { key: 'Q', name: tc(d.id).q[0] },
    { key: 'E', name: tc(d.id).e[0] },
    { key: 'R', name: tc(d.id).r[0] },
  ];
  $('abilities').innerHTML = items.map((a, i) => `<div class="ab${i === 3 ? ' ult' : ''}" id="ab${i}"><span class="key">${a.key}</span><span class="nm">${a.name}</span><div class="cdov"></div><div class="cdt"></div>${i === 3 ? '<div class="charge"><div></div></div>' : ''}</div>`).join('');
}

let lastUpKey = '';
/** Icono de una trampa (como imagen, para el HUD). */
const trapImgs = new Map<string, string>();
function trapImg(id: string) {
  let u = trapImgs.get(id);
  if (!u) { u = getItem(`trap_${id}`).base.toDataURL(); trapImgs.set(id, u); }
  return u;
}
let lastTrap = '', lastEcto = false, lastNightKey = '';
/** Recompensa diaria: ventana con los 7 días de la racha. */
function showDaily(coins: number, streak: number) {
  const box = document.createElement('div');
  box.className = 'daily';
  const days = DAILY.map((c, i) => `<div class="${i < Math.min(streak, 7) ? 'got' : ''}${i === Math.min(streak, 7) - 1 ? ' now' : ''}"><small>${i + 1}</small><b>${c}</b>🪙</div>`).join('');
  box.innerHTML = `<div class="panel"><h2>🎁 ${t('dailyTitle')}</h2><p class="big">+${coins} 🪙</p><p>${t('dailyDay', { d: streak })}</p><div class="days">${days}</div><p class="small">${t('dailyBack')}</p><button class="btn big">${t('dailyOk')}</button></div>`;
  document.body.appendChild(box);
  playSfx('coin');
  const close = () => { box.remove(); };
  box.querySelector('button')!.onclick = close;
  box.onclick = (e) => { if (e.target === box) close(); };
}

/** Contador de cazas del HUD: salta al subir. */
function setTally(id: string, n: number) {
  const el = $(id), b = el.querySelector('b')!;
  if (b.textContent === String(n)) return;
  const up = n > Number(b.textContent);
  b.textContent = String(n);
  if (up) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}
/** Racha de cazas: ×2, ×3… en grande sobre el juego, con un sonido cada vez más agudo. */
let comboTimer = 0;
function showCombo(n: number) {
  const el = $('combo');
  const name = t((n >= 5 ? 'combo5' : `combo${n}`) as 'combo2');
  el.innerHTML = `<b>×${n}</b><span>${escapeHtml(name)}</span>`;
  el.className = `c${Math.min(5, n)}`;
  el.hidden = false;
  void el.offsetWidth; el.classList.add('pop');
  playSfx('combo', Math.min(1, n / 10));
  game.excite(0.25);
  clearTimeout(comboTimer);
  comboTimer = window.setTimeout(() => { el.hidden = true; }, 1600);
}

function updateHud() {
  const y = game.you;
  coach.update(y, !tut && !game.night && inGame);
  if (!y) return;
  // trampa que llevas (X)
  const trap = y.trap ?? '';
  if (trap !== lastTrap) {
    lastTrap = trap;
    $('trapslot').hidden = !trap;
    $('tb-trap').hidden = !trap;
    if (trap) {
      $('trapslot').innerHTML = `<img src="${trapImg(trap)}" alt=""><span>${t(`trapN_${trap}` as never)}</span> <kbd>X</kbd>`;
      $('trapslot').title = t(`trapD_${trap}` as never);
      $('tb-trap').innerHTML = `<img src="${trapImg(trap)}" alt="">`;
      toast(`<img src="${trapImg(trap)}" style="width:30px;image-rendering:pixelated;vertical-align:middle"> <b>${t(`trapN_${trap}` as never)}</b><br><span style="font-family:var(--vt);font-size:16px">${t(`trapD_${trap}` as never)}</span><br>${t(input.touch.active ? 'trapUseTouch' : 'trapUse')}`);
    }
  }
  // ectoplasma (El Señor de la Noche)
  const ecto = !!y.ecto;
  if (ecto !== lastEcto) { lastEcto = ecto; document.body.classList.toggle('ecto', ecto); buildAbilities(); }
  renderNight();
  if (ecto) {
    $('hpfill').style.width = '100%';
    $('hptext').textContent = t(y.sil ? 'ectoSil' : 'ectoHp');
  } else {
  $('hpfill').style.width = `${(y.hp / y.mhp) * 100}%`;
  $('hptext').textContent = `${y.hp} / ${y.mhp}`;
  }
  $('xpfill').style.width = `${(y.xp / y.xpn) * 100}%`;
  $('lvl').textContent = String(y.lvl);
  $('pts').textContent = t('pts', { n: y.pts });
  setTally('t-npc', y.kn ?? 0); setTally('t-hun', y.kh ?? 0); setTally('t-mon', y.kills);
  $('gcoins').textContent = `🪙 ${y.coins}`;
  for (let i = 0; i < 3; i++) {
    const el = document.getElementById(`ab${i}`);
    if (!el) continue;
    const r = y.cd[i], m = y.cdm[i] || 1;
    (el.querySelector('.cdov') as HTMLElement).style.height = `${(r / m) * 100}%`;
    (el.querySelector('.cdt') as HTMLElement).textContent = r > 0.05 && i > 0 ? r.toFixed(1) : '';
    el.classList.toggle('ready', r <= 0);
    if (i === 2 && y.ecm) (el.querySelector('.cdt') as HTMLElement).textContent = `${y.ec}/${y.ecm}${r > 0.05 && (y.ec ?? 0) < y.ecm ? ' · ' + r.toFixed(0) : ''}`;
    if (i === 1 && y.qcm) (el.querySelector('.cdt') as HTMLElement).textContent = `${y.qc}/${y.qcm}${r > 0.05 && (y.qc ?? 0) < y.qcm ? ' · ' + r.toFixed(0) : ''}`;
  }
  // botones táctiles: enfriamiento como "tarta" que se vacía y cargas
  if (input.touch.active) {
    const ids = ['tb-atk', 'tb-q', 'tb-e', 'tb-r'];
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById(ids[i]);
      if (!el) continue;
      let frac = 0, txt = '';
      if (i < 3) {
        const r = y.cd[i], m = y.cdm[i] || 1;
        frac = Math.max(0, Math.min(1, r / m));
        if (i > 0 && r > 0.05) txt = r.toFixed(r < 10 ? 1 : 0);
        if (i === 1 && y.qcm) { txt = `${y.qc}/${y.qcm}`; if ((y.qc ?? 0) > 0) frac = 0; }
        if (i === 2 && y.ecm) { txt = `${y.ec}/${y.ecm}`; if ((y.ec ?? 0) > 0) frac = 0; }
      } else {
        const locked = y.tier < 2;
        frac = locked ? 1 : y.ultOn > 0 ? 0 : 1 - y.ult / 100;
        txt = locked ? t('ultLocked') : y.ultOn > 0 ? y.ultOn.toFixed(0) : y.ult >= 100 ? '' : `${y.ult}%`;
        el.classList.toggle('locked', locked);
        el.classList.toggle('ready', !locked && y.ult >= 100 && y.ultOn <= 0);
      }
      el.style.setProperty('--cd', String(frac));
      (el.querySelector('small') as HTMLElement).textContent = txt;
    }
  }
  // definitiva: bloqueada hasta nivel 10 y se carga con bajas
  const ultEl = document.getElementById('ab3');
  if (ultEl) {
    const locked = y.tier < 2;
    ultEl.classList.toggle('locked', locked);
    ultEl.classList.toggle('ready', !locked && y.ult >= 100 && y.ultOn <= 0);
    ultEl.classList.toggle('active', y.ultOn > 0);
    (ultEl.querySelector('.charge div') as HTMLElement).style.width = `${locked ? 0 : y.ult}%`;
    (ultEl.querySelector('.cdov') as HTMLElement).style.height = '0%';
    (ultEl.querySelector('.cdt') as HTMLElement).textContent = locked ? t('ultLocked') : y.ultOn > 0 ? y.ultOn.toFixed(0) : y.ult >= 100 ? t('ultReady') : `${y.ult}%`;
  }
  $('lvl').classList.toggle('t1', y.tier === 1); $('lvl').classList.toggle('t2', y.tier === 2); $('lvl').classList.toggle('t3', y.tier >= 3);
  $('buffs').innerHTML = y.buffs.map((b) => `<span class="buff">${tb(b.t)}${b.t === 'horde' || b.t === 'mirrors' || b.t === 'thralls' ? ' ' + b.r : b.t === 'ambush' ? ' ' + Math.round(b.r) + '%' : b.r < 900 ? ' ' + Math.ceil(b.r) : ''}</span>`).join('');
  const upKey = `${y.up}|${Object.values(y.ups).join(',')}|${y.lvl >= 15}|${!!y.ecto}`;
  if (upKey !== lastUpKey) {
    lastUpKey = upKey;
    const box = $('upgrades');
    box.hidden = y.up <= 0 || !!y.ecto;
    box.innerHTML = `<div class="up-title">${y.up > 1 ? t('upMany', { n: y.up }) : t('upOne')}</div>` + UPGRADES.map((u) => {
      const lv = y.ups[u.id];
      const mx = upgradeMax(u, y.lvl);
      return `<div class="up${lv >= mx ? ' maxed' : ''}" data-u="${u.id}"><b>${u.key}·${tu(u.id).name}</b>${tu(u.id).desc}<br><small>${lv}/${mx}</small></div>`;
    }).join('');
    box.querySelectorAll<HTMLElement>('.up').forEach((el) => { el.onclick = () => net.send({ t: 'upgrade', u: el.dataset.u as UpgradeId }); });
  }
  $('ping').textContent = `${Math.round(net.rtt)} ms`;
}

$('rank').addEventListener('click', () => $('rank').classList.toggle('open'));

let rivalId = -1, rivalUntil = 0, deathShownAt = 0;
function renderRank(list: [string, number, CharacterId, number][], total: number) {
  const rival = performance.now() < rivalUntil ? rivalId : -1;
  $('rank').innerHTML = `<div class="title">${t('rank')} · ${total}👤</div>` + list.map((r, i) =>
    `<div class="r${r[3] === myId ? ' me' : ''}${r[3] === rival ? ' rival' : ''}"${r[3] === rival ? ` title="${escapeHtml(t('rival'))}"` : ''}><span>${i === 0 ? '👑' : `${i + 1}.`} ${escapeHtml(r[0])}${r[3] === rival ? ' 🎯' : ''}</span><span>${r[1]}</span></div>`).join('');
}

// ---------------------------------------------------------------------------
// El Señor de la Noche: barra de estado y podio
// ---------------------------------------------------------------------------
const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
function renderNight() {
  const n = game.night, bar = $('nlbar');
  if (!n || n.ph === 'podium') { if (!bar.hidden) bar.hidden = true; document.body.classList.remove('nl'); return; }
  document.body.classList.add('nl');
  const me = game.ents.get(myId);
  const hot = n.ph === 'match' && !!me && !!(me.f2 & Flag2.Sunlit);
  const ecto = !!game.you?.ecto;
  let html = '';
  if (n.ph === 'lobby') {
    html = `<span class="big">${t('nlTitle')}</span><br>${t('nlLobby', { n: n.n, r: n.ready })}<br>`;
    html += n.n < NIGHTLORD.lobby.minPlayers ? t('nlWait') : n.start >= 0 ? (n.auto ? t('nlAuto', { s: mmss(n.start) }) : `<span class="big">${t('nlGo', { s: n.start })}</span>`) : '';
    html += `<br><small>${t('nlReadyHint')}</small>`;
  } else {
    html = `⏱ ${mmss(n.t)} · ${t('nlAlive', { a: n.alive, n: n.total })}<br>`;
    if (ecto) html += game.you?.sil ? t('nlEctoSil') : `${t('nlEcto')}${n.sil > 0 ? ` · ${t('nlSilIn', { s: n.sil })}` : ''}`;
    else if (hot) html += `<span class="big">${t('nlBurn')}</span>`;
    else if (n.sun[1] < -9999) html += t('nlSunIn', { s: Math.max(0, NIGHTLORD.sun.start - n.t) });
    else html += n.fog[3] < 0 ? t('nlFogShrink') : t('nlSunMoves');
  }
  const key = html + hot + ecto;
  if (key === lastNightKey) return;
  lastNightKey = key;
  bar.hidden = false;
  bar.innerHTML = html;
  bar.classList.toggle('hot', hot);
  bar.classList.toggle('ecto', ecto);
}

let podiumT = 0;
function showPodium(s: Extract<import('../shared/protocol').NightState, { ph: 'podium' }>) {
  const box = $('podium');
  const medal = ['🥇', '🥈', '🥉'];
  const order = [1, 0, 2].filter((i) => s.top[i]); // 2º, 1º, 3º
  box.innerHTML = `<h2>${t('podiumTitle')}</h2>${s.top[0] ? `<div class="winner">👑 ${escapeHtml(s.top[0][0])}</div>` : ''}<div class="steps">${order.map((i) => { const r = s.top[i]; return `<div class="step p${i + 1}"><canvas data-c="${r[1]}" data-s="${r[2]}" width="${SW}" height="${SH}"></canvas><b>${medal[i]} ${escapeHtml(r[0])}</b>⚔ ${r[3]} · +${r[4]}🪙</div>`; }).join('')}</div>
    <div class="you">${s.place ? t('podiumPlace', { p: s.place }) : ''} · ${t('podiumCoins', { c: s.coins })}</div><div class="back" id="podback"></div>`;
  box.querySelectorAll<HTMLCanvasElement>('canvas').forEach((cv) => {
    const fr = getFrame('monster', cv.dataset.c as CharacterId, cv.dataset.s ?? 'classic', Anim.Taunt, 1);
    const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false; c.drawImage(fr.base, 0, 0, SW, SH);
  });
  box.hidden = false;
  let left = Math.round(s.left);
  const tick = () => { const el = document.getElementById('podback'); if (el) el.textContent = t('podiumBack', { s: Math.max(0, left) }); left--; };
  clearInterval(podiumT); tick(); podiumT = window.setInterval(tick, 1000);
  playSfx('evolve');
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function onGameEvent(ev: GameEvent) {
  if (tut && ev.e === 'die') tutEvent(ev);
  if (ev.e === 'fx' && ev.f === 'evolve' && ev.o === myId && (ev.n ?? 0) > 0) {
    const ch = (ev.c ?? selChar) as CharacterId;
    const i = (ev.n ?? 1) - 1, m = CHARACTERS[ch]?.evolution[i], x = CHARACTERS[ch] ? tc(ch).evo[i] : undefined;
    if (m) toast(`${t('evoToast', { l: m.lvl, n: x?.[0] ?? m.name })}<br><span style="font-family:var(--vt);font-size:18px">${x?.[1] ?? m.desc}</span>`);
    return;
  }
  if (ev.e === 'kill') {
    const d = document.createElement('div');
    const icon = ev.vk === Kind.Hunter ? '🏹' : '💀';
    d.innerHTML = `<span class="a">${escapeHtml(tw(ev.a))}</span> ${icon} <span class="v">${escapeHtml(tw(ev.v))}</span>`;
    const kf = $('killfeed');
    kf.prepend(d);
    while (kf.children.length > 6) kf.lastChild?.remove();
    setTimeout(() => d.remove(), 5200);
  }
}
game.onEvent = onGameEvent;

input.onKey = (code) => {
  if (code === 'KeyM') { toggleMuteUi(); return; }
  if (!inGame) return;
  if (devMode && input.keys.has('ShiftLeft') || devMode && input.keys.has('ShiftRight')) {
    if (code === 'KeyL') { const lv = game.you?.lvl ?? 1; net.send({ t: 'cheat', lvl: lv < 5 ? 5 : lv < 10 ? 10 : lv < 15 ? 15 : lv + 1 }); return; }
    if (code === 'KeyU') { net.send({ t: 'cheat', ult: true }); return; }
  }
  if (code === 'KeyI') { toggleInfo(); return; }
  if (code === 'Escape' && !$('infopanel').hidden) { toggleInfo(false); return; }
  if (code === 'KeyG') net.send({ t: 'emote', e: 'wave' });
  if (code === 'KeyT') net.send({ t: 'emote', e: 'taunt' });
  if (code === 'KeyH') net.send({ t: 'emote', e: 'ally' });
  if (code === 'KeyX') net.send({ t: 'trap' });
  const up = UPGRADES.find((u) => `Digit${u.key}` === code || `Numpad${u.key}` === code);
  if (up) net.send({ t: 'upgrade', u: up.id });
};
// silenciar: botón del HUD y botón flotante en portada, menú y tutorial (los dos van sincronizados)
function toggleMuteUi() {
  const m = toggleMute();
  for (const id of ['mute', 'menumute']) $(id).textContent = m ? '🔇' : '🔊';
}
$('mute').onclick = toggleMuteUi;
$('menumute').onclick = () => { initAudio(); toggleMuteUi(); };
for (const id of ['mute', 'menumute']) $(id).textContent = isMuted() ? '🔇' : '🔊';
$('exit').onclick = () => { net.send({ t: 'leave' }); };

// ---------------------------------------------------------------------------
// Ficha del monstruo en partida (botón «i» o tecla I): habilidades, pasiva y evoluciones
// ---------------------------------------------------------------------------
function myChar(): CharacterId { return (game.ents.get(game.youId)?.c as CharacterId | undefined) ?? selChar; }
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function buildInfo() {
  const id = myChar(), d = CHARACTERS[id], x = tc(id), lv = game.you?.lvl ?? 1;
  const cd = (s: number) => (s > 0 ? `<span class="cd">⏱ ${t('secs', { s })}</span>` : '');
  const row = (k: string, n: string, desc: string, extra = '', cls = '') => `<div class="irow${cls}"><span class="key">${k}</span><div><b>${n}</b>${extra}<p>${desc}</p></div></div>`;
  const ultLocked = lv < 10;
  $('infopanel').innerHTML = `
    <button class="btn tiny iclose" id="infoclose" aria-label="×">✕</button>
    <div class="ihead"><canvas id="infocv" width="${SW * 3}" height="${SH * 3}"></canvas><div><h3>${x.name}</h3><div class="ititle">${x.title}</div>
      <div class="istats">${t('stats', { hp: d.hp, sp: d.speed, dm: d.damage })}${d.armor ? t('armor', { a: Math.round(d.armor * 100) }) : ''}</div></div></div>
    <div class="isec">${t('infoPassive')}</div>
    ${row('★', x.passive.includes(':') ? x.passive.split(':')[0] : t('infoPassive'), cap(x.passive.includes(':') ? x.passive.slice(x.passive.indexOf(':') + 1).trim() : x.passive))}
    <div class="isec">${t('infoAbilities')}</div>
    ${row('🖱', x.attack, t('infoBasic'), cd(d.attackCd))}
    ${row('Q', x.q[0], x.q[1], cd(d.abilities[0].cooldown))}
    ${row('E', x.e[0], x.e[1], cd(d.abilities[1].cooldown))}
    ${row('R', x.r[0], x.r[1], ultLocked ? `<span class="cd lock">🔒 ${t('levelLong')} 10</span>` : '', ultLocked ? ' locked' : '')}
    <div class="isec">${t('infoEvo')}</div>
    ${d.evolution.map((ev, i) => row(lv >= ev.lvl ? '✓' : String(ev.lvl), x.evo[i]?.[0] ?? ev.name, x.evo[i]?.[1] ?? ev.desc, '', lv >= ev.lvl ? ' done' : ' locked')).join('')}`;
  previews.push({ cv: $<HTMLCanvasElement>('infocv'), char: id, skin: () => selSkin, anim: Anim.Taunt });
  $('infoclose').onclick = () => toggleInfo(false);
}
function toggleInfo(show = $('infopanel').hidden) {
  if (show) buildInfo();
  $('infopanel').hidden = !show;
  $('infobtn').classList.toggle('on', show);
}
$('infobtn').onclick = () => toggleInfo();

function showScreen(which: 'splash' | 'menu' | 'game' | 'death' | 'tutorial') {
  $('splash').hidden = which !== 'splash';
  $('tutorial').hidden = which !== 'tutorial';
  $('death').classList.toggle('tut', !!tut);
  $('menu').hidden = which !== 'menu';
  $('menubg').hidden = which !== 'menu' && which !== 'splash' && which !== 'tutorial';
  $('hud').hidden = which === 'menu' || which === 'splash' || which === 'tutorial';
  $('menumute').hidden = !$('hud').hidden;
  $('death').hidden = which !== 'death';
  inGame = which === 'game' || which === 'death';
  setPlaying(which === 'game');
  if (which === 'menu') carousels.get('chars')?.recenter();
  if (which === 'tutorial') buildTutorialScreen();
  if (which === 'death') carousels.get('death-chars')?.recenter();
  if (!inGame && !$('infopanel').hidden) toggleInfo(false);
}

// Portada: logo, fondo animado y desfile de monstruos; «Iniciar» da paso al menú (y arranca el audio)
function enterMenu() {
  if ($('splash').hidden) return;
  initAudio();
  startMusic();
  $('splash').classList.add('out');
  setTimeout(() => { $('splash').classList.remove('out'); showScreen('menu'); }, 260);
}
$('start').onclick = enterMenu;
window.addEventListener('keydown', (e) => { if (!$('splash').hidden && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); enterMenu(); } });
// pantalla de muerte: Enter o Espacio para volver a la noche (con un margen para no saltarla atacando)
window.addEventListener('keydown', (e) => {
  if ($('death').hidden || !$('bugform').hidden || (e.code !== 'Enter' && e.code !== 'Space') || e.repeat) return;
  if ((e.target as HTMLElement)?.tagName === 'TEXTAREA' || performance.now() - deathShownAt < 700) return;
  e.preventDefault();
  $('respawn').click();
});

// ---------------------------------------------------------------------------
// Muerte
// ---------------------------------------------------------------------------
$('respawn').onclick = () => {
  if (tut) { net.send({ t: 'respawn', char: tut.char, skin: 'classic' }); return; }
  if (!isOwned(selChar)) { tryUnlock(selChar); return; }
  net.send({ t: 'respawn', char: selChar, skin: selSkin });
};
$('tomenu').onclick = () => net.send({ t: 'leave' });

// ---------------------------------------------------------------------------
// Red
// ---------------------------------------------------------------------------
net.on((m: ServerMsg) => {
  switch (m.t) {
    case 'welcome':
      welcomedOk();
      devMode = !!m.dev || !!m.profile.master;
      googleClientId = m.google ?? '';
    // falls through
    case 'profile':
      profile = m.profile;
      if (isPortal) { portalSet('nl_token', m.profile.token); store.set('nl_token', m.profile.token); }
      else if (m.profile.google) { store.set('nl_token', m.profile.token); session.del('nl_token'); }
      else { session.set('nl_token', m.profile.token); store.del('nl_token'); }
      buildAccount();
      if (!nameInput.value) nameInput.value = m.profile.name;
      refreshMenu();
      break;
    case 'joined': {
      myId = m.you;
      game.start(m);
      $('podium').hidden = true;
      clearInterval(podiumT);
      lastNightKey = ''; lastTrap = '-'; lastEcto = false; document.body.classList.remove('ecto');
      renderNight();
      buildAbilities();
      lastUpKey = '';
      const th = tt(m.theme);
      setMusicKey(({ elm: 0, transylvania: -2, camp: 3, swamp: -4, nile: 2, jungle: 5, cemetery: -5, cityz: 1 } as Record<string, number>)[m.theme] ?? 0);
      const link = isCrazy ? portalInviteLink(m.code) ?? m.code : isPortal ? m.code : `${location.origin}${location.pathname}?sala=${m.code}`; // en portales: su enlace de invitación
      if (isCrazy) reportRoom(m.code, m.theme !== 'cityz');
      $('roominfo').innerHTML = `${t('room')} <b>${m.code}</b>${m.priv ? ' 🔒' : ''} · ${th.name}`;
      $('roominfo').title = t('share', { l: link });
      $('roominfo').style.pointerEvents = 'auto';
      $('roominfo').style.cursor = 'pointer';
      $('roominfo').onclick = () => { navigator.clipboard?.writeText(link); toast(t('linkCopied')); };
      if (!tut && ($('menu').hidden === false || !$('death').hidden || m.theme === 'cemetery' || m.theme === 'cityz')) toast(`<b>${th.name}</b><br>${th.subtitle}`);
      if (m.theme === 'cemetery') toast(t('nlLobbyHelp'));
      if (m.theme === 'cityz') toast(t('nlMatchHelp'));
      showScreen('game');
      if (tut) { $('roominfo').textContent = `📖 ${tt2('lesson', { i: TUT_CHARS.indexOf(tut.char) + 1 })}`; $('roominfo').onclick = null; renderTut(); }
      else if (!isPortal) history.replaceState(null, '', `?sala=${m.code}`);
      break;
    }
    case 'snap':
      game.onSnapshot(m);
      updateHud();
      if (tut) tickTut();
      break;
    case 'rank':
      renderRank(m.list, m.total);
      break;
    case 'combo':
      showCombo(m.n);
      break;
    case 'died': {
      $('death-by').textContent = t('killedBy', { n: tw(m.by) });
      if (m.kid !== undefined && m.kid !== myId) { rivalId = m.kid; rivalUntil = performance.now() + 150_000; game.rivalId = m.kid; game.rivalUntil = rivalUntil; }
      // una frase que dé ganas de volver: a punto de evolucionar o récord
      const nextEvo = [5, 10, 15].find((l) => l > m.lvl);
      const gap = nextEvo ? nextEvo - m.lvl : 0;
      const hook = m.record ? t('dRecord') : gap === 1 ? t('dEvo1') : gap === 2 ? t('dEvoN', { n: 2 }) : '';
      const medals = (m.medals ?? []).map((id) => { const md = MEDAL_BY_ID[id]; return md ? `<span class="dm">${md.icon} ${escapeHtml(tm(id).name)} <b>+${md.coins}🪙</b></span>` : ''; }).join('');
      $('death-hook').innerHTML = (hook ? `<p class="hook">${escapeHtml(hook)}</p>` : '') + (medals ? `<div class="dmedals"><small>${t('dMedals')}</small>${medals}</div>` : '');
      const mins = Math.floor(m.time / 60), secs = m.time % 60;
      $('death-stats').innerHTML = `
        <div><b>${m.pts}</b>${t('dPoints')}</div><div><b>${m.lvl}</b>${t('dLevel')}</div>
        <div><b>${mins}:${String(secs).padStart(2, '0')}</b>${t('dSurvived')}</div><div><b>+${m.coins}🪙</b>${t('dCoins')}</div>
        <div class="hunt"><b>👤 ${m.npc ?? 0}</b>${t('dHumans')}</div><div class="hunt"><b>🏹 ${m.hunters ?? 0}</b>${t('dHunters')}</div><div class="hunt"><b>👹 ${m.kills}</b>${t('dMonsters')}</div><div class="hunt"><b>×${Math.max(1, m.combo ?? 0)}</b>${t('dCombo')}</div>`;
      setTimeout(() => { if (inGame && !game.alive) { showScreen('death'); deathShownAt = performance.now(); } }, 1400);
      break;
    }
    case 'toast':
      if (m.k === 'daily') { showDaily(Number(m.a?.c ?? 0), Number(m.a?.d ?? 1)); break; }
      if (m.k === 'trapHit') toast(escapeHtml(t('trapHit', { t: t(`trapN_${m.a?.t}` as never) })));
      else toast(escapeHtml((m.k && tk(m.k, m.a ?? {})) || m.text));
      break;
    case 'nl':
      game.setNight(m.s);
      renderNight();
      if (m.s.ph === 'podium') showPodium(m.s);
      break;
    case 'alert':
      game.addAlert(m.x, m.y, m.k);
      playSfx('curse');
      break;
    case 'medal': {
      const md = MEDAL_BY_ID[m.id];
      if (md) toast(`${md.icon} ${t('medalUnlocked')}<br>${tm(md.id).name}<br><span style="color:var(--gold)">${t('coinsPlus', { c: md.coins })}</span>`);
      break;
    }
    case 'rooms':
      $('rooms').innerHTML = m.list.length
        ? m.list.map((r) => `<span class="room" data-code="${r.code}">${r.nl ? '🌅 ' : ''}${r.code} · ${r.nl ? t('nlName') : tt(r.theme).name} · ${r.players}/${r.max}</span>`).join('')
        : '';
      $('rooms').querySelectorAll<HTMLElement>('.room').forEach((el) => { el.onclick = () => join('code', el.dataset.code); });
      break;
    case 'left':
      reportRoom(null);
      game.stop();
      game.setNight(null); renderNight(); $('podium').hidden = true; clearInterval(podiumT); document.body.classList.remove('ecto');
      if (tut) { endTut(); showScreen('tutorial'); break; }
      showScreen('menu');
      history.replaceState(null, '', location.pathname);
      net.send({ t: 'rooms' });
      break;
    case 'error':
      showError((m.k && tk(m.k)) || m.msg);
      break;
  }
});

net.onClose = () => {
  game.stop();
  if ($('splash').hidden) showScreen('menu');
  showError(t('connLost'));
  setTimeout(() => location.reload(), 2500);
};

function retranslate() {
  applyStatic();
  tutStatic();
  if (!$('tutorial').hidden) buildTutorialScreen();
  if (tut) renderTut();
  document.querySelectorAll<HTMLOptionElement>('#theme option').forEach((o) => { if (o.value && o.value !== 'nightlord') o.textContent = tt(o.value as MapThemeId).name; });
  buildAccount();
  refreshMenu();
  if (inGame) { buildAbilities(); lastUpKey = ''; }
}
onLangChange(retranslate);

// ---------------------------------------------------------------------------
// Tutorial: instrucciones y lecciones de práctica
// ---------------------------------------------------------------------------
interface TutState { char: TutChar; step: number; ctx: TutCtx; base: TutCtx; prev: { x: number; y: number; hp: number; mhp: number; lvl: number; cd1: number; cd2: number } | null; sent: Record<string, number>; done: boolean }
let tut: TutState | null = null;
const tutDoneSet = (): Set<string> => new Set((store.get('nl_tut') ?? '').split(',').filter(Boolean));
const zeroCtx = (): TutCtx => ({ moved: 0, kills: 0, farKills: 0, hunterKills: 0, healed: 0, q: 0, e: 0, minions: 0, lvl: 1, ups: 0, ult: 0 });

function tutStatic() {
  $('tutbtn').textContent = tt2('btn');
  $('tutbtn2').textContent = tt2('btn');
}

function buildTutorialScreen() {
  $('tut-title').textContent = tt2('title');
  $('tut-practice').textContent = tt2('practice');
  $('tut-back').textContent = tt2('back');
  $('tut-menu').textContent = tt2('toMenu');
  $('tut-rules').innerHTML = ['goal', 'pc', 'mob', 'lvl', 'ult', 'pvp', 'hunt', 'items', 'death']
    .map((k) => `<div class="tut-card${k === 'hunt' || k === 'items' ? ' wide' : ''}"><b>${tt2('h_' + k)}</b><p>${tt2(k)}</p>${k === 'hunt' || k === 'items' ? `<div class="tut-icons" id="tut-icons-${k}"></div>` : ''}</div>`).join('');
  // sprites de los objetos y de los Cazadores, con su nombre
  const icon = (box: HTMLElement, img: { base: HTMLCanvasElement; glow?: HTMLCanvasElement | null }, label: string, scale: number) => {
    const cv = document.createElement('canvas');
    cv.width = img.base.width * scale; cv.height = img.base.height * scale;
    const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false;
    c.drawImage(img.base, 0, 0, cv.width, cv.height);
    if (img.glow) { c.globalCompositeOperation = 'lighter'; c.drawImage(img.glow, 0, 0, cv.width, cv.height); }
    const d = document.createElement('div'); d.className = 'ti';
    d.appendChild(cv); d.insertAdjacentHTML('beforeend', `<span>${label}</span>`);
    box.appendChild(d);
  };
  const items = $('tut-icons-items');
  for (const id of ['blood', 'speed', 'fury', 'shield', 'coin', 'xp', 'spirits', 'boots', 'shovel']) icon(items, getItem(id), tpu(id).replace(/[¡!+]/g, '').trim(), 4);
  const hunters = $('tut-icons-hunt');
  for (const id of ['cazador', 'inquisidor', 'exorcista', 'sectario', 'heraldo']) icon(hunters, getFrame('hunter', id, '', Anim.Idle, 0), th(id), 2);
  const done = tutDoneSet();
  const box = $('tut-lessons');
  box.innerHTML = '';
  TUT_CHARS.forEach((ch, i) => {
    const x = tc(ch);
    const el = document.createElement('div');
    el.className = `tut-lesson${done.has(ch) ? ' done' : ''}`;
    const cv = document.createElement('canvas'); cv.width = SW * 3; cv.height = SH * 3;
    previews.push({ cv, char: ch, skin: () => 'classic', anim: Anim.Taunt });
    el.appendChild(cv);
    el.insertAdjacentHTML('beforeend', `<div><div class="tl-n">${tt2('lesson', { i: i + 1 })}${done.has(ch) ? ` · <span class="ok">${tt2('done')}</span>` : ''}</div><b>${x.name}</b> <span class="tl-t">${x.title}</span><p>${tt2('c_' + ch)}</p></div>`);
    const b = document.createElement('button'); b.className = 'btn'; b.textContent = tt2('practiceBtn');
    b.onclick = () => startTut(ch);
    el.appendChild(b);
    box.appendChild(el);
  });
}

function startTut(ch: TutChar) {
  initAudio();
  startMusic();
  tut = { char: ch, step: 0, ctx: zeroCtx(), base: zeroCtx(), prev: null, sent: {}, done: false };
  $('tutdone').hidden = true;
  net.send({ t: 'join', mode: 'tutorial', char: ch, skin: 'classic' });
}

function endTut() {
  tut = null;
  $('tutpanel').hidden = true;
  $('tutdone').hidden = true;
  $('death').classList.remove('tut');
}

function tutEvent(ev: Extract<GameEvent, { e: 'die' }>) {
  const me = game.ents.get(game.youId);
  if (!tut || !me) return;
  const d = Math.hypot(ev.x - me.rx, ev.y - me.ry);
  if (ev.k === Kind.Npc && d < 360) tut.ctx.kills++;
  if (ev.k === Kind.Npc && d >= 90 && d < 720) tut.ctx.farKills++;
  if (ev.k === Kind.Hunter && d < 1000) tut.ctx.hunterKills++;
}

/** Valor actual de un paso (relativo a cuando empezó, salvo los absolutos). */
function tutVal(st: { m: keyof TutCtx; abs?: boolean }) {
  return tut ? (st.abs ? tut.ctx[st.m] : tut.ctx[st.m] - tut.base[st.m]) : 0;
}

function tickTut() {
  const y = game.you, me = game.ents.get(game.youId);
  if (!tut || !y || !me || tut.done) return;
  const c = tut.ctx;
  if (tut.prev && y.alive) {
    c.moved += Math.min(60, Math.hypot(y.x - tut.prev.x, y.y - tut.prev.y));
    // los mordiscos curan de golpe y poco; no cuentan la regeneración, las pociones (curan mucho) ni subir de nivel (sube la vida máxima)
    const gain = y.hp - tut.prev.hp;
    if (gain >= 2 && gain <= y.mhp * 0.2 && y.mhp === tut.prev.mhp && y.lvl === tut.prev.lvl) c.healed += gain;
    if (y.cd[1] > tut.prev.cd1 + 0.3) c.q++;
    if (y.cd[2] > tut.prev.cd2 + 0.3) c.e++;
  }
  tut.prev = { x: y.x, y: y.y, hp: y.hp, mhp: y.mhp, lvl: y.lvl, cd1: y.cd[1], cd2: y.cd[2] };
  let mins = 0;
  for (const e of game.ents.values()) if (e.k === Kind.Minion && e.o === game.youId) mins++;
  c.minions = mins; c.lvl = y.lvl; c.ult = y.ultOn > 0 ? 1 : 0;
  c.ups = Object.values(y.ups).reduce((a, b) => a + b, 0);
  const steps = LESSONS[tut.char];
  const st = steps[tut.step];
  // pasos que necesitan al servidor (nivel 10 con la R cargada, Cazador de práctica); se reintentan si hace falta
  if (st.action && y.alive) {
    const last = tut.sent[st.id] ?? 0;
    const needHunter = st.action === 'hunter' && ![...game.ents.values()].some((e) => e.k === Kind.Hunter);
    const needHurt = st.action === 'hurt' && y.hp > y.mhp * 0.85; // se ha curado con una poción: volvemos a herirle
    if (!last || (needHunter && performance.now() - last > 15000) || (needHurt && performance.now() - last > 4000)) { net.send({ t: 'tut', a: st.action }); tut.sent[st.id] = performance.now(); }
  }
  if (tutVal(st) >= st.n) {
    tut.step++;
    playSfx('pickup');
    if (tut.step >= steps.length) { finishTut(); return; }
    tut.base = { ...c };
  }
  renderTut();
}

function renderTut() {
  if (!tut) return;
  const steps = LESSONS[tut.char], st = steps[Math.min(tut.step, steps.length - 1)];
  const i = TUT_CHARS.indexOf(tut.char);
  $('tutpanel').hidden = tut.done;
  const html = `<div class="tp-h">📖 ${tt2('lesson', { i: i + 1 })} · ${tt2('c_' + tut.char)}</div>
    <div class="tp-bar"><div style="width:${(tut.step / steps.length) * 100}%"></div></div>
    <div class="tp-s">${tt2('step', { i: tut.step + 1, n: steps.length })}${st.passive ? ` · <span class="tp-p">${tt2('passive')}</span>` : ''}</div>
    <div class="tp-t" data-step="${tut.step}">${stepText(tut.char, st, tutVal(st))}</div>`;
  if (html === lastTutHtml) return; // solo se redibuja si cambia (si no, la animación de entrada no acaba nunca)
  const sameStep = $('tutpanel').querySelector<HTMLElement>('.tp-t')?.dataset.step === String(tut.step);
  lastTutHtml = html;
  $('tutpanel').innerHTML = html;
  if (sameStep) $('tutpanel').querySelector<HTMLElement>('.tp-t')!.style.animation = 'none';
}
let lastTutHtml = '';

function finishTut() {
  if (!tut) return;
  tut.done = true;
  const done = tutDoneSet(); done.add(tut.char); store.set('nl_tut', [...done].join(','));
  const i = TUT_CHARS.indexOf(tut.char), next = TUT_CHARS[i + 1];
  const all = TUT_CHARS.every((c) => done.has(c));
  $('tutpanel').hidden = true;
  $('tutdone').innerHTML = `<h2>${tt2('lessonDone')}</h2><p>${tt2('lessonDoneSub', { n: tc(tut.char).name })}</p>${all ? `<p class="ok">${tt2('allDone')}</p>` : ''}
    <div class="row center">${next ? `<button class="btn big" id="tut-next">${tt2('next')}</button>` : ''}<button class="btn big" id="tut-real">${tt2('playReal')}</button><button class="btn" id="tut-exit">${tt2('exitTut')}</button></div>`;
  $('tutdone').hidden = false;
  playSfx('level');
  if (next) $('tut-next').onclick = () => startTut(next);
  $('tut-real').onclick = () => { endTut(); net.send({ t: 'leave' }); setTimeout(() => showScreen('menu'), 150); };
  $('tut-exit').onclick = () => net.send({ t: 'leave' });
}

$('tutbtn').onclick = () => { initAudio(); startMusic(); $('splash').hidden = true; showScreen('tutorial'); };
$('tutbtn2').onclick = () => showScreen('tutorial');
$('tut-back').onclick = () => showScreen('splash');
$('home').onclick = () => showScreen('splash');
$('tut-menu').onclick = () => showScreen('menu');
tutStatic();

let welcomedOk: () => void = () => {};
const welcomed = new Promise<void>((r) => { welcomedOk = r; });

// ---------------------------------------------------------------------------
// «¿Encontraste algún error?» (pantalla de muerte). Los reportes se ven en /admin/ (cuentas master).
// ---------------------------------------------------------------------------
$('bugbtn').onclick = () => { $('bugform').hidden = false; $<HTMLTextAreaElement>('bugtext').focus(); };
$('bugcancel').onclick = () => { $('bugform').hidden = true; };
$('bugsend').onclick = () => {
  const ta = $<HTMLTextAreaElement>('bugtext');
  const text = ta.value.trim();
  if (text.length < 3) { ta.focus(); return; }
  const me = game.ents.get(game.youId);
  net.send({ t: 'report', text, ctx: {
    char: selChar, lvl: me?.l ?? 0, lang, portal: PORTAL || 'web',
    screen: `${innerWidth}x${innerHeight}@${devicePixelRatio}`, touch: matchMedia('(pointer: coarse)').matches ? 1 : 0, ua: navigator.userAgent.slice(0, 150),
  } });
  ta.value = '';
  $('bugform').hidden = true;
};
async function boot() {
  await initPortal((m) => { setForcedMute(m); for (const id of ['mute', 'menumute']) $(id).textContent = isMuted() ? '🔇' : '🔊'; });
  if (isCrazy) {
    // en CrazyGames se usa su nombre de usuario (obligatorio: los amigos tienen que reconocerse en la sala)
    const setName = (u: string) => { nameInput.value = u.slice(0, 14); store.set('nl_name', nameInput.value); };
    const u = await portalUsername();
    if (u) setName(u);
    onPortalLogin((u) => { setName(u); net.send({ t: 'hello', token: savedToken(), name: nameInput.value }); });
  }
  buildLangPicker($('langs'));
  setLang(lang);
  showScreen(new URLSearchParams(location.search).get('sala') ? 'menu' : 'splash');
  refreshMenu();
  try {
    const linkCode = new URLSearchParams(location.search).get('sala');
    await net.connect(linkCode ? net.shardOfCode(linkCode) || await net.pickShard() : await net.pickShard());
    net.send({ t: 'hello', token: savedToken(), name: nameInput.value.trim() });
    net.send({ t: 'rooms' });
    loadingStop();
    if (isCrazy) {
      await welcomed;
      const goTo = (code: string) => { $('splash').hidden = true; showScreen('menu'); join('code', code); };
      const inv = invitedRoom();
      if (inv) goTo(inv);
      else if (isInstantMultiplayer()) { $('splash').hidden = true; showScreen('menu'); join('create', undefined, { priv: true, fill: true, anyTheme: true }); }
      onInviteJoin((code) => { if (game.roomCode !== code) goTo(code); });
    }
    setInterval(() => { if (!inGame) net.send({ t: 'rooms' }); }, 5000);
  } catch {
    showError(t('noServer'));
  }
}
boot();

// ---------------------------------------------------------------------------
// Visor de sprites (abre /#sprites): útil para diseñar skins y monstruos nuevos
// ---------------------------------------------------------------------------
if (location.hash.startsWith('#sprites')) {
  import('./spritesheet').then((m) => m.showSpriteSheet());
} else if (location.hash.startsWith('#mapa')) {
  import('./spritesheet').then((m) => m.showMapPreview(location.hash.slice(6)));
}

// logo animado del menú
const logoCanvas = document.getElementById('logo') as HTMLCanvasElement | null;
if (logoCanvas) startLogo(logoCanvas);
const menuBg = document.getElementById('menubg') as HTMLCanvasElement | null;
if (menuBg) startMenuBg(menuBg);
startLogo($<HTMLCanvasElement>('splashlogo'));
startParade($<HTMLCanvasElement>('parade'));
