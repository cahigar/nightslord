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
- Mapas completos sin oscuridad: <http://localhost:5173/#mapa=camp:1234> (tema `elm`, `transylvania` o `camp` y la semilla que quieras)

Producción local / demo: `npm run demo` (compila y arranca) → <http://localhost:3000>

### Demo multijugador en un solo PC

1. `npm run demo` y abre <http://localhost:3000> en **dos ventanas** del navegador, una al lado de la otra (o una normal y otra de incógnito).
2. Pon un nombre distinto en cada una y pulsa **Jugar**: las dos entran a la misma sala pública. También puedes crear sala en una y unirte con el código en la otra.
3. Lo que hagas en una ventana se ve en la otra: movimiento, ataques, saludo (G), taunt (T), ranking y killfeed.

Nota: el navegador ralentiza las pestañas que no están visibles, así que usa ventanas separadas para ver las dos a la vez.

### Modo desarrollo (trucos para probar)

`npm run dev` y `npm run demo` arrancan el servidor con `--dev`: todos los monstruos y skins quedan desbloqueados y puedes usar
**Mayús+L** (subir al siguiente hito de nivel: 5 → 10 → 15) y **Mayús+U** (llenar la carga de la R).
Para producción usa `npm start` (sin trucos).

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
| Silenciar | M | |

## Contenido actual (v0.5)

**Monstruos**

| | Ataque | Q | E | R (nv. 10) | Desbloqueo |
|---|---|---|---|---|---|
| 🧛 El Conde | Mordisco con robo de vida | Murciélagos | Niebla | Noche Carmesí | gratis |
| 🐺 Lobo de Luna | Zarpazo amplio | Embestida | Aullido | Luna Llena | gratis |
| ⚱️ Ramsés | Escarabajos a distancia que ralentizan | Vendas | Maldición | Tormenta del Faraón | 250 🪙 o medalla 🏹 |
| 👻 La Dama Velada | Puñetazo fantasma | Desvestirse | Frenesí invisible | Todos somos la Dama | 400 🪙 o medalla 💀 |
| 🧟 Paciente Cero | Mordisco infecto | Contagio (convierte a un humano en zombi aliado) | Carne fresca (cebo que atrae a sus zombis) | Salida de la tumba (horda + zombi gordo explosivo) | 350 🪙 o medalla 🍖 |
| 🐙 K'thula | Tentáculo | Tentáculo abisal (golpe en zona que atrae) | Sumergirse (intocable, ×2 velocidad) | Marejada abisal (ola que empuja y deja charcas) | 450 🪙 o medalla 👑 |

**Paciente Cero (invocador)**: algo menos de vida que el resto (95). El Contagio tarda unos 5 s: la vida del humano baja poco a poco y al llegar a cero se levanta como zombi. Máximo 5 zombis (7 durante la R), cada uno dura 30 s; atacan solos lo que tienen cerca y siguen a su dueño. Las bajas de sus zombis dan la mitad de XP/puntos y no cargan la R con humanos. Un 15 % de las víctimas de un zombi se levanta como zombi (estos no contagian). Nv. 5: los zombis que mueren dejan una nube tóxica que ralentiza y debilita. Nv. 15: aparecen zombis rápidos y duros.

**K'thula (acuático)**: cruza el agua profunda (lagos, ríos, piscinas) donde va ×1,3 más rápido y se regenera si no ha recibido daño en 3 s. Sumergirse dura 2,4 s en agua profunda y 1,2 s en tierra. En el agua su ataque básico es un chorro a presión (1,5 s, recarga 0,5 s). Si se queda quieto fuera del agua, brota bajo él una charca que va creciendo (nv. 5: más grande y más rápida). Nv. 15: dos cargas de Q y deja una charca al emerger.
**Charcas**: da igual quién las cree; cualquier criatura acuática recibe en ellas la mitad del bonus del agua profunda, y el resto se ralentiza.

**Evolución por niveles** (cada monstruo conserva su identidad):

| Nivel | Qué cambia |
|---|---|
| 5 | Mejora de la pasiva (Sed de sangre · Instinto depredador · Maldición del faraón · Presencia Ausente · Epidemia · Señor de las profundidades). Ojos más intensos. |
| 10 | Se desbloquea la **R**. Aura de partículas y detalles que brillan. |
| 15 | Mejora de Q/E (Señor de los Murciélagos · Bestia Alfa · Faraón Despierto · Desaparición Perfecta · Cepas mutantes · Llamada del abismo). El Conde y la Dama levitan; Lobo y Ramsés irradian luz. |
| 15+ | Solo estadísticas, como antes. |

**La R se carga con bajas**, no con el tiempo: humano +4 %, otro monstruo +25 %, Cazador +40 % (Sectario +15 %, Heraldo +60 %) (al llegar al nivel 10 empieza con un 30 %). Todos los números están en `shared/balance.ts`.

**Mapas** (procedurales con semilla): Calle del Olmo, Transilvania, Campamento Lago Sereno.
- **Agua en todos**: estanque y piscinas (Olmo), río con puentes (Transilvania), lago (Campamento). Se consulta con `map.water`, `waterAt(map, x, y)` y `obstacle.body`.
- **Televisiones** como entidades localizables (`map.tvs`): en ventanas de casas y cabañas, en escaparates de tiendas de electrodomésticos y abandonadas a la intemperie.
- **Bordes temáticos**: el mundo continúa fuera del área jugable (bosque denso, agua profunda, acantilados, vallas, muros, casas, cementerios) y se pierde en una niebla espesa.

**Entidades**: humanos que huyen y gritan (variantes por mapa), la orden de cazadores (ver abajo), 6 power-ups (sangre, rapidez, furia, escudo, monedas, XP).

**La orden de cazadores** (aparecen según el **nivel medio de la sala**; los de más nivel son pocos y proporcionales al número de jugadores, mínimo 1 cuando se alcanza la media; si la media baja, se retiran sin que nadie los vea). Todos van primero a por los zombis que tengan cerca.

| | Aparece | Cómo pelea |
|---|---|---|
| Cazador | siempre | Ballesta a distancia y estaca cuerpo a cuerpo. |
| Inquisidor | media ≥ 5 | Espada en llamas y embestida; prefiere a los monstruos de más nivel. |
| Exorcista | media ≥ 10 | Lanza frascos de agua bendita: charco que quema poco a poco y aturde al pisarlo. |
| Sectario | hay algún monstruo de nivel 15+ | Muy débil. Hace un ritual (círculo pixelado, 4 s) e invoca dentro a un monstruo de nivel 15+ al azar con la mitad de su vida actual; luego huye y desaparece. Matarlo interrumpe el ritual. |
| Heraldo de la luz | media de los jugadores de nivel ≥ 10 llega a 20 | Ángel lento pero constante (no se le ralentiza, asusta ni empuja). Maza que quita mucha vida. Ignora a los de nivel < 10. |

**Mejoras 1-2-3 a partir del nivel 15**: Vitalidad y Fuerza suben su tope de 8 a 16 y Velocidad de 6 a 10.

**Recompensas**: humano 10 pts / 1 🪙 · Cazador 80 pts / 8 🪙 (Heraldo 300 pts / 25 🪙) · monstruo 50 pts + 25 % de los suyos / 5 🪙. Al morir conservas el 70 % de los puntos de sala.

**Medallas**: Primera sangre, Glotón, Cazador de cazadores, Pesadilla de los Cazadores, Depredador, Inmortal, Señor de la Noche, Criatura ancestral, Buenas noches.

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

## Despliegue (bajo coste / gratis)

El juego necesita un **proceso Node siempre encendido con WebSockets**, por eso:

- **Vercel**: no mantiene WebSockets persistentes → sirve solo para el **cliente** estático.
- **Hostinger hosting compartido**: no permite procesos Node permanentes → no vale para el servidor. Un **VPS de Hostinger** sí.

| Opción | Coste | Notas |
|---|---|---|
| **Render** (`render.yaml` incluido) | gratis | Se duerme tras 15 min sin tráfico y tarda ~1 min en despertar. Ideal para enseñar el prototipo. Disco efímero: los perfiles se pierden al reiniciar. |
| **Oracle Cloud Always Free** (VM ARM) | gratis | Servidor permanente de verdad. Pide tarjeta y a veces no hay capacidad en la región. `docker build` + `docker run -p 80:3000 -v $PWD/data:/app/data`. |
| **VPS barato** (Hostinger KVM 1, Hetzner…) | ~4-6 €/mes | La opción más estable. Mismo Dockerfile. |

**Cliente en Vercel + servidor en otro sitio**: en Vercel define `VITE_SERVER_URL=https://tu-servidor` y usa `npm run build:client` con salida `dist/client`.

## Próximos pasos sugeridos

1. Persistencia real (SQLite/Turso/Supabase) en lugar del JSON.
2. Protocolo binario y delta-snapshots para bajar el ancho de banda.
3. Más mapas (hospital abandonado, pantano), más monstruos (criatura del lago, zombi), más taunts por personaje.
4. Tienda con objetos cosméticos (sombreros, rastros) y power-ups activables comprados con monedas.
5. Anti-trampas básicos y cuentas opcionales (enlazar perfil por email).
