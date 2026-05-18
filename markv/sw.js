const CACHE_VERSION = "v24";
const SHELL_CACHE = `markv-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `markv-runtime-${CACHE_VERSION}`;
const NAVIGATION_FALLBACK = "./index.html";

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/analytics.js",
  "./assets/library-core.js?v=15",
  "./assets/visual-blocks.js?v=12",
  "./assets/visual-block-menu.js?v=12",
  "./assets/pwa.js",
  "./assets/sample-developer.md",
  "./assets/toolbar-sync.js",
  "./assets/toolbar-mobile.js?v=2",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
  "./vendor/mermaid.min.js",
];

const RUNTIME_ASSETS = [
  "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css",
  "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css",
  "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js",
];

const RUNTIME_ORIGINS = new Set([
  "https://cdnjs.cloudflare.com",
  "https://cdn.jsdelivr.net",
]);

function shouldCache(response) {
  return Boolean(response && response.ok);
}

async function safeAdd(cache, url) {
  try {
    await cache.add(new Request(url, { cache: "reload" }));
  } catch (error) {
    console.warn("[sw] precache skipped", url, error);
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

      const runtime = await caches.open(RUNTIME_CACHE);
      await Promise.all(RUNTIME_ASSETS.map((url) => safeAdd(runtime, url)));
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
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
    return;
  }

  if (!RUNTIME_ORIGINS.has(url.origin)) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then(async (response) => {
          if (shouldCache(response)) {
            await cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);

      if (cached) {
        event.waitUntil(fetchPromise.then(() => undefined));
        return cached;
      }

      return fetchPromise;
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "markv-flush-queue") {
    event.waitUntil(Promise.resolve());
  }
});
