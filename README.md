# 🦇 El Señor de la Noche .io (Nights Lord)

Juego multijugador gratuito tipo **.io** en pixel art 2D. Eres un monstruo clásico del cine de terror: cazas humanos para hacerte más fuerte, esquivas (o cazas) a los **Helsing** y compites con otros monstruos por ser el número 1 de la sala.

- **Salas libres**: entras y sales cuando quieras sin parar la partida. Sala aleatoria, por código (`?sala=ABCD`) o creando la tuya (pública/privada, con mapa a elegir).
- **Ranking de sala** por puntos en tiempo real (el líder lleva 👑 y los Helsing le ven desde más lejos).
- **Progresión persistente**: monedas, medallas, personajes y skins desbloqueables.
- Todo en **TypeScript**: servidor autoritativo en Node + cliente Canvas 2D sin motor.
- **Sprites, mapas y sonido 100 % procedurales** (no hay ficheros de imagen ni audio).

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

Visor de sprites (todas las animaciones y skins): <http://localhost:5173/#sprites>

Producción local: `npm run build && npm start` → <http://localhost:3000>

## Controles

| Acción | Teclado/ratón | Móvil |
|---|---|---|
| Moverse | WASD / flechas | joystick |
| Apuntar | ratón | dirección del joystick |
| Ataque básico | clic izq. / Espacio | ⚔ |
| Habilidades | Q (o clic dcho.) / E | Q / E |
| Mejoras al subir de nivel | 1 · 2 · 3 · 4 | tocar la tarjeta |
| Saludar / Taunt | G / T | 😜 |
| Silenciar | M | |

## Contenido actual (prototipo v0.1)

**Monstruos**

| | Ataque | Q | E | Desbloqueo |
|---|---|---|---|---|
| 🧛 El Conde (vampiro) | Mordisco con robo de vida | Murciélagos (abanico) | Niebla (teletransporte invulnerable) | gratis |
| 🐺 Lobo de Luna | Zarpazo amplio | Embestida | Aullido (buff + miedo) | gratis |
| 🧟 Ramsés (momia) | Golpe, 15 % armadura | Vendas (inmoviliza) | Maldición (área + ralentiza) | 250 🪙 o medalla 🏹 |
| 👻 La Dama Velada | Puñetazo | Desvanecer (invisible, golpe x2) | Empujón (aturde) | 400 🪙 o medalla 💀 |

**Mapas** (procedurales con semilla): Calle del Olmo, Transilvania, Campamento Lago Sereno.

**Entidades**: humanos que huyen y gritan (variantes por mapa), Helsing con ballesta y estaca que te persiguen, 6 power-ups (sangre, rapidez, furia, escudo, monedas, XP).

**Recompensas**: humano 10 pts / 1 🪙 · Helsing 80 pts / 8 🪙 · monstruo 50 pts + 25 % de los suyos / 5 🪙. Al morir conservas el 70 % de los puntos de sala.

**Medallas**: Primera sangre, Glotón, Cazador de cazadores, Pesadilla de Helsing, Depredador, Inmortal, Señor de la Noche, Criatura ancestral, Buenas noches.

## Arquitectura

```
shared/   tipos y lógica común: protocolo, personajes, skins, catálogo, mapas, colisiones
server/   Node + ws: RoomManager, Room (simulación 20 Hz), store (perfiles JSON)
client/   Canvas 2D: game (predicción + interpolación + render), sprites, tiles, audio, input, UI
tools/    bots de carga
```

- **Servidor autoritativo** a 20 ticks/s; snapshots a 10 Hz con *interest management* (solo entidades en un radio de ~1150 px) → ~20-25 KB/s por jugador.
- **Cliente**: predicción local del movimiento con reconciliación por número de secuencia; el resto de entidades se interpolan con 120 ms de retardo.
- **Mapa determinista**: servidor y cliente generan el mismo mapa con `(tema, semilla)`; no se envía por red.
- **Cada sala tiene su propio bucle**, así que entrar o salir no afecta a las demás. Las salas vacías se cierran a los 60 s.

### Cómo añadir contenido sin coste de arte

- **Skin nueva**: añade una entrada con una paleta en `SKINS` (`shared/characters.ts`). Nada más.
- **Monstruo nuevo**: stats + habilidades en `CHARACTERS`, una función "forma" en `client/sprites.ts` (cabeza, ropa y extras sobre el esqueleto común) y su `case` de habilidades en `server/Room.ts`. Todas las animaciones (idle, andar, ataque, cast, saludo, taunt, daño) se heredan automáticamente porque todos comparten las mismas poses.
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
