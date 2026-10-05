// Valores de balance de habilidades, evolución y definitivas.
// Separados de la implementación (server/kits) para poder equilibrar sin tocar la lógica.

/** Niveles en los que cambia la evolución del monstruo. */
export const TIER_LEVELS = [5, 10, 15] as const;
export const tierOf = (level: number) => (level >= 15 ? 3 : level >= 10 ? 2 : level >= 5 ? 1 : 0);

/** Carga de la definitiva (R): se gana con bajas, no con el tiempo. */
/** Estados genéricos nuevos (sueño, rabia, sangrado, engatusar). */
export const STATUS = {
  drowsyDecay: 14, drowsyHold: 2.5, // la somnolencia baja sola si no la alimentan
  sleepPlayer: 1.6, sleepOther: 2.8, sleepMarkT: 8,
  rageNpcDmg: 8,
  clone: { hp: 60, speed: 230, dmg: 0.55, cd: 0.6 },
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
    ult: { dur: 6, lifesteal: 0.35, batHealMul: 2, cdRate: 1.8, cdCutOnCast: 0.4, panicR: 460, panicT: 3, pulse: 1 },
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
    basicDrowsy: 14, // somnolencia por golpe básico
    susceptMul: 1.45, susceptT: 8, // nv. 5: quien ya se durmió acumula más rápido
    lullaby: { range: 210, rangeT3: 270, cone: 0.95, coneT3: 1.15, dmg: 0.45, drowsy: 48 },
    stalk: { maxT: 10, chargeT: 3, chargeTT3: 1.6, bonusMax: 1.2, drowsyBonus: 35 }, // Acecho
    ult: { range: 1400, nextMul: 2.2, nextDrowsy: 40, buffT: 4 },
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
    potion: { range: 360, speed: 520, r: 64, rT1: 84 },
    fire: { t: 3, tT1: 4.5, dps: 9 }, acid: { dmg: 1.0, slowT: 2, slowMul: 0.5 }, hex: { dmg: 0.6, weakT: 3, vulnT: 3, vulnMul: 1.25 },
    big: { r: 140, mul: 1.8 },
    broom: { t: 2.6, tT3: 4, speedMul: 1.35 },
    powerupMul: 1.5, // los power-ups le hacen más efecto
    ult: { range: 420, r: 230, tPlayer: 3, tOther: 5 },
  },
};

// ---------------------------------------------------------------------------
// La orden de cazadores: aparecen según el nivel medio de la sala
// ---------------------------------------------------------------------------
export type HunterType = 'cazador' | 'inquisidor' | 'exorcista' | 'sectario' | 'heraldo';
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
};
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
  caps: { inquisidor: 3, exorcista: 3, sectario: 2, heraldo: 2 },
};
