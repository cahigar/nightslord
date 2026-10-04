import type { CharacterId } from '../../shared/characters';
import { invisibleKit } from './invisible';
import { mummyKit } from './mummy';
import type { Kit } from './types';
import { vampireKit } from './vampire';
import { werewolfKit } from './werewolf';

/** Registro de kits. Un monstruo nuevo = un kit nuevo aquí. */
export const KITS: Record<CharacterId, Kit> = {
  vampire: vampireKit,
  werewolf: werewolfKit,
  mummy: mummyKit,
  invisible: invisibleKit,
};

export type { Kit } from './types';
