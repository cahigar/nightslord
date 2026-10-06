// Castellano: idioma base. Todas las claves de la interfaz están aquí; los otros idiomas pueden dejar huecos.
import type { CharacterId } from '../../shared/characters';

const UI = {
  docTitle: 'Mooonsters',
  logo: 'M<span class="ooo">OOO</span>NSTERS',
  language: 'Idioma',
  namePh: 'Tu nombre',
  coins: 'Monedas',
  chooseMonster: 'Elige tu monstruo',
  skin: 'Skin',
  play: '🦇 Jugar',
  codePh: 'CÓDIGO',
  join: 'Unirse',
  randomMap: 'Mapa aleatorio',
  private: 'Privada',
  createRoom: 'Crear sala',
  medals: '🏅 Medallas',
  help: '<b>WASD</b> moverse · <b>Ratón</b> apuntar · <b>Clic / Espacio</b> atacar · <b>Q / clic dcho.</b> y <b>E</b> habilidades · <b>R</b> definitiva (nivel 10)<br /><b>1-4</b> mejoras al subir nivel · <b>G</b> saludar · <b>T</b> taunt · <b>H</b> alianza · <b>M</b> silenciar',
  // cuenta
  guest: '👤 Juegas como <b>invitado</b>: tu progreso se pierde al cerrar el navegador.',
  accountNote: 'Entra con Google para guardar monedas, medallas y compras. Solo usamos tu correo para identificarte: <b>nunca te enviaremos publicidad</b>.',
  privacy: 'Privacidad',
  savedIn: '✅ Progreso guardado en <b>{email}</b>',
  logout: 'Cerrar sesión',
  loginUnavailable: '(inicio de sesión no disponible en este servidor)',
  googleFail: '(no se pudo cargar Google)',
  // desbloqueos
  unlockFor: 'Desbloquear por {p} monedas',
  orMedalLong: ' o consiguiendo la medalla «{m}»',
  confirmUnlock: '¿Desbloquear {n} por {p} monedas?',
  needCoins: 'Necesitas {p} monedas',
  orMedal: ' o la medalla «{m}»',
  or: 'o',
  skinByMedal: 'Se gana con la medalla «{m}»',
  coinsN: '{p} monedas',
  skinMedalErr: 'Skin de medalla: {m} — {d}',
  confirmSkin: '¿Comprar la skin «{s}» por {p} monedas?',
  // ficha
  lvlShort: 'Nv',
  levelLong: 'Nivel',
  stats: 'Vida {hp} · Velocidad {sp} · Daño {dm}',
  armor: ' · Armadura {a}%',
  // errores y avisos
  connectRoomFail: 'No se pudo conectar con el servidor de esa sala.',
  code4: 'El código tiene 4 caracteres.',
  connLost: 'Conexión perdida. Reintentando...',
  noServer: 'No se pudo conectar con el servidor.',
  noCoins: 'No tienes monedas suficientes.',
  noRoom: 'No existe ninguna sala con ese código.',
  roomFull: 'La sala está llena.',
  serverFull: 'El servidor está lleno. Inténtalo en un rato.',
  serverBusy: 'El servidor está lleno ahora mismo. Prueba en un momento.',
  loginFail: 'No se pudo iniciar sesión con Google.',
  skinMedalOnly: 'Esta skin se gana con una medalla.',
  summoned: '¡Un sectario te ha invocado! Llegas con la mitad de tu vida.',
  allyOffer: '🤝 {n} te ofrece una alianza: pulsa H para aceptar.',
  // HUD
  pts: '{n} pts',
  ultLocked: 'Nv 10',
  ultReady: '¡R!',
  upOne: '¡1 mejora disponible! (1-4)',
  upMany: '¡{n} mejoras disponibles! (1-4)',
  rank: 'RANKING DE SALA',
  evoToast: '✨ Nivel {l}: <b>{n}</b>',
  room: 'Sala',
  share: 'Comparte: {l}',
  linkCopied: 'Enlace de la sala copiado 📋',
  medalUnlocked: '¡Medalla desbloqueada!',
  coinsPlus: '+{c} monedas',
  charMedalDesc: 'Alcanza el nivel 15 con este monstruo.',
  evoUlt: 'Desbloquea la definitiva R, que se carga con bajas.',
  // muerte
  fallen: 'Has caído',
  killedBy: 'Te ha cazado: {n}',
  dPoints: 'puntos',
  dLevel: 'nivel',
  dMonsters: 'monstruos',
  dSurvived: 'sobrevivido',
  dCoins: 'monedas',
  again: '¿Volver con otro monstruo?',
  respawn: 'Volver a la noche',
  menu: 'Menú',
  exit: 'Salir',
  // en partida
  levelUp: '¡NIVEL!',
  evolution: '¡EVOLUCIÓN!',
  ritual: '¡RITUAL!',
  wave: '¡Buenas noches!',
};
export type UiKey = keyof typeof UI;

export interface Dict {
  ui: Partial<Record<UiKey, string>>;
  /** Textos de cada monstruo (en castellano salen de shared/characters.ts; aquí solo los taunts). */
  chars: Partial<Record<CharacterId, Partial<{ name: string; title: string; attack: string; passive: string; q: [string, string]; e: [string, string]; r: [string, string]; evo: [string, string][]; taunt: string }>>>;
  medals: Record<string, [string, string?]>;
  upgrades: Record<string, [string, string]>;
  themes: Record<string, [string, string]>;
  /** Palabras y nombres que llegan del servidor en castellano. */
  words: Record<string, string>;
  buffs: Record<string, string>;
  pu: Record<string, string>;
  hunters: Record<string, string>;
  /** Frase con humor de cada monstruo al proponer una alianza (H). */
  ally?: Partial<Record<CharacterId, string>>;
}

type CharTr = NonNullable<Dict['chars'][CharacterId]>;
/** Ficha traducida de un monstruo: nombre, título, ataque, pasiva, Q, E, R, evolución nv. 5 y nv. 15 y taunt. */
export function ch(name: string, title: string, attack: string, passive: string, q: [string, string], e: [string, string], r: [string, string], e5: [string, string], e15: [string, string], taunt: string): CharTr {
  return { name, title, attack, passive, q, e, r, evo: [e5, e15], taunt };
}

export const ES: Dict & { ui: typeof UI } = {
  ui: UI,
  chars: {
    vampire: { taunt: '¡Bleh, bleh!' }, werewolf: { taunt: '¡AUUUUU!' }, mummy: { taunt: '¡Te envuelvo!' }, invisible: { taunt: '¿Me buscabas?' },
    zombie: { taunt: '¡Cereeebros!' }, kthula: { taunt: "Ph'nglui... ¡glub!" }, nightmare: { taunt: 'Duérmete, niño...' }, mary: { taunt: 'Di mi nombre 3 veces' },
    reanimated: { taunt: '¡ESTÁ VIVO!' }, doppy: { taunt: '¿Quién es quién?' }, witch: { taunt: '¡Jijijiji!' }, succubus: { taunt: 'Mua ♥' },
    poltergeist: { taunt: '¡BUUU!' }, tree: { taunt: '¡Yo soy... madera!' }, pirate: { taunt: '¡Arrr, marinero!' }, spider: { taunt: 'Ven a mi tela...' },
    scarecrow: { taunt: '¡Bu! ...¿Asustado?' }, demon: { taunt: '¿Hace calor o soy yo?' }, slime: { taunt: '*blub blub*' }, alien: { taunt: 'Llévame con tu líder' },
    static: { taunt: 'No toque su televisor...' }, kappa: { taunt: '¡Cuidado con mi cuenco!' },
    reaper: { taunt: 'Tu hora ha llegado...' }, unit: { taunt: 'Somos uno. Únete.' }, necro: { taunt: '¡Levantaos, huesos!' },
    worm: { taunt: '*ruge desde la arena*' }, dino: { taunt: '¡RAAAWR... cerebros!' }, r800: { taunt: 'Objetivo adquirido.' }, huntress: { taunt: 'Yo también cazaba monstruos.' }, candle: { taunt: 'Sopla, si te atreves.' },
  },
  medals: {},
  upgrades: {},
  themes: {},
  words: {},
  buffs: {
    speed: '⚡Rapidez', fury: '🔥Furia', howl: '🌕Aullido', shield: '🛡Escudo', invis: '👻Invisible', invisAuto: '👻Presencia ausente', protect: '✨Protegido',
    slow: '🐌Lento', stun: '💫Aturdido', frenzy: '💨Frenesí', haste: '💨Sed', vuln: '💔Vulnerable', tomb: '⚱️Sarcófago', weak: '🤢Debilitado', dive: '🫧Sumergido',
    horde: '🧟Horda', deep: '🌊Abismo', puddle: '💧Charca', sleep: '💤Dormido', rage: '😡Rabia', charm: '💗Engatusado', bleed: '🩸Sangrado', fly: '🪽Volando',
    prop: '🌳Acecho', mimic: '🎭Imitando', guise: '🎭Disfrazado', mirrors: '🪞Espejos', ambush: '🗡Emboscada', hex: '🐸Animalillo', poison: '🧪Envenenado',
    thralls: '💘Enamorados', phase: '👻Intangible', root: '🌿Enredado', treeRoot: '🌳Enraizado', burn: '🔥Ardiendo', silence: '🔇Silenciado', blind: '🐦‍⬛Cegado',
    fear: '😱Aterrorizado', souls: '👻Almas', deathMark: '☠️Marca de muerte', dance: '💃Danza', units: '👁️Unidades', free: '🛰️Independientes', march: '💀Marcha', skeletons: '🦴Esqueletos', tvIn: '📺Dentro de la tele', blaze: '🔥Paso ardiente', disguised: '🥸Camuflado', converge: '💥Convergencia', dig: '🪱Bajo tierra', devour: '👄Devorador', raptor: '🦖Velociraptor', trike: '🦏Tricerátops', ptero: '🦅Pterodáctilo', egg: '🥚Huevo', prehistoric: '🍖Carne prehistórica', lock: '🎯Objetivo fijado', burst: '🚀Cohetes', militia: '🔥Milicia', spirits: '💀Espíritus', bootsFire: '👢🔥Botas de fuego', bootsNature: '👢🌿Botas de naturaleza', bootsWater: '👢💧Botas de agua', planted: '🌾Plantado', wet: '💦Empapado', snuffed: '🕯️Apagado', nearFire: '🔥Junto al fuego', lightsOut: '🌑A oscuras'
  },
  pu: { blood: '+Sangre', speed: '¡Rapidez!', fury: '¡Furia!', shield: '+Escudo', coin: '+5 monedas', xp: '+XP', spirits: '¡Espíritus!', boots: '¡Botas elementales!', shovel: '¡Un enterrador!' },
  ally: {
    vampire: '¿Pacto de sangre? Yo pongo los colmillos.', werewolf: '¿Cazamos en manada? Yo aúllo, tú corres.', mummy: 'Alianza eterna: tengo 3000 años de experiencia.',
    invisible: 'Seremos aliados. No me verás, pero estaré.', zombie: 'Grrr... no hueles a cerebro. Vale, no te muerdo.', kthula: 'Únete a mí o te abrazo con tentáculos.',
    nightmare: 'Aliémonos... y que duerman ellos.', mary: 'Di «aliados» tres veces frente al espejo.', reanimated: '¡Juntos tenemos más piezas!',
    doppy: '¿Aliados? Puedo ser tú, pero mejor.', witch: 'Un pacto sin letra pequeña... casi.', succubus: 'Hagamos equipo, cielo ♥',
    poltergeist: '¡BUUU-sco aliados!', tree: 'Echemos raíces juntos.', pirate: '¡A bordo! Repartimos el botín... luego.',
    spider: 'Entra en mi tela... de amistad.', scarecrow: '¿Socios? Yo asusto, tú cosechas.', demon: 'Firma aquí. No quema... mucho.',
    slime: '¿Nos fusionamos? *blub*', alien: 'Saludos, terrícola. Propongo un tratado.', static: 'Sintoniza mi canal: alianza 24 h.',
    kappa: 'Te invito a mi charca. Trae pepino.', reaper: 'Aliados hasta la muerte... la tuya o la mía.', unit: 'Únete. Nosotros somos majos.',
    necro: 'Mis esqueletos te mandan saludos.', worm: '*vibraciones amistosas bajo la arena*', dino: '¡RAWR! (significa «amigos»)',
    r800: 'Alianza propuesta. Riesgo de traición: 3 %.', huntress: 'No te disparo si tú no me muerdes.', candle: 'Te alumbro el camino... si te portas bien.',
  },
  hunters: { cazador: 'CAZADOR', inquisidor: 'INQUISIDOR', exorcista: 'EXORCISTA', sectario: 'SECTARIO', heraldo: 'HERALDO', croc: 'COCODRILO', raptor: 'RAPTOR', rex: 'T-REX' },
};
