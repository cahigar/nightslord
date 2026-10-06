# 🦇 El Señor de la Noche .io (Nights Lord)

Juego multijugador gratuito tipo **.io** en pixel art 2D. Eres un monstruo clásico del cine de terror: cazas humanos para hacerte más fuerte, esquivas (o cazas) a los **Cazadores** y al resto de la orden y compites con otros monstruos por ser el número 1 de la sala.

- **Salas libres**: entras y sales cuando quieras sin parar la partida. Sala aleatoria, por código (`?sala=ABCD`) o creando la tuya (pública/privada, con mapa a elegir).
- **Ranking de sala** por puntos en tiempo real (el líder lleva 👑 y los Cazadores le ven desde más lejos).
- **Progresión persistente**: monedas, medallas, personajes y skins desbloqueables.
- Todo en **TypeScript**: servidor autoritativo en Node + cliente Canvas 2D sin motor.
- **Sprites, mapas y sonido 100 % procedurales** (no hay ficheros de imagen ni audio):
  - Personajes de 24×32 con sombreado automático, contorno coloreado y ojos/fuegos que brillan en la oscuridad.
  - Terreno por ruido con tramado, caminos serpenteantes, lagos irregulares, bosques agrupados y sombras.
  - Iluminación nocturna: farolas, braseros, ventanas, antorchas y linternas de los NPC, farol de los Cazadores, niebla, luciérnagas y ascuas.

## Arrancar en local

```bash
npm install
npm run dev          # servidor :3000 + cliente Vite :5173
```

Abre <http://localhost:5173>. Para probar con más jugadores abre varias pestañas o lanza bots:

```bash
npm run bots -- 8                         # 8 bots a una sala aleatoria
npm run bots -- 8 ws://localhost:3000/ws ABCD   # a una sala concreta
```

Visores para diseñar:
- Sprites (todas las animaciones y skins): <http://localhost:5173/#sprites>
- Mapas completos sin oscuridad: <http://localhost:5173/#mapa=camp:1234> (tema `elm`, `transylvania`, `camp`, `swamp`, `nile` o `jungle` y la semilla que quieras)

Producción local / demo: `npm run demo` (compila y arranca) → <http://localhost:3000>

### Demo multijugador en un solo PC

1. `npm run demo` y abre <http://localhost:3000> en **dos ventanas** del navegador, una al lado de la otra (o una normal y otra de incógnito).
2. Pon un nombre distinto en cada una y pulsa **Jugar**: las dos entran a la misma sala pública. También puedes crear sala en una y unirte con el código en la otra.
3. Lo que hagas en una ventana se ve en la otra: movimiento, ataques, saludo (G), taunt (T), ranking y killfeed.

Nota: el navegador ralentiza las pestañas que no están visibles, así que usa ventanas separadas para ver las dos a la vez.

### Modo desarrollo (trucos para probar)

`npm run dev` y `npm run demo` arrancan el servidor con `--dev`: todos los monstruos y skins quedan desbloqueados y puedes usar
**Mayús+L** (subir al siguiente hito de nivel: 5 → 10 → 15) y **Mayús+U** (llenar la carga de la R).
Para producción usa `npm start` (sin trucos). En producción, las **cuentas master** (los Gmail de `ADMIN_EMAILS`) tienen todo desbloqueado y también pueden usar estos trucos.

Prueba automática del servidor (sin red ni navegador): `npx tsx tools/simtest.ts` sube cada monstruo a nivel 15 y usa todo su kit.

## Controles

| Acción | Teclado/ratón | Móvil |
|---|---|---|
| Moverse | WASD / flechas | joystick |
| Apuntar | ratón | dirección del joystick |
| Ataque básico | clic izq. / Espacio | ⚔ |
| Habilidades | Q (o clic dcho.) / E | Q / E |
| Definitiva (desde nivel 10) | R | R |
| Mejoras al subir de nivel | 1 · 2 · 3 · 4 | tocar la tarjeta |
| Saludar / Taunt | G / T | 😜 |
| Proponer / aceptar alianza | H | |
| Silenciar | M | |

## Contenido actual (v0.13)

**Monstruos**

| | Ataque | Q | E | R (nv. 10) | Desbloqueo |
|---|---|---|---|---|---|
| 🧛 El Conde | Mordisco con robo de vida | Murciélagos | Niebla | Noche Carmesí | gratis |
| 🐺 Aullador | Zarpazo amplio | Embestida | Aullido | Luna Llena | gratis |
| ⚱️ Ramsés | Escarabajos a distancia que ralentizan | Vendas | Maldición | Tormenta del Faraón | gratis |
| 👻 La Dama Velada | Puñetazo fantasma | Desvestirse | Frenesí invisible | Todos somos la Dama | gratis |
| 🧟 Paciente Cero | Mordisco infecto | Contagio (convierte a un humano en zombi aliado) | Carne fresca (cebo que atrae a sus zombis) | Salida de la tumba (horda + zombi gordo explosivo) | gratis |
| 🐙 K'thula | Tentáculo | Tentáculo abisal (golpe en zona que atrae) | Sumergirse (intocable, ×2 velocidad) | Marejada abisal (ola que empuja y deja charcas) | gratis |
| 🌙 Pesadilla | Zarpa de sombra | Arrullo (cono de sueño) | Acecho (se convierte en un objeto del mapa) | Entre sueños (aparece junto a un dormido) | gratis |
| 🪞 Bloody Mary | Cristal | A través del espejo | Espejo de sangre | Sal del espejo (copias) | gratis |
| ⚡ Reanimado | Puñetazo | Sacudida | Clavo pararrayos (2 cargas) | Tormenta galvánica (5 s) | gratis |
| 🎭 Doppy | Golpe falso | Robar rostro | Engatusar | Doble perfecto | gratis |
| 🧹 Hécuba | Poción al azar (fuego/ácido) | Poción aleatoria (fuego/ácido/rabia, 3 cargas) | Escoba | Maleficio (animalillo) | gratis |
| 💋 Lilith | Beso robado (roba vida, enamora humanos) | Flechazo (corazón que atrae) | Alas | Pasión desatada | gratis |
| 👻 Poltergeist | Objeto volador (sale de cualquier sitio) | Revuelo | Intangible | Drenaje | 🪙 o medalla ⏳ Inmortal |
| 🌳 Raíz Negra | Ramazo | Zarzas (enredan) | Brotar (flor · torreta · muro, 2 cargas) | Bosque maldito | 🪙 o medalla 🏹 Cazador de cazadores |
| 🏴‍☠️ Capitán Ahogado | Sablazo espectral (cañonazos desde el barco) | Garfio | Barril de pólvora | ¡Al abordaje! | 🪙 o medalla 🎯 Cazarrecompensas |
| 🕷️ Aracne | Mordisco venenoso | Telaraña (2 cargas) | Salto arácnido | Gran telaraña | 🪙 o medalla 💀 Depredador |
| 🌾 El Segador | Guadaña | Cuervos (ciegan) | Plantarse | La Cosecha | 🪙 o medalla 🌕 Criatura ancestral |
| 🔥 Azufre | Golpe ígneo (quema) | Bola infernal | Paso ardiente | Infierno | 🪙 o medalla ⚰️ Pesadilla de los Cazadores |
| 🟢 Baba | Salpicadura (mancha pegajosa) | Rastro de veneno | Burbuja de ácido | Masa crítica | 🪙 o medalla 🍖 Glotón |
| 👽 El Visitante | Rayo de plasma | Abducción | Baliza | Invasión | 🪙 o medalla 👑 Señor de la Noche |
| 📺 Interferencia | Estática (las teles cercanas repiten el ataque) | Señal pirata (onda que hipnotiza) | Cambio de canal (se mete en una tele) | Emisión nacional (rayo que salta de tele en tele) | 🪙 o medalla 😤 Venganza |
| 🥒 Kappa | Zarpazo de río (en el agua: burbujas) | Lengua acuática (arrastra hasta él) | Cuenco sagrado (cura y aguanta) | Remolino del río (daño cada segundo) | 🪙 o medalla 🤝 Pacto de sangre |
| ☠️ La Parca | Guadañazo amplio | Paso fúnebre (teletransporte) | Marca de muerte | Danza de la Parca | 🪙 o medalla 🔥 Imparable |
| 👁️ Unidad | Mirada compartida (disparan todas) | Asimilación | Independencia | Convergencia | 🪙 o medalla 🗃️ Coleccionista |
| 💀 El Nigromante | Orbe oscuro | Alzar huesos | Marcha de los muertos | Portales del osario | 🪙 o medalla ♾️ Eterno |
| 🪱 Gusarena | Mordisco sísmico (lento y brutal) | Sumergirse (solo percibe pisadas) | Arenas movedizas | Devorador | 🪙 o medalla 🎮 Habitual |
| 🦖 Dinozombie | Según la forma (raptor, tricerátops, pterodáctilo) | Cambio de forma | Instinto (según la forma) | Extinción (huevo y asteroide) | 🪙 o medalla ⭐ Leyenda |
| 🤖 R-800 | Impacto hidráulico (o disparos si no hay nadie cerca) | Adquisición de objetivo | Arma integrada (ráfaga) | Protocolo de exterminio (láser) | 🪙 o medalla 🦴 Rey de monstruos |
| 🏹 La Cazadora | Ballesta | Culatazo | Repliegue (invisible) | Círculo de caza (ciega) | 🪙 o medalla 🕯 Ritual interrumpido |

**Paciente Cero (invocador)**: algo menos de vida que el resto (95). El Contagio tarda unos 5 s: la vida del humano baja poco a poco y al llegar a cero se levanta como zombi. Máximo 5 zombis (7 durante la R), cada uno dura 30 s; atacan solos lo que tienen cerca y siguen a su dueño. Las bajas de sus zombis dan la mitad de XP/puntos y no cargan la R con humanos. Un 15 % de las víctimas de un zombi se levanta como zombi (estos no contagian). Nv. 5: los zombis que mueren dejan una nube tóxica que ralentiza y debilita. Nv. 15: aparecen zombis rápidos y duros.

**K'thula (acuático)**: cruza el agua profunda (lagos, ríos, piscinas) donde va ×1,3 más rápido y se regenera si no ha recibido daño en 3 s. Sumergirse dura 2,4 s en agua profunda y 1,2 s en tierra. En el agua su ataque básico es un chorro a presión (1,5 s, recarga 0,5 s). Si se queda quieto fuera del agua, brota bajo él una charca que va creciendo (nv. 5: más grande y más rápida). Nv. 15: dos cargas de Q y deja una charca al emerger.
**Charcas**: da igual quién las cree; cualquier criatura acuática recibe en ellas la mitad del bonus del agua profunda, y el resto se ralentiza.

**Pesadilla (sueño y emboscada)**: sus golpes y habilidades llenan una barra violeta de **somnolencia**; al llenarse, el objetivo se duerme (1,6 s jugadores, 2,8 s el resto). Acecho lo convierte en un objeto típico del mapa (árbol, farola, buzón, lápida, estatua, roca, tronco): los demás lo ven exactamente así, los cazadores lo ignoran y los humanos no huyen. Si espera quieto y ataca, el primer golpe hace hasta +120 % de daño. Moverse o recibir daño lo destapa.

**Bloody Mary (espejos)**: hasta 3 espejos (4 a nivel 15). E coloca uno y da velocidad, velocidad de ataque y robo de vida 4 s. Q viaja al más cercano y lo hace estallar. Nv. 5: 1 espejo = robo de vida, 2 = velocidad, 3 = sus golpes desangran. R: todos estallan y de cada uno sale una copia suya que ataca sola 7 s.

**Reanimado (aguante)**: se regenera rápido si lleva 4 s sin recibir daño. Nv. 5: al acumular un 30 % de su vida en daño recibido suelta una descarga que aturde. E lanza un clavo que se queda 15 s; cada 5 s cae un rayo y, si estás cerca, vuelve a ti atravesando enemigos. R: 5 s de tormenta con nubes densas en una zona muy grande (ralentiza y daña; tú ves a través de las nubes). Nv. 15: sin nadie a mano, su básico lanza piedras, lápidas o troncos según el mapa.

**Doppy (engaño)**: si no lucha un rato se convierte en un humano cualquiera (los demás lo ven como un NPC más); su primer golpe aturde. Q copia al monstruo cercano: aspecto, nombre, nivel y su básico, Q y E durante 10 s (16 s a nivel 15). E: se vuelve un humano irresistible; humanos y cazadores le siguen embobados y los monstruos cercanos caminan hacia él. R: imita la definitiva del monstruo más cercano convirtiéndose en él (si no hay, una al azar).

**Hécuba (bruja del pantano)**: su básico lanza al azar ácido (envenena unos segundos) o fuego (el suelo arde). Q: frasco grande al azar entre ácido, fuego y rabia (todos atacan a lo más cercano, ella incluida), con 3 cargas. E: vuela en escoba por encima de cualquier obstáculo y aterriza siempre en un hueco libre. R (Maleficio): un gran charco embrujado; quien lo pisa se convierte en animalillo unos segundos (no ataca ni usa habilidades) y ella recupera al instante las 3 pociones. Nv. 5: veneno y fuego duran más. Nv. 15: pociones con más área, power-ups que duran un 50 % más y puede lanzar desde la escoba.

**Lilith (súcubo)**: roba vida con cada golpe. A los humanos no los mata: los enamora y luchan por ella contra cazadores, monstruos y esbirros enemigos (3 a la vez, 5 desde el nivel 5; al acabarse el hechizo vuelven en sí y el más antiguo deja paso al nuevo). Q lanza un corazón que daña, atrae y deja embobado (si alcanza a un humano, lo enamora). E: vuela con sus alas, más rápida. R: en un área grande todos atacan a lo más cercano, pero nunca a ella; las bajas cuentan para ella. Nv. 15: Flechazo con 2 cargas que atraviesa.

**Poltergeist (fantasma)**: levita (pasa por encima del agua). Sus objetos (sillas, libros, platos, candelabros) no salen de él: salen disparados desde puntos al azar alrededor del objetivo. Q: lluvia de objetos sobre la zona. E: intangible 2,2 s; atraviesa ataques y obstáculos, y dentro de un obstáculo nadie lo ve (atacar lo vuelve sólido). R: 4 s drenando la vida de los enemigos cercanos y curándose lo drenado. Nv. 5: los objetos ralentizan. Nv. 15: dos objetos por ataque y más tiempo intangible.

**Raíz Negra (árbol maldito)**: si se queda quieto echa raíces: regenera y recibe un 25 % menos de daño sin dejar de atacar. Q: zarzas que dañan, **enredan** (no pueden moverse, sí atacar) y dejan espinos que ralentizan. E (2 cargas): lo que brota depende de dónde apuntes: junto a él, una flor que le cura; sobre un árbol o seto del mapa, lo despierta como planta carnívora que escupe espinas; en campo abierto, un muro de raíces que no deja pasar a los enemigos (y los cazadores atacan antes que a él). R: 7 s de bosque maldito que ralentiza, enreda una y otra vez y le cura a él y a sus plantas. Nv. 15: 3 cargas, dos espinas por disparo y el ramazo enreda.

**Capitán Ahogado (pirata fantasma)**: sus víctimas pueden soltar monedas o sangre (Botín maldito). Q: garfio que atrae al enemigo. E: barril de pólvora que explota a los 2,5 s o al recibir un golpe (aparta y prende los árboles). Nv. 5: anda sobre el agua en un barco fantasma y desde él ataca a cañonazos. R: 3 bucaneros fantasma luchan a su lado 12 s. Nv. 15: el garfio le impulsa hacia lo que engancha (enemigos u obstáculos) y los barriles tienen más área.

**Aracne (mujer araña)**: sus mordiscos envenenan; desde el nv. 5 los mordiscos seguidos al mismo enemigo acumulan veneno. Q (2 cargas): telaraña que ralentiza y queda en el suelo 45 s (máximo 4). E: salto por encima de cualquier obstáculo. R: cubre la zona de telarañas, une con hilos las del suelo (también ralentizan), corre más dentro y suelta 6 arañitas venenosas. Nv. 15: 2 saltos y al caer aterroriza (los enemigos huyen).

**El Segador (espantapájaros)**: quieto 5 s, su siguiente golpe hace +80 % (le dura hasta 3 s después de moverse). Q: cuervos en línea recta que dañan y ciegan (al jugador cegado casi no le queda vista; los cazadores pierden el objetivo). E: se planta 2,5 s inmóvil con un 65 % menos de daño y los enemigos cercanos huyen. Nv. 5: aparecen por el mapa espantapájaros iguales a él (con su nombre y nivel) que no hacen nada y asustan un poco al aparecer. R: trigo alto que tapa a quien está dentro; en él corre y pega más y es invisible hasta que ataca. Nv. 15: los cuervos vuelven y Plantarse tiene 2 cargas.

**Azufre (demonio de fuego)**: inmune al fuego; sus golpes queman. Q: bola infernal que explota y deja el suelo en llamas. E: embestida corta con rastro de fuego. Nv. 5: quien ya arde recibe +40 % de sus habilidades de fuego. R: 6 s en los que cada golpe lanza una onda de fuego y ataca y corre más rápido. Nv. 15: la bola suelta llamas secundarias y el fuego le cura.

**Baba (slime)**: sus golpes dejan baba pegajosa. Al perder cada 30 % de la vida se separa en 2 slimes pequeños 8 s: recibe −30 % de daño, pega −25 % y se regenera mientras quede alguno. Q: él y sus copias corren más y dejan veneno a su paso. E: burbuja de ácido que envenena y aparta. Nv. 5: los objetos que recoge y sus víctimas le curan. R: enorme 6 s con +60 % de vida; atrapa y arrastra a los enemigos y luego estalla. Nv. 15: sus mitades revientan en baba al reunirse y los charcos duran el doble.

**El Visitante (alien)**: tres plasmas seguidos al mismo objetivo lo silencian 2 s. Q: un OVNI abduce al enemigo de la zona y lo deja caer. E: baliza; a los 2,5 s un OVNI dispara sobre ella y cerca de ella corre más. Nv. 5: recoger objetos recorta un 20 % sus enfriamientos. R: 7 s con tres OVNIs que disparan solos. Nv. 15: la abducción atrapa a todos los de una zona mayor y la baliza deja radiación. Sus rayos son eléctricos.

**Fuego y electricidad en el escenario**: cualquier fuego (pociones, bolas infernales, barriles, botas de fuego...) prende árboles y setos: quedan calcinados 15 s y, mientras arden (8 s), queman a quien esté cerca salvo a los inmunes al fuego. Los ataques eléctricos (rayos del Reanimado y de los OVNIs) que caen cerca del agua electrocutan a quien esté dentro.

**Objetos**: además de sangre, rapidez, furia, escudo, monedas y XP, aparecen 💀 Espíritus guiados (10 s lanzando calaveras que persiguen enemigos), 👢 Botas elementales (más velocidad y rastro de fuego, raíces que atrapan o agua que ralentiza) y ⚰️ Pala de enterrador (un enterrador te acompaña hasta que lo matan: ataca al enemigo más cercano y, si no ve a nadie, te sigue).

**Evolución por niveles** (cada monstruo conserva su identidad):

| Nivel | Qué cambia |
|---|---|
| 5 | Mejora de la pasiva (Sed de sangre · Instinto depredador · Maldición del faraón · Presencia Ausente · Epidemia · Señor de las profundidades). Ojos más intensos. |
| 10 | Se desbloquea la **R**. Aura de partículas y detalles que brillan. |
| 15 | Mejora de Q/E (Señor de los Murciélagos · Bestia Alfa · Faraón Despierto · Desaparición Perfecta · Cepas mutantes · Llamada del abismo). El Conde y la Dama levitan; Lobo y Ramsés irradian luz. |
| 15+ | Solo estadísticas, como antes. |

**La R se carga con bajas**, no con el tiempo: humano +4 %, otro monstruo +25 %, Cazador +40 % (Sectario +15 %, Heraldo +60 %) (al llegar al nivel 10 empieza con un 30 %). Todos los números están en `shared/balance.ts`.

**Mapas** (procedurales con semilla): Calle del Olmo, Transilvania, Campamento Lago Sereno, **Pantano de la Bruja** (charcas de agua negra, cipreses con musgo, la choza de la bruja con su caldero y tótems), **Orillas del Nilo** y **Jungla Jurásica**.
- **Orillas del Nilo**: desierto con dunas, el Nilo cruzándolo de norte a sur con pasarelas, pirámides, esfinge, obeliscos, templo de columnas, aldea de adobe y palmeras. En el río acechan **cocodrilos** (solo asoman los ojos) que muerden y aturden a quien se acerque a la orilla; no se alejan del agua.
- **Jungla Jurásica**: selva densa con un **río poco profundo** que se cruza a pie pero cuya **corriente arrastra** río abajo (también se predice en el cliente), templo escalonado en ruinas, campamento de exploradores y una laguna. La habitan **raptores** en manada y un **tiranosaurio** que ruge y asusta; no son zombis y atacan a cualquier monstruo (también a la Cazadora). Las fieras dan buena recompensa al morir.
- **Agua en todos**: estanque y piscinas (Olmo), río con puentes (Transilvania), lago (Campamento). Se consulta con `map.water`, `waterAt(map, x, y)` y `obstacle.body`.
- **Televisiones** (`map.tvs`): en ventanas, escaparates y abandonadas a la intemperie; solo aparecen (encendidas) cuando hay una Interferencia en la sala.
- **Bordes temáticos**: el mundo continúa fuera del área jugable (bosque denso, agua profunda, acantilados, vallas, muros, casas, cementerios) y se pierde en una niebla espesa.

**Entidades**: humanos que huyen y gritan (variantes por mapa), la orden de cazadores (ver abajo), 6 power-ups (sangre, rapidez, furia, escudo, monedas, XP).

**La orden de cazadores** (aparecen según el **nivel medio de la sala**; los de más nivel son pocos y proporcionales al número de jugadores, mínimo 1 cuando se alcanza la media; si la media baja, se retiran sin que nadie los vea). Todos van primero a por los zombis que tengan cerca.

| | Aparece | Cómo pelea |
|---|---|---|
| Cazador | siempre | Ballesta a distancia y estaca cuerpo a cuerpo. |
| Inquisidor | media ≥ 5 | Espada en llamas y embestida; prefiere a los monstruos de más nivel. |
| Exorcista | media ≥ 10 | Lanza frascos de agua bendita: charco que quema poco a poco y aturde al pisarlo. |
| Sectario | hay algún monstruo de nivel 15+ | Muy débil. Hace un ritual (círculo pixelado, 4 s) e invoca dentro a un monstruo de nivel 15+ al azar con la mitad de su vida actual; luego huye y desaparece. Matarlo interrumpe el ritual. |
| Heraldo de la luz | media de los jugadores de nivel ≥ 10 llega a 20 | Ángel lento pero constante (no se le ralentiza, asusta ni empuja). Maza que quita mucha vida. Ignora a los de nivel < 10 (pero no a los clones de la Dama). Si no consigue llegar, vuela por encima de los obstáculos y aterriza en un sitio libre. |

**Mejoras 1-2-3 a partir del nivel 15**: Vitalidad y Fuerza suben su tope de 8 a 16 y Velocidad de 6 a 10.

**Recompensas**: humano 10 pts / 1 🪙 · Cazador 80 pts / 8 🪙 (Heraldo 300 pts / 25 🪙) · monstruo 50 pts + 25 % de los suyos / 5 🪙. Al morir conservas el 70 % de los puntos de sala.

**Progresión**
- **12 monstruos gratis** desde el principio (de El Conde a Lilith). Los otros 10 se desbloquean **con monedas** (400 🪙 el primero y +200 por cada uno que compres: 400, 600, 800…) **o consiguiendo su medalla** (ver tabla).
- **50 medallas**: 28 generales (humanos, cazadores, Heraldo, Sectario, rachas de monstruos, cazarrecompensas, venganza, alianza, traidor, supervivencia, niveles 10/15/20, partidas jugadas, 1000 monedas, coleccionista, comprar skin…) y **una única por monstruo** (alcanzar el nivel 15 con él). Cada medalla da monedas.
- **Alianza (H)**: pulsa H cerca de otro monstruo para ofrecerla; si responde con H, confeti 🎉 y medalla 🤝. No cambia nada en el juego (podéis seguir dañándoos): quien derrota a su aliado gana la medalla **Traidor** 💔. Derrotar a quien te derrotó la última vez da la medalla **Venganza**.
- **Invitado o cuenta**: se puede jugar sin registrarse (el progreso vive en la pestaña y se pierde al cerrar el navegador) o entrar con **Google** para guardar monedas, medallas y compras. Solo se guarda el identificador de Google y el correo; no se envían correos ni publicidad (`/privacidad.html`). Al entrar por primera vez, el progreso de invitado pasa a la cuenta.
- **Idiomas**: castellano, euskera, inglés, francés, catalán, chino y japonés (banderitas en el menú; se detecta el idioma del navegador). Textos en `client/lang/*.ts`; el castellano es la base y lo que falte en otro idioma sale en castellano.
- Preparado para el futuro: hueco oculto para un **banner** no invasivo en la selección de personaje (`#ad-slot` en `client/index.html`) y tienda de partículas y gorros.

**Interferencia (señal maldita)**: mientras está en la sala, las televisiones del mapa se encienden (si no hay ninguna Interferencia, no se ven). Las teles cercanas repiten sus ataques. Su **Ruido** llena una barra de hipnosis: al llenarse, la víctima camina hacia ella o hacia una tele. Nv. 5: +50 % de daño a hipnotizados o casi. Nv. 15: las teles atacan en más radio.

**Kappa (duende del río)**: acuático como K'thula (cruza agua profunda y en cualquier agua o charca corre más y se regenera). Q: lengua que atrae un poco. E: se agacha 2,5 s y rellena el agua de su cabeza (cura y recibe menos daño; un golpe fuerte lo interrumpe). R: remolino que arrastra al centro 6 s (cuenta como agua). Nv. 5: golpear por la espalda roba velocidad. Nv. 15: de vez en cuando una nube llueve cerca y deja una poza.

**La Parca (asesina)**: cada baja le da almas (+1,5 % de daño cada una; los monstruos y cazadores dan 3) hasta que muere y las pierde todas; las almas orbitan a su alrededor. Q: teletransporte corto (nv. 15: 2 cargas). E: marca al enemigo más cercano al puntero 5 s: corre más hacia él y el siguiente guadañazo hace +80 %. Nv. 5: las almas también dan velocidad y velocidad de ataque. R: 10 s apareciendo cada 0,75 s junto a un enemigo al azar con un gran tajo; al acabar vuelve exactamente a donde empezó (nv. 15: tajos más grandes).

**Unidad (invocadora, enjambre)**: Q convierte al humano más cercano en una Unidad vinculada que va siempre pegada a ella en formación (máx. 4; nv. 15: 8); cuando ataca, todas sus Unidades disparan a la vez al mismo punto. Camuflaje: tras 5 s quieta, ella y su enjambre parecen humanos normales que pasean (cazadores y humanos no las ven como amenaza); al moverse, atacar o recibir daño se descubren. E: una Unidad vinculada se vuelve independiente y recorre el mapa sola (máx. 1; nv. 15: 2). Pasiva Somos Uno: si muere con otra Unidad viva, reaparece en ella y la muerte no cuenta. Nv. 5: más velocidad por cada Unidad activa. R: su cuerpo y las vinculadas parpadean 3 s mientras ella sigue moviéndose con el grupo y al final explotan todos a la vez; entonces su conciencia salta a una independiente (sin una viva no se puede usar).

**El Nigromante (invocador)**: dispara orbes oscuros y se cura un poco con cada baja de sus esqueletos. Q: esqueleto guerrero o arquero al azar (12 %: perro esqueleto rapidísimo); máx. 3, con 2 cargas desde el nv. 5. E: 4 s de marcha (él y sus esqueletos corren y atacan más rápido; él levita y cruza el agua). Nv. 5 Último conjuro: al morir, al cabo de 1 s vuelve 3 s como fantasma inmóvil y **maneja con el ratón** un largo rayo que quema (la pantalla de muerte espera). R: 7 s de puños y pies de hueso gigantes que caen del cielo alrededor del punto elegido (con aviso de sombra). Nv. 15: hasta 5 esqueletos, un 30 % más grandes y con más vida.

**Kappa e Interferencia (v0.10)**: el Kappa pega un tajo de agua más amplio y de más alcance; desde el agua dispara burbujas lejanas que ralentizan; su lengua arrastra a la víctima hasta él; el remolino quita vida cada segundo; y en el nivel 15 la lluvia de una nube de tormenta va formando la poza. La E de Interferencia ahora la mete en la tele a la que apuntes (hasta 3 s, intocable): con otra E sale donde apuntes cerca de esa tele y, si no hace nada, sale por una tele al azar con un chispazo que hipnotiza; su R es un rayo que salta muy rápido de tele en tele (prefiere las que tienen enemigos cerca).

**Clases** (`CLASS` en `shared/balance.ts`): cuerpo a cuerpo (+12 % vida y +6 % armadura: Aullador, Reanimado, Raíz Negra, Baba, Kappa, Capitán Ahogado, Azufre), asesinos (−10 % vida y 8 % de robo de vida: Dama, Pesadilla, Aracne, Parca), invocadores (−15 % vida y la mitad de regeneración: Paciente Cero, Lilith, Bloody Mary, Unidad, Nigromante) y a distancia (sin cambios).

**Alimañas**: cada mapa tiene bichos poco comunes (ratas, cuervos, murciélagos, sapos) que no atacan, huyen muy rápido de cualquier monstruo o cazador y **siempre** sueltan un objeto al morir (sin cadáver ni linterna).

**Todo en pixel art**: círculos, anillos y arcos (zonas, golpes, sombras, auras) se dibujan con píxeles de la rejilla del mundo (`client/pixelshapes.ts`), y los proyectiles giran en pasos de 45°.

**Móvil**: joystick flotante (aparece donde pongas el pulgar), botones en arco que se arrastran para apuntar (Q, E y R se lanzan al soltar; pulsar sin arrastrar apunta solo al enemigo más cercano), enfriamientos en los propios botones, barras arriba y la cámara centra al personaje en la zona que no tapan los controles.

**Gusarena (cuerpo a cuerpo, coloso)**: más grande y con más vida y empuje, pero le cuesta arrancar y girar. Q: se entierra (intocable) y bajo tierra no ve el mapa, solo las ondas de las pisadas de quien se mueve cerca; otra Q (o a los 5 s) emerge mordiendo a su alrededor. E: arenas movedizas que le siguen, ralentizan y arrastran hacia él. R: avanza 3,5 s guiado por el puntero, engulle a quien choque con su boca (silenciados, perdiendo vida) y al final los escupe. Nv. 5: percibe más lejos y se cura bajo tierra. Nv. 15: más tiempo bajo tierra y arenas más grandes.

**Dinozombie (cambiaformas)**: la Q alterna Velociraptor (mordiscos rápidos, corre más al perseguir; E: salto sobre un objetivo con daño en área), Tricerátops (cornada lenta y amplia, mucha resistencia y casi inmune a ralentizar o aturdir; E: carga larga que empuja y aturde) y Pterodáctilo (huevos a distancia, vuela sobre agua y obstáculos; E: remolino que empuja). R: se vuelve huevo intocable y cae un asteroide que quema una gran zona; sale con otra forma. Nv. 5: cambiar de forma cura y da un bonus breve. Nv. 15: mejores E y cambio de forma más rápido.

**R-800 (perseguidor)**: esqueleto mecánico de un solo ojo; puñetazos eléctricos o, si no hay nadie a mano, bolas de energía eléctrica (algo más lentas). Inmune a miedo, enamoramiento e hipnosis; las ralentizaciones le afectan la mitad. Q: fija al enemigo más cercano 6 s (lo ve aunque sea invisible, corre más hacia él y el siguiente golpe hace +70 %). E: lanzacohetes de 3 s hacia el puntero (explotan en área) caminando más despacio. Nv. 5: se repara sin recibir daño y al morir explota al segundo. R: 5 s de cañón enorme y láser rojo muy ancho guiado cuyo daño sube cuanto más tiempo sigue sobre el mismo objetivo. Nv. 15: salta solo al siguiente objetivo y los cohetes duran más, salen más seguidos y explotan más grande.

**La Cazadora (desertora de la orden)**: mujer de negro con sombrero de cazadora y ballesta de plata (virotes de plata brillantes). No mata humanos: al herirlos les da antorchas u horcas (nv. 15 también arcos) y se vuelven milicia que va a su aire contra los monstruos; cada uno le da experiencia y, al acabarse, se desarman y vuelven a ser humanos (no mueren). La orden de cazadores no la ataca. Q: culatazo que empuja (nv. 15: en cono). E: salto corto e invisibilidad (enfriamiento 7 s). Nv. 5: matar o armar recupera enfriamientos. R: gira sobre sí misma disparando grandes virotes de plata en espiral en todas direcciones; ciegan.

**Ajustes v0.13**: la Gusarena hace menos daño, el agua le hace daño y le frena, y al reptar ondula y deja jorobas de arena detrás. Los dinosaurios del Dinozombie se ven más grandes y mejor animados (raptor con carrera, tricerátops con gola y cuatro patas, pterodáctilo con tres posiciones de aleteo).

**Ajustes v0.12**: el rayo del Último conjuro del Nigromante es mucho más ancho y vistoso y dura 4,5 s. Aracne: cada 3 básicos sale una arañita que da 3 mordiscos y se deshace, y los hilos largos de la gran telaraña aturden 3 s. Capitán Ahogado: su R ahora es *Mar de los ahogados*, una gran poza de 10 s; navegando en ella dispara cañonazos en 4 direcciones y más rápido. La Baba (y sus copias) ahora es un cubo de gelatina.

**Azufre**: todos sus golpes queman y se ven las llamas sobre quien arde. Su Paso ardiente es ahora una carrera de 2,2 s muchísimo más rápida que quema a quien toca y deja un rastro de llamas; en el nv. 15 pisar fuego le cura más. **El enterrador** de la pala da más miedo (y ya no rompe el juego al morir).

**Ajustes de esta versión**: la somnolencia de Pesadilla sube más rápido y en los NPC ya no baja con el tiempo; los espejos de Bloody Mary se pueden romper a golpes; las televisiones solo existen si hay una Interferencia.

## Arquitectura

```
shared/   tipos y lógica común: protocolo, personajes, balance, skins, catálogo, mapas, ruido, colisiones
server/   Node + ws: RoomManager, Room (simulación 20 Hz, estados genéricos), kits/ (habilidades por monstruo), store
client/   Canvas 2D: game (predicción + interpolación + render), effects (efectos temáticos), sprites, tiles, terrain, ambient, audio, input, UI
tools/    bots de carga y simtest (prueba de kits sin red)
```

- **Servidor autoritativo** a 20 ticks/s; snapshots a 10 Hz con *interest management* (solo entidades en un radio de ~1150 px) → ~20-25 KB/s por jugador.
- **Cliente**: predicción local del movimiento con reconciliación por número de secuencia; el resto de entidades se interpolan con 120 ms de retardo.
- **Mapa determinista**: servidor y cliente generan el mismo mapa con `(tema, semilla)`; no se envía por red.
- **Cada sala tiene su propio bucle**, así que entrar o salir no afecta a las demás. Las salas vacías se cierran a los 60 s.

### Cómo añadir contenido sin coste de arte

- **Skin nueva**: añade una entrada con una paleta en `SKINS` (`shared/characters.ts`). Nada más.
- **Monstruo nuevo**:
  1. Textos, stats, R y hitos en `CHARACTERS` (`shared/characters.ts`) y sus números en `shared/balance.ts`.
  2. Un kit en `server/kits/` (ataque, Q, E, R y ganchos como `onKill`, `speedMul`, `onProjectileHit`…) registrado en `kits/index.ts`.
  3. Una función "forma" en `client/sprites.ts` (cabeza, ropa y extras sobre el esqueleto común) que recibe el tier de evolución.
  4. Sus efectos en `client/effects.ts`.

  Todas las animaciones (idle, andar, ataque, cast, saludo, taunt, daño) se heredan automáticamente, y los estados genéricos de la sala (vulnerable, presa, marca, sarcófago, pánico, ralentización con intensidad) se pueden reutilizar.
- **Mapa nuevo**: un tema en `THEMES` + su rama de generación en `generateMap` (`shared/maps.ts`) y el arte de sus obstáculos en `client/tiles.ts`.

## Despliegue (barato y con el gasto bajo control)

El juego necesita **procesos Node siempre encendidos con WebSockets** (Vercel o un hosting compartido no sirven para el servidor).

**Producción recomendada**: un VPS de precio fijo (Hostinger VPS KVM 1, Hetzner…) con la carpeta `deploy/`. El hosting web compartido de Hostinger no sirve para el servidor del juego (necesita un proceso siempre encendido con WebSockets):

- `deploy/instalar.sh tu.dominio.com tu@gmail.com [rama]` (el Gmail es opcional: será la cuenta master; la rama, por defecto `main`) prepara un Ubuntu 24.04 limpio (Docker, cortafuegos, HTTPS automático con Caddy, copia diaria de perfiles).
- `deploy/docker-compose.yml`: varios procesos de juego (**shards** A, B…) en la misma máquina, cada uno con su tope `MAX_CONNECTIONS`. Las salas se crean y cierran solas según haga falta (`MIN_ROOMS` mantiene siempre alguna abierta) y su código empieza por la letra del shard.
- `deploy/actualizar.sh`: `git pull` y reconstruye sin perder perfiles.
- Perfiles en **SQLite** (`data/profiles.db`), compartido por todos los shards; el antiguo `profiles.json` se importa solo.
- Tráfico comprimido (permessage-deflate): ~3-4 KB/s por jugador. `/health` (o `/A/health`) muestra jugadores, conexiones y KB/s enviados.

Variables: `SHARD`, `MAX_CONNECTIONS` (200), `MAX_ROOMS` (20), `MIN_ROOMS` (1), `WS_DEFLATE` (1), `DB_FILE`, `PORT`, `GOOGLE_CLIENT_ID` (inicio de sesión con Google; vacío = solo invitados), `ADMIN_EMAILS` (Gmail de las cuentas master, separados por comas); en el cliente, `VITE_SHARDS` (p. ej. `A,B`) y `VITE_SERVER_URL` si el cliente se aloja aparte.

### Inicio de sesión con Google (una vez, gratis)

1. Entra en <https://console.cloud.google.com/> con tu Gmail y crea un proyecto (p. ej. «Nights Lord»).
2. **APIs y servicios → Pantalla de consentimiento de OAuth**: tipo *Externo*; nombre de la app, correo de asistencia, dominio `tu.dominio.com` y como política de privacidad `https://tu.dominio.com/privacidad.html`. Ámbitos: solo `email`, `profile` y `openid` (los básicos, no requieren verificación). Publica la app («En producción»).
3. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**. En *Orígenes de JavaScript autorizados* pon `https://tu.dominio.com` (no hace falta URI de redirección).
4. Copia el ID de cliente (`xxxx.apps.googleusercontent.com`) y en el servidor:
   ```sh
   nano /opt/nightslord/deploy/.env     # GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   cd /opt/nightslord/deploy && docker compose up -d
   ```
5. `ADMIN_EMAILS` ya lo rellena `instalar.sh tu.dominio.com tu@gmail.com`; esa cuenta será master (todo desbloqueado) al entrar con Google.

Antes de publicar, pon tu correo de contacto en `client/public/privacidad.html` (donde dice `[correo de contacto]`).

Para enseñar el prototipo gratis sigue valiendo **Render** (`render.yaml`, se duerme tras 15 min sin tráfico).

## Próximos pasos sugeridos

1. Tienda de cosméticos: partículas y gorros.
2. Banner no invasivo en la selección de personaje (`#ad-slot`).
3. Protocolo binario y delta-snapshots para bajar el ancho de banda.
4. Más mapas (hospital abandonado) y más monstruos.
5. Anti-trampas básicos.
