// Valores de balance de habilidades, evolución y definitivas.
// Separados de la implementación (server/kits) para poder equilibrar sin tocar la lógica.

/** Niveles en los que cambia la evolución del monstruo. */
export const TIER_LEVELS = [5, 10, 15] as const;
export const tierOf = (level: number) => (level >= 15 ? 3 : level >= 10 ? 2 : level >= 5 ? 1 : 0);

/** Carga de la definitiva (R): se gana con bajas, no con el tiempo. */
export const ULT = {
  max: 100,
  onUnlock: 30, // carga regalada al llegar al nivel 10
  npc: 4, // humano normal: aporta poco
  player: 25, // otro monstruo: bastante
  helsing: 40, // Helsing: mucho
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
    howlT: 5, howlDmgMul: 1.3, howlSpeedMul: 1.2, howlR: 420, fearNpcT: 1.8, fearHelsingT: 0.8, fearHelsingR: 260,
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
    ult: { dur: 15, radius: 750, surpriseStunPlayer: 2.5, surpriseStunHelsing: 5, vulnMul: 1.3, vulnMulHelsing: 1.5 },
  },
};
