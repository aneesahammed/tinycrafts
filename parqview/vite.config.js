import { defineConfig } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
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

export default defineConfig({
  base: './',
  plugins: [copyRootStaticAssets()],
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
