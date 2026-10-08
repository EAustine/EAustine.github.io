import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Archivo comes from Google Fonts here so the page stays one small file.
const archivoFromGoogle = (): Plugin => ({
  name: 'archivo-from-google',
  transformIndexHtml(html) {
    return html.replace(
      '</title>',
      `</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap">`,
    );
  },
});

// One file has nowhere to put the wordmark or the icons, so the wordmark and
// the SVG favicon are inlined and the links to the other icon files dropped.
const inlineBrand = (): Plugin => ({
  name: 'inline-brand',
  transformIndexHtml(html) {
    const uri = (file: string) => 'data:image/svg+xml;base64,' + readFileSync(r('./public/' + file)).toString('base64');
    return html
      .replace('src="./wordmark-dark.svg"', `src="${uri('wordmark-dark.svg')}"`)
      .replace('href="./favicon.svg"', `href="${uri('favicon.svg')}"`)
      .replace(/<link rel="(?:icon" href="\.\/favicon\.ico"|apple-touch-icon"|manifest")[^>]*>\n?/g, '');
  },
});

// The game only, as one self-contained HTML file (JS and CSS inlined).
// The viewer page is left out, so the build hides the links to it.
export default defineConfig({
  base: './',
  define: { __SINGLE__: 'true' },
  resolve: { alias: { '@fonts': r('./src/styles/fonts.single.css') } },
  plugins: [archivoFromGoogle(), inlineBrand(), viteSingleFile()],
  publicDir: false,
  build: {
    target: 'es2022',
    outDir: 'dist-single',
    chunkSizeWarningLimit: 700,
    rollupOptions: { input: r('./index.html') },
  },
});
