import type { CharacterId } from '../../shared/characters';
import { alienKit } from './alien';
import { demonKit } from './demon';
import { dinoKit } from './dino';
import { doppyKit, setKits } from './doppy';
import { candleKit } from './candle';
import { huntressKit } from './huntress';
import { invisibleKit } from './invisible';
import { kappaKit } from './kappa';
import { kthulaKit } from './kthula';
import { maryKit } from './mary';
import { mummyKit } from './mummy';
import { necroKit } from './necro';
import { nightmareKit } from './nightmare';
import { pirateKit } from './pirate';
import { r800Kit } from './r800';
import { poltergeistKit } from './poltergeist';
import { reanimatedKit } from './reanimated';
import { reaperKit } from './reaper';
import { scarecrowKit } from './scarecrow';
import { slimeKit } from './slime';
import { spiderKit } from './spider';
import { staticKit } from './static';
import { succubusKit } from './succubus';
import { treeKit } from './tree';
import { unitKit } from './unit';
import type { Kit } from './types';
import { vampireKit } from './vampire';
import { werewolfKit } from './werewolf';
import { witchKit } from './witch';
import { wormKit } from './worm';
import { zombieKit } from './zombie';

/** Registro de kits. Un monstruo nuevo = un kit nuevo aquí. */
export const KITS: Record<CharacterId, Kit> = {
  vampire: vampireKit,
  werewolf: werewolfKit,
  mummy: mummyKit,
  invisible: invisibleKit,
  zombie: zombieKit,
  kthula: kthulaKit,
  nightmare: nightmareKit,
  mary: maryKit,
  reanimated: reanimatedKit,
  doppy: doppyKit,
  witch: witchKit,
  succubus: succubusKit,
  poltergeist: poltergeistKit,
  tree: treeKit,
  pirate: pirateKit,
  spider: spiderKit,
  scarecrow: scarecrowKit,
  demon: demonKit,
  slime: slimeKit,
  alien: alienKit,
  static: staticKit,
  kappa: kappaKit,
  reaper: reaperKit,
  unit: unitKit,
  necro: necroKit,
  worm: wormKit,
  dino: dinoKit,
  r800: r800Kit,
  huntress: huntressKit,
  candle: candleKit,
};
setKits(KITS); // Doppy necesita los kits de los demás para imitarlos

export type { Kit } from './types';
