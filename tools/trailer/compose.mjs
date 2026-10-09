// Monta el trailer final (1080×1920, 30 fps, ~29 s) a partir de la grabación, sus marcas y la música.
// Uso: node tools/trailer/compose.mjs <werewolf|kthula|doppy> <carpeta de grabación> <salida.mp4>
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { renderCards } from './cards.mjs';

const [char, dir = '/tmp/tr', out = `/tmp/tr/trailer-${char}.mp4`] = process.argv.slice(2);
const MUSIC = process.env.MUSIC || `${dir}/music.webm`;
const INTRO = 2.4, END = 5.6;

const C = {
  werewolf: {
    name: 'AULLADOR', title: 'HOMBRE LOBO', accent: '#8fb4ff',
    segments: [
      { take: 'basic', off: 1.6, len: 2.6, title: 'ZARPAZO', sub: 'CAZA EN TRANSILVANIA', card: { key: 'P', name: 'ZARPAZO AMPLIO', desc: 'Pasiva: golpea a varios a la vez' } },
      { take: 'q', off: 0.5, len: 2.4, title: 'EMBESTIDA', sub: 'NADIE SE LE ESCAPA', card: { key: 'Q', name: 'EMBESTIDA', desc: 'Carga y arrolla todo a su paso' } },
      { take: 'e', off: 1.0, len: 2.6, title: 'AULLIDO', sub: 'EL MIEDO LOS PARALIZA', card: { key: 'E', name: 'AULLIDO', desc: '+30 % de daño y +20 % de velocidad' } },
      { take: 'evo5', off: 0.7, len: 2.4, title: 'EVOLUCIONA' },
      { take: 'evo15', off: 1.3, len: 2.4, title: 'EVOLUCIONA', sub: 'NIVELES 5 · 10 · 15' },
      { take: 'r', off: 0.3, len: 2.8, title: 'LUNA LLENA', sub: 'MODO BESTIA', card: { key: 'R', name: 'LUNA LLENA', desc: 'Más grande, más rápido… y cada baja alarga la luna' } },
      { take: 'hunter', off: 0.0, len: 2.8, title: 'CAZA AL CAZADOR', sub: 'QUE TRAIGAN BALAS DE PLATA' },
    ],
  },
  kthula: {
    name: "K'THULA", title: 'HORROR ABISAL', accent: '#5fe0a8',
    segments: [
      { take: 'basic', off: 1.2, len: 2.6, title: 'TENTÁCULO', sub: 'ALGO SALE DEL PANTANO', card: { key: 'P', name: 'HIJO DEL ABISMO', desc: 'Pasiva: en el agua es más rápido y dispara chorros' } },
      { take: 'q', off: 0.4, len: 2.4, title: 'TENTÁCULO ABISAL', sub: 'TE ARRASTRA AL FONDO', card: { key: 'Q', name: 'TENTÁCULO ABISAL', desc: 'Surge del suelo y arrastra hacia el centro' } },
      { take: 'e', off: 0.5, len: 2.2, title: 'SUMERGIRSE', sub: 'NADIE LO VE VENIR', card: { key: 'E', name: 'SUMERGIRSE', desc: 'Bucea muy rápido y no se le puede golpear' } },
      { take: 'evo5', off: 0.7, len: 2.2, title: 'EVOLUCIONA' },
      { take: 'evo15', off: 1.3, len: 2.2, title: 'EVOLUCIONA', sub: 'NIVELES 5 · 10 · 15' },
      { take: 'r', off: 0.3, len: 2.8, title: 'MAREJADA ABISAL', sub: 'QUE SUBA LA MAREA', card: { key: 'R', name: 'MAREJADA ABISAL', desc: 'Una ola que arrastra y deja charcas detrás' } },
      { take: 'hunter', off: 1.4, len: 2.8, title: 'CAZA AL CAZADOR', sub: 'BIENVENIDOS AL PANTANO' },
    ],
  },
  doppy: {
    name: 'DOPPY', title: 'DOPPELGÄNGER', accent: '#ff7ad9',
    segments: [
      { take: 'disguise', off: 0.1, len: 3.0, title: 'MIL CARAS', sub: '¿QUIÉN ES QUIÉN?', card: { key: 'P', name: 'MIL CARAS', desc: 'Pasiva: se disfraza de humano y su golpe aturde' } },
      { take: 'q', off: 0.2, len: 2.6, title: 'ROBAR ROSTRO', sub: 'AHORA ES OTRO MONSTRUO', card: { key: 'Q', name: 'ROBAR ROSTRO', desc: 'Copia el aspecto y los poderes de otro monstruo' } },
      { take: 'e', off: 0.4, len: 2.8, title: 'ENGATUSAR', sub: 'TODOS QUIEREN SEGUIRLE', card: { key: 'E', name: 'ENGATUSAR', desc: 'Humanos y cazadores le siguen embobados' } },
      { take: 'evo5', off: 0.7, len: 2.4, title: 'EVOLUCIONA' },
      { take: 'evo15', off: 1.3, len: 2.4, title: 'EVOLUCIONA', sub: 'NIVELES 5 · 10 · 15' },
      { take: 'r', off: 0.3, len: 2.8, title: 'DOBLE PERFECTO', sub: 'LA DEFINITIVA DE OTRO', card: { key: 'R', name: 'DOBLE PERFECTO', desc: 'Imita la definitiva del monstruo más cercano' } },
      { take: 'hunter', off: 0.3, len: 2.6, title: 'CAZA AL CAZADOR', sub: 'NI LO VIERON VENIR' },
    ],
  },
}[char];
C.char = char;

const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { stdio: 'inherit' });
const marks = Object.fromEntries(JSON.parse(readFileSync(`${dir}/${char}.json`, 'utf8')).marks);
if (process.env.OFFS) for (const [i, v] of process.env.OFFS.split(',').entries()) if (v) C.segments[i].off = +v; // ajuste fino sin tocar el archivo
const work = `${dir}/${char}-work`; mkdirSync(work, { recursive: true });
const SRC = `${dir}/${char}.webm`;

await renderCards(C, work, END);

const VF = 'fps=30,scale=1080:1920:flags=lanczos,setsar=1';
const parts = [];
// intro: juego desenfocado y oscurecido + monstruo y nombre
const first = marks[C.segments[0].take] + C.segments[0].off;
ff('-ss', String(first), '-t', String(INTRO), '-i', SRC, '-loop', '1', '-t', String(INTRO), '-i', `${work}/intro.png`,
  '-filter_complex', `[0:v]${VF},gblur=sigma=26,eq=brightness=-0.18:saturation=0.7[bg];[1:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1[ov];[bg][ov]overlay=0:0,fade=t=in:st=0:d=0.2[v]`,
  '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', `${work}/p0.mp4`);
parts.push({ v: `${work}/p0.mp4`, len: INTRO, a: null });
// tomas
for (const [i, s] of C.segments.entries()) {
  const at = marks[s.take] + s.off;
  ff('-ss', String(at), '-t', String(s.len), '-i', SRC, '-loop', '1', '-t', String(s.len), '-i', `${work}/seg${i}.png`,
    '-filter_complex', `[0:v]${VF}[g];[1:v]format=rgba,fade=t=in:st=0:d=0.12:alpha=1[ov];[g][ov]overlay=0:0[v]`,
    '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', `${work}/p${i + 1}.mp4`);
  ff('-ss', String(at), '-t', String(s.len), '-i', SRC, '-vn', '-ac', '2', '-ar', '48000', '-af', `apad=whole_dur=${s.len},afade=t=in:d=0.04,afade=t=out:st=${s.len - 0.06}:d=0.06`, `${work}/a${i + 1}.wav`);
  parts.push({ v: `${work}/p${i + 1}.mp4`, len: s.len, a: `${work}/a${i + 1}.wav` });
}
// cierre
ff('-i', `${work}/end.webm`, '-t', String(END), '-vf', `fps=30,setsar=1,tpad=stop_mode=clone:stop_duration=1,trim=duration=${END}`, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', `${work}/pend.mp4`);
parts.push({ v: `${work}/pend.mp4`, len: END, a: null });

writeFileSync(`${work}/list.txt`, parts.map((p) => `file '${p.v}'`).join('\n'));
ff('-f', 'concat', '-safe', '0', '-i', `${work}/list.txt`, '-c', 'copy', `${work}/video.mp4`);
const total = parts.reduce((s, p) => s + p.len, 0);

// audio: música continua + efectos de cada toma en su sitio
const inputs = ['-stream_loop', '-1', '-i', MUSIC];
const filt = [`[0:a]atrim=0:${total},asetpts=N/SR/TB,volume=4.5,afade=t=out:st=${total - 1.2}:d=1.2[m]`];
let t = 0, n = 1; const mix = ['[m]'];
for (const p of parts) {
  if (p.a) { inputs.push('-i', p.a); filt.push(`[${n}:a]volume=2.2,adelay=${Math.round(t * 1000)}|${Math.round(t * 1000)}[s${n}]`); mix.push(`[s${n}]`); n++; }
  t += p.len;
}
filt.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0:duration=first,loudnorm=I=-14:TP=-1.0:LRA=11[a]`);
ff(...inputs, '-filter_complex', filt.join(';'), '-map', '[a]', '-t', String(total), '-ar', '48000', '-c:a', 'pcm_s16le', `${work}/audio.wav`);
ff('-i', `${work}/video.mp4`, '-i', `${work}/audio.wav`, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', '-shortest', out);
console.log('trailer', out, total.toFixed(1), 's');
