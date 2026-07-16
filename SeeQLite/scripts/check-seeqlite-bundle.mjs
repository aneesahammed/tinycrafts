import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const dist = join(root, 'dist');
if (!existsSync(dist)) throw new Error('Missing SeeQLite dist directory. Run npm run build first.');
const assets = join(dist, 'assets');
const names = readdirSync(assets);
for (const suffix of ['.js', '.css']) {
  if (!names.some((name) => name.endsWith(suffix))) throw new Error(`Missing ${suffix} bundle.`);
}
const html = readFileSync(join(dist, 'index.html'), 'utf8');
if (html.includes('src="/') || html.includes('href="/')) throw new Error('SeeQLite artifact contains a root-relative asset path.');
if (!existsSync(join(dist, 'sample.sqlite'))) throw new Error('SeeQLite artifact is missing the bundled sample database.');
if (!existsSync(join(dist, 'sw.js'))) throw new Error('SeeQLite artifact is missing the service worker.');
const serviceWorker = readFileSync(join(dist, 'sw.js'), 'utf8');
if (!serviceWorker.includes('const CACHE_PREFIX = \'seeqlite-\'')) throw new Error('SeeQLite service worker must use a scoped cache prefix.');
if (!serviceWorker.includes('const PRECACHE =')) throw new Error('SeeQLite service worker must contain the generated precache manifest.');
if (serviceWorker.includes("caches.delete(key)" ) && !serviceWorker.includes("key.startsWith(CACHE_PREFIX)")) throw new Error('SeeQLite service worker must not delete sibling caches.');
const precacheMatch = /const PRECACHE = (\[[\s\S]*?\]);/.exec(serviceWorker);
if (!precacheMatch) throw new Error('SeeQLite service worker precache manifest is unreadable.');
const precachedPaths = JSON.parse(precacheMatch[1]);
if (precachedPaths.some((path) => /\.(?:sqlite|sqlite3|db|wal|shm|journal)$/i.test(path))) throw new Error('SeeQLite service worker must not precache database or sidecar paths.');
for (const name of names.filter((entry) => entry.endsWith('.js'))) {
  const source = readFileSync(join(assets, name), 'utf8');
  if (source.includes('new Worker(`data:') || source.includes('new Worker("data:')) throw new Error('SeeQLite must not construct data URL workers.');
}
assertBudget(/index-.*\.js$/, 260 * 1024, 'main app JavaScript');
assertBudget(/sqlite\.worker-.*\.js$/, 240 * 1024, 'SQLite worker JavaScript');
assertBudget(/SqlEditor-.*\.js$/, 400 * 1024, 'lazy SQL editor JavaScript');
assertBudget(/\.wasm$/, 1 * 1024 * 1024, 'SQLite WASM');
assertBudget(/\.css$/, 25 * 1024, 'CSS');
console.log(`SeeQLite bundle verified: ${names.length} emitted assets.`);

function assertBudget(pattern, maxBytes, label) {
  const name = names.find((entry) => pattern.test(entry));
  if (!name) throw new Error(`Missing ${label} asset.`);
  const size = statSync(join(assets, name)).size;
  if (size > maxBytes) throw new Error(`${label} is ${size} bytes, over the ${maxBytes}-byte budget.`);
}
