// Definición de personajes jugables, habilidades y skins.
// Para añadir un monstruo nuevo: añade una entrada en CHARACTERS (stats + habilidades),
// una "forma" en client/sprites.ts (rasgos sobre el cuerpo base) y sus skins (paletas).

export type CharacterId = 'vampire' | 'werewolf' | 'mummy' | 'invisible' | 'zombie' | 'kthula' | 'nightmare' | 'mary' | 'reanimated' | 'doppy' | 'witch' | 'succubus' | 'poltergeist' | 'tree'
  | 'pirate';

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
  /** Levita: pasa por encima del agua profunda (sin las ventajas de los acuáticos). */
  hover?: boolean;
  /** Inmune al fuego (zonas en llamas, quemaduras, árboles ardiendo). */
  fireImmune?: boolean;
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
    name: 'Aullador',
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
  nightmare: {
    id: 'nightmare',
    name: 'Pesadilla',
    title: 'Criatura del sueño',
    hp: 105,
    speed: 210,
    damage: 18,
    range: 52,
    arc: Math.PI / 2,
    attackCd: 0.5,
    armor: 0.05,
    attackName: 'Zarpa de sombra',
    passive: 'Somnolencia: sus golpes y habilidades llenan una barra en los enemigos; al llenarse, se duermen un momento.',
    abilities: [
      { key: 'Q', name: 'Arrullo', desc: 'Nana en cono: poco daño pero mucha somnolencia.', cooldown: 6 },
      { key: 'E', name: 'Acecho', desc: 'Se convierte en un objeto del escenario. Si espera quieto y luego ataca, el primer golpe hace daño extra.', cooldown: 9 },
    ],
    ult: { key: 'R', name: 'Entre sueños', desc: 'Aparece junto a un enemigo dormido; su siguiente ataque está potenciado.', cooldown: 0 },
    evolution: [
      { lvl: 5, name: 'Mal dormir', desc: 'Quien ya se ha dormido una vez acumula somnolencia más rápido durante un tiempo.' },
      { lvl: 10, name: 'Entre sueños', desc: 'Desbloquea la definitiva R, que se carga con bajas.' },
      { lvl: 15, name: 'Pesadilla recurrente', desc: 'Arrullo con más área y Acecho llega antes al bonus máximo.' },
    ],
  },
  mary: {
    id: 'mary',
    name: 'Bloody Mary',
    title: 'Leyenda del espejo',
    hp: 100,
    speed: 212,
    damage: 17,
    range: 54,
    arc: Math.PI / 2,
    attackCd: 0.45,
    armor: 0.05,
    attackName: 'Cristal',
    passive: 'Puede tener varios espejos activos por el mapa.',
    abilities: [
      { key: 'Q', name: 'A través del espejo', desc: 'Viaja al espejo más cercano, que estalla en fragmentos de cristal.', cooldown: 5 },
      { key: 'E', name: 'Espejo de sangre', desc: 'Coloca un espejo y gana velocidad, velocidad de ataque y robo de vida unos segundos.', cooldown: 7 },
    ],
    ult: { key: 'R', name: 'Sal del espejo', desc: 'Todos sus espejos estallan y de cada uno sale una copia suya que ataca sola.', cooldown: 0 },
    evolution: [
      { lvl: 5, name: 'Reflejo sangriento', desc: 'Bonus por espejos activos: 1 robo de vida, 2 velocidad, 3 sus golpes desangran.' },
      { lvl: 10, name: 'Sal del espejo', desc: 'Desbloquea la definitiva R, que se carga con bajas.' },
      { lvl: 15, name: 'Mil reflejos', desc: 'Un espejo más, explosión mayor y los cristales que quedan ralentizan.' },
    ],
  },
  reanimated: {
    id: 'reanimated',
    name: 'Reanimado',
    title: 'Cadáver cosido',
    hp: 170,
    speed: 178,
    damage: 24,
    range: 58,
    arc: Math.PI * 0.55,
    attackCd: 0.75,
    armor: 0.15,
    attackName: 'Puñetazo',
    passive: 'Galvanizado: se regenera mucho más si lleva unos segundos sin recibir daño.',
    abilities: [
      { key: 'Q', name: 'Sacudida', desc: 'Golpea el suelo: daña y aleja a los enemigos cercanos.', cooldown: 7 },
      { key: 'E', name: 'Clavo pararrayos', desc: 'Lanza un clavo que se queda clavado 15 s. Cada 5 s cae un rayo y el clavo vuelve a ti atravesando enemigos. 2 cargas.', cooldown: 8 },
    ],
    ult: { key: 'R', name: 'Tormenta galvánica', desc: 'Nubes de tormenta cubren la zona 5 s: ralentizan y dañan a los enemigos. Tú ves a través.', cooldown: 0 },
    evolution: [
      { lvl: 5, name: 'Sobrecarga', desc: 'Al acumular daño recibido suelta una descarga eléctrica que aturde alrededor.' },
      { lvl: 10, name: 'Tormenta galvánica', desc: 'Desbloquea la definitiva R, que se carga con bajas.' },
      { lvl: 15, name: 'Fuerza bruta', desc: 'Sin enemigos al alcance, su ataque básico lanza lápidas, piedras o troncos.' },
    ],
  },
  doppy: {
    id: 'doppy',
    name: 'Doppy',
    title: 'Doppelgänger',
    hp: 100,
    speed: 215,
    damage: 18,
    range: 50,
    arc: Math.PI / 2,
    attackCd: 0.5,
    armor: 0.05,
    attackName: 'Golpe falso',
    passive: 'Mil caras: si pasa un rato sin luchar, adopta el aspecto de un humano cualquiera. Su primer golpe desde el disfraz aturde.',
    abilities: [
      { key: 'Q', name: 'Robar rostro', desc: 'Copia al monstruo cercano: su aspecto, su nombre y su ataque, Q y E durante unos segundos.', cooldown: 12 },
      { key: 'E', name: 'Engatusar', desc: 'Se vuelve irresistible: humanos y cazadores cercanos le siguen embobados y los monstruos se acercan sin querer.', cooldown: 11 },
    ],
    ult: { key: 'R', name: 'Doble perfecto', desc: 'Imita la definitiva del monstruo más cercano (o una al azar) convirtiéndose en él.', cooldown: 0 },
    evolution: [
      { lvl: 5, name: 'Cara conocida', desc: 'Se disfraza antes y su golpe por sorpresa hace más daño.' },
      { lvl: 10, name: 'Doble perfecto', desc: 'Desbloquea la definitiva R, que se carga con bajas.' },
      { lvl: 15, name: 'Nadie es quien dice ser', desc: 'Robar rostro dura más y Engatusar llega más lejos.' },
    ],
  },
  witch: {
    id: 'witch',
    name: 'Hécuba',
    title: 'Bruja del pantano',
    hp: 95,
    speed: 205,
    damage: 15,
    range: 360,
    arc: 0,
    attackCd: 0.75,
    armor: 0,
    rangedBasic: true,
    attackName: 'Poción',
    passive: 'Alquimista: lanza frascos al azar de ácido (envenena unos segundos) o fuego (el suelo arde).',
    abilities: [
      { key: 'Q', name: 'Poción aleatoria', desc: 'Frasco grande al azar: ácido, fuego o rabia (todos atacan a lo más cercano, ella incluida). 3 cargas.', cooldown: 6 },
      { key: 'E', name: 'Escoba', desc: 'Vuela unos segundos por encima de los obstáculos (aterriza siempre en un sitio libre).', cooldown: 12 },
    ],
    ult: { key: 'R', name: 'Maleficio', desc: 'Un gran charco embrujado: quien lo pisa se convierte en animalillo unos segundos. Recarga al instante las 3 pociones.', cooldown: 0 },
    evolution: [
      { lvl: 5, name: 'Caldero espeso', desc: 'El veneno y el fuego duran más.' },
      { lvl: 10, name: 'Maleficio', desc: 'Desbloquea la definitiva R, que se carga con bajas.' },
      { lvl: 15, name: 'Gran alquimista', desc: 'Las pociones salpican un área mayor, los power-ups le duran más y puede lanzar pociones desde la escoba, que vuela más tiempo.' },
    ],
  },
  succubus: {
    id: 'succubus',
    name: 'Lilith',
    title: 'Súcubo',
    hp: 100,
    speed: 215,
    damage: 17,
    range: 54,
    arc: Math.PI / 2,
    attackCd: 0.5,
    armor: 0.05,
    attackName: 'Beso robado',
    passive: 'Roba vida con cada golpe. Los humanos que golpea no mueren: se enamoran y luchan por ella contra cazadores y monstruos.',
    abilities: [
      { key: 'Q', name: 'Flechazo', desc: 'Lanza un corazón que daña, atrae al objetivo hacia ella y lo deja embobado un instante. Si alcanza a un humano, lo enamora.', cooldown: 5 },
      { key: 'E', name: 'Alas', desc: 'Vuela unos segundos por encima de los obstáculos, más rápida.', cooldown: 10 },
    ],
    ult: { key: 'R', name: 'Pasión desatada', desc: 'En un área grande todos atacan a lo más cercano, pero nunca a ella. Las bajas cuentan para ella.', cooldown: 0 },
    evolution: [
      { lvl: 5, name: 'Devoción', desc: 'Roba más vida y puede tener 5 enamorados (en vez de 3), que le duran más.' },
      { lvl: 10, name: 'Pasión desatada', desc: 'Desbloquea la definitiva R, que se carga con bajas.' },
      { lvl: 15, name: 'Corazón roto', desc: 'Flechazo con 2 cargas que atraviesa enemigos y vuela más tiempo.' },
    ],
  },
  poltergeist: {
    id: 'poltergeist',
    name: 'Poltergeist',
    title: 'Fantasma ruidoso',
    hp: 95,
    speed: 210,
    damage: 16,
    range: 420,
    arc: 0,
    attackCd: 0.7,
    armor: 0,
    rangedBasic: true,
    hover: true,
    attackName: 'Objeto volador',
    passive: 'Levita: pasa por encima del agua. Sus ataques no salen de él: los objetos salen disparados desde cualquier punto de la zona hacia el enemigo.',
    abilities: [
      { key: 'Q', name: 'Revuelo', desc: 'Una lluvia de objetos sale de todas partes hacia los enemigos de la zona señalada.', cooldown: 7 },
      { key: 'E', name: 'Intangible', desc: 'Atraviesa ataques y obstáculos; dentro de un obstáculo nadie lo ve. Atacar lo vuelve sólido.', cooldown: 9 },
    ],
    ult: { key: 'R', name: 'Drenaje', desc: 'Durante unos segundos drena la vida de los enemigos a su alrededor y se cura lo que drena.', cooldown: 0 },
    evolution: [
      { lvl: 5, name: 'Casa encantada', desc: 'Los objetos ralentizan un momento a quien golpean.' },
      { lvl: 10, name: 'Drenaje', desc: 'Desbloquea la definitiva R, que se carga con bajas.' },
      { lvl: 15, name: 'Furia espectral', desc: 'Lanza dos objetos por ataque y es intangible más tiempo.' },
    ],
  },
  tree: {
    id: 'tree',
    name: 'Raíz Negra',
    title: 'Árbol maldito',
    hp: 180,
    speed: 168,
    damage: 22,
    range: 62,
    arc: Math.PI * 0.6,
    attackCd: 0.8,
    armor: 0.15,
    attackName: 'Ramazo',
    passive: 'Raíces profundas: si se queda quieto echa raíces; regenera vida y recibe un 25 % menos de daño (puede seguir atacando).',
    abilities: [
      { key: 'Q', name: 'Zarzas', desc: 'Las raíces revientan donde apuntas: dañan, enredan (no pueden moverse) y dejan espinos que ralentizan.', cooldown: 8 },
      { key: 'E', name: 'Brotar', desc: 'Junto a ti: una flor que te cura. Sobre un árbol o seto: lo despierta como torreta que dispara espinas. En campo abierto: un muro de raíces que no deja pasar. 2 cargas.', cooldown: 10 },
    ],
    ult: { key: 'R', name: 'Bosque maldito', desc: 'Un bosque crece a tu alrededor 7 s: ralentiza, enreda una y otra vez a los enemigos y te cura a ti y a tus plantas.', cooldown: 0 },
    evolution: [
      { lvl: 5, name: 'Savia', desc: 'Las zarzas enredan más tiempo, sus plantas duran más y la flor cura más.' },
      { lvl: 10, name: 'Bosque maldito', desc: 'Desbloquea la definitiva R, que se carga con bajas.' },
      { lvl: 15, name: 'Ancestral', desc: '3 cargas de Brotar, las torretas disparan dos espinas y el ramazo enreda.' },
    ],
  },
  pirate: {
    id: 'pirate',
    name: 'Capitán Ahogado',
    title: 'Pirata fantasma',
    hp: 130,
    speed: 200,
    damage: 20,
    range: 58,
    arc: Math.PI * 0.6,
    attackCd: 0.6,
    armor: 0.1,
    attackName: 'Sablazo espectral',
    passive: 'Botín maldito: sus víctimas pueden soltar monedas o sangre.',
    abilities: [
      { key: 'Q', name: 'Garfio', desc: 'Lanza un garfio que atrae al enemigo hacia él.', cooldown: 7 },
      { key: 'E', name: 'Barril de pólvora', desc: 'Deja un barril que explota a los 2,5 s o al recibir un golpe (y prende los árboles).', cooldown: 8 },
    ],
    ult: { key: 'R', name: '¡Al abordaje!', desc: 'Aparecen 3 bucaneros fantasma que luchan a su lado durante 12 s.', cooldown: 0 },
    evolution: [
      { lvl: 5, name: 'Barco fantasma', desc: 'Anda sobre el agua en un barco fantasma, desde el que ataca a cañonazos.' },
      { lvl: 10, name: '¡Al abordaje!', desc: 'Desbloquea la definitiva R, que se carga con bajas.' },
      { lvl: 15, name: 'Lobo de mar', desc: 'El garfio le impulsa hacia lo que engancha (enemigos u obstáculos) y los barriles tienen más área.' },
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
  nightmare: [
    { id: 'classic', name: 'Sombra', price: 0, palette: { skin: '#2a2238', hair: '#3a2e58', cloth: '#28204a', cloth2: '#161026', accent: '#b080ff', eye: '#ece0ff' } },
    { id: 'insomnia', name: 'Insomnio', price: 200, palette: { skin: '#34302a', hair: '#4a4030', cloth: '#2e2a1e', cloth2: '#1a1810', accent: '#ffb030', eye: '#fff0a0' } },
    { id: 'night', name: 'Terror nocturno', price: 350, palette: { skin: '#2e1420', hair: '#4a1428', cloth: '#2a1020', cloth2: '#160810', accent: '#ff3060', eye: '#ff90a0' } },
  ],
  mary: [
    { id: 'classic', name: 'Velo rojo', price: 0, palette: { skin: '#e8dcdc', hair: '#2a1416', cloth: '#7a1018', cloth2: '#4a0a10', accent: '#d8e8f8', eye: '#ff3040' } },
    { id: 'bride', name: 'Novia', price: 200, palette: { skin: '#f0e8e8', hair: '#e8d8b0', cloth: '#e8e4ec', cloth2: '#b8b0c0', accent: '#c01830', eye: '#ff3040' } },
    { id: 'ghost', name: 'Reflejo frío', price: 350, palette: { skin: '#c8e0e8', hair: '#3a5060', cloth: '#2a4a5a', cloth2: '#183040', accent: '#a0f0ff', eye: '#a0f0ff' } },
  ],
  reanimated: [
    { id: 'classic', name: 'Cosido', price: 0, palette: { skin: '#8a9a7a', hair: '#1a1a1a', cloth: '#3a3430', cloth2: '#24201c', accent: '#60c8ff', eye: '#c8f0ff' } },
    { id: 'rust', name: 'Oxidado', price: 200, palette: { skin: '#9a8a7a', hair: '#3a2a1a', cloth: '#5a3a24', cloth2: '#3a2414', accent: '#ffa030', eye: '#ffe080' } },
    { id: 'storm', name: 'Tormenta', price: 350, palette: { skin: '#6a7a8a', hair: '#e8e8f0', cloth: '#202838', cloth2: '#141a26', accent: '#c080ff', eye: '#ffffff' } },
  ],
  doppy: [
    { id: 'classic', name: 'Sin rostro', price: 0, palette: { skin: '#c8c0d0', hair: '#8a8098', cloth: '#5a5068', cloth2: '#3a3448', accent: '#ffe060', eye: '#202030' } },
    { id: 'mime', name: 'Mimo', price: 150, palette: { skin: '#f0f0f0', hair: '#202020', cloth: '#202020', cloth2: '#f0f0f0', accent: '#e02040', eye: '#202020' } },
    { id: 'gold', name: 'Dorado', price: 300, palette: { skin: '#e0c060', hair: '#a07020', cloth: '#6a4a10', cloth2: '#4a3008', accent: '#ffffff', eye: '#3a2008' } },
  ],
  witch: [
    { id: 'classic', name: 'Del pantano', price: 0, palette: { skin: '#8aa060', hair: '#3a2a3a', cloth: '#2a3a24', cloth2: '#1a2414', accent: '#a0ff40', eye: '#ffe040' } },
    { id: 'night', name: 'Medianoche', price: 200, palette: { skin: '#d8c8e0', hair: '#1a1020', cloth: '#2a1a40', cloth2: '#180e28', accent: '#c060ff', eye: '#ff60c0' } },
    { id: 'pumpkin', name: 'Calabaza', price: 300, palette: { skin: '#e0b090', hair: '#c04010', cloth: '#3a2010', cloth2: '#241408', accent: '#ff9020', eye: '#40ff60' } },
  ],
  succubus: [
    { id: 'classic', name: 'Carmesí', price: 0, palette: { skin: '#e8b8c0', hair: '#2a0e1a', cloth: '#8a1838', cloth2: '#4a0a20', accent: '#ff4a8a', eye: '#ffd040' } },
    { id: 'night', name: 'Medianoche', price: 200, palette: { skin: '#b8b0e0', hair: '#e8e0f0', cloth: '#2a1a4a', cloth2: '#180e2e', accent: '#c080ff', eye: '#80f0ff' } },
    { id: 'infernal', name: 'Infernal', price: 350, palette: { skin: '#d06048', hair: '#1a0a0a', cloth: '#2a0a0a', cloth2: '#140404', accent: '#ffb030', eye: '#ffe060' } },
  ],
  poltergeist: [
    { id: 'classic', name: 'Sábana', price: 0, palette: { skin: '#e8ecf4', hair: '#c8d0e0', cloth: '#b8c4d8', cloth2: '#8a98b0', accent: '#a0e8ff', eye: '#141020' } },
    { id: 'grave', name: 'Sudario', price: 200, palette: { skin: '#d8ccb0', hair: '#b8aa88', cloth: '#a89a78', cloth2: '#7a6e54', accent: '#ffe080', eye: '#2a1a10' } },
    { id: 'ecto', name: 'Ectoplasma', price: 350, palette: { skin: '#a8f0b8', hair: '#70d090', cloth: '#58c078', cloth2: '#348a50', accent: '#e0ff80', eye: '#0a2010' } },
  ],
  tree: [
    { id: 'classic', name: 'Roble podrido', price: 0, palette: { skin: '#5a4632', hair: '#2e4a24', cloth: '#3e3022', cloth2: '#2a2018', accent: '#a0e040', eye: '#ffb020' } },
    { id: 'autumn', name: 'Otoño', price: 200, palette: { skin: '#6a4a30', hair: '#c05a18', cloth: '#4a3424', cloth2: '#30221a', accent: '#ffb030', eye: '#ff6020' } },
    { id: 'dead', name: 'Seco', price: 350, palette: { skin: '#4a4448', hair: '#2a2630', cloth: '#363036', cloth2: '#221e24', accent: '#c060ff', eye: '#ff3060' } },
  ],
  pirate: [
    { id: 'classic', name: 'Ahogado', price: 0, palette: { skin: '#8ac0c0', hair: '#2a3a40', cloth: '#1e2a48', cloth2: '#141a2e', accent: '#d8b040', eye: '#a0fff0' } },
    { id: 'coral', name: 'Arrecife', price: 200, palette: { skin: '#a0c8b0', hair: '#5a2a2a', cloth: '#6a1a24', cloth2: '#3a0e14', accent: '#ff9070', eye: '#ffe080' } },
    { id: 'abyss', name: 'Abismal', price: 350, palette: { skin: '#6a7ab0', hair: '#1a1a2a', cloth: '#1a1a24', cloth2: '#0a0a12', accent: '#60e0a0', eye: '#60ff90' } },
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
