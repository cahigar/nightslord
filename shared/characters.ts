// Definición de personajes jugables, habilidades y skins.
// Para añadir un monstruo nuevo: añade una entrada en CHARACTERS (stats + habilidades),
// una "forma" en client/sprites.ts (rasgos sobre el cuerpo base) y sus skins (paletas).

export type CharacterId = 'vampire' | 'werewolf' | 'mummy' | 'invisible';

export interface AbilityInfo {
  key: 'Q' | 'E';
  name: string;
  desc: string;
  cooldown: number; // segundos
}

export interface CharacterDef {
  id: CharacterId;
  name: string;
  title: string;
  hp: number;
  speed: number; // px/s
  damage: number;
  range: number; // alcance del ataque básico
  arc: number; // apertura del ataque básico (radianes)
  attackCd: number;
  armor: number; // reducción de daño 0..1
  attackName: string;
  passive: string;
  abilities: [AbilityInfo, AbilityInfo];
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  vampire: {
    id: 'vampire',
    name: 'El Conde',
    title: 'Vampiro',
    hp: 100,
    speed: 215,
    damage: 18,
    range: 50,
    arc: Math.PI / 2,
    attackCd: 0.45,
    armor: 0,
    attackName: 'Mordisco',
    passive: 'Sed de sangre: el mordisco te cura un 30 % del daño.',
    abilities: [
      { key: 'Q', name: 'Murciélagos', desc: 'Lanza un abanico de 3 murciélagos.', cooldown: 6 },
      { key: 'E', name: 'Niebla', desc: 'Te teletransportas convertido en niebla, invulnerable 1 s.', cooldown: 9 },
    ],
  },
  werewolf: {
    id: 'werewolf',
    name: 'Lobo de Luna',
    title: 'Hombre lobo',
    hp: 130,
    speed: 205,
    damage: 22,
    range: 56,
    arc: Math.PI * 0.8,
    attackCd: 0.5,
    armor: 0.05,
    attackName: 'Zarpazo',
    passive: 'Zarpazo amplio que golpea a varios enemigos.',
    abilities: [
      { key: 'Q', name: 'Embestida', desc: 'Carga hacia delante dañando todo lo que tocas.', cooldown: 5 },
      { key: 'E', name: 'Aullido', desc: '+30 % daño y +20 % velocidad 5 s. Paraliza de miedo a los humanos.', cooldown: 12 },
    ],
  },
  mummy: {
    id: 'mummy',
    name: 'Ramsés',
    title: 'Momia',
    hp: 150,
    speed: 180,
    damage: 20,
    range: 52,
    arc: Math.PI / 2,
    attackCd: 0.55,
    armor: 0.15,
    attackName: 'Golpe vendado',
    passive: 'Vendajes: 15 % menos de daño recibido.',
    abilities: [
      { key: 'Q', name: 'Vendas', desc: 'Lanza vendas que inmovilizan al objetivo 1,2 s.', cooldown: 6 },
      { key: 'E', name: 'Maldición', desc: 'Área de maldición: daño y ralentización 3 s.', cooldown: 11 },
    ],
  },
  invisible: {
    id: 'invisible',
    name: 'La Dama Velada',
    title: 'Mujer invisible',
    hp: 90,
    speed: 230,
    damage: 16,
    range: 48,
    arc: Math.PI / 2,
    attackCd: 0.4,
    armor: 0,
    attackName: 'Puñetazo fantasma',
    passive: 'El primer golpe tras desvanecerte hace daño doble.',
    abilities: [
      { key: 'Q', name: 'Desvanecer', desc: 'Invisible 4 s (solo te ven muy de cerca).', cooldown: 10 },
      { key: 'E', name: 'Empujón', desc: 'Onda que aturde y empuja a todos los cercanos.', cooldown: 7 },
    ],
  },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

// ---------- Skins (cambios de paleta: coste casi nulo crear nuevas) ----------
// Slots de paleta que usa el renderizador de sprites:
//  skin: piel · hair: pelo/pelaje · cloth: ropa principal · cloth2: ropa secundaria
//  accent: detalles (forro capa, collar...) · eye: ojos
export interface Palette {
  skin: string;
  hair: string;
  cloth: string;
  cloth2: string;
  accent: string;
  eye: string;
}

export interface SkinDef {
  id: string;
  name: string;
  price: number; // monedas (0 = gratis)
  medal?: string; // o se desbloquea con medalla
  palette: Palette;
}

export const SKINS: Record<CharacterId, SkinDef[]> = {
  vampire: [
    { id: 'classic', name: 'Clásico', price: 0, palette: { skin: '#d8d4e8', hair: '#1a1424', cloth: '#1e1a2e', cloth2: '#0e0b18', accent: '#b0182a', eye: '#ff2a3a' } },
    { id: 'nosfe', name: 'Nosferatu', price: 150, palette: { skin: '#9fb39a', hair: '#9fb39a', cloth: '#2b2b2b', cloth2: '#141414', accent: '#3d3d3d', eye: '#f2f27a' } },
    { id: 'royal', name: 'Sangre Real', price: 300, palette: { skin: '#f0e6f6', hair: '#e8e0c0', cloth: '#5a0f2a', cloth2: '#300818', accent: '#e0b040', eye: '#ff4060' } },
    { id: 'neon', name: 'Neón 80s', price: 0, medal: 'predator', palette: { skin: '#c8f0ff', hair: '#ff3aa8', cloth: '#25124a', cloth2: '#120626', accent: '#36f2e0', eye: '#36f2e0' } },
  ],
  werewolf: [
    { id: 'classic', name: 'Gris lunar', price: 0, palette: { skin: '#6e5a4a', hair: '#5a5260', cloth: '#3a4a7a', cloth2: '#26304f', accent: '#e8e0d0', eye: '#ffd23a' } },
    { id: 'brown', name: 'Pardo', price: 120, palette: { skin: '#7a5236', hair: '#8a5a2e', cloth: '#7a2a2a', cloth2: '#4a1818', accent: '#f0e0c0', eye: '#ffb020' } },
    { id: 'snow', name: 'Ártico', price: 300, palette: { skin: '#c8c8d8', hair: '#eef0f8', cloth: '#2a5a5a', cloth2: '#183838', accent: '#ffffff', eye: '#40c8ff' } },
    { id: 'hell', name: 'Infernal', price: 0, medal: 'hunter', palette: { skin: '#3a1a1a', hair: '#2a1010', cloth: '#1a1a1a', cloth2: '#0a0a0a', accent: '#ff6a10', eye: '#ff3010' } },
  ],
  mummy: [
    { id: 'classic', name: 'Vendas viejas', price: 0, palette: { skin: '#3a2a1a', hair: '#d8c8a0', cloth: '#c8b888', cloth2: '#a89868', accent: '#e8c040', eye: '#40ff80' } },
    { id: 'pharaoh', name: 'Faraón', price: 250, palette: { skin: '#2a1a10', hair: '#e8d8b0', cloth: '#e0d0a0', cloth2: '#b0a070', accent: '#2a50c0', eye: '#ffd040' } },
    { id: 'swamp', name: 'Del pantano', price: 150, palette: { skin: '#1a2a10', hair: '#8a9a60', cloth: '#7a8a50', cloth2: '#5a6a38', accent: '#4a3a20', eye: '#c0ff40' } },
  ],
  invisible: [
    { id: 'classic', name: 'Gabardina', price: 0, palette: { skin: '#e8dcc8', hair: '#5a3a2a', cloth: '#6a5a48', cloth2: '#4a3e30', accent: '#202020', eye: '#a0d0ff' } },
    { id: 'gala', name: 'Gala', price: 200, palette: { skin: '#f0e8f0', hair: '#202020', cloth: '#8a1a4a', cloth2: '#5a0e30', accent: '#e8c060', eye: '#ff80c0' } },
    { id: 'ghost', name: 'Espectral', price: 0, medal: 'survivor', palette: { skin: '#c0f0e0', hair: '#80c0b0', cloth: '#5a8a80', cloth2: '#3a6a60', accent: '#c0fff0', eye: '#ffffff' } },
  ],
};

export function getSkin(char: CharacterId, skinId: string): SkinDef {
  return SKINS[char].find((s) => s.id === skinId) ?? SKINS[char][0];
}

// ---------- Mejoras por nivel ----------
export type UpgradeId = 'vit' | 'str' | 'spd' | 'pow';
export const UPGRADES: { id: UpgradeId; key: string; name: string; desc: string; max: number }[] = [
  { id: 'vit', key: '1', name: 'Vitalidad', desc: '+15 % vida máxima', max: 8 },
  { id: 'str', key: '2', name: 'Fuerza', desc: '+12 % daño', max: 8 },
  { id: 'spd', key: '3', name: 'Velocidad', desc: '+5 % velocidad', max: 6 },
  { id: 'pow', key: '4', name: 'Poder oscuro', desc: '-8 % enfriamiento habilidades', max: 6 },
];

export const xpForLevel = (level: number) => Math.round(40 + level * 35 + level * level * 4);
export const MAX_LEVEL = 30;
