// Valores de balance de habilidades, evolución y definitivas.
// Separados de la implementación (server/kits) para poder equilibrar sin tocar la lógica.

/** Niveles en los que cambia la evolución del monstruo. */
export const TIER_LEVELS = [5, 10, 15] as const;
/** Reaparecer en la misma sala: nivel de partida (última evolución alcanzada) y multiplicador de XP hasta recuperar el nivel anterior. */
export const CATCH_UP = { milestones: [5], mul: 2 }; // nunca se reaparece por encima del 5: el resto se recupera con XP doble

/** Tutorial: personajes de práctica, XP acelerada y Cazador de práctica más blando. */
export const TUTORIAL = { chars: ['vampire', 'mummy', 'zombie'] as const, themes: ['transylvania', 'camp', 'elm'] as const, xpMul: 3, hunterDmg: 0.4, hunterHp: 0.6, npcSpeed: 0.6 };

/** Modo «El Señor de la Noche» (todos contra todos, sin reaparecer). Tiempos en segundos. */
export const NIGHTLORD = {
  lobby: { readyT: 10, autoT: 180, minPlayers: 2 },
  matchT: 600, // duración aproximada: a los 10 min la niebla ya casi ha desaparecido
  silenceAt: 540, // a los 9 min los ectoplasmas quedan silenciados para siempre
  podiumT: 9,
  xpMul: 2, // la experiencia de bajas y objetos rinde el doble
  passiveXp: { base: 6, perSec: 0.04 }, // experiencia por segundo para todos los vivos (crece con el tiempo)
  altar: { r: 70, base: 10, perSec: 3, max: 60 }, // experiencia por segundo encima de un altar (crece mientras sigues encima)
  sun: { start: 45, cover: 480, dps: 0.02, dpsGrow: 0.012, dpsMax: 0.09 }, // % de la vida máxima por segundo (crece con el tiempo al sol)
  fog: { r: 950, shrinkAt: 500, shrinkEnd: 600, rEnd: 160, gone: 690 }, // círculo de niebla que tapa el sol
  ecto: { speed: 300, q: { r: 230, t: 2, mul: 0.4, cd: 9 }, e: { r: 120, dmg: 9, cd: 2.5 }, reviveHp: 0.5 },
  coins: [100, 50, 25], killCoins: 15,
  npcs: 150, powerups: 70, traps: 26,
  horde: { every: 50, size: [7, 11] as [number, number], minDist: 900 }, // hordas de zombis que aparecen por la ciudad
};

/** Trampas: se recogen del mapa (como mucho una) y se colocan con la X. */
export type TrapId = 'salt' | 'seal' | 'hand' | 'eyes' | 'ritual' | 'candle' | 'silence' | 'blood';
export const TRAP_IDS: TrapId[] = ['salt', 'seal', 'hand', 'eyes', 'ritual', 'candle', 'silence', 'blood'];
export const TRAPS = {
  arm: 0.8, stepR: 70, perMap: 9,
  salt: { r: 190, t: 14 },
  seal: { t: 60, mul: 1.3, life: 90 },
  hand: { root: 5, life: 90 },
  eyes: { r: 300, life: 120, cd: 6 },
  ritual: { delay: 3 },
  candle: { r: 300, t: 18, sight: 150 },
  silence: { t: 5, life: 90 },
  blood: { dmg: 0.18, life: 90 }, // fracción de la vida máxima de quien la pisa
};

export const tierOf = (level: number) => (level >= 15 ? 3 : level >= 10 ? 2 : level >= 5 ? 1 : 0);

/** Carga de la definitiva (R): se gana con bajas, no con el tiempo. */
/** Estados genéricos nuevos (sueño, rabia, sangrado, engatusar). */
export const STATUS = {
  drowsyDecay: 8, drowsyHold: 4, // a los jugadores la somnolencia les baja sola si no la alimentan (a humanos y cazadores no)
  sleepPlayer: 1.6, sleepOther: 2.8, sleepMarkT: 8,
  rageNpcDmg: 8,
  hexSpeedMul: 0.7, // animalillo (maleficio): va dando saltitos
  treeBurnT: 15, treeFlameT: 8, treeFireDps: 10, treeFireR: 45, // árboles que arden: quemados 15 s, en llamas los 8 primeros
  shock: { r: 260, stun: 1.2, stunPlayer: 0.9, dmg: 8 }, // ataques eléctricos sobre el agua
  fleeSpeed: 150, // los aterrorizados huyen de lo que les asusta
  hypno: { hold: 3, decay: 12, tPlayer: 1.6, tOther: 2.6, speed: 120, pullR: 900 }, // hipnosis (Interferencia): al llenarse caminan hacia ella o hacia una tele
  clone: { hp: 60, speed: 230, dmg: 0.55, cd: 0.6 },
};

/** Objetos nuevos que aparecen por el mapa. */
export const ITEMS = {
  spirits: { t: 10, every: 0.7, range: 450, speed: 420, dmg: 0.5 }, // calaveras guiadas
  boots: { t: 12, speedMul: 1.3, every: 40, fire: { r: 28, t: 2.5, dps: 6 }, nature: { r: 26, t: 4, root: 1.2 }, water: { r: 34, t: 4 } },
  digger: { hp: 110, speed: 205, dmg: 0.6, cd: 0.9 }, // el enterrador de la pala
};

export const ULT = {
  max: 100,
  onUnlock: 30, // carga regalada al llegar al nivel 10
  npc: 4, // humano normal: aporta poco
  player: 25, // otro monstruo: bastante
  hunter: 40, // Hunter: mucho
  powerup: 0,
};

export const BAL = {
  vampire: {
    biteHeal: 0.3, // pasiva base: fracción del daño del mordisco que cura
    biteHealT1: 0.42, // nivel 5
    killSpeedMul: 1.3, // nivel 5: al matar humano
    killSpeedT: 2,
    bats: 3, batsT3: 5, batSpread: 0.28, batSpreadT3: 0.22, batSpeed: 540, batLife: 0.9, batDmg: 0.8, batHeal: 0.15,
    mistDist: 240, mistInvuln: 1,
    mistTrailT: 2.5, mistTrailW: 56, mistTrailSlow: 0.55, mistTrailSlowT: 1.2, // nivel 15
    orbitBats: 2, orbitRegen: 6, orbitBlockR: 52, // nivel 15
    ult: { dur: 6, lifesteal: 0.35, batHealMul: 2, cdRate: 1.8, cdCutOnCast: 0.4, panicR: 460, panicT: 3, pulse: 1, blinkRange: 520, blinkPick: 90, blinkCd: 0.5 }, // blink: atacar apuntando a un enemigo te lleva junto a él
  },
  werewolf: {
    preyHpFrac: 0.35, chaseR: 480, chaseDot: 0.72, chaseSpeedMul: 1.15, // nivel 5
    dashT: 0.3, dashSpeedMul: 3.2, dashDmg: 1.2, dashKnock: 200, qChargesT3: 2, chargeLock: 0.35,
    howlT: 5, howlDmgMul: 1.3, howlSpeedMul: 1.2, howlR: 420, fearNpcT: 1.8, fearHunterT: 0.8, fearHunterR: 260,
    preyMarkT: 6, preyBonus: 0.6, // nivel 15
    ult: { dur: 7, extendPerKill: 1, maxExtend: 5, speedMul: 1.25, atkSpeedMul: 0.65, rangeMul: 1.3, scale: 1.25 },
  },
  mummy: {
    scarabSpeed: 430, scarabLife: 0.75, scarabDmg: 0.7, scarabSlowT: 0.8, scarabSlowMul: 0.72,
    curseEvery: 4, curseMarkT: 6, curseMarkSlowT: 2.5, curseMarkSlowMul: 0.35, curseMarkBonus: 0.3, // nivel 5
    bandageSpeed: 500, bandageLife: 0.95, bandageRoot: 1.2, bounceR: 230, // rebote nivel 15
    curseR: 175, curseRT3: 215, curseSlowT: 3, curseSlowMul: 0.5,
    ult: {
      dur: 6, speedMul: 1.3, atkSpeedMul: 0.6,
      stormSpeed: 380, stormLife: 1.6, stormHitR: 72, stormDmg: 0.6,
      entombT: 5, entombPlayerT: 3, dotEvery: 0.5, dotDmg: 3, healFrac: 0.4,
    },
  },
  invisible: {
    invisBonus: 2, // multiplicador del primer golpe desde invisibilidad
    revealR: 110, // a esta distancia se intuye su presencia (salvo desvestida)
    autoInvisAfter: 10, // nivel 5
    undressT: 4,
    frenzyT: 4, frenzySpeedMul: 1.35, frenzyAtkSpeedMul: 0.6,
    killInvisT: 3, reappearT: 1, // nivel 15
    ult: { dur: 15, radius: 750, surpriseStunPlayer: 2.5, surpriseStunHunter: 5, vulnMul: 1.3, vulnMulHunter: 1.5 },
  },
  zombie: {
    maxMinions: 5, maxMinionsUlt: 7,
    contagionRange: 320, contagionCone: 0.9, minionLife: 30,
    chainChance: 0.15, chainLife: 15, // los nacidos por contagio en cadena no contagian
    minion: {
      normal: { hp: 45, speed: 172, dmg: 0.45, cd: 0.9 },
      fast: { hp: 30, speed: 228, dmg: 0.4, cd: 0.7 },
      tough: { hp: 95, speed: 142, dmg: 0.5, cd: 1.0 },
      fat: { hp: 70, speed: 175, dmg: 0, cd: 0 },
    },
    infectT: 5, infectSlowMul: 0.55, // contagio: tarda 5 s en convertirse
    aggroR: 380, leashR: 600, followDist: 110, attackReach: 14,
    rewardShare: 0.5, // las bajas de sus zombis dan la mitad de XP y puntos
    toxicR: 70, toxicT: 4, toxicSlowMul: 0.6, weakMul: 0.75, // nivel 5 (Epidemia)
    meatRange: 260, meatT: 5, meatPullR: 700, meatFightR: 160, meatSpeedMul: 1.35,
    variantChanceT3: { fast: 0.25, tough: 0.25 },
    ult: { normals: 3, fats: 1, life: 30, capT: 30, fatSeekR: 520, fatTriggerR: 46, fatSwellT: 0.55, fatBoomR: 120, fatBoomDmg: 2.2 },
  },
  kthula: {
    deepSpeedMul: 1.3, deepRegen: 0.03, // por segundo, fracción de la vida máxima
    shallowFactor: 0.5, // las charcas dan la mitad del bonus
    regenSafeT: 3, // sin recibir daño en los últimos 3 s
    puddleR: 70, puddleT: 8, puddleSlowMul: 0.6, maxPuddles: 12,
    stillDelay: 0.35, growR0: 26, growRate: 34, growMax: 70, growMaxT1: 100, growRateT1: 50, growT: 8, // charca bajo ella al estar quieta fuera del agua (nv. 5: mayor y más rápida)
    jetT: 1.5, jetCd: 0.5, jetEvery: 0.15, jetRange: 270, jetW: 28, jetDmg: 0.3, jetPush: 18, jetMoveMul: 0.65, // ataque básico en el agua
    tentacleRange: 300, tentacleDelay: 0.4, tentacleR: 74, tentacleDmg: 1.2, tentaclePull: 60, qChargesT3: 2,
    diveLand: 1.2, diveDeep: 2.4, diveSpeedMul: 2.0, divePuddleR: 85, // duración doble a petición
    ult: { speed: 360, life: 1.5, hitR: 84, dmg: 1.1, knock: 170, puddleEvery: 70, puddleR: 64 },
  },
  nightmare: {
    basicDrowsy: 24, // somnolencia por golpe básico
    susceptMul: 1.45, susceptT: 8, // nv. 5: quien ya se durmió acumula más rápido
    lullaby: { range: 210, rangeT3: 270, cone: 0.95, coneT3: 1.15, dmg: 0.45, drowsy: 65 },
    stalk: { maxT: 10, chargeT: 3, chargeTT3: 1.6, bonusMax: 1.2, drowsyBonus: 35 }, // Acecho
    ult: { range: 1400, hopMul: 1.8, window: 7, hops: 5, fieldR: 520, fieldT: 3, fieldRate: 50 }, // R: zona de sueño y saltos entre dormidos
  },
  mary: {
    maxMirrors: 3, maxMirrorsT3: 4, mirrorLife: 40,
    eBuff: { t: 4, speedMul: 1.3, atkSpeedMul: 0.7, lifesteal: 0.25 },
    lifesteal1: 0.12, speed2: 1.12, bleed3: { t: 3, dps: 4 }, // nv. 5 (por espejos activos)
    boom: { r: 110, rT3: 140, dmg: 1.4, dmgT3: 1.7 },
    shardsT: 3, shardsSlow: 0.6, // nv. 15: cristales en el suelo
    ult: { cloneLife: 7, clonesCap: 5 },
  },
  reanimated: {
    regenSafeT: 4, regen: 0.035, // por segundo, fracción de la vida máxima
    overload: { frac: 0.3, r: 150, dmg: 1.0, stun: 1.0 }, // nv. 5
    slam: { r: 150, dmg: 0.8, knock: 190 },
    nail: { speed: 620, life: 0.6, dmg: 0.9, stayT: 15, every: 5, returnR: 900, returnSpeed: 900, returnDmg: 1.1, strikeR: 60, strikeDmg: 0.6 },
    qChargesNail: 2,
    ult: { r: 540, t: 5, dps: 7, slowMul: 0.55 },
    boulder: { speed: 520, life: 0.55, dmg: 1.1, meleeCheck: 80 }, // nv. 15
  },
  doppy: {
    disguiseAfter: 3, disguiseAfterT1: 1.6, surpriseMul: 1.5, surpriseMulT1: 1.9, surpriseStun: 0.8,
    steal: { range: 320, t: 10, tT3: 16 },
    charm: { r: 300, rT3: 400, tNpc: 3, tPlayer: 1.1, buffT: 3, dmgTakenMul: 1.25 },
    ult: { range: 800, extra: 2 },
  },
  witch: {
    potion: { range: 360, speed: 520, r: 58, rT3: 80 }, // básico: ácido o fuego al azar
    acid: { dmg: 0.8, poisonT: 4, poisonTT1: 6, poisonDps: 5 }, // envenena unos segundos
    fire: { t: 3, tT1: 4.5, dps: 9 }, // deja el suelo en llamas
    rage: { tPlayer: 2.5, tOther: 4 }, // solo en la Q: atacan a lo más cercano, ella incluida
    big: { r: 110, rT3: 140, mul: 1.5, charges: 3 }, // Q: poción aleatoria (ácido, fuego o rabia)
    broom: { t: 2.6, tT3: 4, speedMul: 1.35 },
    powerupTimeT3: 1.5, // nivel 15: los power-ups le duran más
    ult: { range: 420, r: 250, zoneT: 4, tPlayer: 3, tOther: 5 }, // Maleficio: animalillo
  },
  succubus: {
    lifesteal: 0.25, lifestealT1: 0.35, // pasiva: roba vida con cada golpe
    thrall: { hp: 40, speed: 190, dmg: 0.5, cd: 0.8 }, // humanos engatusados que luchan por ella
    thrallCap: 3, thrallCapT1: 5, thrallLife: 20, thrallLifeT1: 30,
    heart: { speed: 560, life: 0.65, dmg: 0.7, pull: 150, charmT: 0.6 }, heartChargesT3: 2, // Q: corazón que atrae
    wings: { t: 2.5, tT3: 3.5, speedMul: 1.3 }, // E: alas
    ult: { range: 420, r: 230, tPlayer: 3, tOther: 5 }, // R: Pasión desatada (rabia que nunca va contra ella)
  },
  poltergeist: {
    obj: { range: 420, spawnMin: 110, spawnMax: 200, speed: 640, dmg: 0.72, countT3: 2 }, // casi no se puede esquivar (apunta solo y atraviesa muros): daño moderado // básico: objetos que salen de cualquier sitio
    objSlow: { t: 1, mul: 0.6 }, // nivel 5: los objetos ralentizan
    storm: { r: 210, count: 6, dmg: 0.7 }, // Q: revuelo
    phase: { t: 2.2, tT3: 3.2 }, // E: intangible
    ult: { r: 270, t: 4, dps: 12 }, // R: drenaje (se cura lo drenado)
  },
  tree: {
    rootAfter: 1.5, rootRegen: 0.03, rootArmor: 0.25, // pasiva: quieto echa raíces (regenera y aguanta más)
    lashRootT3: 0.5, // nivel 15: el ramazo enreda
    bramble: { range: 380, r: 110, dmg: 0.8, root: 1.4, rootT1: 2, zoneT: 4, slowMul: 0.6 }, // Q: zarzas que enredan
    seedRange: 360, selfR: 110, charges: 2, chargesT3: 3, // E: brotar (flor junto a él · torreta en la vegetación · muro en campo abierto)
    plantLife: 20, plantLifeT1: 30,
    wall: { hp: 220, r: 26, cap: 2 },
    turret: { hp: 70, r: 16, cap: 3, range: 360, cd: 1.1, dmg: 0.35, speed: 560, awakenedMul: 1.25 }, // despertada de un árbol del mapa: más fuerte
    flower: { hp: 50, r: 12, cap: 1, healR: 220, heal: 0.04, healT1: 0.06 },
    ult: { r: 320, t: 7, every: 1.4, root: 1, dmg: 0.6, slowMul: 0.6, heal: 0.03 }, // R: Bosque maldito
  },
  pirate: {
    lootChance: 0.35, // pasiva: Botín maldito
    hook: { speed: 720, life: 0.5, dmg: 0.6, pull: 110, leapT: 0.28 }, // Q: garfio (nv. 15: se impulsa hacia lo que engancha)
    barrel: { fuse: 2.5, r: 110, rT3: 150, dmg: 1.6, knock: 160, cap: 3 }, // E: barril de pólvora
    cannon: { speed: 620, life: 0.62, dmg: 0.9 }, // nv. 5: en el barco fantasma ataca a distancia
    ult: { r: 280, t: 10, atkMul: 0.55, dirs: 4 }, buccaneer: { hp: 70, speed: 205, dmg: 0.55, cd: 0.8 }, // R: gran poza 10 s (en el barco: cañonazos en 4 direcciones y más rápidos)
  },
  spider: {
    poison: { t: 4, dps: 4, stackMul: 0.5, maxStacks: 4, window: 3 }, // pasiva y nv. 5 (veneno que se acumula)
    web: { speed: 520, life: 0.7, dmg: 0.4, slowT: 2, slowMul: 0.45, r: 46, t: 45, max: 4, charges: 2 }, // Q: telaraña
    leap: { range: 280, t: 0.32, fearR: 150, fearT: 1.5, chargesT3: 2 }, // E: salto arácnido
    ult: { r: 320, t: 7, slowMul: 0.3, speedMul: 1.4, linkR: 700, n: 6, life: 9, threadStun: 3 }, // R: gran telaraña (los hilos aturden 3 s)
    brood: { every: 3, hits: 3, life: 8 }, // pasiva: cada 3 básicos sale una arañita que da 3 mordiscos y muere
    spiderling: { hp: 14, speed: 260, dmg: 0.25, cd: 0.6 },
  },
  scarecrow: {
    still: { t: 5, grace: 3, mul: 1.8 }, // pasiva: quieto 5 s, el siguiente golpe hace más daño
    crows: { speed: 500, life: 0.8, dmg: 0.7, blindT: 2.5 }, // Q: cuervos (nv. 15: vuelven)
    plant: { t: 2.5, dmgMul: 0.35, fearR: 220, fearT: 1.6, chargesT3: 2 }, // E: plantarse
    decoy: { hp: 40, every: 8, max: 3, life: 10, fearR: 130, fearT: 1, spawnR: 650 }, // nv. 5: espantapájaros por el mapa
    ult: { r: 330, t: 8, speedMul: 1.5, dmgMul: 1.4, reinvis: 1.2 }, // R: la Cosecha (trigo alto)
  },
  demon: {
    burn: { t: 3, dps: 7 }, // todos sus golpes queman
    combustMul: 1.4, // nv. 5: más daño a quien ya arde
    fireball: { speed: 520, life: 0.8, dmg: 1.2, r: 90, zoneT: 3, dps: 8, sparks: 4 }, // Q (nv. 15: llamas secundarias)
    dash: { t: 2.2, speedMul: 1.9, dmg: 0.6, trailT: 3, every: 24 }, // E: paso ardiente (carrera en llamas)
    ult: { t: 6, atkMul: 0.6, speedMul: 1.3, wave: { speed: 600, life: 0.5, dmg: 0.7 }, aura: { r: 95, every: 0.5, dmg: 0.3 } }, // R: Infierno (con aura de llamas)
    fireHealT3: 0.09, // nv. 15: el fuego le cura (fracción de vida por segundo)
  },
  slime: {
    split: { steps: [0.7, 0.4], t: 8, dmgTakenMul: 0.7, dmgMul: 0.75, regen: 0.03 }, // pasiva: se divide
    slimelet: { hp: 35, speed: 210, dmg: 0.35, cd: 0.8 },
    goo: { r: 34, t: 3, tT3: 6, slowMul: 0.6 }, // manchas pegajosas
    trail: { t: 4, speedMul: 1.4, every: 30, r: 26, zoneT: 3, poisonT: 3, poisonDps: 5 }, // Q: rastro de veneno
    bubble: { speed: 460, life: 0.8, dmg: 0.9, r: 100, knock: 140, poisonT: 4, poisonDps: 5 }, // E: burbuja de ácido
    absorb: 0.15, // nv. 5: lo que recoge le cura
    ult: { t: 6, hpMul: 0.6, grabR: 70, dps: 10, boomR: 170, boomDmg: 1.4, boomKnock: 200 }, // R: masa crítica
  },
  static: {
    noise: { speed: 620, life: 0.38, dmg: 0.8, hypno: 22 }, // básico: estática (Ruido)
    tvR: 450, tvShotR: 200, tvShotRT3: 290, tvDmg: 0.5, tvMax: 4, // pasiva: las teles cercanas repiten sus ataques
    wave: { r: 220, tvR: 150, tvRT3: 220, slowT: 1.5, slowMul: 0.6, hypno: 40 }, // Q: señal pirata
    channel: { range: 950, pick: 260, t: 3, exitR: 300, popR: 130, popHypno: 30 }, // E: meterse en una tele (y salir)
    hypnoDmgMul: 1.5, // nv. 5: más daño a los hipnotizados
    ult: { t: 6, hop: 0.12, beamW: 30, dmg: 0.55, hypno: 22, hitR: 70 }, // R: el rayo salta de tele en tele
  },
  kappa: {
    bubble: { speed: 480, life: 1.15, dmg: 0.75, slowT: 1, slowMul: 0.8 }, // desde el agua: burbujas a larga distancia
    tongue: { speed: 700, life: 0.48, dmg: 0.6, stun: 0.35 }, // Q: lengua acuática (arrastra hasta él)
    bowl: { t: 2.5, heal: 0.07, armorMul: 0.55, breakFrac: 0.12 }, // E: cuenco sagrado (se corta con un golpe fuerte)
    steal: { t: 3, slowMul: 0.75, speedMul: 1.25 }, // nv. 5: robo de velocidad por la espalda
    ult: { r: 270, t: 6, pull: 110, every: 1, dmg: 0.7 }, // R: remolino del río (daño cada segundo)
    rain: { every: 6, t: 2.4, r: 80, puddleT: 9, near: 220 }, // nv. 15: nubes cuya lluvia forma una poza
  },
  alien: {
    plasma: { speed: 760, life: 0.5, dmg: 1.0 }, // básico
    silence: { hits: 3, window: 3, t: 2 }, // pasiva
    abduct: { range: 400, delay: 0.35, r: 70, rT3: 130, t: 1.2, dmg: 1.3 }, // Q (nv. 15: varios)
    beacon: { hp: 40, range: 300, delay: 2.5, life: 10, r: 120, dmg: 1.6, speedR: 260, speedMul: 1.3, radT: 4, radDps: 6 }, // E
    pickupCd: 0.2, // nv. 5: recoger objetos recorta un 20 % los enfriamientos
    ult: { t: 7, every: 0.6, range: 380, dmg: 0.6, ufos: 3 }, // R: Invasión
  },

  reaper: {
    soul: { npc: 1, big: 3, max: 40, dmg: 0.015, spd: 0.006, atk: 0.008 }, // pasiva (y nv. 5: velocidad y ataque)
    step: { range: 210, chargesT3: 2 }, // Q: paso fúnebre
    mark: { range: 520, pick: 220, t: 5, speedMul: 1.3, dot: 0.6, bonus: 1.8 }, // E: marca de muerte
    ult: { t: 10, every: 0.75, range: 650, r: 115, rT3: 145, dmg: 1.6 }, // R: danza de la Parca
  },
  unit: {
    eye: { speed: 640, life: 0.38, dmg: 0.85, unitDmg: 0.45 }, // básico: disparo de cada Unidad
    link: { max: 4, maxT3: 8, range: 340 }, // Q: asimilación
    free: { max: 1, maxT3: 2 }, // E: independencia
    drone: { hp: 55, speed: 205, dmg: 0.4, cd: 0.9 }, // Unidad vinculada (sigue y ayuda)
    freeDrone: { hp: 70, speed: 190, dmg: 0.5, cd: 0.8 }, // Unidad independiente (deambula sola)
    rebirthHp: 0.6, // pasiva: vida al reaparecer en otra Unidad
    hive: { speed: 0.04, atk: 0.04, max: 10 }, // nv. 5: por cada Unidad activa
    camo: { t: 5 }, // pasiva: segundos quieta para camuflarse como humanos
    ult: { delay: 3, r: 125, dmg: 2.4 }, // R: convergencia (parpadean hasta explotar)
  },
  necro: {
    orb: { speed: 520, life: 0.6, dmg: 1.0 }, // básico: orbe oscuro
    max: 3, maxT3: 5, dogChance: 0.12, // Q: alzar huesos
    skel: { hp: 60, speed: 170, dmg: 0.5, cd: 0.9 }, archer: { hp: 40, speed: 160, dmg: 0.45, cd: 1.3, range: 300, arrowSpeed: 560 }, dog: { hp: 38, speed: 280, dmg: 0.32, cd: 0.4 },
    march: { t: 4, speedMul: 1.3, atkMul: 0.7 }, // E: marcha de los muertos
    last: { delay: 1, t: 4.5, len: 560, w: 58, dps: 24, turn: 7 }, // nv. 5: último conjuro (rayo ancho que maneja el jugador)
    ult: { t: 7, area: 260, every: 0.3, r: 80, dmg: 1.7, knock: 140, warn: 0.55 }, // R: puños y pies de hueso caen del cielo
    bigT3: { hpMul: 1.5, scale: 1.3 }, // nv. 15: esqueletos más grandes y duros
    heal: { small: 0.04, big: 0.1 }, // pasiva: se cura con las bajas de sus esqueletos
  },
  worm: {
    scale: 1.35, r: 25, knock: 150, // pasiva: Coloso (más grande y empuja más)
    accel: { t: 0.7, min: 0.45, turnDot: 0.2 }, // le cuesta arrancar y girar
    dig: { t: 5, tT3: 8, speedMul: 1.15, healT1: 0.04, emergeR: 110, emergeDmg: 0.85, emergeKnock: 120 }, // Q: sumergirse
    sense: { r: 420, rT1: 700 }, // pisadas que percibe bajo tierra (las muestra el cliente)
    sand: { r: 170, rT3: 240, t: 4, slowMul: 0.55, pull: 70 }, // E: arenas movedizas
    ult: { t: 3.5, speedMul: 2.2, turn: 2.6, mouthR: 34, max: 5, dps: 8, spit: 1.0, spitKnock: 260 }, // R: Devorador
    water: { dps: 0.06, slow: 0.7 }, // el agua le daña (fracción de vida por segundo) y le frena
  },
  dino: {
    shiftCdT3: 2.5, // nv. 15: el cambio de forma recarga antes
    raptor: { dmgMul: 0.75, atkMul: 0.6, chaseR: 420, chaseDot: 0.7, chaseMul: 1.22, leap: { range: 420, pick: 260, t: 0.4, r: 95, rT3: 140, dmg: 1.4 } },
    trike: { dmgMul: 1.5, atkMul: 1.5, rangeMul: 1.25, armorMul: 0.65, ccMul: 0.5, charge: { t: 0.6, tT3: 0.95, speedMul: 3.1, dmg: 1.3, knock: 230, stun: 1.2 } },
    ptero: { atkMul: 0.9, egg: { speed: 560, life: 0.65, dmg: 0.95 }, twister: { speed: 240, life: 1.7, dmg: 0.3, knock: 150, every: 0.25, nT3: 2 } },
    shiftHeal: 0.08, bonusT: 3, // nv. 5: carne prehistórica
    ult: { egg: 1, r: 260, dmg: 3.0, burnT: 4, burnDps: 9, fireT: 5 }, // R: extinción
  },
  r800: {
    shot: { speed: 560, life: 0.6, dmg: 0.42, cd: 0.34, meleeCheck: 40 }, // básico a distancia: bolas de electricidad
    lock: { range: 650, t: 6, speedMul: 1.3, dot: 0.6, bonus: 1.7 }, // Q: adquisición de objetivo
    burst: { t: 3, tT3: 4.5, every: 0.3, everyT3: 0.22, speed: 520, life: 0.9, dmg: 0.55, r: 62, rT3: 90, spread: 0.1, speedMul: 0.6 }, // E: lanzacohetes
    repair: { safeT: 4, rate: 0.03 }, boom: { delay: 1, r: 130, dmg: 2.2 }, // nv. 5
    ult: { t: 5, len: 620, w: 76, turn: 3, dps: 10, ramp: 0.9, maxMul: 3.5, speedMul: 0.7 }, // R: protocolo de exterminio (cañón ancho)
  },
  huntress: {
    bolt: { speed: 760, life: 0.52, dmg: 1.0 }, // básico: ballesta
    militia: { hp: 45, speed: 175, dmg: 0.45, cd: 1.0, life: 30, max: 8, xp: 14, pts: 8 }, // pasiva: humanos armados
    butt: { r: 80, arc: 0.7, arcT3: 1.3, dmg: 1.1, knock: 260 }, // Q: culatazo
    retreat: { t: 0.22, speedMul: 3.2, invisT: 3.5 }, // E: repliegue (enfriamiento en characters.ts)
    cdRefund: 0.5, // nv. 5: recupera la mitad del enfriamiento de Q y E
    ult: { t: 3, every: 0.13, n: 5, turn: 0.3, speed: 560, life: 0.75, blindT: 3, dmg: 0.6 }, // R: círculo de caza (abanico de virotes en espiral)
  },
  candle: {
    flame: { speed: 500, life: 0.42, dmg: 1.0, burnT: 1.5, burnDps: 6 }, // básico: llama de vela
    drip: { every: 48, r: 22, t: 5, wax: 26 }, // pasiva: gotas de cera al moverse (encerado por segundo)
    waxRoot: 1, waxDecay: 16, // al llenar la barra de encerado: arraigado 1 s
    nearFire: { r: 220, atkMul: 0.75 }, // pasiva: cerca del fuego ataca más rápido
    glob: { speed: 520, range: 440, r: 80, t: 7, slowMul: 0.5, wax: 70, fireDps: 16, fireT: 4 }, // Q: cera ardiente
    slowMul: 0.85, // ralentización de las gotas
    dark: { t: 5, speedMul: 1.45, dmgMul: 0.6, boomR: 120, boomDmg: 1.3, burnT: 2.5, burnDps: 7 }, // E: apagar la llama
    candle: { heal: 0.07, life: 12, pickR: 36 }, // nv. 5: velas de los quemados
    ult: { r: 560, t: 8, speedMul: 1.3, atkMul: 0.7 }, // R: se apagaron las luces
    spread: { r: 110, every: 0.6 }, // nv. 15: el fuego salta a la cera cercana
  },
};

/** Clases: invocadores con menos vida y regeneración, asesinos con robo de vida y algo menos de vida,
 *  cuerpo a cuerpo con más vida y armadura. */
export const CLASS: Record<string, { hp: number; regen: number; armor: number; lifesteal: number }> = {
  melee: { hp: 1.12, regen: 1, armor: 0.06, lifesteal: 0 },
  assassin: { hp: 0.9, regen: 1, armor: 0, lifesteal: 0.08 },
  summoner: { hp: 0.85, regen: 0.5, armor: 0, lifesteal: 0 },
  ranged: { hp: 1, regen: 1, armor: 0, lifesteal: 0 },
  hybrid: { hp: 1, regen: 1, armor: 0, lifesteal: 0 },
};

/** Alimañas de cada mapa: no atacan, huyen muy rápido y siempre dejan un objeto. */
export const CRITTERS = { max: 7, every: 9, hp: 14, r: 10, speed: 70, flee: 270, seeR: 300, xp: 8, pts: 6 };


// ---------------------------------------------------------------------------
// La orden de cazadores: aparecen según el nivel medio de la sala
// ---------------------------------------------------------------------------
export type OrderType = 'cazador' | 'inquisidor' | 'exorcista' | 'sectario' | 'heraldo';
/** Fieras de algunos mapas (no son de la orden): cocodrilos del Nilo y dinosaurios de la jungla. */
export type BeastType = 'croc' | 'raptor' | 'rex';
export type HunterType = OrderType | BeastType;
export interface HunterDef {
  name: string; hp: number; speed: number; r: number;
  melee: number; meleeCd: number; reach: number;
  reward: { xp: number; pts: number; coins: number; ult: number };
}
export const HUNTERS: Record<HunterType, HunterDef> = {
  cazador: { name: 'Cazador', hp: 180, speed: 150, r: 17, melee: 34, meleeCd: 1.3, reach: 26, reward: { xp: 70, pts: 80, coins: 8, ult: 40 } },
  inquisidor: { name: 'Inquisidor', hp: 280, speed: 168, r: 17, melee: 44, meleeCd: 1.2, reach: 30, reward: { xp: 110, pts: 120, coins: 12, ult: 45 } },
  exorcista: { name: 'Exorcista', hp: 190, speed: 140, r: 17, melee: 18, meleeCd: 1.4, reach: 24, reward: { xp: 100, pts: 110, coins: 10, ult: 40 } },
  sectario: { name: 'Sectario', hp: 45, speed: 175, r: 15, melee: 0, meleeCd: 9, reach: 0, reward: { xp: 40, pts: 40, coins: 5, ult: 15 } },
  heraldo: { name: 'Heraldo de la luz', hp: 650, speed: 105, r: 20, melee: 78, meleeCd: 1.8, reach: 46, reward: { xp: 260, pts: 300, coins: 25, ult: 60 } },
  croc: { name: 'Cocodrilo', hp: 200, speed: 150, r: 22, melee: 26, meleeCd: 1.6, reach: 30, reward: { xp: 60, pts: 60, coins: 6, ult: 25 } },
  raptor: { name: 'Raptor', hp: 75, speed: 245, r: 15, melee: 9, meleeCd: 0.9, reach: 22, reward: { xp: 35, pts: 35, coins: 3, ult: 15 } },
  rex: { name: 'Tiranosaurio', hp: 600, speed: 140, r: 32, melee: 52, meleeCd: 1.7, reach: 44, reward: { xp: 240, pts: 260, coins: 22, ult: 60 } },
};
export const isBeast = (t: string) => t === 'croc' || t === 'raptor' || t === 'rex';
/** Fieras: dónde viven, cuántas hay y cómo cazan. */
export const BEASTS = {
  croc: { max: 5, see: 300, leash: 170, swim: 235, stun: 0.3 }, // acecha en el agua y muerde a quien se acerque a la orilla
  raptor: { max: 6, pack: 2, see: 420, leash: 900 },
  rex: { max: 1, see: 460, leash: 1300, knock: 180, roarCd: 9, roarR: 260, fearT: 1.2 },
  every: 12, // reaparición
};
/** Corriente del agua poco profunda de la jungla (empuja río abajo). */
export const CURRENT = { push: 120 };
export const ORDER = {
  minionPriorityR: 260, // si hay zombis tan cerca, los cazadores van primero a por ellos
  shoot: { dmg: 26, cd: 1.8, speed: 640, range: 520 }, // ballesta del cazador
  lunge: { cd: 4, t: 0.35, mul: 2.8, range: 260, min: 90 }, // embestida del inquisidor
  levelBias: 22, // el inquisidor prefiere monstruos de nivel alto (px por nivel)
  potion: { cd: 3.2, range: 430, speed: 430, r: 70, t: 3.5, dps: 4, stun: 1.1 }, // agua bendita del exorcista
  ritual: { t: 4, r: 70, cd: 30, flee: 9, victimCd: 45, minLevel: 15 }, // sectario
  herald: { ignoreBelow: 10, stunMul: 0.4 },
  // aparición (nivel medio de la sala)
  inquisidorAvg: 5, exorcistaAvg: 10, heraldoAvg: 20,
  caps: { inquisidor: 2, exorcista: 2, sectario: 2, heraldo: 1 },
  maxTotal: 7, // cazadores normales como mucho (incluyendo los especiales que ocupan su hueco)
  calmAvg: 3, // con nivel medio por debajo, solo 1 cazador por cada 3 jugadores
  rookie: { min: 0.5, perLvl: 0.0625 }, // daño que reciben los novatos de la Orden y las fieras
};
