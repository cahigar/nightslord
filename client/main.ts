// Punto de entrada del cliente: menús, HUD y bucle de render.
import { CHARACTERS, CHARACTER_IDS, SKINS, UPGRADES, upgradeMax, type CharacterId, type UpgradeId } from '../shared/characters';
import { CHARACTER_UNLOCK, hasCharacter, hasSkin, MEDALS, MEDAL_BY_ID, unlockPrice, type Profile } from '../shared/catalog';
import { THEMES, type MapThemeId } from '../shared/maps';
import { Anim, Kind, type GameEvent, type ServerMsg } from '../shared/protocol';
import { initAudio, isMuted, startMusic, toggleMute } from './audio';
import { Game } from './game';
import { input, setupInput } from './input';
import { net } from './net';
import { ANIMS, getFrame, SH, SW } from './sprites';
import { applyStatic, buildLangPicker, lang, onLangChange, setLang, t, tb, tc, tk, tm, tt, tu, tw } from './i18n';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const game = new Game(canvas);
// acceso de depuración desde la consola (solo útil en modo desarrollo)
(window as unknown as { __nl: unknown }).__nl = { game, net };

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* */ } },
};
/** Invitado: su token vive solo en esta pestaña/navegador abierto (al cerrarlo se pierde el progreso).
 *  Con cuenta de Google: el token se guarda y el progreso se recupera desde cualquier sitio. */
const session = {
  get(k: string) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { sessionStorage.setItem(k, v); } catch { /* */ } },
  del(k: string) { try { sessionStorage.removeItem(k); } catch { /* */ } },
};
const savedToken = () => store.get('nl_token') ?? session.get('nl_token') ?? undefined;
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
  canvas.width = Math.floor(innerWidth * devicePixelRatio);
  canvas.height = Math.floor(innerHeight * devicePixelRatio);
}
addEventListener('resize', resize);
resize();
setupInput(canvas);

let last = performance.now();
let mmT = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.render(dt);
  mmT -= dt;
  if (inGame && mmT <= 0) { game.minimap($<HTMLCanvasElement>('minimap')); mmT = 0.2; }
  animatePreviews(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------------------
// Previsualizaciones animadas de personajes
// ---------------------------------------------------------------------------
const previews: { cv: HTMLCanvasElement; char: CharacterId; skin: () => string; anim: Anim }[] = [];
function animatePreviews(now: number) {
  for (const p of previews) {
    if (!p.cv.isConnected) continue;
    const def = ANIMS[p.anim];
    const f = Math.floor(now / 1000 / def.dur) % def.frames.length;
    const c = p.cv.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, p.cv.width, p.cv.height);
    const fr = getFrame('monster', p.char, p.skin(), p.anim, f);
    c.drawImage(fr.base, 0, 0, p.cv.width, p.cv.height);
    if (fr.glow) { c.globalCompositeOperation = 'lighter'; c.drawImage(fr.glow, 0, 0, p.cv.width, p.cv.height); c.globalCompositeOperation = 'source-over'; }
  }
}

// ---------------------------------------------------------------------------
// Menú
// ---------------------------------------------------------------------------
function buildChars(container: HTMLElement, small = false) {
  container.innerHTML = '';
  for (const id of CHARACTER_IDS) {
    const def = CHARACTERS[id];
    const owned = devMode || (profile ? hasCharacter(profile, id) : CHARACTER_UNLOCK[id].price === 0);
    const el = document.createElement('div');
    el.className = `char${selChar === id ? ' sel' : ''}${owned ? '' : ' locked'}`;
    const cv = document.createElement('canvas');
    cv.width = SW * 3; cv.height = SH * 3;
    previews.push({ cv, char: id, skin: () => (selChar === id ? selSkin : 'classic'), anim: selChar === id ? Anim.Taunt : Anim.Idle });
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
    el.onclick = () => {
      if (!owned) {
        const price = unlockPrice(profile);
        if (profile && profile.coins >= price && confirm(t('confirmUnlock', { n: tc(id).name, p: price }))) net.send({ t: 'buy', item: `char:${id}` });
        else showError(t('needCoins', { p: price }) + (CHARACTER_UNLOCK[id].medal ? t('orMedal', { m: tm(CHARACTER_UNLOCK[id].medal!).name }) : '') + '.');
        return;
      }
      selChar = id;
      selSkin = 'classic';
      store.set('nl_char', selChar); store.set('nl_skin', selSkin);
      refreshMenu();
    };
    container.appendChild(el);
  }
}

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
  if (profile?.google) {
    box.innerHTML = `<div class="who">${t('savedIn', { email: escapeHtml(profile.google.email) })}${profile.master ? ' · <span class="master">MASTER</span>' : ''}</div><button id="logout" class="btn tiny">${t('logout')}</button>`;
    $('logout').onclick = () => {
      store.del('nl_token'); session.del('nl_token');
      (window as unknown as { google?: GoogleId }).google?.accounts.id.disableAutoSelect();
      location.reload();
    };
    return;
  }
  box.innerHTML = `<div class="who">${t('guest')}</div><div id="gbtn"></div>
    <div class="note">${t('accountNote')} <a href="/privacidad.html" target="_blank">${t('privacy')}</a></div>`;
  if (!googleClientId) { $('gbtn').textContent = t('loginUnavailable'); return; }
  loadGoogle().then(() => {
    const g = (window as unknown as { google: GoogleId }).google;
    g.accounts.id.initialize({ client_id: googleClientId, callback: (r: { credential: string }) => net.send({ t: 'login', credential: r.credential }) });
    const el = document.getElementById('gbtn');
    if (el) g.accounts.id.renderButton(el, { theme: 'filled_black', size: 'medium', text: 'signin_with', shape: 'pill', locale: lang });
  }).catch(() => { const el = document.getElementById('gbtn'); if (el) el.textContent = t('googleFail'); });
}

function buildCharInfo() {
  const d = CHARACTERS[selChar], x = tc(selChar);
  $('charinfo').innerHTML = `
    <div><b>${x.attack}</b> · ${x.passive}</div>
    <div><b>Q ${x.q[0]}</b> · ${x.q[1]}</div>
    <div><b>E ${x.e[0]}</b> · ${x.e[1]}</div>
    <div><b>R ${x.r[0]}</b> · ${x.r[1]}</div>
    <div class="evo">${d.evolution.map((ev, i) => `<span><b>${t('lvlShort')} ${ev.lvl}</b> ${x.evo[i]?.[0] ?? ev.name}</span>`).join('')}</div>
    <div class="stats">${t('stats', { hp: d.hp, sp: d.speed, dm: d.damage })}${d.armor ? t('armor', { a: Math.round(d.armor * 100) }) : ''}</div>`;
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
  if (profile && !devMode && !hasCharacter(profile, selChar)) { selChar = 'vampire'; selSkin = 'classic'; }
  if (profile && !devMode) {
    const sk = SKINS[selChar].find((s) => s.id === selSkin);
    if (!sk || !hasSkin(profile, selChar, sk)) selSkin = 'classic';
  }
  buildChars($('chars'));
  buildCharInfo();
  buildSkins();
  buildMedals();
  $('coins').textContent = String(profile?.coins ?? 0);
  if (!$('death').hidden) buildChars($('death-chars'), true);
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

async function join(mode: 'random' | 'code' | 'create', code?: string) {
  initAudio();
  startMusic();
  const name = nameInput.value.trim();
  store.set('nl_name', name);
  // con varios servidores, la sala vive en el suyo (su código empieza por esa letra)
  if (mode === 'code' && code && net.shardOfCode(code) !== net.shard) {
    try { await net.switchTo(net.shardOfCode(code)); } catch { showError(t('connectRoomFail')); return; }
  }
  // re-hello por si cambió el nombre
  net.send({ t: 'hello', token: savedToken(), name });
  net.send({
    t: 'join', mode, code, char: selChar, skin: selSkin,
    priv: $<HTMLInputElement>('priv').checked, theme: ($<HTMLSelectElement>('theme').value || undefined) as MapThemeId | undefined,
  });
}

$('play').onclick = () => join('random');
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

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function buildAbilities() {
  const d = CHARACTERS[selChar];
  const items = [
    { key: '🖱', name: tc(d.id).attack },
    { key: 'Q', name: tc(d.id).q[0] },
    { key: 'E', name: tc(d.id).e[0] },
    { key: 'R', name: tc(d.id).r[0] },
  ];
  $('abilities').innerHTML = items.map((a, i) => `<div class="ab${i === 3 ? ' ult' : ''}" id="ab${i}"><span class="key">${a.key}</span><span class="nm">${a.name}</span><div class="cdov"></div><div class="cdt"></div>${i === 3 ? '<div class="charge"><div></div></div>' : ''}</div>`).join('');
}

let lastUpKey = '';
function updateHud() {
  const y = game.you;
  if (!y) return;
  $('hpfill').style.width = `${(y.hp / y.mhp) * 100}%`;
  $('hptext').textContent = `${y.hp} / ${y.mhp}`;
  $('xpfill').style.width = `${(y.xp / y.xpn) * 100}%`;
  $('lvl').textContent = String(y.lvl);
  $('pts').textContent = t('pts', { n: y.pts });
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
  const upKey = `${y.up}|${Object.values(y.ups).join(',')}|${y.lvl >= 15}`;
  if (upKey !== lastUpKey) {
    lastUpKey = upKey;
    const box = $('upgrades');
    box.hidden = y.up <= 0;
    box.innerHTML = `<div class="up-title">${y.up > 1 ? t('upMany', { n: y.up }) : t('upOne')}</div>` + UPGRADES.map((u) => {
      const lv = y.ups[u.id];
      const mx = upgradeMax(u, y.lvl);
      return `<div class="up${lv >= mx ? ' maxed' : ''}" data-u="${u.id}"><b>${u.key}·${tu(u.id).name}</b>${tu(u.id).desc}<br><small>${lv}/${mx}</small></div>`;
    }).join('');
    box.querySelectorAll<HTMLElement>('.up').forEach((el) => { el.onclick = () => net.send({ t: 'upgrade', u: el.dataset.u as UpgradeId }); });
  }
  $('ping').textContent = `${Math.round(net.rtt)} ms`;
}

function renderRank(list: [string, number, CharacterId, number][], total: number) {
  $('rank').innerHTML = `<div class="title">${t('rank')} · ${total}👤</div>` + list.map((r, i) =>
    `<div class="r${r[3] === myId ? ' me' : ''}"><span>${i === 0 ? '👑' : `${i + 1}.`} ${escapeHtml(r[0])}</span><span>${r[1]}</span></div>`).join('');
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function onGameEvent(ev: GameEvent) {
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
  if (code === 'KeyM') { $('mute').textContent = toggleMute() ? '🔇' : '🔊'; return; }
  if (!inGame) return;
  if (devMode && input.keys.has('ShiftLeft') || devMode && input.keys.has('ShiftRight')) {
    if (code === 'KeyL') { const lv = game.you?.lvl ?? 1; net.send({ t: 'cheat', lvl: lv < 5 ? 5 : lv < 10 ? 10 : lv < 15 ? 15 : lv + 1 }); return; }
    if (code === 'KeyU') { net.send({ t: 'cheat', ult: true }); return; }
  }
  if (code === 'KeyG') net.send({ t: 'emote', e: 'wave' });
  if (code === 'KeyT') net.send({ t: 'emote', e: 'taunt' });
  if (code === 'KeyH') net.send({ t: 'emote', e: 'ally' });
  const up = UPGRADES.find((u) => `Digit${u.key}` === code || `Numpad${u.key}` === code);
  if (up) net.send({ t: 'upgrade', u: up.id });
};
$('mute').onclick = () => { $('mute').textContent = toggleMute() ? '🔇' : '🔊'; };
$('mute').textContent = isMuted() ? '🔇' : '🔊';
$('exit').onclick = () => { net.send({ t: 'leave' }); };

function showScreen(which: 'menu' | 'game' | 'death') {
  $('menu').hidden = which !== 'menu';
  $('hud').hidden = which === 'menu';
  $('death').hidden = which !== 'death';
  inGame = which !== 'menu';
}

// ---------------------------------------------------------------------------
// Muerte
// ---------------------------------------------------------------------------
$('respawn').onclick = () => {
  net.send({ t: 'respawn', char: selChar, skin: selSkin });
};
$('tomenu').onclick = () => net.send({ t: 'leave' });

// ---------------------------------------------------------------------------
// Red
// ---------------------------------------------------------------------------
net.on((m: ServerMsg) => {
  switch (m.t) {
    case 'welcome':
      devMode = !!m.dev || !!m.profile.master;
      googleClientId = m.google ?? '';
    // falls through
    case 'profile':
      profile = m.profile;
      if (m.profile.google) { store.set('nl_token', m.profile.token); session.del('nl_token'); }
      else { session.set('nl_token', m.profile.token); store.del('nl_token'); }
      buildAccount();
      if (!nameInput.value) nameInput.value = m.profile.name;
      refreshMenu();
      break;
    case 'joined': {
      myId = m.you;
      game.start(m);
      buildAbilities();
      lastUpKey = '';
      const th = tt(m.theme);
      const link = `${location.origin}${location.pathname}?sala=${m.code}`;
      $('roominfo').innerHTML = `${t('room')} <b>${m.code}</b>${m.priv ? ' 🔒' : ''} · ${th.name}`;
      $('roominfo').title = t('share', { l: link });
      $('roominfo').style.pointerEvents = 'auto';
      $('roominfo').style.cursor = 'pointer';
      $('roominfo').onclick = () => { navigator.clipboard?.writeText(link); toast(t('linkCopied')); };
      if ($('menu').hidden === false || !$('death').hidden) toast(`<b>${th.name}</b><br>${th.subtitle}`);
      showScreen('game');
      history.replaceState(null, '', `?sala=${m.code}`);
      break;
    }
    case 'snap':
      game.onSnapshot(m);
      updateHud();
      break;
    case 'rank':
      renderRank(m.list, m.total);
      break;
    case 'died': {
      $('death-by').textContent = t('killedBy', { n: tw(m.by) });
      const mins = Math.floor(m.time / 60), secs = m.time % 60;
      $('death-stats').innerHTML = `
        <div><b>${m.pts}</b>${t('dPoints')}</div><div><b>${m.lvl}</b>${t('dLevel')}</div><div><b>${m.kills}</b>${t('dMonsters')}</div>
        <div><b>${mins}:${String(secs).padStart(2, '0')}</b>${t('dSurvived')}</div><div><b>+${m.coins}🪙</b>${t('dCoins')}</div>`;
      setTimeout(() => { if (inGame && !game.alive) { showScreen('death'); buildChars($('death-chars'), true); } }, 1400);
      break;
    }
    case 'toast': toast(escapeHtml((m.k && tk(m.k, m.a ?? {})) || m.text)); break;
    case 'medal': {
      const md = MEDAL_BY_ID[m.id];
      if (md) toast(`${md.icon} ${t('medalUnlocked')}<br>${tm(md.id).name}<br><span style="color:var(--gold)">${t('coinsPlus', { c: md.coins })}</span>`);
      break;
    }
    case 'rooms':
      $('rooms').innerHTML = m.list.length
        ? m.list.map((r) => `<span class="room" data-code="${r.code}">${r.code} · ${tt(r.theme).name} · ${r.players}/${r.max}</span>`).join('')
        : '';
      $('rooms').querySelectorAll<HTMLElement>('.room').forEach((el) => { el.onclick = () => join('code', el.dataset.code); });
      break;
    case 'left':
      game.stop();
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
  showScreen('menu');
  showError(t('connLost'));
  setTimeout(() => location.reload(), 2500);
};

function retranslate() {
  applyStatic();
  document.querySelectorAll<HTMLOptionElement>('#theme option').forEach((o) => { if (o.value) o.textContent = tt(o.value as MapThemeId).name; });
  buildAccount();
  refreshMenu();
  if (inGame) { buildAbilities(); lastUpKey = ''; }
}
onLangChange(retranslate);

async function boot() {
  buildLangPicker($('langs'));
  setLang(lang);
  showScreen('menu');
  refreshMenu();
  try {
    const linkCode = new URLSearchParams(location.search).get('sala');
    await net.connect(linkCode ? net.shardOfCode(linkCode) || await net.pickShard() : await net.pickShard());
    net.send({ t: 'hello', token: savedToken(), name: nameInput.value.trim() });
    net.send({ t: 'rooms' });
    setInterval(() => { if (!inGame) net.send({ t: 'rooms' }); }, 5000);
  } catch {
    showError(t('noServer'));
  }
}
boot();

// ---------------------------------------------------------------------------
// Visor de sprites (abre /#sprites): útil para diseñar skins y monstruos nuevos
// ---------------------------------------------------------------------------
if (location.hash === '#sprites') {
  import('./spritesheet').then((m) => m.showSpriteSheet());
} else if (location.hash.startsWith('#mapa')) {
  import('./spritesheet').then((m) => m.showMapPreview(location.hash.slice(6)));
}
