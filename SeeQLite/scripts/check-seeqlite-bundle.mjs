import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const dist = join(root, 'dist');
if (!existsSync(dist)) throw new Error('Missing SeeQLite dist directory. Run npm run build first.');
const assets = join(dist, 'assets');
const names = readdirSync(assets);
for (const suffix of ['.js', '.css']) {
  if (!names.some((name) => name.endsWith(suffix))) throw new Error(`Missing ${suffix} bundle.`);
}
console.log(`SeeQLite bundle verified: ${names.length} emitted assets.`);
