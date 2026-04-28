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

  await serviceWorker.register(serviceWorkerUrl, { scope: './' });
}

async function unregisterDevServiceWorkers({ serviceWorker, locationRef }) {
  const registrations = await serviceWorker.getRegistrations?.();
  if (!registrations?.length) return;

  const results = await Promise.all(registrations.map((registration) => registration.unregister()));

  if (!serviceWorker.controller) return;
  if (!results.some(Boolean)) return;

  locationRef?.reload?.();
}
