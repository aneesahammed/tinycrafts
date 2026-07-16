import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const dist = join(root, 'dist');
const cachePrefix = 'seeqlite-';
const files = collect(dist)
  .filter((file) => file !== 'sw.js')
  .filter((file) => !/\.(?:sqlite|sqlite3|db|wal|shm|journal)$/i.test(file))
  .filter((file) => !file.endsWith('.map'))
  .sort();

const records = files.map((file) => {
  const bytes = readFileSync(join(dist, file));
  return { path: `./${file.replaceAll('\\', '/')}`, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
});
const buildId = createHash('sha256').update(JSON.stringify(records)).digest('hex').slice(0, 16);
const precache = ['./', ...records.map((record) => record.path)];
const worker = `const CACHE_PREFIX = '${cachePrefix}';
const CACHE_NAME = '${cachePrefix}${buildId}';
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE);
    // The first install has no active worker; later updates wait for a safe reload.
    if (!self.registration.active) self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('.sqlite') || url.pathname.endsWith('.sqlite3') || url.pathname.endsWith('.db') || url.pathname.endsWith('.wal') || url.pathname.endsWith('.shm') || url.pathname.endsWith('.journal')) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    return fetch(request);
  })());
});
`;

writeFileSync(join(dist, 'sw.js'), worker);
console.log(`SeeQLite service worker generated: ${records.length} precached assets (${buildId}).`);

function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collect(path);
    return [relative(dist, path)];
  });
}
