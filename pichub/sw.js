const CACHE_VERSION = "v14";
const SHELL_CACHE = `pichub-shell-${CACHE_VERSION}`;
const NAVIGATION_FALLBACK = "./index.html";

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/pwa.js",
  "./sw.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
];

function shouldCache(response) {
  return Boolean(response && (response.ok || response.type === "opaque"));
}

async function safeAdd(cache, url) {
  try {
    await cache.add(new Request(url, { cache: "reload" }));
  } catch (error) {
    console.warn("[pichub-sw] precache skipped", url, error);
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (shouldCache(response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch (_error) {
    const cache = await caches.open(SHELL_CACHE);
    return (
      (await cache.match(NAVIGATION_FALLBACK, { ignoreSearch: true })) ||
      (await cache.match("./", { ignoreSearch: true }))
    );
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await Promise.all(SHELL_ASSETS.map((url) => safeAdd(shell, url)));
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("pichub-") && key !== SHELL_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
