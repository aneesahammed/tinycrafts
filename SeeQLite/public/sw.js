const CACHE_PREFIX = 'seeqlite-dev-';
const CACHE_NAME = `${CACHE_PREFIX}shell-v1`;
const SHELL = ['./', './index.html', './manifest.webmanifest', './seeqlite-icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => {
    if (!self.registration.active) self.skipWaiting();
  }));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || /\.(?:sqlite|sqlite3|db|wal|shm|journal)$/i.test(url.pathname)) return;
  if (!['document', 'script', 'style', 'font', 'wasm'].includes(request.destination) && !url.pathname.endsWith('.wasm')) return;
  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
});
