# Trailers de monstruos (formato reel 9:16)

Graban partidas guionizadas con Playwright y las montan con ffmpeg: intro con el monstruo, 7 tomas con rótulo
(habilidad, Q, E, evoluciones, definitiva, cazadores) y tarjeta final con el logo animado.

```bash
npm i --no-save @fontsource/press-start-2p @fontsource/vt323   # fuentes (Google Fonts no siempre es accesible)
npx tsx server/index.ts --dev &                                 # servidor en modo desarrollo (puerto 3000)
npx vite --port 5173 &                                          # cliente
node tools/trailer/music.mjs /tmp/tr/music.webm 32              # pista de música
node tools/trailer/record.mjs werewolf /tmp/tr                  # grabación + marcas (werewolf | kthula | doppy)
node tools/trailer/compose.mjs werewolf /tmp/tr salida.mp4      # montaje final
```

Para un monstruo nuevo: añade su guion en `record.mjs` (SCRIPTS) y sus textos en `compose.mjs`.
Si una toma queda mal, ajusta `off` (segundos desde la marca) o pasa `OFFS=",0.4,,"` al montar.
