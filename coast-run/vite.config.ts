import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Two static pages: the game (index.html) and the model viewer (supercar.html).
// The build goes to docs/, which GitHub Pages serves (Settings > Pages >
// Deploy from a branch > main, /docs). base './' keeps every path relative, so
// the site works at eaustine.github.io/coast-run/ or any other sub-path.
// Icons, the social card and the manifest live in public/ and are copied as is.
export default defineConfig({
  base: './',
  define: { __SINGLE__: 'false' },
  resolve: { alias: { '@fonts': r('./src/styles/fonts.css') } },
  build: {
    target: 'es2022',
    outDir: 'docs',
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,   // three.js is one shared chunk of about 550 kB
    rollupOptions: {
      input: { main: r('./index.html'), supercar: r('./supercar.html') },
    },
  },
});
