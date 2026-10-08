// Textos del modo El Señor de la Noche, los mapas Cementerio y Ciudad Z y las trampas (el castellano está en es.ts).
import type { Dict } from './es';

type Extra = { ui: Dict['ui']; themes: Dict['themes']; medals: Dict['medals']; words: Dict['words']; pu: Dict['pu'] };

const trapPu = (ui: Dict['ui']) => Object.fromEntries(['salt', 'seal', 'hand', 'eyes', 'ritual', 'candle', 'silence', 'blood'].map((k) => [`trap_${k}`, (ui as Record<string, string>)[`trapN_${k}`]]));

const EN: Extra['ui'] = {
  playNl: '🌅 Lord of the Night', playNlSub: 'Free-for-all · no respawns · dawn is coming', nlCreate: '🌅 Lord of the Night (lobby)',
  nlTitle: '🌅 LORD OF THE NIGHT', nlLobby: 'In the graveyard: {n} 👤 · ready {r}/{n}', nlWait: 'Waiting for another monster…',
  nlAuto: 'The match starts on its own in {s}', nlGo: 'Everyone ready! Starting in {s}', nlReadyHint: 'Everyone step into the candle circle to start now',
  nlAlive: '{a}/{n} alive', nlSunIn: '☀️ Dawn in {s} s: find the fog', nlSunMoves: '☀️ The sun is rising: hide in the fog', nlFogShrink: '🌫️ The fog is fading!',
  nlBurn: '🔥 YOU ARE BURNING IN THE SUN!', nlEcto: '👻 Ectoplasm · Q chill · E shudder · kill a living monster to come back', nlEctoSil: '👻 Silenced: you can no longer come back',
  nlSilIn: 'silence in {s} s', nlLobbyHelp: 'Graveyard: wait here for the next match. If everyone stands in the candle circle, it starts in 10 s.',
  nlMatchHelp: 'Last monster standing wins. If you fall, you roam as ectoplasm. Altars give XP; the sun burns.',
  podiumTitle: '🌅 DAWN', podiumPlace: 'You finished #{p}', podiumCoins: '+{c} 🪙 this match', podiumBack: 'Back to the graveyard in {s}…',
  ectoQ: 'Chill', ectoE: 'Shudder', ectoHp: 'ECTOPLASM', ectoSil: 'SILENCED',
  ectoBorn: '👻 You are ectoplasm: Q slows, E shudders. Kill a living monster to come back.', ectoRevive: 'You are back from the dead!',
  ritualWarn: '🕯️ A ritual by {n} claims you! It will summon you in 3 s.', eyesAlert: '👁️ {n} walked past your Ritual Eyes.',
  trapHit: 'You stepped on: {t}!', trapUse: 'Press X to place it at your feet', trapUseTouch: 'Tap its button to place it at your feet',
  matchRunning: 'That match has already started: wait in the lobby for the next one.',
  trapN_salt: 'Salt circle', trapD_salt: 'A ring enemies cannot cross (neither in nor out).',
  trapN_seal: 'Unholy seal', trapD_seal: 'Whoever steps on it is marked: takes more damage from everything for 1 minute.',
  trapN_hand: 'Grave hand', trapD_hand: 'Ghostly hands root whoever steps on it for 5 s.',
  trapN_eyes: 'Ritual eyes', trapD_eyes: 'They warn you when someone walks nearby.',
  trapN_ritual: 'Cultist ritual', trapD_ritual: 'After 3 s it summons a random player into the circle (they are warned).',
  trapN_candle: 'Black candle', trapD_candle: 'Darkens the area: nobody inside can see much, not even you.',
  trapN_silence: 'Seal of silence', trapD_silence: 'Whoever steps on it is silenced for 5 s (no abilities).',
  trapN_blood: 'Blood pentacle', trapD_blood: 'Hurts whoever steps on it and heals you the same.',
};
const FR: Extra['ui'] = {
  playNl: '🌅 Le Seigneur de la Nuit', playNlSub: 'Chacun pour soi · sans réapparition · l’aube approche', nlCreate: '🌅 Le Seigneur de la Nuit (salon)',
  nlTitle: '🌅 LE SEIGNEUR DE LA NUIT', nlLobby: 'Au cimetière : {n} 👤 · prêts {r}/{n}', nlWait: 'En attente d’un autre monstre…',
  nlAuto: 'La partie commence toute seule dans {s}', nlGo: 'Tout le monde est prêt ! Début dans {s}', nlReadyHint: 'Entrez tous dans le cercle de bougies pour commencer tout de suite',
  nlAlive: '{a}/{n} en vie', nlSunIn: '☀️ L’aube dans {s} s : trouve le brouillard', nlSunMoves: '☀️ Le soleil avance : réfugie-toi dans le brouillard', nlFogShrink: '🌫️ Le brouillard se dissipe !',
  nlBurn: '🔥 TU BRÛLES AU SOLEIL !', nlEcto: '👻 Ectoplasme · Q frisson · E vibration · tue un vivant pour ressusciter', nlEctoSil: '👻 Réduit au silence : tu ne peux plus ressusciter',
  nlSilIn: 'silence dans {s} s', nlLobbyHelp: 'Cimetière : on attend ici la prochaine partie. Si tout le monde entre dans le cercle de bougies, elle commence dans 10 s.',
  nlMatchHelp: 'Le dernier monstre debout gagne. Si tu tombes, tu erres en ectoplasme. Les autels donnent de l’XP ; le soleil brûle.',
  podiumTitle: '🌅 L’AUBE', podiumPlace: 'Tu termines {p}e', podiumCoins: '+{c} 🪙 cette partie', podiumBack: 'Retour au cimetière dans {s}…',
  ectoQ: 'Frisson', ectoE: 'Vibration', ectoHp: 'ECTOPLASME', ectoSil: 'SILENCE',
  ectoBorn: '👻 Tu es un ectoplasme : Q ralentit, E vibre. Tue un vivant pour ressusciter.', ectoRevive: 'Tu es ressuscité !',
  ritualWarn: '🕯️ Un rituel de {n} te réclame ! Il t’invoquera dans 3 s.', eyesAlert: '👁️ {n} est passé près de tes Yeux rituels.',
  trapHit: 'Tu as marché sur : {t} !', trapUse: 'Appuie sur X pour la poser à tes pieds', trapUseTouch: 'Touche son bouton pour la poser à tes pieds',
  matchRunning: 'Cette partie a déjà commencé : attends la suivante dans le salon.',
  trapN_salt: 'Cercle de sel', trapD_salt: 'Un anneau que les ennemis ne peuvent pas franchir (ni pour entrer ni pour sortir).',
  trapN_seal: 'Sceau impie', trapD_seal: 'Qui marche dessus est marqué : il subit plus de dégâts pendant 1 minute.',
  trapN_hand: 'Main sépulcrale', trapD_hand: 'Des mains fantômes enracinent 5 s celui qui marche dessus.',
  trapN_eyes: 'Yeux rituels', trapD_eyes: 'Ils te préviennent quand quelqu’un passe à côté.',
  trapN_ritual: 'Rituel de sectaire', trapD_ritual: 'Après 3 s, invoque un joueur au hasard dans le cercle (il est prévenu).',
  trapN_candle: 'Bougie noire', trapD_candle: 'Assombrit la zone : personne n’y voit presque rien, pas même toi.',
  trapN_silence: 'Sceau de silence', trapD_silence: 'Qui marche dessus est réduit au silence 5 s (sans compétences).',
  trapN_blood: 'Pentacle de sang', trapD_blood: 'Blesse qui marche dessus et te soigne d’autant.',
};
const EU: Extra['ui'] = {
  playNl: '🌅 Gauaren Jauna', playNlSub: 'Denak denen aurka · berpiztu gabe · egunsentia dator', nlCreate: '🌅 Gauaren Jauna (aurrekoa)',
  nlTitle: '🌅 GAUAREN JAUNA', nlLobby: 'Hilerrian: {n} 👤 · prest {r}/{n}', nlWait: 'Beste munstro baten zain…',
  nlAuto: 'Partida berez hasiko da {s} barru', nlGo: 'Denak prest! {s} barru hasiko da', nlReadyHint: 'Sartu denok kandelen zirkuluan orain hasteko',
  nlAlive: '{a}/{n} bizirik', nlSunIn: '☀️ {s} s barru egunsentia: bilatu lainoa', nlSunMoves: '☀️ Eguzkia aurrera doa: babestu lainoan', nlFogShrink: '🌫️ Lainoa desagertzen ari da!',
  nlBurn: '🔥 EGUZKITAN ERRETZEN ZAUDE!', nlEcto: '👻 Ektoplasma · Q hotzikara · E dardara · hil bizidun bat berpizteko', nlEctoSil: '👻 Isilarazita: ezin zara berpiztu',
  nlSilIn: 'isiltasuna {s} s barru', nlLobbyHelp: 'Hilerria: hemen itxaroten da hurrengo partida. Denok kandelen zirkuluan sartzen bazarete, 10 s barru hasiko da.',
  nlMatchHelp: 'Zutik geratzen den azken munstroak irabazten du. Erortzen bazara, ektoplasma gisa ibiliko zara. Aldareek esperientzia ematen dute; eguzkiak erretzen du.',
  podiumTitle: '🌅 EGUNSENTIA', podiumPlace: '{p}. geratu zara', podiumCoins: '+{c} 🪙 partida honetan', podiumBack: 'Hilerrira itzultzen {s} barru…',
  ectoQ: 'Hotzikara', ectoE: 'Dardara', ectoHp: 'EKTOPLASMA', ectoSil: 'ISILARAZITA',
  ectoBorn: '👻 Ektoplasma zara: Qk moteltzen du, Ek dardara. Hil bizidun bat berpizteko.', ectoRevive: 'Berpiztu zara!',
  ritualWarn: '🕯️ {n}(r)en errituala zure bila dator! 3 s barru deituko zaitu.', eyesAlert: '👁️ {n} zure Erritu-begien ondotik pasatu da.',
  trapHit: 'Zapaldu duzu: {t}!', trapUse: 'Sakatu X zure oinetan jartzeko', trapUseTouch: 'Ukitu bere botoia zure oinetan jartzeko',
  matchRunning: 'Partida hori hasita dago: itxaron hurrengoari aurrekoan.',
  trapN_salt: 'Gatz-zirkulua', trapD_salt: 'Etsaiek zeharkatu ezin duten eraztuna (ez sartzeko ez irteteko).',
  trapN_seal: 'Zigilu deabruzkoa', trapD_seal: 'Zapaltzen duena markatuta geratzen da: kalte gehiago jasotzen du minutu batez.',
  trapN_hand: 'Hilobi-eskua', trapD_hand: 'Esku mamuek 5 s errotzen dute zapaltzen duena.',
  trapN_eyes: 'Erritu-begiak', trapD_eyes: 'Norbait ondotik pasatzen denean abisatzen dizute.',
  trapN_ritual: 'Sektarioaren errituala', trapD_ritual: '3 s barru jokalari bat zoriz deitzen du zirkulura (abisua jasotzen du).',
  trapN_candle: 'Kandela beltza', trapD_candle: 'Eremua iluntzen du: barruan inork ez du ia ezer ikusten, zuk ere ez.',
  trapN_silence: 'Isiltasun-zigilua', trapD_silence: 'Zapaltzen duena 5 s isilarazita geratzen da (trebetasunik gabe).',
  trapN_blood: 'Odol-pentakulua', trapD_blood: 'Zapaltzen duena zauritzen du eta zu kopuru berean sendatzen zaitu.',
};
const CA: Extra['ui'] = {
  playNl: '🌅 El Senyor de la Nit', playNlSub: 'Tots contra tots · sense reaparèixer · arriba l’alba', nlCreate: '🌅 El Senyor de la Nit (prèvia)',
  nlTitle: '🌅 EL SENYOR DE LA NIT', nlLobby: 'Al cementiri: {n} 👤 · a punt {r}/{n}', nlWait: 'Esperant un altre monstre…',
  nlAuto: 'La partida comença sola d’aquí a {s}', nlGo: 'Tots a punt! Comença d’aquí a {s}', nlReadyHint: 'Entreu tots al cercle d’espelmes per començar ja',
  nlAlive: '{a}/{n} vius', nlSunIn: '☀️ Clareja d’aquí a {s} s: busca la boira', nlSunMoves: '☀️ El sol avança: refugia’t a la boira', nlFogShrink: '🌫️ La boira es dissipa!',
  nlBurn: '🔥 ET CREMES AL SOL!', nlEcto: '👻 Ectoplasma · Q calfred · E vibració · mata un viu per ressuscitar', nlEctoSil: '👻 Silenciat: ja no pots ressuscitar',
  nlSilIn: 'silenci d’aquí a {s} s', nlLobbyHelp: 'Cementiri: aquí s’espera la següent partida. Si tots entreu al cercle d’espelmes, comença en 10 s.',
  nlMatchHelp: 'Guanya l’últim monstre dret. Si caus, vagues com a ectoplasma. Els altars donen experiència; el sol crema.',
  podiumTitle: '🌅 CLAREJA', podiumPlace: 'Has quedat {p}è', podiumCoins: '+{c} 🪙 en aquesta partida', podiumBack: 'Tornant al cementiri d’aquí a {s}…',
  ectoQ: 'Calfred', ectoE: 'Vibració', ectoHp: 'ECTOPLASMA', ectoSil: 'SILENCIAT',
  ectoBorn: '👻 Ets un ectoplasma: Q alenteix, E vibra. Mata un viu per ressuscitar.', ectoRevive: 'Has ressuscitat!',
  ritualWarn: '🕯️ Un ritual de {n} et reclama! D’aquí a 3 s t’invocarà.', eyesAlert: '👁️ {n} ha passat pels teus Ulls rituals.',
  trapHit: 'Has trepitjat: {t}!', trapUse: 'Prem X per posar-la als teus peus', trapUseTouch: 'Toca el seu botó per posar-la als teus peus',
  matchRunning: 'Aquesta partida ja ha començat: espera la següent a la prèvia.',
  trapN_salt: 'Cercle de sal', trapD_salt: 'Un anell que els enemics no poden creuar (ni per entrar ni per sortir).',
  trapN_seal: 'Segell profà', trapD_seal: 'Qui el trepitja queda marcat: rep més mal de tot durant 1 minut.',
  trapN_hand: 'Mà sepulcral', trapD_hand: 'Unes mans fantasmals arrelen 5 s qui la trepitja.',
  trapN_eyes: 'Ulls rituals', trapD_eyes: 'T’avisen quan algú passa a prop.',
  trapN_ritual: 'Ritual de sectari', trapD_ritual: 'Als 3 s invoca dins del cercle un jugador a l’atzar (se l’avisa).',
  trapN_candle: 'Espelma negra', trapD_candle: 'Enfosqueix la zona: ningú hi veu gaire, ni tan sols tu.',
  trapN_silence: 'Segell de silenci', trapD_silence: 'Qui el trepitja queda silenciat 5 s (sense habilitats).',
  trapN_blood: 'Pentacle de sang', trapD_blood: 'Fereix qui el trepitja i et cura el mateix.',
};
const ZH: Extra['ui'] = {
  playNl: '🌅 暗夜之王', playNlSub: '大混战 · 不能复活 · 黎明将至', nlCreate: '🌅 暗夜之王（等候区）',
  nlTitle: '🌅 暗夜之王', nlLobby: '墓地里有 {n} 只怪物 · 准备 {r}/{n}', nlWait: '等待另一只怪物……',
  nlAuto: '比赛将在 {s} 后自动开始', nlGo: '全员准备！{s} 后开始', nlReadyHint: '所有人走进蜡烛圈即可立即开始',
  nlAlive: '存活 {a}/{n}', nlSunIn: '☀️ {s} 秒后天亮：快找雾', nlSunMoves: '☀️ 太阳在推进：躲进雾里', nlFogShrink: '🌫️ 雾正在散去！',
  nlBurn: '🔥 你在阳光下燃烧！', nlEcto: '👻 灵质体 · Q 寒颤 · E 震荡 · 杀死一个活人即可复活', nlEctoSil: '👻 已沉默：无法再复活',
  nlSilIn: '{s} 秒后沉默', nlLobbyHelp: '墓地：在这里等待下一场。如果所有人都站进蜡烛圈，10 秒后开始。',
  nlMatchHelp: '最后站着的怪物获胜。倒下后会变成灵质体游荡。祭坛给经验；阳光会灼烧。',
  podiumTitle: '🌅 天亮了', podiumPlace: '你获得第 {p} 名', podiumCoins: '本场 +{c} 🪙', podiumBack: '{s} 秒后返回墓地……',
  ectoQ: '寒颤', ectoE: '震荡', ectoHp: '灵质体', ectoSil: '已沉默',
  ectoBorn: '👻 你成了灵质体：Q 减速，E 震荡。杀死一个活人即可复活。', ectoRevive: '你复活了！',
  ritualWarn: '🕯️ {n} 的仪式在召唤你！3 秒后你会被拉过去。', eyesAlert: '👁️ {n} 经过了你的仪式之眼。',
  trapHit: '你踩到了：{t}！', trapUse: '按 X 放在脚下', trapUseTouch: '点它的按钮放在脚下',
  matchRunning: '这场比赛已经开始：请在等候区等待下一场。',
  trapN_salt: '盐圈', trapD_salt: '敌人无法穿过的圆环（进不来也出不去）。',
  trapN_seal: '亵渎之印', trapD_seal: '踩到的人被标记：1 分钟内受到的所有伤害增加。',
  trapN_hand: '墓穴之手', trapD_hand: '幽灵之手将踩到的人定身 5 秒。',
  trapN_eyes: '仪式之眼', trapD_eyes: '有人经过附近时提醒你。',
  trapN_ritual: '邪教仪式', trapD_ritual: '3 秒后随机召唤一名玩家进入圆圈（会提前警告他）。',
  trapN_candle: '黑蜡烛', trapD_candle: '让区域变暗：里面的人几乎什么都看不见，包括你。',
  trapN_silence: '沉默之印', trapD_silence: '踩到的人沉默 5 秒（无法使用技能）。',
  trapN_blood: '血之五芒星', trapD_blood: '伤害踩到的人，并为你恢复等量生命。',
};
const JA: Extra['ui'] = {
  playNl: '🌅 夜の王', playNlSub: 'バトルロイヤル · 復活なし · 夜明けが来る', nlCreate: '🌅 夜の王（ロビー）',
  nlTitle: '🌅 夜の王', nlLobby: '墓地に {n} 体 · 準備 {r}/{n}', nlWait: 'ほかのモンスターを待っています…',
  nlAuto: '{s} 後に自動で開始', nlGo: '全員準備完了！{s} 後に開始', nlReadyHint: '全員がロウソクの輪に入るとすぐに始まる',
  nlAlive: '生存 {a}/{n}', nlSunIn: '☀️ {s} 秒で夜明け：霧を探せ', nlSunMoves: '☀️ 太陽が迫る：霧に隠れろ', nlFogShrink: '🌫️ 霧が晴れていく！',
  nlBurn: '🔥 日光で焼けている！', nlEcto: '👻 エクトプラズム · Q 悪寒 · E 振動 · 生者を倒すと復活', nlEctoSil: '👻 沈黙：もう復活できない',
  nlSilIn: '{s} 秒後に沈黙', nlLobbyHelp: '墓地：ここで次の試合を待つ。全員がロウソクの輪に入れば 10 秒で開始。',
  nlMatchHelp: '最後まで立っていたモンスターの勝ち。倒れるとエクトプラズムになってさまよう。祭壇で経験値、日光は危険。',
  podiumTitle: '🌅 夜明け', podiumPlace: '{p} 位', podiumCoins: 'この試合 +{c} 🪙', podiumBack: '{s} 秒後に墓地へ戻る…',
  ectoQ: '悪寒', ectoE: '振動', ectoHp: 'エクトプラズム', ectoSil: '沈黙',
  ectoBorn: '👻 エクトプラズムになった：Q で減速、E で振動。生者を倒すと復活。', ectoRevive: '復活した！',
  ritualWarn: '🕯️ {n} の儀式があなたを呼んでいる！3 秒後に召喚される。', eyesAlert: '👁️ {n} が儀式の目のそばを通った。',
  trapHit: '踏んでしまった：{t}！', trapUse: 'X で足元に設置', trapUseTouch: 'ボタンをタップして足元に設置',
  matchRunning: 'その試合はもう始まっている：ロビーで次を待とう。',
  trapN_salt: '塩の輪', trapD_salt: '敵が越えられない輪（入ることも出ることもできない）。',
  trapN_seal: '冒涜の印', trapD_seal: '踏んだ者は 1 分間、あらゆるダメージが増える。',
  trapN_hand: '墓場の手', trapD_hand: '亡霊の手が踏んだ者を 5 秒間その場に縛る。',
  trapN_eyes: '儀式の目', trapD_eyes: '誰かが近くを通ると知らせてくれる。',
  trapN_ritual: '教団の儀式', trapD_ritual: '3 秒後、ランダムなプレイヤーを輪の中に召喚する（本人に警告あり）。',
  trapN_candle: '黒いロウソク', trapD_candle: '周囲を暗くする：中では誰もほとんど見えない。自分も。',
  trapN_silence: '沈黙の印', trapD_silence: '踏んだ者は 5 秒間沈黙（スキル使用不可）。',
  trapN_blood: '血の五芒星', trapD_blood: '踏んだ者を傷つけ、同じだけ自分を回復する。',
};

const THEMES_TR: Record<string, Extra['themes']> = {
  en: { cemetery: ['Graveyard', 'The monsters gather before dawn'], cityz: ['Z City', 'Nobody survived the outbreak... almost nobody'] },
  fr: { cemetery: ['Cimetière', 'Les monstres se rassemblent avant l’aube'], cityz: ['Ville Z', 'Personne n’a survécu à l’invasion... presque personne'] },
  eu: { cemetery: ['Hilerria', 'Munstroak egunsentia baino lehen biltzen dira'], cityz: ['Z Hiria', 'Inor ez zen bizirik geratu inbasioaren ondoren... ia inor'] },
  ca: { cemetery: ['Cementiri', 'Els monstres es reuneixen abans de l’alba'], cityz: ['Ciutat Z', 'Ningú no va sobreviure a la invasió... gairebé ningú'] },
  zh: { cemetery: ['墓地', '怪物们在黎明前聚集'], cityz: ['Z 城', '入侵之后无人幸存……几乎无人'] },
  ja: { cemetery: ['墓地', '夜明け前にモンスターが集う'], cityz: ['Zシティ', '侵攻のあと、生き残りはいない…ほとんどは'] },
};
const MEDAL_TR: Record<string, [string, string]> = {
  en: ['Lord of the Night', 'Win a Lord of the Night match.'], fr: ['Seigneur de la Nuit', 'Gagne une partie du Seigneur de la Nuit.'],
  eu: ['Gauaren Jauna', 'Irabazi Gauaren Jaunaren partida bat.'], ca: ['Senyor de la Nit', 'Guanya una partida del Senyor de la Nit.'],
  zh: ['暗夜之王', '赢得一场暗夜之王比赛。'], ja: ['夜の王', '「夜の王」で 1 回勝つ。'],
};
const WORDS_TR: Record<string, Extra['words']> = {
  en: { 'el amanecer': 'the dawn', 'un zombi': 'a zombie', 'un pentáculo': 'a pentacle' },
  fr: { 'el amanecer': 'l’aube', 'un zombi': 'un zombie', 'un pentáculo': 'un pentacle' },
  eu: { 'el amanecer': 'egunsentia', 'un zombi': 'zonbi bat', 'un pentáculo': 'pentakulu bat' },
  ca: { 'el amanecer': 'l’alba', 'un zombi': 'un zombi', 'un pentáculo': 'un pentacle' },
  zh: { 'el amanecer': '黎明', 'un zombi': '僵尸', 'un pentáculo': '五芒星' },
  ja: { 'el amanecer': '夜明け', 'un zombi': 'ゾンビ', 'un pentáculo': '五芒星' },
};
const UI_TR: Record<string, Extra['ui']> = { en: EN, fr: FR, eu: EU, ca: CA, zh: ZH, ja: JA };

/** Añade estos textos a los diccionarios de cada idioma. */
export function addNightlordTexts(dicts: Record<string, Dict>) {
  dicts.es.themes.cemetery ??= ['Cementerio', 'Los monstruos se reúnen antes del amanecer'];
  dicts.es.themes.cityz ??= ['Ciudad Z', 'Nadie quedó vivo tras la invasión... casi nadie'];
  for (const [l, ui] of Object.entries(UI_TR)) {
    const d = dicts[l];
    if (!d) continue;
    Object.assign(d.ui, ui);
    Object.assign(d.themes, THEMES_TR[l]);
    d.medals.nightlord = MEDAL_TR[l];
    Object.assign(d.words, WORDS_TR[l]);
    Object.assign(d.pu, trapPu(ui));
  }
}
