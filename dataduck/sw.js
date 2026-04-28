const CACHE_NAME = 'dataduck-shell-v3';
const APP_SHELL = ['./', './index.html', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'];
const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const IS_LOCAL_DEV_SERVER = LOCAL_DEV_HOSTS.has(self.location.hostname);

self.addEventListener('install', (event) => {
  if (IS_LOCAL_DEV_SERVER) {
    event.waitUntil(self.skipWaiting());
    return;
  }

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  if (IS_LOCAL_DEV_SERVER) {
    event.waitUntil(unregisterLocalDevWorker());
    return;
  }

  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isLocalDevServer(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

function isLocalDevServer(url) {
  return LOCAL_DEV_HOSTS.has(url.hostname);
}

async function unregisterLocalDevWorker() {
  await self.registration.unregister();
  const clients = await self.clients.matchAll({ type: 'window' });
  await Promise.all(clients.map((client) => client.navigate(client.url).catch(() => undefined)));
}

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match(fallbackUrl);
  }
}
