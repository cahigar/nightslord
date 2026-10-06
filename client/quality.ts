// Calidad de imagen adaptable: resolución interna del lienzo del juego.
// En móvil se empieza más bajo que la densidad de la pantalla (el pixel art no lo nota) y, si los FPS caen,
// se baja un escalón más; si van sobrados durante un rato, se vuelve a subir.
const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const dpr = typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1;
const max = touch ? Math.min(dpr, 1.5) : Math.min(dpr, 2);

export const quality = {
  scale: max,
  max,
  min: touch ? 0.85 : 1,
  touch,
};

let acc = 0, frames = 0, slowWindows = 0, goodWindows = 0;
/** Llamar una vez por fotograma con el dt real; devuelve true si ha cambiado la escala (hay que redimensionar). */
export function adaptQuality(dt: number): boolean {
  acc += dt; frames++;
  if (acc < 2) return false;
  const avg = acc / frames;
  acc = 0; frames = 0;
  if (avg > 1 / 45) { slowWindows++; goodWindows = 0; } else if (avg < 1 / 57) { goodWindows++; slowWindows = 0; } else { slowWindows = 0; goodWindows = 0; }
  if (slowWindows >= 1 && quality.scale > quality.min) {
    quality.scale = Math.max(quality.min, +(quality.scale - 0.25).toFixed(2));
    slowWindows = 0;
    return true;
  }
  if (goodWindows >= 6 && quality.scale < quality.max) {
    quality.scale = Math.min(quality.max, +(quality.scale + 0.25).toFixed(2));
    goodWindows = 0;
    return true;
  }
  return false;
}
