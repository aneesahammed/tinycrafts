const DEV_SW_RELOAD_KEY = 'dataduck:dev-service-worker-cleared';

export async function setupServiceWorker({
  isDev = import.meta.env.DEV,
  navigatorRef = navigator,
  locationRef = globalThis.location,
  sessionStorageRef = globalThis.sessionStorage,
  serviceWorkerUrl = new URL('../sw.js', import.meta.url),
} = {}) {
  const serviceWorker = navigatorRef?.serviceWorker;
  if (!serviceWorker) return;

  if (isDev) {
    await unregisterDevServiceWorkers({ serviceWorker, locationRef, sessionStorageRef });
    return;
  }

  await serviceWorker.register(serviceWorkerUrl, { scope: './' });
}

async function unregisterDevServiceWorkers({ serviceWorker, locationRef, sessionStorageRef }) {
  const registrations = await serviceWorker.getRegistrations?.();
  if (!registrations?.length) return;

  await Promise.all(registrations.map((registration) => registration.unregister()));

  if (!serviceWorker.controller) return;
  if (sessionStorageRef?.getItem?.(DEV_SW_RELOAD_KEY)) return;

  sessionStorageRef?.setItem?.(DEV_SW_RELOAD_KEY, '1');
  locationRef?.reload?.();
}
