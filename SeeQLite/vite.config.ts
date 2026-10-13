import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('.', import.meta.url));
const buildInputs = [
  'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'scripts/build-service-worker.mjs',
  ...['src', 'public'].flatMap((directory) => readdirSync(join(root, directory), { recursive: true })
    .map((entry) => `${directory}/${entry}`)
    .filter((file) => !/\.(?:sqlite|sqlite3|db|wal|shm|journal)$/i.test(file) && statSync(join(root, file)).isFile())),
].sort();
const buildHash = createHash('sha256');
for (const file of buildInputs) buildHash.update(file).update(readFileSync(join(root, file)));
const buildId = buildHash.digest('hex').slice(0, 10);

export default defineConfig({
  base: './',
  define: { __SEEQLITE_BUILD_ID__: JSON.stringify(buildId) },
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  build: {
    assetsInlineLimit: 0,
    target: 'es2022',
    sourcemap: true,
  },
});
