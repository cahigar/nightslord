// Publicador de Instagram para Mooonsters (API Graph de Meta, sin dependencias).
//
// Uso (desde el VPS, mejor a través de publicar.sh):
//   node publicar.mjs comprobar      → valida token, cuenta y vídeos; no publica nada
//   node publicar.mjs                → publica lo que toque según calendario.json (lo lanza el cron)
//   node publicar.mjs probar <id>    → prepara el vídeo en Instagram sin publicarlo
//   node publicar.mjs ahora <id>     → publica esa entrada ya, sin esperar a su fecha
//   node publicar.mjs todos          → publica de golpe, en orden, todo lo que ya toca
//   node publicar.mjs estado         → lista qué se ha publicado y qué queda
//
// Variables (deploy/.env): IG_USER_ID, FB_PAGE_ID, META_APP_ID, META_APP_SECRET, IG_TOKEN, DOMAIN
// Los vídeos van en social/media/ y Caddy los sirve en https://DOMAIN/media/<archivo>,
// que es desde donde Instagram los descarga.

import { readFileSync, writeFileSync, existsSync, statSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const CAL = join(DIR, 'calendario.json');
const STATE = join(DIR, 'estado.json');
const MEDIA = join(DIR, 'media');
const API = process.env.GRAPH_API || `https://graph.facebook.com/${process.env.GRAPH_VERSION || 'v26.0'}`;

const env = (k) => {
  const v = (process.env[k] || '').trim();
  if (!v) throw new Error(`Falta ${k} en deploy/.env`);
  return v;
};

const log = (...a) => console.log(new Date().toISOString(), ...a);

function loadState() {
  if (!existsSync(STATE)) return { publicados: {}, fallos: {} };
  return JSON.parse(readFileSync(STATE, 'utf8'));
}
function saveState(s) {
  writeFileSync(STATE, JSON.stringify(s, null, 2));
  try { chmodSync(STATE, 0o600); } catch {}
}

async function graph(method, path, params = {}, token) {
  const url = new URL(path.startsWith('http') ? path : `${API}/${path}`);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    (method === 'GET' ? url.searchParams : body).set(k, String(v));
  }
  if (token) (method === 'GET' ? url.searchParams : body).set('access_token', token);
  const res = await fetch(url, method === 'GET' ? {} : { method, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error || {};
    const err = new Error(`${e.message || res.statusText} (código ${e.code ?? res.status}${e.error_subcode ? '/' + e.error_subcode : ''})`);
    err.code = e.code;
    throw err;
  }
  return data;
}

// Token de página: si se saca de un token de usuario de larga duración, no caduca.
async function pageToken(state, { refrescar = false } = {}) {
  if (state.pageToken && !refrescar) return state.pageToken;
  const d = await graph('GET', env('FB_PAGE_ID'), { fields: 'access_token,name' }, env('IG_TOKEN'));
  state.pageToken = d.access_token;
  saveState(state);
  log(`Token de página obtenido para «${d.name}».`);
  return state.pageToken;
}

// Llama a la API con el token de página; si caducó, lo regenera una vez.
async function ig(state, method, path, params) {
  try {
    return await graph(method, path, params, await pageToken(state));
  } catch (e) {
    if (e.code !== 190) throw e;
    log('Token de página no válido; lo regenero a partir de IG_TOKEN.');
    return graph(method, path, params, await pageToken(state, { refrescar: true }));
  }
}

function loadCalendar() {
  const cal = JSON.parse(readFileSync(CAL, 'utf8'));
  const ids = new Set();
  for (const e of cal) {
    if (!e.id || ids.has(e.id)) throw new Error(`Entrada sin id o id repetido: ${e.id}`);
    ids.add(e.id);
    if (!['reel', 'historia', 'imagen'].includes(e.tipo)) throw new Error(`${e.id}: tipo debe ser «reel», «imagen» o «historia»`);
    if (Number.isNaN(Date.parse(e.fecha))) throw new Error(`${e.id}: fecha no válida (${e.fecha})`);
  }
  return cal;
}

function mediaUrl(archivo) {
  return `https://${env('DOMAIN')}/media/${encodeURIComponent(archivo)}`;
}

async function esperarContenedor(state, id) {
  const fin = Date.now() + 15 * 60_000;
  while (Date.now() < fin) {
    const d = await ig(state, 'GET', id, { fields: 'status_code,status' });
    if (d.status_code === 'FINISHED') return;
    if (d.status_code === 'ERROR' || d.status_code === 'EXPIRED') {
      throw new Error(`Instagram rechazó el vídeo: ${d.status || d.status_code}`);
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error('El vídeo tardó más de 15 minutos en procesarse');
}

async function crearContenedor(state, tipo, e) {
  const esImagen = /\.jpe?g$/i.test(e.archivo);
  const params = esImagen ? { image_url: mediaUrl(e.archivo) } : { video_url: mediaUrl(e.archivo) };
  if (tipo === 'imagen') {
    if (!esImagen) throw new Error(`${e.id}: las imágenes tienen que ser .jpg`);
    params.caption = e.texto || '';
  } else if (tipo === 'reel') {
    Object.assign(params, {
      media_type: 'REELS',
      caption: e.texto || '',
      share_to_feed: true,
      thumb_offset: e.portada_ms ?? 1500,
    });
  } else {
    params.media_type = 'STORIES';
  }
  const { id } = await ig(state, 'POST', `${env('IG_USER_ID')}/media`, params);
  await esperarContenedor(state, id);
  return id;
}

async function publicarUno(state, tipo, e) {
  const contenedor = await crearContenedor(state, tipo, e);
  const { id } = await ig(state, 'POST', `${env('IG_USER_ID')}/media_publish`, { creation_id: contenedor });
  let enlace = '';
  try { enlace = (await ig(state, 'GET', id, { fields: 'permalink' })).permalink || ''; } catch {}
  return { id, enlace };
}

async function publicarEntrada(state, e) {
  const hecho = state.publicados[e.id] || {};
  if (!hecho.principal) {
    log(`Publicando ${e.tipo} «${e.id}» (${e.archivo})…`);
    hecho.principal = { ...(await publicarUno(state, e.tipo, e)), cuando: new Date().toISOString() };
    state.publicados[e.id] = hecho;
    saveState(state);
    log(`  ✔ publicado (${e.tipo}) ${hecho.principal.enlace}`);
  }
  if ((e.tipo === 'reel' || e.tipo === 'imagen') && e.historia && !hecho.historia) {
    log(`Publicando historia de «${e.id}»…`);
    hecho.historia = { ...(await publicarUno(state, 'historia', e)), cuando: new Date().toISOString() };
    state.publicados[e.id] = hecho;
    saveState(state);
    log('  ✔ historia publicada');
  }
  delete state.fallos[e.id];
  saveState(state);
}

function completa(state, e) {
  const h = state.publicados[e.id];
  return !!(h && h.principal && (!e.historia || e.tipo === 'historia' || h.historia));
}

async function comprobar(state) {
  const appToken = `${env('META_APP_ID')}|${env('META_APP_SECRET')}`;
  const dbg = (await graph('GET', 'debug_token', { input_token: env('IG_TOKEN') }, appToken)).data;
  if (!dbg.is_valid) throw new Error('IG_TOKEN no es válido: genera uno nuevo en el Explorador de la API Graph');
  const caduca = dbg.expires_at ? new Date(dbg.expires_at * 1000) : null;
  log(`IG_TOKEN válido. Caduca: ${caduca ? caduca.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : 'nunca'}.`);
  if (caduca && caduca - Date.now() < 24 * 3600_000) {
    log('  ⚠ Es el token corto (1 hora). Extiéndelo en el depurador de tokens y cámbialo en .env.');
  }
  const pt = await pageToken(state, { refrescar: true });
  const pdbg = (await graph('GET', 'debug_token', { input_token: pt }, appToken)).data;
  log(`Token de página: ${pdbg.expires_at ? 'caduca ' + new Date(pdbg.expires_at * 1000).toISOString() : 'no caduca ✔'}.`);
  const cuenta = await ig(state, 'GET', env('IG_USER_ID'), { fields: 'username,followers_count,media_count' });
  log(`Cuenta: @${cuenta.username} · ${cuenta.followers_count} seguidores · ${cuenta.media_count} publicaciones.`);
  const lim = await ig(state, 'GET', `${env('IG_USER_ID')}/content_publishing_limit`, { fields: 'quota_usage,config' });
  const q = lim.data?.[0];
  if (q) log(`Cupo de publicación: ${q.quota_usage}/${q.config?.quota_total ?? 50} en 24 h.`);

  let ok = true;
  for (const e of loadCalendar()) {
    const local = join(MEDIA, e.archivo);
    if (!existsSync(local)) { log(`  ✘ Falta social/media/${e.archivo} (${e.id})`); ok = false; continue; }
    const r = await fetch(mediaUrl(e.archivo), { method: 'HEAD' }).catch(() => null);
    if (!r || !r.ok) { log(`  ✘ ${mediaUrl(e.archivo)} no responde (${r?.status ?? 'sin conexión'})`); ok = false; continue; }
    const mb = (statSync(local).size / 1e6).toFixed(1);
    log(`  ✔ ${e.id}: ${e.archivo} (${mb} MB) · ${completa(state, e) ? 'ya publicado' : 'pendiente ' + e.fecha}`);
  }
  log(ok ? 'Todo listo.' : 'Hay vídeos que faltan: súbelos a /opt/nightslord/social/media/.');
}

async function main() {
  const [cmd = 'publicar', arg] = process.argv.slice(2);
  const state = loadState();
  state.fallos ||= {};
  const cal = loadCalendar();
  const buscar = (id) => cal.find((e) => e.id === id) || (() => { throw new Error(`No hay entrada «${id}»`); })();

  if (cmd === 'comprobar') return comprobar(state);

  if (cmd === 'estado') {
    for (const e of cal) {
      const h = state.publicados[e.id];
      const f = state.fallos[e.id];
      console.log(`${completa(state, e) ? '✔' : f ? '✘' : '·'} ${e.fecha}  ${e.id}  ${h?.principal?.enlace || ''}${f ? '  fallo: ' + f.error : ''}`);
    }
    return;
  }

  if (cmd === 'probar') {
    const e = buscar(arg);
    log(`Preparando «${e.id}» sin publicar…`);
    await crearContenedor(state, e.tipo, e);
    log('✔ Instagram aceptó el vídeo. No se ha publicado nada.');
    return;
  }

  if (cmd === 'ahora') return publicarEntrada(state, buscar(arg));

  if (cmd === 'todos') {
    const lista = cal
      .filter((e) => Date.parse(e.fecha) <= Date.now() && !completa(state, e))
      .sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha));
    log(`${lista.length} entradas pendientes.`);
    for (const e of lista) {
      try { await publicarEntrada(state, e); }
      catch (err) { log(`  ✘ «${e.id}» falló: ${err.message}. Paro aquí para no desordenar el feed.`); process.exitCode = 1; return; }
    }
    log('Hecho.');
    return;
  }

  if (cmd !== 'publicar') throw new Error(`Orden desconocida: ${cmd}`);

  const ahora = Date.now();
  const pendientes = cal
    .filter((e) => Date.parse(e.fecha) <= ahora && !completa(state, e))
    .filter((e) => (state.fallos[e.id]?.intentos || 0) < 3)
    .sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha));
  if (!pendientes.length) return;

  // Como mucho una entrada por ejecución: si el servidor estuvo apagado, no suelta varias de golpe.
  const e = pendientes[0];
  try {
    await publicarEntrada(state, e);
  } catch (err) {
    const f = state.fallos[e.id] || { intentos: 0 };
    f.intentos += 1;
    f.error = err.message;
    state.fallos[e.id] = f;
    saveState(state);
    log(`  ✘ «${e.id}» falló (intento ${f.intentos}/3): ${err.message}`);
    process.exitCode = 1;
  }
}

main().catch((e) => { log('✘', e.message); process.exitCode = 1; });
