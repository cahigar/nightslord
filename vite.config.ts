import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';

/**
 * Compilaciones para portales: CrazyGames (`npm run build:crazygames`, .env.crazygames) e itch.io (`npm run build:itch`, .env.itch):
 * rutas relativas, sin la web pública (páginas SEO, vídeos…), sin enlaces a fuera ni etiquetas de la web.
 * La compilación normal (`vite build`) no cambia.
 */
function portalBuild(): Plugin {
  const icons = ['favicon.png', 'favicon-32.png', 'apple-touch-icon.png'];
  return {
    name: 'portal',
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

export default defineConfig(({ mode }) => mode === 'crazygames' || mode === 'itch'
  ? {
    root: 'client',
    base: './',
    envDir: '..', // .env.crazygames / .env.itch están en la raíz del proyecto
    publicDir: false,
    plugins: [portalBuild()],
    build: { outDir: `../dist-${mode}`, emptyOutDir: true },
  }
  : {
    root: 'client',
    build: { outDir: '../dist/client', emptyOutDir: true },
    server: {
      port: 5173,
      proxy: { '/ws': { target: 'ws://localhost:3000', ws: true } },
    },
  });
