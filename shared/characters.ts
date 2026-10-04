// Definición de personajes jugables, habilidades y skins.
// Para añadir un monstruo nuevo: añade una entrada en CHARACTERS (stats + habilidades),
// una "forma" en client/sprites.ts (rasgos sobre el cuerpo base) y sus skins (paletas).

export type CharacterId = 'vampire' | 'werewolf' | 'mummy' | 'invisible' | 'zombie' | 'kthula';

export interface AbilityInfo {
  key: 'Q' | 'E' | 'R';
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
  /** Definitiva (R): se desbloquea al nivel 10 y se carga con bajas. */
  ult: AbilityInfo;
  /** Hitos de evolución (niveles 5, 10 y 15). */
  evolution: { lvl: number; name: string; desc: string }[];
  /** true si el ataque básico es a distancia (no usa range/arc). */
  rangedBasic?: boolean;
  /** Criatura acuática: camina sobre agua profunda y aprovecha cualquier agua (sea de quien sea). */
  aquatic?: boolean;
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
    ult: { key: 'R', name: 'Noche Carmesí', desc: '6 s de robo de vida extra, enfriamientos acelerados y pánico entre los humanos cercanos.', cooldown: 0 },
    evolution: [
      { lvl: 5, name: 'Sed de sangre', desc: 'El mordisco cura más y matar humanos te da un acelerón de 2 s.' },
      { lvl: 10, name: 'Noche Carmesí', desc: 'Desbloquea la definitiva R, que se carga con bajas.' },
      { lvl: 15, name: 'Señor de los Murciélagos', desc: 'Q lanza 5 murciélagos, 2 murciélagos te orbitan bloqueando proyectiles y la Niebla deja una estela que ralentiza.' },
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
    ult: { key: 'R', name: 'Luna Llena', desc: '7 s en modo bestia: más grande, rápido y con más alcance. Cada baja alarga la luna 1 s.', cooldown: 0 },
    evolution: [
      { lvl: 5, name: 'Instinto depredador', desc: 'Las presas heridas (menos del 35 % de vida) dejan rastro y perseguirlas te acelera.' },
      { lvl: 10, name: 'Luna Llena', desc: 'Desbloquea la definitiva R, que se carga con bajas.' },
      { lvl: 15, name: 'Bestia Alfa', desc: 'Embestida con 2 cargas y el Aullido marca a sus víctimas como Presa: tu primer zarpazo les hace daño extra.' },
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
    attackCd: 0.5,
    armor: 0.15,
    attackName: 'Escarabajos',
    passive: 'Vendajes: 15 % menos de daño recibido. Sus escarabajos ralentizan.',
    rangedBasic: true,
    abilities: [
      { key: 'Q', name: 'Vendas', desc: 'Lanza vendas que inmovilizan al objetivo 1,2 s.', cooldown: 6 },
      { key: 'E', name: 'Maldición', desc: 'Área de maldición: daño y ralentización 3 s.', cooldown: 11 },
    ],
    ult: { key: 'R', name: 'Tormenta del Faraón', desc: 'Tormenta de arena en línea recta que encierra a los enemigos en sarcófagos. Golpearlos te cura.', cooldown: 0 },
    evolution: [
      { lvl: 5, name: 'Maldición del faraón', desc: 'Cada 4.º escarabajo sobre un objetivo lo maldice: tu siguiente golpe lo ralentiza mucho más.' },
      { lvl: 10, name: 'Tormenta del Faraón', desc: 'Desbloquea la definitiva R, que se carga con bajas.' },
      { lvl: 15, name: 'Faraón Despierto', desc: 'Las vendas rebotan a un segundo objetivo y la Maldición abarca más área.' },
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
    passive: 'El primer golpe desde la invisibilidad hace daño doble. Recibir daño o atacar te hace visible.',
    abilities: [
      { key: 'Q', name: 'Desvestirse', desc: 'Tu ropa cae al suelo y quedas totalmente invisible 4 s.', cooldown: 10 },
      { key: 'E', name: 'Frenesí invisible', desc: 'Más velocidad de movimiento y de ataque 4 s. No rompe la invisibilidad.', cooldown: 9 },
    ],
    ult: { key: 'R', name: 'Todos somos la Dama', desc: '15 s: los humanos cercanos se visten como tú. Quien mate a uno se lleva una sorpresa (aturdido y vulnerable).', cooldown: 0 },
    evolution: [
      { lvl: 5, name: 'Presencia Ausente', desc: 'Tras 10 s sin atacar ni recibir daño te vuelves invisible sin límite de tiempo.' },
      { lvl: 10, name: 'Todos somos la Dama', desc: 'Desbloquea la definitiva R, que se carga con bajas.' },
      { lvl: 15, name: 'Desaparición Perfecta', desc: 'Cada baja te vuelve invisible (si ya lo eras, reapareces 1 s y vuelves a esfumarte).' },
    ],
  },
  zombie: {
    id: 'zombie',
    name: 'Paciente Cero',
    title: 'Zombi',
    hp: 95, // invocador: algo menos de vida que el resto
    speed: 195,
    damage: 17,
    range: 48,
    arc: Math.PI / 2,
    attackCd: 0.5,
    armor: 0.05,
    attackName: 'Mordisco infecto',
    passive: 'Infección: sus zombis atacan solos a humanos, monstruos y Cazadores.',
    abilities: [
      { key: 'Q', name: 'Contagio', desc: 'Infecta al humano más cercano al cursor: en 5 s pierde la vida y se levanta como zombi aliado durante 30 s (máx. 5).', cooldown: 5 },
      { key: 'E', name: 'Carne fresca', desc: 'Lanza carne: tus zombis corren hacia ella y atacan lo que haya cerca. Te acelera ir hacia ella.', cooldown: 10 },
    ],
    ult: { key: 'R', name: 'Salida de la tumba', desc: 'Emergen 3 zombis y 1 zombi gordo que corre hacia un enemigo y explota.', cooldown: 0 },
    evolution: [
      { lvl: 5, name: 'Epidemia', desc: 'Tus zombis dejan al morir una zona contaminada que ralentiza y debilita.' },
      { lvl: 10, name: 'Salida de la tumba', desc: 'Desbloquea la definitiva R, que se carga con bajas.' },
      { lvl: 15, name: 'Cepas mutantes', desc: 'Algunos zombis nacen rápidos o resistentes.' },
    ],
  },
  kthula: {
    id: 'kthula',
    name: "K'thula",
    title: 'Horror abisal',
    hp: 115,
    speed: 200,
    damage: 18,
    range: 62,
    arc: Math.PI * 0.6,
    attackCd: 0.5,
    armor: 0.05,
    attackName: 'Tentáculo',
    passive: 'Camina sobre agua profunda; en el agua (y en cualquier charca) es más rápido, se regenera y su ataque pasa a ser un chorro. Si se queda quieto fuera del agua, brota una charca bajo él.',
    aquatic: true,
    abilities: [
      { key: 'Q', name: 'Tentáculo abisal', desc: 'Un tentáculo surge en el punto señalado, daña y arrastra hacia el centro.', cooldown: 6 },
      { key: 'E', name: 'Sumergirse', desc: 'Se sumerge y se desplaza muy rápido (más tiempo en agua profunda). No se le puede golpear.', cooldown: 10 },
    ],
    ult: { key: 'R', name: 'Marejada abisal', desc: 'Una gran ola avanza en línea recta: daña, empuja y deja charcas detrás.', cooldown: 0 },
    evolution: [
      { lvl: 5, name: 'Señor de las profundidades', desc: 'La charca que brota al quedarse quieto crece más y más rápido.' },
      { lvl: 10, name: 'Marejada abisal', desc: 'Desbloquea la definitiva R, que se carga con bajas.' },
      { lvl: 15, name: 'Llamada del abismo', desc: 'Tentáculo con 2 cargas y al emerger deja una charca corrupta.' },
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
  zombie: [
    { id: 'classic', name: 'Bata de hospital', price: 0, palette: { skin: '#7a9a6a', hair: '#3a2a1a', cloth: '#a8c0c8', cloth2: '#7890a0', accent: '#8a1a1a', eye: '#e8ff60' } },
    { id: 'office', name: 'Oficinista', price: 150, palette: { skin: '#8aa070', hair: '#5a4a3a', cloth: '#3a4058', cloth2: '#262a3a', accent: '#a02020', eye: '#ffe040' } },
    { id: 'rotten', name: 'Podrido', price: 300, palette: { skin: '#5a6a40', hair: '#2a2a1a', cloth: '#6a5a3a', cloth2: '#4a3e28', accent: '#5a1a10', eye: '#ff6020' } },
  ],
  kthula: [
    { id: 'classic', name: 'Abisal', price: 0, palette: { skin: '#3a7a6a', hair: '#2a5a50', cloth: '#1a2a3a', cloth2: '#0e1824', accent: '#60e0a0', eye: '#80ff60' } },
    { id: 'coral', name: 'Coral', price: 200, palette: { skin: '#b04a5a', hair: '#7a2a3a', cloth: '#2a1a2a', cloth2: '#180e18', accent: '#ffa070', eye: '#ffe060' } },
    { id: 'void', name: 'Del vacío', price: 350, palette: { skin: '#3a3a6a', hair: '#24244a', cloth: '#0e0e1a', cloth2: '#06060e', accent: '#a080ff', eye: '#ff60ff' } },
  ],
};

export function getSkin(char: CharacterId, skinId: string): SkinDef {
  return SKINS[char].find((s) => s.id === skinId) ?? SKINS[char][0];
}

// ---------- Mejoras por nivel ----------
export type UpgradeId = 'vit' | 'str' | 'spd' | 'pow';
/** max: tope hasta el nivel 14 · maxHigh: tope a partir del nivel 15 (se puede seguir mejorando 1-2-3). */
export const UPGRADES: { id: UpgradeId; key: string; name: string; desc: string; max: number; maxHigh: number }[] = [
  { id: 'vit', key: '1', name: 'Vitalidad', desc: '+15 % vida máxima', max: 8, maxHigh: 16 },
  { id: 'str', key: '2', name: 'Fuerza', desc: '+12 % daño', max: 8, maxHigh: 16 },
  { id: 'spd', key: '3', name: 'Velocidad', desc: '+5 % velocidad', max: 6, maxHigh: 10 },
  { id: 'pow', key: '4', name: 'Poder oscuro', desc: '-8 % enfriamiento habilidades', max: 6, maxHigh: 6 },
];
export const upgradeMax = (u: { max: number; maxHigh: number }, level: number) => (level >= 15 ? u.maxHigh : u.max);

export const xpForLevel = (level: number) => Math.round(40 + level * 35 + level * level * 4);
export const MAX_LEVEL = 30;
