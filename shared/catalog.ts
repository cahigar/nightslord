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
  { id: 'firstblood', name: 'Primera sangre', desc: 'Caza a tu primer humano.', icon: '🩸', coins: 10 },
  { id: 'glutton', name: 'Glotón', desc: 'Caza 100 humanos en total.', icon: '🍖', coins: 60 },
  { id: 'hunter', name: 'Cazador de cazadores', desc: 'Derrota a un Cazador.', icon: '🏹', coins: 40 },
  { id: 'slayer', name: 'Pesadilla de los Cazadores', desc: 'Derrota a 25 Cazadores en total.', icon: '⚰️', coins: 150 },
  { id: 'predator', name: 'Depredador', desc: 'Derrota a 3 monstruos en una sola vida.', icon: '💀', coins: 80 },
  { id: 'survivor', name: 'Inmortal', desc: 'Sobrevive 5 minutos seguidos.', icon: '🕯️', coins: 60 },
  { id: 'lord', name: 'Señor de la Noche', desc: 'Sé el nº 1 de una sala con 3+ jugadores.', icon: '👑', coins: 100 },
  { id: 'level10', name: 'Criatura ancestral', desc: 'Alcanza el nivel 10 en una vida.', icon: '🌕', coins: 50 },
  { id: 'social', name: 'Buenas noches', desc: 'Saluda y haz un taunt en la misma partida.', icon: '👋', coins: 5 },
];

export const MEDAL_BY_ID = Object.fromEntries(MEDALS.map((m) => [m.id, m]));

// ---------- Desbloqueo de personajes ----------
export const CHARACTER_UNLOCK: Record<CharacterId, { price: number; medal?: string }> = {
  vampire: { price: 0 },
  werewolf: { price: 0 },
  mummy: { price: 250, medal: 'hunter' }, // con la medalla o pagando
  invisible: { price: 400, medal: 'predator' },
  zombie: { price: 350, medal: 'glutton' },
  kthula: { price: 450, medal: 'lord' },
  nightmare: { price: 400, medal: 'survivor' },
  mary: { price: 450, medal: 'level10' },
  reanimated: { price: 350, medal: 'slayer' },
  doppy: { price: 500 },
  witch: { price: 450 },
  succubus: { price: 450, medal: 'social' },
  poltergeist: { price: 400, medal: 'survivor' },
  tree: { price: 450, medal: 'hunter' },
  pirate: { price: 450 },
  spider: { price: 400, medal: 'predator' },
  scarecrow: { price: 400, medal: 'survivor' },
  demon: { price: 450, medal: 'slayer' },
  slime: { price: 350, medal: 'glutton' },
  alien: { price: 500, medal: 'lord' },
  static: { price: 500 },
  kappa: { price: 450 },
};

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
}

export function hasCharacter(p: Profile, c: CharacterId): boolean {
  const u = CHARACTER_UNLOCK[c];
  return u.price === 0 || p.chars.includes(c) || (!!u.medal && p.medals.includes(u.medal));
}

export function hasSkin(p: Profile, c: CharacterId, skin: { id: string; price: number; medal?: string }): boolean {
  if (skin.price === 0 && !skin.medal) return true;
  if (skin.medal && p.medals.includes(skin.medal)) return true;
  return p.skins.includes(`${c}:${skin.id}`);
}
