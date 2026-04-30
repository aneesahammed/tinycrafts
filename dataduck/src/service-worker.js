import { trustedScriptUrl } from './util/dom.js';

export async function setupServiceWorker({
  isDev = import.meta.env.DEV,
  navigatorRef = navigator,
  locationRef = globalThis.location,
  serviceWorkerUrl = './sw.js',
} = {}) {
  const serviceWorker = navigatorRef?.serviceWorker;
  if (!serviceWorker) return;

  if (isDev) {
    await unregisterDevServiceWorkers({ serviceWorker, locationRef });
    return;
  }

  // updateViaCache: 'none' forces the browser to bypass the HTTP cache when
  // checking sw.js for updates. Without this, a malicious SW briefly served
  // during a transient compromise could persist via cache-Control until TTL
  // expiry — keeping a backdoor alive after the source was already fixed.
  await serviceWorker.register(trustedScriptUrl(serviceWorkerUrl), { scope: './', updateViaCache: 'none' });
}

async function unregisterDevServiceWorkers({ serviceWorker, locationRef }) {
  const registrations = await serviceWorker.getRegistrations?.();
  if (!registrations?.length) return;

  const results = await Promise.all(registrations.map((registration) => registration.unregister()));

  if (!serviceWorker.controller) return;
  if (!results.some(Boolean)) return;

  locationRef?.reload?.();
}
