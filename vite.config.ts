import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';

/**
 * Compilación para CrazyGames (`npm run build:crazygames`, modo «crazygames», variables en .env.crazygames):
 * rutas relativas, sin la web pública (páginas SEO, vídeos…), sin enlaces a fuera ni etiquetas de la web.
 * La compilación normal (`vite build`) no cambia.
 */
function crazyGames(): Plugin {
  const icons = ['favicon.png', 'favicon-32.png', 'apple-touch-icon.png'];
  return {
    name: 'crazygames',
    transformIndexHtml(html) {
      return html
        .replace(/\s*<nav class="splash-links">[\s\S]*?<\/nav>/, '')
        .replace(/\s*<link rel="(canonical|alternate)"[^>]*>/g, '')
        .replace(/\s*<meta (property="og:|name="twitter:)[^>]*>/g, '')
        .replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
        .replace(/href="\/(favicon|apple-touch)/g, 'href="./$1');
    },
    generateBundle() {
      for (const f of icons) this.emitFile({ type: 'asset', fileName: f, source: readFileSync(`client/public/${f}`) });
    },
  };
}

export default defineConfig(({ mode }) => mode === 'crazygames'
  ? {
    root: 'client',
    base: './',
    envDir: '..', // .env.crazygames está en la raíz del proyecto
    publicDir: false,
    plugins: [crazyGames()],
    build: { outDir: '../dist-crazygames', emptyOutDir: true },
  }
  : {
    root: 'client',
    build: { outDir: '../dist/client', emptyOutDir: true },
    server: {
      port: 5173,
      proxy: { '/ws': { target: 'ws://localhost:3000', ws: true } },
    },
  });
