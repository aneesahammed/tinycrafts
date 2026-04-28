import { defineConfig } from 'vite';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootStaticAssets = ['manifest.json', 'sw.js', 'icon.svg', 'icon-192.png', 'icon-512.png'];

function copyRootStaticAssets() {
  return {
    name: 'copy-root-static-assets',
    generateBundle() {
      for (const asset of rootStaticAssets) {
        const file = resolve(process.cwd(), asset);
        if (!existsSync(file)) continue;
        this.emitFile({
          type: 'asset',
          fileName: asset,
          source: readFileSync(file),
        });
      }
    },
  };
}

function preserveRootPwaLinks() {
  return {
    name: 'preserve-root-pwa-links',
    enforce: 'post',
    generateBundle(_, bundle) {
      const index = bundle['index.html'];
      if (!index || index.type !== 'asset' || typeof index.source !== 'string') return;

      index.source = pinPwaLinks(index.source);
    },
    writeBundle(options) {
      const indexPath = resolve(process.cwd(), options.dir || 'dist', 'index.html');
      if (!existsSync(indexPath)) return;

      writeFileSync(indexPath, pinPwaLinks(readFileSync(indexPath, 'utf8')));
    },
  };
}

function pinPwaLinks(html) {
  return html
    .replace(/href="\.\/assets\/manifest-[^"]+\.json"/, 'href="./manifest.json"')
    .replace(/href="\.\/assets\/icon-[^"]+\.svg"/, 'href="./icon.svg"')
    .replace(/href="\.\/assets\/icon-192-[^"]+\.png"/, 'href="./icon-192.png"');
}

export default defineConfig({
  base: './',
  plugins: [copyRootStaticAssets(), preserveRootPwaLinks()],
  build: {
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
});
