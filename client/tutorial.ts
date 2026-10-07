// Tutorial: instrucciones y tres lecciones de práctica (cuerpo a cuerpo, a distancia e invocador).
// Cada lección es una lista de pasos que se comprueban en el cliente con lo que ya llega del servidor.
import type { CharacterId } from '../shared/characters';
import { lang, tc } from './i18n';

export type TutChar = 'vampire' | 'mummy' | 'zombie';
export const TUT_CHARS: TutChar[] = ['vampire', 'mummy', 'zombie'];

/** Contadores que alimentan los pasos. */
export interface TutCtx { moved: number; kills: number; farKills: number; hunterKills: number; healed: number; q: number; e: number; minions: number; lvl: number; ups: number; ult: number }
export interface TutStep { id: string; m: keyof TutCtx; n: number; abs?: boolean; action?: 'boost' | 'hunter'; passive?: boolean }

const MOVE: TutStep = { id: 'move', m: 'moved', n: 600 };
const LVL5: TutStep = { id: 'lvl5', m: 'lvl', n: 5, abs: true };
const UPG: TutStep = { id: 'upgrade', m: 'ups', n: 1, abs: true };
const ULT: TutStep = { id: 'ult', m: 'ult', n: 1, abs: true, action: 'boost' };
const HUNTER: TutStep = { id: 'hunter', m: 'hunterKills', n: 1, action: 'hunter' };

export const LESSONS: Record<TutChar, TutStep[]> = {
  vampire: [MOVE, { id: 'v_bite', m: 'kills', n: 3 }, { id: 'v_passive', m: 'healed', n: 15, passive: true }, { id: 'q', m: 'q', n: 1 }, { id: 'v_e', m: 'e', n: 1 }, LVL5, UPG, ULT, HUNTER],
  mummy: [MOVE, { id: 'm_shoot', m: 'farKills', n: 2, passive: true }, { id: 'm_q', m: 'q', n: 1 }, { id: 'm_e', m: 'e', n: 1 }, LVL5, UPG, ULT, { ...HUNTER, id: 'm_hunter' }],
  zombie: [MOVE, { id: 'z_q', m: 'minions', n: 2, abs: true, passive: true }, { id: 'z_e', m: 'e', n: 1 }, { id: 'z_bite', m: 'kills', n: 4 }, LVL5, UPG, ULT, { ...HUNTER, id: 'z_hunter' }],
};

type Txt = Record<string, string>;
const ES: Txt = {
  btn: '📖 Tutorial',
  title: 'Cómo se juega',
  practice: 'Practica con 3 monstruos',
  practiceBtn: '▶ Practicar',
  back: '◀ Volver',
  toMenu: 'Ir al menú',
  done: '✓ Hecha',
  lesson: 'Lección {i}/3',
  step: 'Paso {i}/{n}',
  lessonDone: '¡Lección completada!',
  lessonDoneSub: 'Ya dominas a {n}. Nada de lo que hagas en la práctica cuenta para monedas ni medallas.',
  allDone: '¡Has completado el tutorial! Ya estás listo para la noche de verdad.',
  next: 'Siguiente lección ▶',
  playReal: '🦇 Jugar de verdad',
  exitTut: 'Salir',
  passive: 'PASIVA',
  c_vampire: 'Cuerpo a cuerpo y robo de vida',
  c_mummy: 'Ataque a distancia y control',
  c_zombie: 'Invocador: tus zombis luchan por ti',
  // instrucciones
  h_goal: '🎯 Objetivo',
  goal: 'Eres un monstruo. Caza humanos para ganar experiencia, sube de nivel, evoluciona y consigue la mejor puntuación de la sala. Puedes entrar y salir cuando quieras.',
  h_pc: '⌨️ Controles (PC)',
  pc: '<b>WASD</b> moverse · <b>ratón</b> apuntar · <b>clic / Espacio</b> atacar · <b>Q</b> (o clic derecho) y <b>E</b> habilidades · <b>R</b> definitiva · <b>1-4</b> mejoras · <b>I</b> ficha del monstruo · <b>G</b> saludar · <b>T</b> provocar · <b>H</b> alianza',
  h_mob: '📱 Controles (móvil)',
  mob: 'Joystick a la izquierda para moverte. Botones a la derecha: ⚔ ataca, Q, E y R. Arrastra un botón para apuntar y suéltalo para lanzar. Toca las mejoras cuando aparezcan.',
  h_lvl: '⬆️ Niveles y evoluciones',
  lvl: 'Cada nivel te da un punto de mejora (vida, fuerza, velocidad o poder). En los niveles <b>5</b>, <b>10</b> y <b>15</b> tu monstruo evoluciona; en el 10 se desbloquea la definitiva <b>R</b>.',
  h_ult: '💥 Definitiva',
  ult: 'La <b>R</b> se carga con bajas: los humanos dan poco; los Cazadores y otros monstruos, mucho. Cuando la barra brilla, ¡úsala!',
  h_hunt: '🏹 Cazadores',
  hunt: 'Los Cazadores te persiguen y pegan fuerte; cuantos más jugadores y más nivel, más aparecen. Derrotarlos da mucha experiencia y monedas.',
  h_items: '🧪 Objetos',
  items: 'Por el mapa hay sangre (vida), velocidad, furia, escudo, monedas y experiencia, además de objetos especiales. ¡Recógelos!',
  h_pvp: '🤝 Otros monstruos',
  pvp: 'Puedes cazar a otros jugadores (dan mucho) o proponerles una alianza con <b>H</b>... aunque las alianzas se pueden traicionar.',
  h_death: '💀 Si caes',
  death: 'Vuelves a la misma sala desde tu última evolución y con experiencia doble hasta recuperar tu nivel. Las monedas desbloquean monstruos y skins; inicia sesión con Google para guardarlas.',
  // pasos
  s_move: 'Muévete por el mapa: <b>WASD</b> o el joystick.',
  s_v_bite: 'Muerde a 3 humanos con <b>{a}</b>: clic o Espacio (en móvil, ⚔). ¡Caza: {c}/{n}!',
  s_v_passive: '<b>{pn}</b>: {pd} Empiezas con media vida: recupérala mordiendo ({c}/{n}).',
  s_q: 'Usa la <b>Q · {q}</b>: {qd}',
  s_v_e: 'Usa la <b>E · {e}</b>: {ed} Úsala para escapar o acercarte.',
  s_lvl5: 'Sube a nivel <b>5</b> cazando para evolucionar. En la práctica la experiencia va más rápida.',
  s_upgrade: '¡Tienes un punto de mejora! Elige una con <b>1-4</b> o tocándola.',
  s_ult: 'Te regalamos el nivel 10 con la barra llena: pulsa <b>R · {r}</b>. {rd}',
  s_hunter: '¡Un <b>Cazador</b>! Pega fuerte pero da mucha experiencia. Derrótalo.',
  s_m_shoot: '<b>{pn}</b>: {pd} Tu ataque es a distancia: apunta y dispara. Caza 2 humanos desde lejos ({c}/{n}).',
  s_m_q: 'Usa la <b>Q · {q}</b>: {qd} Ideal para que no se te escapen.',
  s_m_e: 'Usa la <b>E · {e}</b>: {ed}',
  s_m_hunter: '¡Un <b>Cazador</b>! Mantén la distancia: dispárale mientras retrocedes.',
  s_z_q: '<b>{pn}</b>: {pd} Usa la <b>Q · {q}</b> sobre humanos para tener 2 zombis a la vez ({c}/{n}).',
  s_z_e: 'Usa la <b>E · {e}</b>: {ed}',
  s_z_bite: 'Caza 4 humanos junto a tus zombis ({c}/{n}).',
  s_z_hunter: '¡Un <b>Cazador</b>! Lanza a tus zombis contra él y remata tú.',
};

const EN: Txt = {
  btn: '📖 Tutorial', title: 'How to play', practice: 'Practise with 3 monsters', practiceBtn: '▶ Practise', back: '◀ Back', toMenu: 'Go to menu', done: '✓ Done',
  lesson: 'Lesson {i}/3', step: 'Step {i}/{n}', lessonDone: 'Lesson complete!', lessonDoneSub: 'You have mastered {n}. Nothing in practice counts towards coins or medals.',
  allDone: 'Tutorial complete! You are ready for the real night.', next: 'Next lesson ▶', playReal: '🦇 Play for real', exitTut: 'Exit', passive: 'PASSIVE',
  c_vampire: 'Melee and life steal', c_mummy: 'Ranged attacks and control', c_zombie: 'Summoner: your zombies fight for you',
  h_goal: '🎯 Goal', goal: 'You are a monster. Hunt humans to gain experience, level up, evolve and get the best score in the room. Join and leave whenever you like.',
  h_pc: '⌨️ Controls (PC)', pc: '<b>WASD</b> move · <b>mouse</b> aim · <b>click / Space</b> attack · <b>Q</b> (or right click) and <b>E</b> abilities · <b>R</b> ultimate · <b>1-4</b> upgrades · <b>I</b> monster info · <b>G</b> wave · <b>T</b> taunt · <b>H</b> alliance',
  h_mob: '📱 Controls (mobile)', mob: 'Joystick on the left to move. Buttons on the right: ⚔ attack, Q, E and R. Drag a button to aim and release to cast. Tap upgrades when they appear.',
  h_lvl: '⬆️ Levels and evolutions', lvl: 'Each level gives you an upgrade point (health, strength, speed or power). At levels <b>5</b>, <b>10</b> and <b>15</b> your monster evolves; level 10 unlocks the <b>R</b> ultimate.',
  h_ult: '💥 Ultimate', ult: '<b>R</b> charges with kills: humans give a little; Hunters and other monsters, a lot. When the bar glows, use it!',
  h_hunt: '🏹 Hunters', hunt: 'Hunters chase you and hit hard; more players and higher levels bring more of them. Defeating them gives lots of experience and coins.',
  h_items: '🧪 Items', items: 'Around the map there is blood (health), speed, fury, shield, coins and experience, plus special items. Grab them!',
  h_pvp: '🤝 Other monsters', pvp: 'You can hunt other players (they give a lot) or offer an alliance with <b>H</b>... though alliances can be betrayed.',
  h_death: '💀 If you fall', death: 'You come back to the same room from your last evolution, with double experience until you recover your level. Coins unlock monsters and skins; sign in with Google to keep them.',
  s_move: 'Move around the map: <b>WASD</b> or the joystick.',
  s_v_bite: 'Bite 3 humans with <b>{a}</b>: click or Space (⚔ on mobile). Hunt: {c}/{n}!',
  s_v_passive: '<b>{pn}</b>: {pd} You start with half health: recover it by biting ({c}/{n}).',
  s_q: 'Use <b>Q · {q}</b>: {qd}', s_v_e: 'Use <b>E · {e}</b>: {ed} Use it to escape or close in.',
  s_lvl5: 'Reach level <b>5</b> by hunting to evolve. Experience is faster in practice.',
  s_upgrade: 'You have an upgrade point! Pick one with <b>1-4</b> or by tapping it.',
  s_ult: 'Here is level 10 with a full bar: press <b>R · {r}</b>. {rd}',
  s_hunter: 'A <b>Hunter</b>! Hits hard but gives lots of experience. Defeat it.',
  s_m_shoot: '<b>{pn}</b>: {pd} Your attack is ranged: aim and shoot. Hunt 2 humans from afar ({c}/{n}).',
  s_m_q: 'Use <b>Q · {q}</b>: {qd} Great to stop them escaping.', s_m_e: 'Use <b>E · {e}</b>: {ed}',
  s_m_hunter: 'A <b>Hunter</b>! Keep your distance: shoot while backing away.',
  s_z_q: '<b>{pn}</b>: {pd} Use <b>Q · {q}</b> on humans to have 2 zombies at once ({c}/{n}).',
  s_z_e: 'Use <b>E · {e}</b>: {ed}', s_z_bite: 'Hunt 4 humans alongside your zombies ({c}/{n}).',
  s_z_hunter: 'A <b>Hunter</b>! Send your zombies at it and finish it off.',
};

const FR: Txt = {
  btn: '📖 Tutoriel', title: 'Comment jouer', practice: 'Entraîne-toi avec 3 monstres', practiceBtn: '▶ S\'entraîner', back: '◀ Retour', toMenu: 'Aller au menu', done: '✓ Fait',
  lesson: 'Leçon {i}/3', step: 'Étape {i}/{n}', lessonDone: 'Leçon terminée !', lessonDoneSub: 'Tu maîtrises {n}. Rien de l\'entraînement ne compte pour les pièces ni les médailles.',
  allDone: 'Tutoriel terminé ! Tu es prêt pour la vraie nuit.', next: 'Leçon suivante ▶', playReal: '🦇 Jouer pour de vrai', exitTut: 'Quitter', passive: 'PASSIF',
  c_vampire: 'Corps à corps et vol de vie', c_mummy: 'Attaque à distance et contrôle', c_zombie: 'Invocateur : tes zombies se battent pour toi',
  h_goal: '🎯 Objectif', goal: 'Tu es un monstre. Chasse des humains pour gagner de l\'expérience, monter de niveau, évoluer et faire le meilleur score du salon.',
  h_pc: '⌨️ Commandes (PC)', pc: '<b>WASD</b> se déplacer · <b>souris</b> viser · <b>clic / Espace</b> attaquer · <b>Q</b> (ou clic droit) et <b>E</b> compétences · <b>R</b> ultime · <b>1-4</b> améliorations · <b>I</b> fiche · <b>G</b> saluer · <b>T</b> provoquer · <b>H</b> alliance',
  h_mob: '📱 Commandes (mobile)', mob: 'Joystick à gauche pour bouger. Boutons à droite : ⚔ attaque, Q, E et R. Fais glisser un bouton pour viser et relâche pour lancer.',
  h_lvl: '⬆️ Niveaux et évolutions', lvl: 'Chaque niveau donne un point d\'amélioration. Aux niveaux <b>5</b>, <b>10</b> et <b>15</b> ton monstre évolue ; le niveau 10 débloque l\'ultime <b>R</b>.',
  h_ult: '💥 Ultime', ult: '<b>R</b> se charge avec les éliminations : les humains donnent peu, les Chasseurs et les monstres beaucoup.',
  h_hunt: '🏹 Chasseurs', hunt: 'Les Chasseurs te poursuivent et frappent fort ; ils sont plus nombreux avec plus de joueurs et de niveau. Les vaincre rapporte beaucoup.',
  h_items: '🧪 Objets', items: 'Sang (vie), vitesse, furie, bouclier, pièces, expérience et objets spéciaux sont éparpillés sur la carte.',
  h_pvp: '🤝 Autres monstres', pvp: 'Tu peux chasser les autres joueurs ou leur proposer une alliance avec <b>H</b>... qui peut être trahie.',
  h_death: '💀 Si tu tombes', death: 'Tu reviens dans le même salon depuis ta dernière évolution, avec expérience double jusqu\'à ton ancien niveau.',
  s_move: 'Déplace-toi : <b>WASD</b> ou le joystick.', s_v_bite: 'Mords 3 humains avec <b>{a}</b> ({c}/{n}).',
  s_v_passive: '<b>{pn}</b> : {pd} Tu commences à mi-vie : récupère-la en mordant ({c}/{n}).', s_q: 'Utilise <b>Q · {q}</b> : {qd}', s_v_e: 'Utilise <b>E · {e}</b> : {ed}',
  s_lvl5: 'Atteins le niveau <b>5</b> pour évoluer.', s_upgrade: 'Choisis une amélioration avec <b>1-4</b> ou en la touchant.',
  s_ult: 'Voici le niveau 10 avec la barre pleine : appuie sur <b>R · {r}</b>. {rd}', s_hunter: 'Un <b>Chasseur</b> ! Il frappe fort mais rapporte beaucoup. Bats-le.',
  s_m_shoot: '<b>{pn}</b> : {pd} Ton attaque est à distance. Chasse 2 humains de loin ({c}/{n}).', s_m_q: 'Utilise <b>Q · {q}</b> : {qd}', s_m_e: 'Utilise <b>E · {e}</b> : {ed}',
  s_m_hunter: 'Un <b>Chasseur</b> ! Garde tes distances et tire en reculant.', s_z_q: '<b>{pn}</b> : {pd} Utilise <b>Q · {q}</b> pour avoir 2 zombies ({c}/{n}).',
  s_z_e: 'Utilise <b>E · {e}</b> : {ed}', s_z_bite: 'Chasse 4 humains avec tes zombies ({c}/{n}).', s_z_hunter: 'Un <b>Chasseur</b> ! Envoie tes zombies et achève-le.',
};

const CA: Txt = {
  btn: '📖 Tutorial', title: 'Com es juga', practice: 'Practica amb 3 monstres', practiceBtn: '▶ Practicar', back: '◀ Tornar', toMenu: 'Anar al menú', done: '✓ Feta',
  lesson: 'Lliçó {i}/3', step: 'Pas {i}/{n}', lessonDone: 'Lliçó completada!', lessonDoneSub: 'Ja domines {n}. La pràctica no compta per a monedes ni medalles.',
  allDone: 'Tutorial completat! Ja estàs a punt per a la nit de veritat.', next: 'Lliçó següent ▶', playReal: '🦇 Jugar de debò', exitTut: 'Sortir', passive: 'PASSIVA',
  c_vampire: 'Cos a cos i robatori de vida', c_mummy: 'Atac a distància i control', c_zombie: 'Invocador: els teus zombis lluiten per tu',
  h_goal: '🎯 Objectiu', goal: 'Ets un monstre. Caça humans per guanyar experiència, puja de nivell, evoluciona i aconsegueix la millor puntuació de la sala.',
  h_pc: '⌨️ Controls (PC)', pc: '<b>WASD</b> moure\'s · <b>ratolí</b> apuntar · <b>clic / Espai</b> atacar · <b>Q</b> (o clic dret) i <b>E</b> habilitats · <b>R</b> definitiva · <b>1-4</b> millores · <b>I</b> fitxa · <b>G</b> saludar · <b>T</b> provocar · <b>H</b> aliança',
  h_mob: '📱 Controls (mòbil)', mob: 'Joystick a l\'esquerra per moure\'t. Botons a la dreta: ⚔ atac, Q, E i R. Arrossega un botó per apuntar i deixa\'l anar per llançar.',
  h_lvl: '⬆️ Nivells i evolucions', lvl: 'Cada nivell et dona un punt de millora. Als nivells <b>5</b>, <b>10</b> i <b>15</b> evolucionas; al 10 es desbloqueja la definitiva <b>R</b>.',
  h_ult: '💥 Definitiva', ult: 'La <b>R</b> es carrega amb baixes: els humans en donen poc; els Caçadors i els monstres, molt.',
  h_hunt: '🏹 Caçadors', hunt: 'Els Caçadors et persegueixen i piquen fort. Vèncer-los dona molta experiència i monedes.',
  h_items: '🧪 Objectes', items: 'Pel mapa hi ha sang (vida), velocitat, fúria, escut, monedes, experiència i objectes especials.',
  h_pvp: '🤝 Altres monstres', pvp: 'Pots caçar altres jugadors o proposar-los una aliança amb <b>H</b>... que es pot trair.',
  h_death: '💀 Si caus', death: 'Tornes a la mateixa sala des de la teva última evolució, amb experiència doble fins a recuperar el nivell.',
  s_move: 'Mou-te: <b>WASD</b> o el joystick.', s_v_bite: 'Mossega 3 humans amb <b>{a}</b> ({c}/{n}).', s_v_passive: '<b>{pn}</b>: {pd} Comences amb mitja vida: recupera-la mossegant ({c}/{n}).',
  s_q: 'Fes servir la <b>Q · {q}</b>: {qd}', s_v_e: 'Fes servir la <b>E · {e}</b>: {ed}', s_lvl5: 'Arriba al nivell <b>5</b> per evolucionar.', s_upgrade: 'Tria una millora amb <b>1-4</b> o tocant-la.',
  s_ult: 'Et regalem el nivell 10 amb la barra plena: prem <b>R · {r}</b>. {rd}', s_hunter: 'Un <b>Caçador</b>! Pica fort però dona molta experiència. Venç-lo.',
  s_m_shoot: '<b>{pn}</b>: {pd} El teu atac és a distància. Caça 2 humans de lluny ({c}/{n}).', s_m_q: 'Fes servir la <b>Q · {q}</b>: {qd}', s_m_e: 'Fes servir la <b>E · {e}</b>: {ed}',
  s_m_hunter: 'Un <b>Caçador</b>! Mantén la distància i dispara mentre recules.', s_z_q: '<b>{pn}</b>: {pd} Fes servir la <b>Q · {q}</b> per tenir 2 zombis ({c}/{n}).',
  s_z_e: 'Fes servir la <b>E · {e}</b>: {ed}', s_z_bite: 'Caça 4 humans amb els teus zombis ({c}/{n}).', s_z_hunter: 'Un <b>Caçador</b>! Llança-hi els zombis i remata\'l.',
};

const EU: Txt = {
  btn: '📖 Tutoriala', title: 'Nola jokatu', practice: 'Praktikatu 3 munstrorekin', practiceBtn: '▶ Praktikatu', back: '◀ Itzuli', toMenu: 'Menura joan', done: '✓ Eginda',
  lesson: '{i}/3 ikasgaia', step: '{i}/{n} urratsa', lessonDone: 'Ikasgaia osatuta!', lessonDoneSub: '{n} menderatzen duzu. Praktikak ez du txanpon edo dominarik ematen.',
  allDone: 'Tutoriala osatuta! Benetako gauerako prest zaude.', next: 'Hurrengo ikasgaia ▶', playReal: '🦇 Benetan jokatu', exitTut: 'Irten', passive: 'PASIBOA',
  c_vampire: 'Gertuko borroka eta bizitza lapurtzea', c_mummy: 'Urrutiko erasoa eta kontrola', c_zombie: 'Deitzailea: zure zonbiek zuregatik borrokatzen dute',
  h_goal: '🎯 Helburua', goal: 'Munstro bat zara. Ehizatu gizakiak esperientzia irabazteko, maila igotzeko eta eboluzionatzeko.',
  h_pc: '⌨️ Kontrolak (PC)', pc: '<b>WASD</b> mugitu · <b>sagua</b> apuntatu · <b>klik / Zuriunea</b> eraso · <b>Q</b> eta <b>E</b> trebetasunak · <b>R</b> behin betikoa · <b>1-4</b> hobekuntzak · <b>I</b> fitxa · <b>H</b> aliantza',
  h_mob: '📱 Kontrolak (mugikorra)', mob: 'Ezkerreko joystickarekin mugitu. Eskuineko botoiak: ⚔ erasoa, Q, E eta R. Arrastatu botoi bat apuntatzeko eta askatu jaurtitzeko.',
  h_lvl: '⬆️ Mailak eta eboluzioak', lvl: 'Maila bakoitzak hobekuntza puntu bat ematen du. <b>5</b>, <b>10</b> eta <b>15</b>. mailetan eboluzionatzen duzu; 10.ean <b>R</b> desblokeatzen da.',
  h_ult: '💥 Behin betikoa', ult: '<b>R</b> hilketekin kargatzen da: gizakiek gutxi, Ehiztariek eta munstroek asko.',
  h_hunt: '🏹 Ehiztariak', hunt: 'Ehiztariek jazarri eta gogor jotzen dute. Garaitzeak esperientzia eta txanpon asko ematen ditu.',
  h_items: '🧪 Objektuak', items: 'Mapan odola (bizitza), abiadura, amorrua, ezkutua, txanponak eta esperientzia daude.',
  h_pvp: '🤝 Beste munstroak', pvp: 'Beste jokalariak ehiza ditzakezu edo <b>H</b>-rekin aliantza proposatu.',
  h_death: '💀 Erortzen bazara', death: 'Gela berera itzultzen zara zure azken eboluziotik, esperientzia bikoitzarekin.',
  s_move: 'Mugitu: <b>WASD</b> edo joystick-a.', s_v_bite: 'Kosk egin 3 gizakiri <b>{a}</b>-rekin ({c}/{n}).', s_v_passive: '<b>{pn}</b>: {pd} Bizitza erdiarekin hasten zara: berreskuratu koska eginez ({c}/{n}).',
  s_q: 'Erabili <b>Q · {q}</b>: {qd}', s_v_e: 'Erabili <b>E · {e}</b>: {ed}', s_lvl5: 'Iritsi <b>5</b>. mailara eboluzionatzeko.', s_upgrade: 'Aukeratu hobekuntza bat <b>1-4</b>-rekin.',
  s_ult: '10. maila oparitzen dizugu barra beteta: sakatu <b>R · {r}</b>. {rd}', s_hunter: '<b>Ehiztari</b> bat! Gogor jotzen du baina esperientzia asko ematen du. Garaitu.',
  s_m_shoot: '<b>{pn}</b>: {pd} Zure erasoa urrutikoa da. Ehizatu 2 gizaki urrunetik ({c}/{n}).', s_m_q: 'Erabili <b>Q · {q}</b>: {qd}', s_m_e: 'Erabili <b>E · {e}</b>: {ed}',
  s_m_hunter: '<b>Ehiztari</b> bat! Mantendu distantzia eta tiro egin atzera egiten duzun bitartean.', s_z_q: '<b>{pn}</b>: {pd} Erabili <b>Q · {q}</b> 2 zonbi izateko ({c}/{n}).',
  s_z_e: 'Erabili <b>E · {e}</b>: {ed}', s_z_bite: 'Ehizatu 4 gizaki zure zonbiekin ({c}/{n}).', s_z_hunter: '<b>Ehiztari</b> bat! Bidali zure zonbiak eta amaitu zuk.',
};

const ZH: Txt = {
  btn: '📖 教程', title: '玩法', practice: '用 3 只怪物练习', practiceBtn: '▶ 练习', back: '◀ 返回', toMenu: '前往菜单', done: '✓ 完成',
  lesson: '第 {i}/3 课', step: '第 {i}/{n} 步', lessonDone: '课程完成！', lessonDoneSub: '你已掌握{n}。练习中的一切不计入金币和奖章。',
  allDone: '教程完成！你已准备好迎接真正的黑夜。', next: '下一课 ▶', playReal: '🦇 正式开始', exitTut: '退出', passive: '被动',
  c_vampire: '近战与吸血', c_mummy: '远程攻击与控制', c_zombie: '召唤师：你的僵尸为你而战',
  h_goal: '🎯 目标', goal: '你是一只怪物。猎杀人类获得经验，升级、进化，在房间里拿到最高分。',
  h_pc: '⌨️ 操作（电脑）', pc: '<b>WASD</b> 移动 · <b>鼠标</b> 瞄准 · <b>左键 / 空格</b> 攻击 · <b>Q</b>（或右键）和 <b>E</b> 技能 · <b>R</b> 终极技 · <b>1-4</b> 强化 · <b>I</b> 资料 · <b>H</b> 结盟',
  h_mob: '📱 操作（手机）', mob: '左侧摇杆移动。右侧按钮：⚔ 攻击、Q、E、R。拖动按钮瞄准，松开释放。',
  h_lvl: '⬆️ 等级与进化', lvl: '每升一级获得一个强化点。<b>5</b>、<b>10</b>、<b>15</b> 级时进化；10 级解锁终极技 <b>R</b>。',
  h_ult: '💥 终极技', ult: '<b>R</b> 靠击杀充能：人类给得少，猎人和怪物给得多。',
  h_hunt: '🏹 猎人', hunt: '猎人会追捕你并造成重创。击败他们可获得大量经验和金币。',
  h_items: '🧪 道具', items: '地图上有鲜血（生命）、速度、狂怒、护盾、金币、经验和特殊道具。',
  h_pvp: '🤝 其他怪物', pvp: '你可以猎杀其他玩家，或按 <b>H</b> 提议结盟……盟约可能被背叛。',
  h_death: '💀 倒下之后', death: '你会从上一次进化开始回到同一房间，并获得双倍经验直到恢复等级。',
  s_move: '移动：<b>WASD</b> 或摇杆。', s_v_bite: '用 <b>{a}</b> 咬 3 个人类（{c}/{n}）。', s_v_passive: '<b>{pn}</b>：{pd} 你开局只有一半生命：通过撕咬恢复（{c}/{n}）。',
  s_q: '使用 <b>Q · {q}</b>：{qd}', s_v_e: '使用 <b>E · {e}</b>：{ed}', s_lvl5: '升到 <b>5</b> 级来进化。', s_upgrade: '用 <b>1-4</b> 或点击选择一个强化。',
  s_ult: '送你 10 级和满充能：按 <b>R · {r}</b>。{rd}', s_hunter: '一个<b>猎人</b>！他攻击很强，但经验丰厚。击败他。',
  s_m_shoot: '<b>{pn}</b>：{pd} 你的攻击是远程的。从远处猎杀 2 个人类（{c}/{n}）。', s_m_q: '使用 <b>Q · {q}</b>：{qd}', s_m_e: '使用 <b>E · {e}</b>：{ed}',
  s_m_hunter: '一个<b>猎人</b>！保持距离，边退边射。', s_z_q: '<b>{pn}</b>：{pd} 对人类使用 <b>Q · {q}</b>，同时拥有 2 只僵尸（{c}/{n}）。',
  s_z_e: '使用 <b>E · {e}</b>：{ed}', s_z_bite: '和僵尸一起猎杀 4 个人类（{c}/{n}）。', s_z_hunter: '一个<b>猎人</b>！派僵尸上，你来补刀。',
};

const JA: Txt = {
  btn: '📖 チュートリアル', title: '遊び方', practice: '3体のモンスターで練習', practiceBtn: '▶ 練習', back: '◀ 戻る', toMenu: 'メニューへ', done: '✓ 完了',
  lesson: 'レッスン {i}/3', step: 'ステップ {i}/{n}', lessonDone: 'レッスン完了！', lessonDoneSub: '{n}をマスターした。練習はコインやメダルに影響しない。',
  allDone: 'チュートリアル完了！本当の夜への準備はできた。', next: '次のレッスン ▶', playReal: '🦇 本番をプレイ', exitTut: '終了', passive: 'パッシブ',
  c_vampire: '近接攻撃と吸血', c_mummy: '遠距離攻撃とコントロール', c_zombie: '召喚：ゾンビが代わりに戦う',
  h_goal: '🎯 目的', goal: 'あなたはモンスター。人間を狩って経験値を得て、レベルアップ・進化し、ルームのトップを目指そう。',
  h_pc: '⌨️ 操作（PC）', pc: '<b>WASD</b> 移動 · <b>マウス</b> 照準 · <b>クリック / スペース</b> 攻撃 · <b>Q</b>（右クリック）と <b>E</b> スキル · <b>R</b> 必殺技 · <b>1-4</b> 強化 · <b>I</b> 情報 · <b>H</b> 同盟',
  h_mob: '📱 操作（スマホ）', mob: '左のスティックで移動。右のボタン：⚔ 攻撃、Q、E、R。ボタンをドラッグして狙い、離して発動。',
  h_lvl: '⬆️ レベルと進化', lvl: 'レベルごとに強化ポイント。<b>5</b>・<b>10</b>・<b>15</b> で進化し、10 で必殺技 <b>R</b> が解放。',
  h_ult: '💥 必殺技', ult: '<b>R</b> は撃破でチャージ：人間は少し、ハンターやモンスターはたくさん。',
  h_hunt: '🏹 ハンター', hunt: 'ハンターは追ってきて強力な攻撃をする。倒せば経験値とコインがたくさん。',
  h_items: '🧪 アイテム', items: 'マップには血（体力）、スピード、怒り、シールド、コイン、経験値、特殊アイテムがある。',
  h_pvp: '🤝 他のモンスター', pvp: '他のプレイヤーを狩るか、<b>H</b> で同盟を提案できる……裏切りもあり。',
  h_death: '💀 倒れたら', death: '同じルームに最後の進化から復帰し、元のレベルまで経験値2倍。',
  s_move: '移動しよう：<b>WASD</b> かスティック。', s_v_bite: '<b>{a}</b> で人間を3人噛もう（{c}/{n}）。', s_v_passive: '<b>{pn}</b>：{pd} 体力半分から開始：噛んで回復しよう（{c}/{n}）。',
  s_q: '<b>Q · {q}</b> を使おう：{qd}', s_v_e: '<b>E · {e}</b> を使おう：{ed}', s_lvl5: '狩ってレベル <b>5</b> にして進化しよう。', s_upgrade: '<b>1-4</b> かタップで強化を選ぼう。',
  s_ult: 'レベル10とフルチャージをプレゼント：<b>R · {r}</b> を押そう。{rd}', s_hunter: '<b>ハンター</b>だ！強いが経験値がたくさん。倒そう。',
  s_m_shoot: '<b>{pn}</b>：{pd} 攻撃は遠距離。遠くから人間を2人狩ろう（{c}/{n}）。', s_m_q: '<b>Q · {q}</b> を使おう：{qd}', s_m_e: '<b>E · {e}</b> を使おう：{ed}',
  s_m_hunter: '<b>ハンター</b>だ！距離を取り、下がりながら撃とう。', s_z_q: '<b>{pn}</b>：{pd} 人間に <b>Q · {q}</b> を使い、ゾンビを2体に（{c}/{n}）。',
  s_z_e: '<b>E · {e}</b> を使おう：{ed}', s_z_bite: 'ゾンビと一緒に人間を4人狩ろう（{c}/{n}）。', s_z_hunter: '<b>ハンター</b>だ！ゾンビを向かわせ、とどめを刺そう。',
};

const ALL: Record<string, Txt> = { es: ES, en: EN, fr: FR, ca: CA, eu: EU, zh: ZH, ja: JA };

/** Texto del tutorial en el idioma actual (con plantillas {x}). */
export function tt2(key: string, vars: Record<string, string | number> = {}): string {
  const s = ALL[lang]?.[key] ?? EN[key] ?? ES[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

/** Texto de un paso con los nombres de ataque, habilidades y pasiva del monstruo. */
export function stepText(ch: CharacterId, st: TutStep, c: number): string {
  const x = tc(ch);
  const [pn, ...pr] = x.passive.split(':');
  return tt2('s_' + st.id, {
    a: x.attack, q: x.q[0], qd: x.q[1], e: x.e[0], ed: x.e[1], r: x.r[0], rd: x.r[1],
    pn: pr.length ? pn : x.passive, pd: pr.length ? pr.join(':').trim() : '', c: Math.min(st.n, Math.floor(c)), n: st.n,
  });
}
