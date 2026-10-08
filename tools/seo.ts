// Genera las páginas estáticas para buscadores e IAs: monstruos, mapas, cómo jugar (es + en),
// sitemap.xml, robots.txt y llms.txt, todo dentro de client/public (Vite lo copia tal cual).
// Uso: npx tsx tools/seo.ts   (las imágenes salen de tools/seo-images.mjs)
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { CHARACTERS, type CharacterId, type CharacterDef } from '../shared/characters';
import { THEMES, THEME_IDS, type MapThemeId } from '../shared/maps';
import { EN } from '../client/lang/en';

const SITE = 'https://mooonsters.com';
const PUB = join(import.meta.dirname, '..', 'client', 'public');
const TODAY = new Date().toISOString().slice(0, 10);
type Lang = 'es' | 'en';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (s: string) => s.replace(/<[^>]+>/g, '');
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Trailers ya publicados (los sirve Caddy en /media)
const TRAILER_CHAR: Partial<Record<CharacterId, string>> = { vampire: 'trailer-vampiro.mp4', zombie: 'trailer-zombi.mp4', mummy: 'trailer-ramses.mp4', candle: 'trailer-candleman.mp4' };
const TRAILER_MAP: Partial<Record<MapThemeId, string>> = { camp: 'trailer-campamento.mp4', nile: 'trailer-nilo.mp4' };
const INSTAGRAM = 'https://www.instagram.com/mooonsters.game/';

const IDS = Object.keys(CHARACTERS) as CharacterId[];

// ---------------------------------------------------------------- textos
const ROLE: Record<Lang, Record<string, string>> = {
  es: { melee: 'Cuerpo a cuerpo', assassin: 'Asesino', summoner: 'Invocador', ranged: 'A distancia', hybrid: 'Híbrido' },
  en: { melee: 'Melee', assassin: 'Assassin', summoner: 'Summoner', ranged: 'Ranged', hybrid: 'Hybrid' },
};

const MAPDESC: Record<Lang, Record<MapThemeId, string>> = {
  es: {
    elm: 'Un barrio residencial con calles en cuadrícula, casas, vallas y un parque con estanque. Los adolescentes y los vecinos pasean como si nada… hasta que cae la noche.',
    transylvania: 'Un valle a los pies del castillo, con caminos empedrados y un río que solo se cruza por los puentes de madera. Aldeanos, curas y doncellas: la cena está servida.',
    camp: 'Cabañas entre pinos, una hoguera que es la única luz en kilómetros y un lago donde algo se mueve bajo el agua. Campistas y monitores con linterna… y luna llena.',
    swamp: 'Charcas de agua negra unidas por pasarelas de barro y, en el centro, la choza seca de la bruja. Los senderos de fango frenan a quien no conoce el pantano.',
    nile: 'Un río con cocodrilos que muerden a todos, pirámides, una esfinge y una gusarena acechando bajo la arena. Turistas, arqueólogos y aldeanos despistados.',
    jungle: 'Un río poco profundo con corriente, una laguna profunda, un templo en ruinas y el campamento de la expedición. Cuidado: aquí también cazan los dinosaurios.',
  },
  en: {
    elm: 'A suburban neighbourhood with grid streets, houses, fences and a park with a pond. Teens and neighbours stroll around without a care… until night falls.',
    transylvania: 'A valley below the castle, with cobbled roads and a river you can only cross over wooden bridges. Villagers, priests and maids: dinner is served.',
    camp: 'Cabins among the pines, a bonfire that is the only light for miles and a lake where something moves beneath the water. Campers and counselors with flashlights… and a full moon.',
    swamp: 'Pools of black water joined by mud paths and, in the middle, the witch’s dry hut. The muddy trails slow down anyone who does not know the swamp.',
    nile: 'A river full of crocodiles that bite everyone, pyramids, a sphinx and a sandworm lurking under the sand. Tourists, archaeologists and careless villagers.',
    jungle: 'A shallow river with a current, a deep lagoon, a ruined temple and the expedition camp. Careful: the dinosaurs hunt here too.',
  },
};

const T = {
  es: {
    lang: 'es', home: '/', monstersPath: '/monstruos/', mapsPath: '/mapas/', howPath: '/como-jugar/',
    monsters: 'Monstruos', maps: 'Mapas', how: 'Cómo jugar', play: '▶ Jugar gratis', other: 'English',
    tagline: 'Juego multijugador de monstruos gratis en el navegador',
    footer: 'Mooonsters es un juego multijugador gratuito tipo .io: se juega desde el navegador del móvil o del PC, sin descargas.',
    privacy: 'Privacidad', terms: 'Condiciones',
    cls: 'Clase', hp: 'Vida', speed: 'Velocidad', armor: 'Armadura', basic: 'Ataque básico', passive: 'Pasiva', abilities: 'Habilidades',
    ult: 'Definitiva (nivel 10)', evo: 'Evoluciones', lvl: 'Nivel', trailer: 'Tráiler', ranged: 'a distancia', others: 'Otros monstruos',
    charTitle: (c: string, t: string) => `${c}, ${t.toLowerCase()} — monstruo jugable de Mooonsters`,
    charDesc: (c: string, t: string, p: string) => `Juega como ${c} (${t}) en Mooonsters, el juego multijugador de monstruos gratis en el navegador. ${p}`,
    charIntro: (c: string, t: string) => `${c} es uno de los 30 monstruos que puedes elegir en Mooonsters. Caza humanos, sube de nivel y evoluciona en los niveles 5, 10 y 15.`,
    monstersTitle: 'Los 30 monstruos de Mooonsters — habilidades y evoluciones',
    monstersDesc: 'Vampiro, hombre lobo, momia, zombi, bruja y 25 monstruos más. Consulta sus habilidades, definitivas y evoluciones y juega gratis en el navegador.',
    monstersIntro: 'En Mooonsters eliges un monstruo clásico del terror y sales a cazar. Cada uno tiene un ataque básico, una pasiva, dos habilidades (Q y E), una definitiva (R) que se desbloquea en el nivel 10 y tres evoluciones.',
    mapsTitle: 'Mapas de Mooonsters — escenarios de terror',
    mapsDesc: 'Seis escenarios de película de terror: barrio, Transilvania, campamento, pantano, Nilo y jungla jurásica. Juega gratis en el navegador.',
    mapsIntro: 'Cada sala usa uno de estos escenarios, con sus propios humanos, agua, obstáculos y peligros. El mapa se genera a partir de una semilla, así que nunca es exactamente igual.',
    mapTitle: (n: string) => `${n} — mapa de Mooonsters`,
    mapDesc: (n: string, d: string) => `${n}: ${d}`,
    humans: 'Humanos que encontrarás',
  },
  en: {
    lang: 'en', home: '/en/', monstersPath: '/en/monsters/', mapsPath: '/en/maps/', howPath: '/en/how-to-play/',
    monsters: 'Monsters', maps: 'Maps', how: 'How to play', play: '▶ Play free', other: 'Español',
    tagline: 'Free multiplayer monster game in your browser',
    footer: 'Mooonsters is a free multiplayer .io game: play it in your phone or PC browser, no downloads.',
    privacy: 'Privacy', terms: 'Terms',
    cls: 'Class', hp: 'Health', speed: 'Speed', armor: 'Armor', basic: 'Basic attack', passive: 'Passive', abilities: 'Abilities',
    ult: 'Ultimate (level 10)', evo: 'Evolutions', lvl: 'Level', trailer: 'Trailer', ranged: 'ranged', others: 'Other monsters',
    charTitle: (c: string, t: string) => `${c}, the ${t.toLowerCase()} — playable monster in Mooonsters`,
    charDesc: (c: string, t: string, p: string) => `Play as ${c} (${t}) in Mooonsters, the free multiplayer monster game in your browser. ${p}`,
    charIntro: (c: string, _t: string) => `${c} is one of the 30 monsters you can pick in Mooonsters. Hunt humans, level up and evolve at levels 5, 10 and 15.`,
    monstersTitle: 'All 30 Mooonsters monsters — abilities and evolutions',
    monstersDesc: 'Vampire, werewolf, mummy, zombie, witch and 25 more monsters. Check their abilities, ultimates and evolutions and play free in your browser.',
    monstersIntro: 'In Mooonsters you pick a classic horror monster and go hunting. Each one has a basic attack, a passive, two abilities (Q and E), an ultimate (R) unlocked at level 10 and three evolutions.',
    mapsTitle: 'Mooonsters maps — horror movie settings',
    mapsDesc: 'Six horror movie settings: suburb, Transylvania, summer camp, swamp, the Nile and a Jurassic jungle. Play free in your browser.',
    mapsIntro: 'Each room uses one of these settings, with its own humans, water, obstacles and dangers. Maps are generated from a seed, so they are never exactly the same.',
    mapTitle: (n: string) => `${n} — Mooonsters map`,
    mapDesc: (n: string, d: string) => `${n}: ${d}`,
    humans: 'Humans you will meet',
  },
};

const HOW: Record<Lang, [string, string][]> = {
  es: [
    ['🎯 Objetivo', 'Eres un monstruo. Caza humanos para ganar experiencia, sube de nivel, evoluciona y consigue la mejor puntuación de la sala. Puedes entrar y salir cuando quieras.'],
    ['⌨️ Controles (PC)', '<b>WASD</b> moverse · <b>ratón</b> apuntar · <b>clic / Espacio</b> atacar · <b>Q</b> (o clic derecho) y <b>E</b> habilidades · <b>R</b> definitiva · <b>1-4</b> mejoras · <b>I</b> ficha del monstruo · <b>G</b> saludar · <b>T</b> provocar · <b>H</b> alianza'],
    ['📱 Controles (móvil)', 'Joystick a la izquierda para moverte. Botones a la derecha: ⚔ ataca, Q, E y R. Arrastra un botón para apuntar y suéltalo para lanzar. Toca las mejoras cuando aparezcan.'],
    ['⬆️ Niveles y evoluciones', 'Cada nivel te da un punto de mejora (vida, fuerza, velocidad o poder). En los niveles <b>5</b>, <b>10</b> y <b>15</b> tu monstruo evoluciona; en el 10 se desbloquea la definitiva <b>R</b>.'],
    ['💥 Definitiva', 'La <b>R</b> se carga con bajas: los humanos dan poco; los Cazadores y otros monstruos, mucho.'],
    ['🏹 Cazadores', 'Los Cazadores te persiguen y pegan fuerte; cuantos más jugadores y más nivel, más aparecen. Derrotarlos da mucha experiencia y monedas.'],
    ['🧪 Objetos', 'Por el mapa hay sangre (vida), velocidad, furia, escudo, monedas y experiencia, además de objetos especiales.'],
    ['🤝 Otros monstruos', 'Puedes cazar a otros jugadores o proponerles una alianza con <b>H</b>… aunque las alianzas se pueden traicionar.'],
    ['🚪 Salas', 'Entras en una sala pública al instante o creas una privada y compartes el enlace con tus amigos. Con tu cuenta de Google guardas monedas, medallas, monstruos y skins.'],
  ],
  en: [
    ['🎯 Goal', 'You are a monster. Hunt humans to gain experience, level up, evolve and get the best score in the room. Join and leave whenever you like.'],
    ['⌨️ Controls (PC)', '<b>WASD</b> move · <b>mouse</b> aim · <b>click / Space</b> attack · <b>Q</b> (or right click) and <b>E</b> abilities · <b>R</b> ultimate · <b>1-4</b> upgrades · <b>I</b> monster info · <b>G</b> wave · <b>T</b> taunt · <b>H</b> alliance'],
    ['📱 Controls (mobile)', 'Joystick on the left to move. Buttons on the right: ⚔ attack, Q, E and R. Drag a button to aim and release to cast. Tap upgrades when they appear.'],
    ['⬆️ Levels and evolutions', 'Each level gives you an upgrade point (health, strength, speed or power). At levels <b>5</b>, <b>10</b> and <b>15</b> your monster evolves; level 10 unlocks the <b>R</b> ultimate.'],
    ['💥 Ultimate', '<b>R</b> charges with kills: humans give a little; Hunters and other monsters, a lot.'],
    ['🏹 Hunters', 'Hunters chase you and hit hard; more players and higher levels bring more of them. Defeating them gives lots of experience and coins.'],
    ['🧪 Items', 'Around the map there is blood (health), speed, fury, shield, coins and experience, plus special items.'],
    ['🤝 Other monsters', 'You can hunt other players or offer them an alliance with <b>H</b>… although alliances can be betrayed.'],
    ['🚪 Rooms', 'Jump into a public room instantly or create a private one and share the link with your friends. Sign in with Google to keep your coins, medals, monsters and skins.'],
  ],
};

const FAQ: Record<Lang, [string, string][]> = {
  es: [
    ['¿Mooonsters es gratis?', 'Sí. Es gratis y no tiene compras con dinero real.'],
    ['¿Hay que descargar algo?', 'No. Se juega en el navegador, en móvil o en PC.'],
    ['¿Puedo jugar con amigos?', 'Sí: crea una sala privada y comparte el enlace.'],
    ['¿Cuántos monstruos hay?', `${IDS.length} monstruos jugables, cada uno con sus habilidades y evoluciones, y 6 mapas.`],
  ],
  en: [
    ['Is Mooonsters free?', 'Yes. It is free and has no real-money purchases.'],
    ['Do I need to download anything?', 'No. It runs in your browser, on phone or PC.'],
    ['Can I play with friends?', 'Yes: create a private room and share the link.'],
    ['How many monsters are there?', `${IDS.length} playable monsters, each with its own abilities and evolutions, and 6 maps.`],
  ],
};

// ---------------------------------------------------------------- datos por idioma
interface CharView { id: CharacterId; name: string; title: string; attack: string; passive: string; q: [string, string]; e: [string, string]; r: [string, string]; evo: [number, string, string][]; def: CharacterDef }
function view(id: CharacterId, lang: Lang): CharView {
  const d = CHARACTERS[id];
  const base: CharView = {
    id, def: d, name: d.name, title: d.title, attack: d.attackName, passive: d.passive,
    q: [d.abilities[0].name, d.abilities[0].desc], e: [d.abilities[1].name, d.abilities[1].desc], r: [d.ult.name, d.ult.desc],
    evo: d.evolution.map((v) => [v.lvl, v.name, v.desc]),
  };
  if (lang === 'es') return base;
  const t = EN.chars[id] ?? {};
  const e5 = t.evo?.[0], e15 = t.evo?.[1];
  return {
    ...base, name: t.name ?? base.name, title: t.title ?? base.title, attack: t.attack ?? base.attack, passive: t.passive ?? base.passive,
    q: t.q ?? base.q, e: t.e ?? base.e, r: t.r ?? base.r,
    evo: [
      [5, e5?.[0] ?? base.evo[0][1], e5?.[1] ?? base.evo[0][2]],
      [10, t.r?.[0] ?? base.evo[1][1], 'Unlocks the R ultimate, which charges with kills.'],
      [15, e15?.[0] ?? base.evo[2][1], e15?.[1] ?? base.evo[2][2]],
    ],
  };
}
const themeName = (id: MapThemeId, lang: Lang) => (lang === 'en' ? EN.themes[id]?.[0] : null) ?? THEMES[id].name;
const themeSub = (id: MapThemeId, lang: Lang) => (lang === 'en' ? EN.themes[id]?.[1] : null) ?? THEMES[id].subtitle;

// slugs únicos por idioma
function slugs(lang: Lang) {
  const used = new Set<string>(); const out = {} as Record<CharacterId, string>;
  for (const id of IDS) { let s = slug(view(id, lang).title); if (used.has(s)) s = `${s}-${slug(view(id, lang).name)}`; used.add(s); out[id] = s; }
  return out;
}
const CSLUG = { es: slugs('es'), en: slugs('en') };
const MSLUG = { es: Object.fromEntries(THEME_IDS.map((m) => [m, slug(THEMES[m].name)])) as Record<MapThemeId, string>, en: Object.fromEntries(THEME_IDS.map((m) => [m, slug(themeName(m, 'en'))])) as Record<MapThemeId, string> };
const charUrl = (id: CharacterId, lang: Lang) => `${T[lang].monstersPath}${CSLUG[lang][id]}/`;
const mapUrl = (m: MapThemeId, lang: Lang) => `${T[lang].mapsPath}${MSLUG[lang][m]}/`;

// ---------------------------------------------------------------- plantilla
const CSS = `
:root{--bg:#0e0a16;--panel:#1a1226;--text:#e8e0f0;--muted:#a89cc0;--gold:#ffd040;--blood:#c01830}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,sans-serif}
a{color:var(--gold)}header,main,footer{max-width:900px;margin:0 auto;padding:16px}
header{display:flex;align-items:center;gap:12px;flex-wrap:wrap}header .brand{display:flex;align-items:center;gap:8px;font-weight:700;color:#f0e0ff;text-decoration:none;font-size:20px}
header .brand img{width:40px;height:40px;image-rendering:pixelated}header nav{display:flex;gap:14px;flex-wrap:wrap;margin-left:auto}header nav a{text-decoration:none;color:var(--muted)}header nav .ig{width:24px;height:20px;vertical-align:-4px;image-rendering:pixelated}
.cta{display:inline-block;background:var(--blood);color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:6px;border:2px solid #ff5060;margin:8px 0}
h1{color:#f0e0ff;line-height:1.2;margin:8px 0}h2{color:var(--gold);font-size:20px;margin-top:28px}.sub{color:var(--muted);margin-top:0}
.hero{display:flex;gap:24px;align-items:center;flex-wrap:wrap}.hero>div{flex:1;min-width:260px}.hero img{width:156px;height:204px;image-rendering:pixelated;background:radial-gradient(#2a1c40,transparent 70%)}
.stats{display:flex;gap:10px;flex-wrap:wrap;padding:0;list-style:none}.stats li{background:var(--panel);padding:6px 10px;border-radius:6px}
.ab{background:var(--panel);border-radius:8px;padding:10px 14px;margin:8px 0}.ab b{color:#f0e0ff}.key{display:inline-block;min-width:26px;text-align:center;background:#2c2040;border-radius:4px;margin-right:6px;font-weight:700;color:var(--gold)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;padding:0;list-style:none}.grid a{display:block;background:var(--panel);border-radius:8px;padding:8px;text-align:center;text-decoration:none;color:var(--text);font-size:14px}
.grid img{width:78px;height:102px;image-rendering:pixelated;display:block;margin:0 auto 4px}.grid small{color:var(--muted);display:block}
video{width:100%;max-width:360px;border-radius:8px;display:block}.crumbs{font-size:14px;color:var(--muted)}footer{color:var(--muted);font-size:14px;border-top:1px solid #2c2040;margin-top:32px}
`;

function page(lang: Lang, o: { path: string; alt?: string; title: string; desc: string; image?: string; body: string; ld?: object[] }) {
  const t = T[lang];
  const img = o.image ?? '/img/og-mooonsters.png';
  const ld = (o.ld ?? []).map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n');
  const alt = o.alt ? `<link rel="alternate" hreflang="${lang}" href="${SITE}${o.path}" />\n<link rel="alternate" hreflang="${lang === 'es' ? 'en' : 'es'}" href="${SITE}${o.alt}" />` : '';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}" />
<link rel="canonical" href="${SITE}${o.path}" />
${alt}
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Mooonsters" />
<meta property="og:title" content="${esc(o.title)}" />
<meta property="og:description" content="${esc(o.desc)}" />
<meta property="og:url" content="${SITE}${o.path}" />
<meta property="og:image" content="${SITE}${img}" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" type="image/png" sizes="64x64" href="/favicon.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<style>${CSS}</style>
${ld}
</head>
<body>
<header>
  <a class="brand" href="${t.home}"><img src="/favicon.png" alt="" />Mooonsters</a>
  <nav><a href="${t.monstersPath}">${t.monsters}</a><a href="${t.mapsPath}">${t.maps}</a><a href="${t.howPath}">${t.how}</a><a href="${o.alt ?? (lang === 'es' ? '/en/' : '/')}" hreflang="${lang === 'es' ? 'en' : 'es'}">${t.other}</a><a href="${INSTAGRAM}" rel="me" title="Instagram @mooonsters.game"><img class="ig" src="/img/ig.svg" alt="Instagram" width="24" height="20" /></a></nav>
</header>
<main>
${o.body}
</main>
<footer>
  <p>${t.footer} <a href="/">mooonsters.com</a> · <a href="${INSTAGRAM}" rel="me">Instagram</a> · <a href="/privacidad.html">${t.privacy}</a> · <a href="/condiciones.html">${t.terms}</a></p>
</footer>
</body>
</html>
`;
}

const crumbs = (lang: Lang, items: [string, string][]) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + path })),
});
const crumbHtml = (items: [string, string][]) => `<p class="crumbs">${items.map(([n, p], i) => (i < items.length - 1 ? `<a href="${p}">${esc(n)}</a>` : esc(n))).join(' › ')}</p>`;
const video = (file: string, poster: string, name: string, desc: string) => ({
  '@context': 'https://schema.org', '@type': 'VideoObject', name, description: desc, thumbnailUrl: SITE + poster,
  contentUrl: `${SITE}/media/${file}`, uploadDate: '2026-10-08', publisher: { '@type': 'Organization', name: 'Mooonsters', url: SITE },
});

const files: Record<string, string> = {};
const sitemap: { path: string; alt?: string; lang: Lang }[] = [];
function emit(lang: Lang, path: string, html: string, alt?: string) {
  files[path.replace(/^\//, '') + 'index.html'] = html;
  sitemap.push({ path, alt, lang });
}

// ---------------------------------------------------------------- páginas
for (const lang of ['es', 'en'] as Lang[]) {
  const t = T[lang], other: Lang = lang === 'es' ? 'en' : 'es';
  const grid = (ids: CharacterId[]) => `<ul class="grid">${ids.map((id) => { const v = view(id, lang); return `<li><a href="${charUrl(id, lang)}"><img src="/img/monstruos/${id}.png" alt="${esc(v.name)}" loading="lazy" width="78" height="102" />${esc(v.name)}<small>${esc(v.title)}</small></a></li>`; }).join('')}</ul>`;

  // monstruos
  for (const id of IDS) {
    const v = view(id, lang), d = v.def, path = charUrl(id, lang);
    const cr: [string, string][] = [['Mooonsters', t.home], [t.monsters, t.monstersPath], [v.name, path]];
    const trailer = TRAILER_CHAR[id];
    const desc = t.charDesc(v.name, v.title, strip(v.passive));
    const body = `${crumbHtml(cr)}
<div class="hero"><img src="/img/monstruos/${id}.png" alt="${esc(`${v.name} (${v.title})`)}" width="156" height="204" />
<div><h1>${esc(v.name)}</h1><p class="sub">${esc(v.title)} · ${ROLE[lang][d.role ?? 'hybrid']}</p>
<p>${esc(t.charIntro(v.name, v.title))}</p><a class="cta" href="/">${t.play}</a></div></div>
<ul class="stats"><li>${t.hp}: <b>${d.hp}</b></li><li>${t.speed}: <b>${d.speed}</b></li><li>${t.armor}: <b>${Math.round(d.armor * 100)} %</b></li><li>${t.cls}: <b>${ROLE[lang][d.role ?? 'hybrid']}</b></li></ul>
<h2>${t.abilities}</h2>
<div class="ab"><span class="key">⚔</span><b>${t.basic}: ${esc(v.attack)}</b>${d.rangedBasic ? ` (${t.ranged})` : ''}</div>
<div class="ab"><span class="key">✦</span><b>${t.passive}</b> — ${esc(v.passive)}</div>
<div class="ab"><span class="key">Q</span><b>${esc(v.q[0])}</b> — ${esc(v.q[1])}</div>
<div class="ab"><span class="key">E</span><b>${esc(v.e[0])}</b> — ${esc(v.e[1])}</div>
<div class="ab"><span class="key">R</span><b>${t.ult}: ${esc(v.r[0])}</b> — ${esc(v.r[1])}</div>
<h2>${t.evo}</h2>
${v.evo.map(([l, n, ds]) => `<div class="ab"><span class="key">${l}</span><b>${esc(n)}</b> — ${esc(ds)}</div>`).join('\n')}
${trailer ? `<h2>${t.trailer}</h2><video controls preload="none" playsinline poster="/img/trailers/${trailer.replace('.mp4', '.jpg')}" src="/media/${trailer}"></video>` : ''}
<h2>${t.others}</h2>
${grid(IDS.filter((x) => x !== id))}`;
    const ld: object[] = [crumbs(lang, cr)];
    if (trailer) ld.push(video(trailer, `/img/trailers/${trailer.replace('.mp4', '.jpg')}`, `${v.name} — Mooonsters`, desc));
    emit(lang, path, page(lang, { path, alt: charUrl(id, other), title: t.charTitle(v.name, v.title), desc, image: undefined, body, ld }), charUrl(id, other));
  }

  // índice de monstruos
  {
    const path = t.monstersPath, cr: [string, string][] = [['Mooonsters', t.home], [t.monsters, path]];
    const body = `${crumbHtml(cr)}<h1>${t.monsters}</h1><p>${t.monstersIntro}</p><a class="cta" href="/">${t.play}</a>${grid(IDS)}`;
    const list = { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: IDS.map((id, i) => ({ '@type': 'ListItem', position: i + 1, name: view(id, lang).name, url: SITE + charUrl(id, lang) })) };
    emit(lang, path, page(lang, { path, alt: T[other].monstersPath, title: t.monstersTitle, desc: t.monstersDesc, body, ld: [crumbs(lang, cr), list] }), T[other].monstersPath);
  }

  // mapas
  const mapCard = (m: MapThemeId) => `<div class="ab"><h2 style="margin:4px 0"><a href="${mapUrl(m, lang)}">${esc(themeName(m, lang))}</a></h2><p class="sub">${esc(themeSub(m, lang))}</p><p>${esc(MAPDESC[lang][m])}</p></div>`;
  for (const m of THEME_IDS) {
    const path = mapUrl(m, lang), name = themeName(m, lang);
    const cr: [string, string][] = [['Mooonsters', t.home], [t.maps, t.mapsPath], [name, path]];
    const trailer = TRAILER_MAP[m];
    const body = `${crumbHtml(cr)}<h1>${esc(name)}</h1><p class="sub">${esc(themeSub(m, lang))}</p><p>${esc(MAPDESC[lang][m])}</p><a class="cta" href="/">${t.play}</a>
${trailer ? `<h2>${t.trailer}</h2><video controls preload="none" playsinline poster="/img/trailers/${trailer.replace('.mp4', '.jpg')}" src="/media/${trailer}"></video>` : ''}
<h2>${t.maps}</h2>${THEME_IDS.filter((x) => x !== m).map(mapCard).join('')}
<h2>${t.monsters}</h2>${grid(IDS.slice(0, 12))}<p><a href="${t.monstersPath}">${t.monsters} →</a></p>`;
    const ld: object[] = [crumbs(lang, cr)];
    if (trailer) ld.push(video(trailer, `/img/trailers/${trailer.replace('.mp4', '.jpg')}`, `${name} — Mooonsters`, MAPDESC[lang][m]));
    emit(lang, path, page(lang, { path, alt: mapUrl(m, other), title: t.mapTitle(name), desc: t.mapDesc(name, MAPDESC[lang][m]), body, ld }), mapUrl(m, other));
  }
  {
    const path = t.mapsPath, cr: [string, string][] = [['Mooonsters', t.home], [t.maps, path]];
    const body = `${crumbHtml(cr)}<h1>${t.maps}</h1><p>${t.mapsIntro}</p><a class="cta" href="/">${t.play}</a>${THEME_IDS.map(mapCard).join('')}`;
    emit(lang, path, page(lang, { path, alt: T[other].mapsPath, title: t.mapsTitle, desc: t.mapsDesc, body, ld: [crumbs(lang, cr)] }), T[other].mapsPath);
  }

  // cómo jugar (+ preguntas frecuentes)
  {
    const path = t.howPath, cr: [string, string][] = [['Mooonsters', t.home], [t.how, path]];
    const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ[lang].map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
    const body = `${crumbHtml(cr)}<h1>${t.how}</h1><p>${t.tagline}.</p><a class="cta" href="/">${t.play}</a>
${HOW[lang].map(([h, p]) => `<h2>${h}</h2><p>${p}</p>`).join('\n')}
<h2>FAQ</h2>${FAQ[lang].map(([q, a]) => `<div class="ab"><b>${esc(q)}</b><br />${esc(a)}</div>`).join('')}`;
    emit(lang, path, page(lang, { path, alt: T[other].howPath, title: lang === 'es' ? 'Cómo se juega a Mooonsters — controles, niveles y evoluciones' : 'How to play Mooonsters — controls, levels and evolutions', desc: strip(HOW[lang][0][1]), body, ld: [crumbs(lang, cr), faq] }), T[other].howPath);
  }
}

// portada en inglés (la de castellano es el propio juego)
{
  const body = `<div class="hero"><img src="/img/monstruos/vampire.png" alt="The Count" width="156" height="204" /><div>
<h1>Mooonsters — free multiplayer monster game</h1>
<p>Pick one of ${IDS.length} classic horror monsters — vampire, werewolf, mummy, zombie, witch and many more — hunt humans, level up, evolve and rule the night. Watch out for the Hunters: they hit hard… but pay well.</p>
<a class="cta" href="/">▶ Play free now</a><p class="sub">Phone and PC · No downloads · Online multiplayer · 7 languages</p></div></div>
<img src="/img/og-mooonsters.png" alt="Mooonsters" style="width:100%;border-radius:8px" />
<h2>Monsters</h2><p>Every monster has a basic attack, a passive, two abilities, an ultimate and three evolutions. <a href="/en/monsters/">See all ${IDS.length} monsters →</a></p>
<h2>Maps</h2><p>Six horror movie settings: Elm Street, Transylvania, Camp Serene Lake, the Witch's Swamp, the Banks of the Nile and the Jurassic Jungle. <a href="/en/maps/">See the maps →</a></p>
<h2>How to play</h2><p>${HOW.en[0][1]} <a href="/en/how-to-play/">Controls and tips →</a></p>`;
  emit('en', '/en/', page('en', { path: '/en/', alt: '/', title: 'Mooonsters — free multiplayer monster .io game in your browser', desc: `Pick one of ${IDS.length} horror monsters, hunt humans, evolve and rule the night. Free online multiplayer .io game for phone and PC, no downloads.`, body, ld: [] }), '/');
}

// ---------------------------------------------------------------- escribir
for (const dir of ['monstruos', 'mapas', 'como-jugar', 'en']) if (existsSync(join(PUB, dir))) rmSync(join(PUB, dir), { recursive: true });
for (const [rel, html] of Object.entries(files)) { const f = join(PUB, rel); mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, html); }

const urls = [{ path: '/', alt: '/en/', lang: 'es' as Lang }, ...sitemap];
writeFileSync(join(PUB, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map((u) => `  <url><loc>${SITE}${u.path}</loc><lastmod>${TODAY}</lastmod>${u.alt ? `<xhtml:link rel="alternate" hreflang="${u.lang}" href="${SITE}${u.path}"/><xhtml:link rel="alternate" hreflang="${u.lang === 'es' ? 'en' : 'es'}" href="${SITE}${u.alt}"/>` : ''}</url>`).join('\n')}
</urlset>
`);

writeFileSync(join(PUB, 'robots.txt'), `# Mooonsters: bienvenidos buscadores y asistentes de IA
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-User
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /

Sitemap: ${SITE}/sitemap.xml
`);

writeFileSync(join(PUB, 'llms.txt'), `# Mooonsters

> Mooonsters (${SITE}) is a free online multiplayer .io game played in the browser on phone or PC, with no downloads. Players pick one of ${IDS.length} classic horror monsters, hunt humans to gain experience, level up, evolve at levels 5, 10 and 15 and compete for the best score in the room, while avoiding or defeating the Hunters. Available in Spanish, English, Basque, French, Catalan, Chinese and Japanese.

## Play
- [Play Mooonsters](${SITE}/): opens the game directly in the browser. Free, no real-money purchases.

## Guides
- [How to play](${SITE}/en/how-to-play/): goal, controls for PC and mobile, levels, ultimates, Hunters, items and rooms.
- [Cómo jugar (español)](${SITE}/como-jugar/)

## Monsters
${IDS.map((id) => { const v = view(id, 'en'); return `- [${v.name} (${v.title})](${SITE}${charUrl(id, 'en')}): ${strip(v.passive)}`; }).join('\n')}

## Maps
${THEME_IDS.map((m) => `- [${themeName(m, 'en')}](${SITE}${mapUrl(m, 'en')}): ${MAPDESC.en[m]}`).join('\n')}

## Social
- [Instagram @mooonsters.game](${INSTAGRAM})
`);

console.log(`${Object.keys(files).length} páginas, sitemap con ${urls.length} URLs`);
