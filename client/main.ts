// Punto de entrada del cliente: menús, HUD y bucle de render.
import { CHARACTERS, CHARACTER_IDS, SKINS, UPGRADES, type CharacterId, type UpgradeId } from '../shared/characters';
import { CHARACTER_UNLOCK, hasCharacter, hasSkin, MEDALS, MEDAL_BY_ID, type Profile } from '../shared/catalog';
import { THEMES, type MapThemeId } from '../shared/maps';
import { Anim, Kind, type GameEvent, type ServerMsg } from '../shared/protocol';
import { initAudio, isMuted, startMusic, toggleMute } from './audio';
import { Game } from './game';
import { input, setupInput } from './input';
import { net } from './net';
import { ANIMS, getFrame, SH, SW } from './sprites';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const game = new Game(canvas);

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* */ } },
};

let profile: Profile | null = null;
let selChar = (store.get('nl_char') as CharacterId) || 'vampire';
let selSkin = store.get('nl_skin') || 'classic';
let inGame = false;
let myId = -1;

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
    const owned = profile ? hasCharacter(profile, id) : CHARACTER_UNLOCK[id].price === 0;
    const el = document.createElement('div');
    el.className = `char${selChar === id ? ' sel' : ''}${owned ? '' : ' locked'}`;
    const cv = document.createElement('canvas');
    cv.width = SW * 3; cv.height = SH * 3;
    previews.push({ cv, char: id, skin: () => (selChar === id ? selSkin : 'classic'), anim: selChar === id ? Anim.Taunt : Anim.Idle });
    el.appendChild(cv);
    el.insertAdjacentHTML('beforeend', `<div class="cname">${def.name}</div>${small ? '' : `<div class="ctitle">${def.title}</div>`}`);
    if (!owned) {
      const u = CHARACTER_UNLOCK[id];
      const medal = u.medal ? MEDAL_BY_ID[u.medal] : null;
      el.insertAdjacentHTML('beforeend', `<div class="lock">🔒 ${u.price}🪙${medal ? ` o ${medal.icon}` : ''}</div>`);
      el.title = `Desbloquear por ${u.price} monedas${medal ? ` o consiguiendo la medalla «${medal.name}»` : ''}`;
    }
    el.onclick = () => {
      if (!owned) {
        if (profile && profile.coins >= CHARACTER_UNLOCK[id].price && confirm(`¿Desbloquear ${def.name} por ${CHARACTER_UNLOCK[id].price} monedas?`)) net.send({ t: 'buy', item: `char:${id}` });
        else showError(`Necesitas ${CHARACTER_UNLOCK[id].price} monedas${CHARACTER_UNLOCK[id].medal ? ` o la medalla «${MEDAL_BY_ID[CHARACTER_UNLOCK[id].medal!].name}»` : ''}.`);
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

function buildCharInfo() {
  const d = CHARACTERS[selChar];
  $('charinfo').innerHTML = `
    <div><b>${d.attackName}</b> · ${d.passive}</div>
    <div><b>Q ${d.abilities[0].name}</b> · ${d.abilities[0].desc}</div>
    <div><b>E ${d.abilities[1].name}</b> · ${d.abilities[1].desc}</div>
    <div class="stats">Vida ${d.hp} · Velocidad ${d.speed} · Daño ${d.damage}${d.armor ? ` · Armadura ${Math.round(d.armor * 100)}%` : ''}</div>`;
}

function buildSkins() {
  const box = $('skins');
  box.innerHTML = '';
  for (const s of SKINS[selChar]) {
    const owned = profile ? hasSkin(profile, selChar, s) : s.price === 0 && !s.medal;
    const el = document.createElement('div');
    el.className = `skin${selSkin === s.id ? ' sel' : ''}${owned ? '' : ' locked'}`;
    const medal = s.medal ? MEDAL_BY_ID[s.medal] : null;
    el.innerHTML = `<span class="sw" style="background:${s.palette.cloth};box-shadow:inset -6px 0 0 ${s.palette.accent}"></span>${s.name}${owned ? '' : medal ? ` <span class="price">${medal.icon}</span>` : ` <span class="price">${s.price}🪙</span>`}`;
    el.title = owned ? s.name : medal ? `Se gana con la medalla «${medal.name}»` : `${s.price} monedas`;
    el.onclick = () => {
      if (!owned) {
        if (medal) return showError(`Skin de medalla: ${medal.name} — ${medal.desc}`);
        if (profile && profile.coins >= s.price && confirm(`¿Comprar la skin «${s.name}» por ${s.price} monedas?`)) net.send({ t: 'buy', item: `skin:${selChar}:${s.id}` });
        else showError(`Necesitas ${s.price} monedas.`);
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
  $('medals').innerHTML = MEDALS.map((m) => `<div class="medal${got.has(m.id) ? ' got' : ''}"><span class="mi">${m.icon}</span><b>${m.name}</b>${m.desc} <span style="color:var(--gold)">+${m.coins}🪙</span></div>`).join('');
}

function refreshMenu() {
  previews.length = 0;
  if (profile && !hasCharacter(profile, selChar)) { selChar = 'vampire'; selSkin = 'classic'; }
  if (profile) {
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
  $('toast').appendChild(t);
  setTimeout(() => t.remove(), 4600);
}

const nameInput = $<HTMLInputElement>('name');
nameInput.value = store.get('nl_name') ?? '';

function join(mode: 'random' | 'code' | 'create', code?: string) {
  initAudio();
  startMusic();
  const name = nameInput.value.trim();
  store.set('nl_name', name);
  // re-hello por si cambió el nombre
  net.send({ t: 'hello', token: store.get('nl_token') ?? undefined, name });
  net.send({
    t: 'join', mode, code, char: selChar, skin: selSkin,
    priv: $<HTMLInputElement>('priv').checked, theme: ($<HTMLSelectElement>('theme').value || undefined) as MapThemeId | undefined,
  });
}

$('play').onclick = () => join('random');
$('join').onclick = () => {
  const code = $<HTMLInputElement>('code').value.trim().toUpperCase();
  if (code.length !== 4) return showError('El código tiene 4 caracteres.');
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
    { key: '🖱', name: d.attackName },
    { key: 'Q', name: d.abilities[0].name },
    { key: 'E', name: d.abilities[1].name },
  ];
  $('abilities').innerHTML = items.map((a, i) => `<div class="ab" id="ab${i}"><span class="key">${a.key}</span>${a.name}<div class="cdov"></div><div class="cdt"></div></div>`).join('');
}

let lastUpKey = '';
function updateHud() {
  const y = game.you;
  if (!y) return;
  $('hpfill').style.width = `${(y.hp / y.mhp) * 100}%`;
  $('hptext').textContent = `${y.hp} / ${y.mhp}`;
  $('xpfill').style.width = `${(y.xp / y.xpn) * 100}%`;
  $('lvl').textContent = String(y.lvl);
  $('pts').textContent = `${y.pts} pts`;
  $('gcoins').textContent = `🪙 ${y.coins}`;
  for (let i = 0; i < 3; i++) {
    const el = document.getElementById(`ab${i}`);
    if (!el) continue;
    const r = y.cd[i], m = y.cdm[i] || 1;
    (el.querySelector('.cdov') as HTMLElement).style.height = `${(r / m) * 100}%`;
    (el.querySelector('.cdt') as HTMLElement).textContent = r > 0.05 && i > 0 ? r.toFixed(1) : '';
    el.classList.toggle('ready', r <= 0);
  }
  const BUFF_NAMES: Record<string, string> = { speed: '⚡Rapidez', fury: '🔥Furia', howl: '🌕Aullido', shield: '🛡Escudo', invis: '👻Invisible', protect: '✨Protegido', slow: '🐌Lento', stun: '💫Aturdido' };
  $('buffs').innerHTML = y.buffs.map((b) => `<span class="buff">${BUFF_NAMES[b.t] ?? b.t} ${Math.ceil(b.r)}</span>`).join('');
  const upKey = `${y.up}|${Object.values(y.ups).join(',')}`;
  if (upKey !== lastUpKey) {
    lastUpKey = upKey;
    const box = $('upgrades');
    box.hidden = y.up <= 0;
    box.innerHTML = `<div class="up-title">¡${y.up} mejora${y.up > 1 ? 's' : ''} disponible${y.up > 1 ? 's' : ''}! (1-4)</div>` + UPGRADES.map((u) => {
      const lv = y.ups[u.id];
      return `<div class="up${lv >= u.max ? ' maxed' : ''}" data-u="${u.id}"><b>${u.key}·${u.name}</b>${u.desc}<br><small>${lv}/${u.max}</small></div>`;
    }).join('');
    box.querySelectorAll<HTMLElement>('.up').forEach((el) => { el.onclick = () => net.send({ t: 'upgrade', u: el.dataset.u as UpgradeId }); });
  }
  $('ping').textContent = `${Math.round(net.rtt)} ms`;
}

function renderRank(list: [string, number, CharacterId, number][], total: number) {
  $('rank').innerHTML = `<div class="title">RANKING DE SALA · ${total}👤</div>` + list.map((r, i) =>
    `<div class="r${r[3] === myId ? ' me' : ''}"><span>${i === 0 ? '👑' : `${i + 1}.`} ${escapeHtml(r[0])}</span><span>${r[1]}</span></div>`).join('');
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function onGameEvent(ev: GameEvent) {
  if (ev.e === 'kill') {
    const d = document.createElement('div');
    const icon = ev.vk === Kind.Helsing ? '🏹' : '💀';
    d.innerHTML = `<span class="a">${escapeHtml(ev.a)}</span> ${icon} <span class="v">${escapeHtml(ev.v)}</span>`;
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
  if (code === 'KeyG') net.send({ t: 'emote', e: 'wave' });
  if (code === 'KeyT') net.send({ t: 'emote', e: 'taunt' });
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
    case 'profile':
      profile = m.profile;
      store.set('nl_token', m.profile.token);
      if (!nameInput.value) nameInput.value = m.profile.name;
      refreshMenu();
      break;
    case 'joined': {
      myId = m.you;
      game.start(m);
      buildAbilities();
      lastUpKey = '';
      const th = THEMES[m.theme];
      const link = `${location.origin}${location.pathname}?sala=${m.code}`;
      $('roominfo').innerHTML = `Sala <b>${m.code}</b>${m.priv ? ' 🔒' : ''} · ${th.name}`;
      $('roominfo').title = `Comparte: ${link}`;
      $('roominfo').style.pointerEvents = 'auto';
      $('roominfo').style.cursor = 'pointer';
      $('roominfo').onclick = () => { navigator.clipboard?.writeText(link); toast('Enlace de la sala copiado 📋'); };
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
      $('death-by').textContent = `Te ha cazado: ${m.by}`;
      const mins = Math.floor(m.time / 60), secs = m.time % 60;
      $('death-stats').innerHTML = `
        <div><b>${m.pts}</b>puntos</div><div><b>${m.lvl}</b>nivel</div><div><b>${m.kills}</b>monstruos</div>
        <div><b>${mins}:${String(secs).padStart(2, '0')}</b>sobrevivido</div><div><b>+${m.coins}🪙</b>monedas</div>`;
      setTimeout(() => { if (inGame && !game.alive) { showScreen('death'); buildChars($('death-chars'), true); } }, 1400);
      break;
    }
    case 'medal': {
      const md = MEDAL_BY_ID[m.id];
      if (md) toast(`${md.icon} ¡Medalla desbloqueada!<br>${md.name}<br><span style="color:var(--gold)">+${md.coins} monedas</span>`);
      break;
    }
    case 'rooms':
      $('rooms').innerHTML = m.list.length
        ? m.list.map((r) => `<span class="room" data-code="${r.code}">${r.code} · ${THEMES[r.theme].name} · ${r.players}/${r.max}</span>`).join('')
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
      showError(m.msg);
      break;
  }
});

net.onClose = () => {
  game.stop();
  showScreen('menu');
  showError('Conexión perdida. Reintentando...');
  setTimeout(() => location.reload(), 2500);
};

async function boot() {
  showScreen('menu');
  refreshMenu();
  try {
    await net.connect();
    net.send({ t: 'hello', token: store.get('nl_token') ?? undefined, name: nameInput.value.trim() });
    net.send({ t: 'rooms' });
    setInterval(() => { if (!inGame) net.send({ t: 'rooms' }); }, 5000);
  } catch {
    showError('No se pudo conectar con el servidor. ¿Está arrancado (npm run dev)?');
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
