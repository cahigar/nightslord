// Aviso de «Nuevo parche» (solo en mooonsters.com, no en portales): lo presenta Barbasucia al entrar al menú,
// una vez por parche y a todo el mundo (así se ve que el juego se actualiza). Para un parche nuevo: cambia PATCH_ID y las notas.
import type { Lang } from './i18n';

/** Versión del parche: se muestra en el título y es la clave de «ya visto». */
export const PATCH_ID = 'v1.13';

interface Notes { title: string; sub: string; ok: string; items: string[] }

export const PATCH_NOTES: Record<Lang, Notes> = {
  es: {
    title: '¡Nuevo parche!', sub: 'Arrr, grumete: ¡más cambios en la noche!', ok: '¡A cazar!',
    items: [
      '👻 <b>Ectoplasmas</b> (El Señor de la Noche): fantasmitos pequeños y semitransparentes que no tapan la partida, y más lentos.',
      '🩸 Nueva Q <b>Sed de vida</b>: vuelan el doble de rápido 5 s (cada 30 s). La vibración quita algo más, pero se recarga en 45 s.',
      '🏴‍☠️ <b>Barbasucia</b>: sus barriles hacen todavía más daño.',
      '🛸 <b>Visitante</b>: su baliza hace más daño.',
      '🔥 <b>Azufre</b>: sus ataques prenden la vegetación y queman el doble las plantas de Raíz Negra.',
      '📜 Y todo lo del parche anterior: clases, +50 % de vida y ajustes de 16 monstruos.',
    ],
  },
  en: {
    title: 'New patch!', sub: 'Arrr, matey: more changes in the night!', ok: 'Let\'s hunt!',
    items: [
      '👻 <b>Ectoplasms</b> (Lord of the Night): small, see-through little ghosts that no longer block the view, and slower.',
      '🩸 New Q <b>Thirst for life</b>: they fly twice as fast for 5 s (every 30 s). Shudder hits a bit harder but recharges in 45 s.',
      '🏴‍☠️ <b>Dirtybeard</b>: his kegs deal even more damage.',
      '🛸 <b>The Visitor</b>: his beacon deals more damage.',
      '🔥 <b>Brimstone</b>: his attacks set vegetation on fire and burn Blackroot\'s plants twice as hard.',
      '📜 Plus everything from the last patch: classes, +50% health and changes to 16 monsters.',
    ],
  },
  fr: {
    title: 'Nouveau patch !', sub: 'Arrr, moussaillon : encore du changement dans la nuit !', ok: 'À la chasse !',
    items: [
      '👻 <b>Ectoplasmes</b> (Le Seigneur de la Nuit) : petits fantômes translucides qui ne cachent plus la partie, et plus lents.',
      '🩸 Nouveau Q <b>Soif de vie</b> : ils volent deux fois plus vite pendant 5 s (toutes les 30 s). La vibration frappe un peu plus fort mais se recharge en 45 s.',
      '🏴‍☠️ <b>Barbesale</b> : ses tonneaux font encore plus de dégâts.',
      '🛸 <b>Le Visiteur</b> : sa balise fait plus de dégâts.',
      '🔥 <b>Soufre</b> : ses attaques enflamment la végétation et brûlent deux fois plus les plantes de Racine Noire.',
      '📜 Et tout le patch précédent : classes, +50 % de vie et ajustements de 16 monstres.',
    ],
  },
  ca: {
    title: 'Nou pedaç!', sub: 'Arrr, grumet: més canvis a la nit!', ok: 'A caçar!',
    items: [
      '👻 <b>Ectoplasmes</b> (El Senyor de la Nit): fantasmets petits i semitransparents que no tapen la partida, i més lents.',
      '🩸 Nova Q <b>Set de vida</b>: volen el doble de ràpid 5 s (cada 30 s). La vibració fa una mica més de mal, però es recarrega en 45 s.',
      '🏴‍☠️ <b>Barbabruta</b>: els seus barrils fan encara més mal.',
      '🛸 <b>El Visitant</b>: la seva balisa fa més mal.',
      '🔥 <b>Sofre</b>: els seus atacs encenen la vegetació i cremen el doble les plantes d\'Arrel Negra.',
      '📜 I tot el pedaç anterior: classes, +50 % de vida i ajustos de 16 monstres.',
    ],
  },
  eu: {
    title: 'Adabaki berria!', sub: 'Arrr, mutil: aldaketa gehiago gauean!', ok: 'Ehizara!',
    items: [
      '👻 <b>Ektoplasmak</b> (Gauaren Jauna): mamu txiki eta erdi gardenak, partida estaltzen ez dutenak, eta motelagoak.',
      '🩸 Q berria, <b>Bizi-egarria</b>: bi aldiz azkarrago hegan egiten dute 5 s (30 s-ro). Dardarak zertxobait gehiago kentzen du, baina 45 s behar ditu kargatzeko.',
      '🏴‍☠️ <b>Bizarzikin</b>: bere upelek are kalte gehiago egiten dute.',
      '🛸 <b>Bisitaria</b>: bere balizak kalte gehiago egiten du.',
      '🔥 <b>Sufrea</b>: bere erasoek landaredia pizten dute eta Erro Beltzaren landareak bikoitza erretzen dituzte.',
      '📜 Eta aurreko adabakia: klaseak, % 50 bizitza gehiago eta 16 munstroren doikuntzak.',
    ],
  },
  zh: {
    title: '新版本上线！', sub: '啊哈，水手：夜晚又有新变化！', ok: '去狩猎！',
    items: [
      '👻 <b>灵质体</b>（暗夜之王）：变成小小的半透明幽灵，不再遮挡视野，速度也更慢。',
      '🩸 新 Q 技能<b>生命渴望</b>：5 秒内飞行速度翻倍（冷却 30 秒）。震荡伤害略微提高，但冷却变为 45 秒。',
      '🏴‍☠️ <b>脏胡子</b>：火药桶伤害更高。',
      '🛸 <b>来客</b>：信标伤害更高。',
      '🔥 <b>硫磺</b>：攻击会点燃植被，对黑根的植物造成双倍灼烧。',
      '📜 以及上个版本的全部内容：职业、生命 +50% 和 16 个怪物的调整。',
    ],
  },
  ja: {
    title: '新パッチ登場！', sub: 'アーッ、新米よ：夜にまた変化だ！', ok: '狩りに行こう！',
    items: [
      '👻 <b>エクトプラズム</b>（夜の王）：小さな半透明のおばけになり、画面をふさがず、動きも遅く。',
      '🩸 新Q<b>生への渇望</b>：5秒間2倍の速さで飛ぶ（30秒ごと）。振動のダメージは少し上がるが、クールダウンは45秒。',
      '🏴‍☠️ <b>ヨゴレヒゲ</b>：樽のダメージがさらにアップ。',
      '🛸 <b>ビジター</b>：ビーコンのダメージがアップ。',
      '🔥 <b>ブリムストーン</b>：攻撃で草木が燃え、ブラックルートの植物を2倍焼く。',
      '📜 前回のパッチ内容もすべて：クラス、体力+50%、16体のモンスター調整。',
    ],
  },
};
