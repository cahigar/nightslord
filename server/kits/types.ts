// Interfaz de un "kit" de personaje: la implementación de sus habilidades.
// La sala (Room) es autoritativa y expone una API; el kit solo decide QUÉ hace cada botón.
// Para añadir un monstruo: crea un kit nuevo y regístralo en kits/index.ts.
import type { Mob, Player, Projectile } from '../entities';
import type { Room } from '../Room';

export interface Kit {
  /** Ataque básico (el cooldown ya lo gestiona la sala). */
  basic(room: Room, p: Player, a: number): void;
  /** Q (slot 0) o E (slot 1). */
  ability(room: Room, p: Player, slot: 0 | 1, a: number): void;
  /** Definitiva. Devuelve true si se ha lanzado (consume la carga). */
  ult(room: Room, p: Player, a: number): boolean;
  /** Lógica por tick (estados propios, pasivas). */
  tick?(room: Room, p: Player, dt: number): void;
  /** Multiplicadores (1 = sin cambio). */
  speedMul?(room: Room, p: Player): number;
  atkSpeedMul?(room: Room, p: Player): number; // multiplica el enfriamiento del ataque básico
  cdRate?(room: Room, p: Player): number; // velocidad de recuperación de Q/E
  qCharges?(p: Player): number; // cargas máximas de Q
  /** Ganchos de combate. */
  onKill?(room: Room, p: Player, victim: Mob): void;
  onDealDamage?(room: Room, p: Player, target: Mob, amount: number): number;
  onProjectileHit?(room: Room, p: Player, pr: Projectile, target: Mob, dealt: number): void;
  /** ¿Bloquea este proyectil enemigo? (p. ej. murciélagos orbitales) */
  blockProjectile?(room: Room, p: Player, pr: Projectile): boolean;
  /** Al alcanzar un nuevo tier de evolución (1, 2 o 3). */
  onTier?(room: Room, p: Player, tier: number): void;
}
