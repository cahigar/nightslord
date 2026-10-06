// Idiomas: castellano (base), euskera, inglés, francés, catalán, chino y japonés.
// Los textos de la interfaz usan claves; los de cada monstruo y medalla se traducen aparte
// (si falta una traducción se usa el castellano de shared/).
import { CHARACTERS, UPGRADES, type CharacterId } from '../shared/characters';
import { MEDAL_BY_ID } from '../shared/catalog';
import { THEMES, type MapThemeId } from '../shared/maps';
import { ES, type Dict } from './lang/es';
import { EN } from './lang/en';
import { EU } from './lang/eu';
import { FR } from './lang/fr';
import { CA } from './lang/ca';
import { ZH } from './lang/zh';
import { JA } from './lang/ja';

export type Lang = 'es' | 'eu' | 'en' | 'fr' | 'ca' | 'zh' | 'ja';
const DICTS: Record<Lang, Dict> = { es: ES, eu: EU, en: EN, fr: FR, ca: CA, zh: ZH, ja: JA };

/** Banderitas en pixel art (cada letra es un color). */
const FLAGS: Record<Lang, { art: string[]; pal: Record<string, string>; name: string }> = {
  es: { name: 'Español', art: ['rrrrrrrrr', 'yyyyyyyyy', 'yyyyyyyyy', 'yyyyyyyyy', 'yyyyyyyyy', 'rrrrrrrrr'], pal: { r: '#c60b1e', y: '#ffc400' } },
  eu: { name: 'Euskara', art: ['gwrrwrrwg', 'rgwrwrwgr', 'wwwgwgwww', 'wwwgwgwww', 'rgwrwrwgr', 'gwrrwrrwg'], pal: { r: '#d52b1e', g: '#009b48', w: '#ffffff' } },
  en: { name: 'English', art: ['rbbwrwbbr', 'bbbwrwbbb', 'wwwwrwwww', 'rrrrrrrrr', 'bbbwrwbbb', 'rbbwrwbbr'], pal: { b: '#012169', w: '#ffffff', r: '#c8102e' } },
  fr: { name: 'Français', art: ['bbbwwwrrr', 'bbbwwwrrr', 'bbbwwwrrr', 'bbbwwwrrr', 'bbbwwwrrr', 'bbbwwwrrr'], pal: { b: '#0055a4', w: '#ffffff', r: '#ef4135' } },
  ca: { name: 'Català', art: ['yyyyyyyyy', 'rrrrrrrrr', 'yyyyyyyyy', 'rrrrrrrrr', 'yyyyyyyyy', 'rrrrrrrrr'], pal: { y: '#fcdd09', r: '#da121a' } },
  zh: { name: '中文', art: ['ryrrrrrrr', 'yyyrryrrr', 'ryrrrrrrr', 'rrrryrrrr', 'rrrrrrrrr', 'rrrrrrrrr'], pal: { r: '#de2910', y: '#ffde00' } },
  ja: { name: '日本語', art: ['wwwwwwwww', 'wwwrrrwww', 'wwrrrrrww', 'wwrrrrrww', 'wwwrrrwww', 'wwwwwwwww'], pal: { w: '#ffffff', r: '#bc002d' } },
};
export const LANGS = Object.keys(FLAGS) as Lang[];

function detect(): Lang {
  try { const s = localStorage.getItem('nl_lang') as Lang | null; if (s && s in DICTS) return s; } catch { /* */ }
  const n = (navigator.language || 'es').toLowerCase();
  if (n.startsWith('eu')) return 'eu';
  if (n.startsWith('ca')) return 'ca';
  if (n.startsWith('fr')) return 'fr';
  if (n.startsWith('zh')) return 'zh';
  if (n.startsWith('ja')) return 'ja';
  if (n.startsWith('es')) return 'es';
  return 'en';
}

export let lang: Lang = detect();
let dict: Dict = DICTS[lang];
const listeners: (() => void)[] = [];

export function setLang(l: Lang) {
  lang = l; dict = DICTS[l];
  try { localStorage.setItem('nl_lang', l); } catch { /* */ }
  document.documentElement.lang = l;
  applyStatic();
  for (const f of listeners) f();
}
export const onLangChange = (f: () => void) => listeners.push(f);

/** Texto de la interfaz. {x} se sustituye por vars.x. */
export function t(key: keyof Dict['ui'], vars: Record<string, string | number> = {}): string {
  const s = dict.ui[key] ?? ES.ui[key] ?? String(key);
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
/** Clave de un mensaje del servidor (si existe). */
export function tk(key: string, vars: Record<string, string | number> = {}): string | null {
  return key in ES.ui ? t(key as keyof Dict['ui'], vars) : null;
}

/** Nombres y palabras sueltas que llegan del servidor en castellano (cazadores, "la noche", "el fuego"...). */
export function tw(word: string): string {
  return dict.words?.[word] ?? word;
}

/** Estado (buff) en el HUD. */
export const tb = (k: string) => dict.buffs[k] ?? ES.buffs[k] ?? k;
/** Texto flotante al recoger un objeto. */
export const tpu = (k: string) => dict.pu[k] ?? ES.pu[k] ?? '+';
/** Frase de alianza (H) de cada monstruo. */
export const tally = (c: string) => dict.ally?.[c as CharacterId] ?? ES.ally?.[c as CharacterId] ?? '🤝';
/** Rótulo de un cazador sobre su cabeza. */
export const th = (k: string) => dict.hunters[k] ?? ES.hunters[k] ?? k.toUpperCase();

export interface CharText { name: string; title: string; attack: string; passive: string; q: [string, string]; e: [string, string]; r: [string, string]; evo: [string, string][]; taunt?: string }
/** Textos de un monstruo en el idioma actual. */
export function tc(id: CharacterId): CharText {
  const d = CHARACTERS[id];
  const base: CharText = {
    name: d.name, title: d.title, attack: d.attackName, passive: d.passive,
    q: [d.abilities[0].name, d.abilities[0].desc], e: [d.abilities[1].name, d.abilities[1].desc], r: [d.ult.name, d.ult.desc],
    evo: d.evolution.map((ev) => [ev.name, ev.desc] as [string, string]), taunt: ES.chars[id]?.taunt,
  };
  const tr = dict.chars[id];
  const out = { ...base, ...(tr ?? {}) } as CharText;
  // las traducciones solo traen las evoluciones de nivel 5 y 15: la de nivel 10 es siempre «desbloquea la R»
  if (tr?.evo && tr.evo.length === 2) out.evo = [tr.evo[0], [out.r[0], t('evoUlt')], tr.evo[1]];
  return out;
}

export function tm(id: string): { name: string; desc: string } {
  const m = MEDAL_BY_ID[id];
  if (!m) return { name: id, desc: '' };
  const tr = dict.medals[id];
  if (id.startsWith('char:')) return { name: tr?.[0] ?? m.name, desc: t('charMedalDesc') };
  return { name: tr?.[0] ?? m.name, desc: tr?.[1] ?? m.desc };
}

export function tu(id: string): { name: string; desc: string } {
  const u = UPGRADES.find((x) => x.id === id)!;
  const tr = dict.upgrades[id];
  return { name: tr?.[0] ?? u.name, desc: tr?.[1] ?? u.desc };
}

export function tt(id: MapThemeId): { name: string; subtitle: string } {
  const th = THEMES[id], tr = dict.themes[id];
  return { name: tr?.[0] ?? th.name, subtitle: tr?.[1] ?? th.subtitle };
}

/** Aplica las traducciones a los textos fijos del HTML (data-i18n, data-i18n-html, data-i18n-ph, data-i18n-title). */
export function applyStatic() {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n as keyof Dict['ui']); });
  document.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml as keyof Dict['ui']); });
  document.querySelectorAll<HTMLInputElement>('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh as keyof Dict['ui']); });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle as keyof Dict['ui']); });
  document.title = t('docTitle');
}

/** Selector de idioma con banderitas pixeladas. */
export function buildLangPicker(container: HTMLElement) {
  container.innerHTML = '';
  for (const l of LANGS) {
    const f = FLAGS[l];
    const cv = document.createElement('canvas');
    cv.width = f.art[0].length; cv.height = f.art.length;
    const c = cv.getContext('2d')!;
    f.art.forEach((row, y) => [...row].forEach((ch, x) => { c.fillStyle = f.pal[ch]; c.fillRect(x, y, 1, 1); }));
    const b = document.createElement('button');
    b.className = `flag${l === lang ? ' sel' : ''}`;
    b.title = f.name;
    b.appendChild(cv);
    b.onclick = () => { setLang(l); buildLangPicker(container); };
    container.appendChild(b);
  }
}
