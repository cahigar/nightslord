import type { CharacterId } from './characters';

// ---------- Medallas ----------
export interface MedalDef {
  id: string;
  name: string;
  desc: string;
  icon: string; // emoji-icono para UI
  coins: number; // recompensa
}

export const MEDALS: MedalDef[] = [
  // --- generales (28)
  { id: 'firstblood', name: 'Primera sangre', desc: 'Caza a tu primer humano.', icon: '🩸', coins: 10 },
  { id: 'glutton', name: 'Glotón', desc: 'Caza 100 humanos en total.', icon: '🍖', coins: 60 },
  { id: 'npc500', name: 'Apocalipsis', desc: 'Caza 500 humanos en total.', icon: '☣️', coins: 200 },
  { id: 'hunter', name: 'Cazador de cazadores', desc: 'Derrota a un Cazador.', icon: '🏹', coins: 40 },
  { id: 'slayer', name: 'Pesadilla de los Cazadores', desc: 'Derrota a 25 Cazadores en total.', icon: '⚰️', coins: 150 },
  { id: 'hunter100', name: 'Exterminador', desc: 'Derrota a 100 Cazadores en total.', icon: '🗡️', coins: 300 },
  { id: 'herald', name: 'Ángel caído', desc: 'Derrota a un Heraldo de la luz.', icon: '😇', coins: 150 },
  { id: 'cultist', name: 'Ritual interrumpido', desc: 'Derrota a un Sectario.', icon: '🕯', coins: 40 },
  { id: 'predator', name: 'Depredador', desc: 'Derrota a 3 monstruos en una sola vida.', icon: '💀', coins: 80 },
  { id: 'streak5', name: 'Imparable', desc: 'Derrota a 5 monstruos en una sola vida.', icon: '🔥', coins: 200 },
  { id: 'monster10', name: 'Rey de monstruos', desc: 'Derrota a 10 monstruos en total.', icon: '🦴', coins: 80 },
  { id: 'monster50', name: 'Azote de la noche', desc: 'Derrota a 50 monstruos en total.', icon: '☠️', coins: 250 },
  { id: 'bounty', name: 'Cazarrecompensas', desc: 'Derrota al líder coronado de la sala.', icon: '🎯', coins: 100 },
  { id: 'revenge', name: 'Venganza', desc: 'Derrota a quien te derrotó la última vez.', icon: '😤', coins: 60 },
  { id: 'ally', name: 'Pacto de sangre', desc: 'Forma una alianza con otro monstruo (H).', icon: '🤝', coins: 20 },
  { id: 'traitor', name: 'Traidor', desc: 'Derrota a tu propio aliado.', icon: '🔪', coins: 50 },
  { id: 'survivor', name: 'Inmortal', desc: 'Sobrevive 5 minutos seguidos.', icon: '⏳', coins: 60 },
  { id: 'nightlord', name: 'Señor de la Noche', desc: 'Gana una partida de El Señor de la Noche.', icon: '👑', coins: 100 },
  { id: 'eternal', name: 'Eterno', desc: 'Sobrevive 10 minutos seguidos.', icon: '♾️', coins: 150 },
  { id: 'lord', name: 'Señor de la Noche', desc: 'Sé el nº 1 de una sala con 3+ jugadores.', icon: '👑', coins: 100 },
  { id: 'level10', name: 'Criatura ancestral', desc: 'Alcanza el nivel 10 en una vida.', icon: '🌕', coins: 50 },
  { id: 'level15', name: 'Leyenda', desc: 'Alcanza el nivel 15 en una vida.', icon: '⭐', coins: 100 },
  { id: 'level20', name: 'Mito', desc: 'Alcanza el nivel 20 en una vida.', icon: '🌟', coins: 250 },
  { id: 'social', name: 'Buenas noches', desc: 'Saluda y haz un taunt en la misma partida.', icon: '👋', coins: 5 },
  { id: 'games10', name: 'Habitual', desc: 'Juega 10 partidas.', icon: '🎮', coins: 30 },
  { id: 'games50', name: 'Noctámbulo', desc: 'Juega 50 partidas.', icon: '🦉', coins: 150 },
  { id: 'rich', name: 'Tesoro maldito', desc: 'Acumula 1000 monedas.', icon: '💰', coins: 50 },
  { id: 'collector', name: 'Coleccionista', desc: 'Ten 16 monstruos desbloqueados.', icon: '🗃️', coins: 150 },
  { id: 'fashion', name: 'Presumido', desc: 'Compra una skin.', icon: '🎩', coins: 20 },
];

/** Medallas propias de cada monstruo (29): alcanzar el nivel 15 con él. Se añaden a MEDALS más abajo. */
export const CHAR_MEDALS: Record<CharacterId, { name: string; icon: string }> = {
  vampire: { name: 'Señor de los murciélagos', icon: '🦇' },
  werewolf: { name: 'Bestia alfa', icon: '🐺' },
  mummy: { name: 'Faraón despierto', icon: '⚱️' },
  invisible: { name: 'Nadie te vio', icon: '👻' },
  zombie: { name: 'Paciente número uno', icon: '🧟' },
  kthula: { name: 'Llamada del abismo', icon: '🐙' },
  nightmare: { name: 'Dulces sueños', icon: '🌙' },
  mary: { name: 'Mil reflejos', icon: '🪞' },
  reanimated: { name: '¡Está vivo!', icon: '⚡' },
  doppy: { name: 'Nadie es quien dice ser', icon: '🎭' },
  witch: { name: 'Gran alquimista', icon: '🧹' },
  succubus: { name: 'Corazón roto', icon: '💋' },
  poltergeist: { name: 'Casa encantada', icon: '🪑' },
  tree: { name: 'Ancestral', icon: '🌳' },
  pirate: { name: 'Lobo de mar', icon: '🏴‍☠️' },
  spider: { name: 'Reina de la colmena', icon: '🕷️' },
  scarecrow: { name: 'El último espantapájaros', icon: '🌾' },
  demon: { name: 'Señor de las llamas', icon: '😈' },
  slime: { name: 'Reacción en cadena', icon: '🟢' },
  alien: { name: 'Nave nodriza', icon: '👽' },
  static: { name: 'Alta definición', icon: '📺' },
  kappa: { name: 'Dueño de la lluvia', icon: '🥒' },
  reaper: { name: 'Segadora', icon: '☠️' },
  unit: { name: 'Legión', icon: '👁️' },
  necro: { name: 'Ejército de hueso', icon: '💀' },
  worm: { name: 'Rey de las dunas', icon: '🪱' },
  dino: { name: 'Rey lagarto', icon: '🦖' },
  r800: { name: 'Modelo avanzado', icon: '🤖' },
  huntress: { name: 'Milicia', icon: '🏹' },
  candle: { name: 'Incendio de cera', icon: '🕯️' },
};
for (const [c, m] of Object.entries(CHAR_MEDALS)) MEDALS.push({ id: `char:${c}`, name: m.name, desc: `Alcanza el nivel 15 con este monstruo.`, icon: m.icon, coins: 80 });

export const MEDAL_BY_ID = Object.fromEntries(MEDALS.map((m) => [m.id, m]));

// ---------- Desbloqueo de personajes ----------
/** Los 12 primeros son gratis; el resto se desbloquea con monedas (cada uno más caro que el anterior) o con su medalla. */
export const FREE_CHARS: CharacterId[] = ['vampire', 'werewolf', 'mummy', 'invisible', 'zombie', 'kthula', 'nightmare', 'mary', 'reanimated', 'doppy', 'witch', 'succubus'];
export const CHARACTER_UNLOCK: Record<CharacterId, { price: number; medal?: string }> = {
  vampire: { price: 0 }, werewolf: { price: 0 }, mummy: { price: 0 }, invisible: { price: 0 }, zombie: { price: 0 }, kthula: { price: 0 },
  nightmare: { price: 0 }, mary: { price: 0 }, reanimated: { price: 0 }, doppy: { price: 0 }, witch: { price: 0 }, succubus: { price: 0 },
  poltergeist: { price: 1, medal: 'survivor' },
  tree: { price: 1, medal: 'hunter' },
  pirate: { price: 1, medal: 'bounty' },
  spider: { price: 1, medal: 'predator' },
  scarecrow: { price: 1, medal: 'level10' },
  demon: { price: 1, medal: 'slayer' },
  slime: { price: 1, medal: 'glutton' },
  alien: { price: 1, medal: 'lord' },
  static: { price: 1, medal: 'revenge' },
  kappa: { price: 1, medal: 'ally' },
  reaper: { price: 1, medal: 'streak5' },
  unit: { price: 1, medal: 'collector' },
  necro: { price: 1, medal: 'eternal' },
  worm: { price: 1, medal: 'games10' },
  dino: { price: 1, medal: 'level15' },
  r800: { price: 1, medal: 'monster10' },
  huntress: { price: 1, medal: 'cultist' },
  candle: { price: 1, medal: 'herald' },
};
/** Precio del siguiente monstruo: 400 monedas el primero y +200 por cada uno que ya hayas comprado. */
export function unlockPrice(p: Profile | null): number {
  const bought = p ? p.chars.filter((c) => !FREE_CHARS.includes(c)).length : 0;
  return 400 + 200 * bought;
}

// ---------- Perfil persistente ----------
export interface Profile {
  token: string;
  name: string;
  coins: number;
  medals: string[];
  chars: CharacterId[]; // personajes desbloqueados
  skins: string[]; // "char:skin" desbloqueadas (comprando)
  stats: {
    npcKills: number;
    hunterKills: number;
    playerKills: number;
    deaths: number;
    games: number;
    bestScore: number;
  };
  createdAt: number;
  /** Cuenta de Google vinculada (si no, es un invitado). */
  google?: { sub: string; email: string };
  /** Cuenta master: todo desbloqueado y trucos de prueba. */
  master?: boolean;
  /** Último monstruo que te derrotó (huella anónima de su perfil), para la medalla Venganza. */
  lastKiller?: string;
}

export function hasCharacter(p: Profile, c: CharacterId): boolean {
  const u = CHARACTER_UNLOCK[c];
  return u.price === 0 || !!p.master || p.chars.includes(c) || (!!u.medal && p.medals.includes(u.medal));
}

export function hasSkin(p: Profile, c: CharacterId, skin: { id: string; price: number; medal?: string }): boolean {
  if ((skin.price === 0 && !skin.medal) || p.master) return true;
  if (skin.medal && p.medals.includes(skin.medal)) return true;
  return p.skins.includes(`${c}:${skin.id}`);
}
