import { describe, expect, it, vi } from 'vitest';
import { setupServiceWorker } from '../src/service-worker.js';

describe('service-worker setup', () => {
  it('unregisters existing workers in Vite dev instead of registering a PWA worker', async () => {
    const unregister = vi.fn(() => Promise.resolve(true));
    const register = vi.fn();
    const reload = vi.fn();
    const sessionStorage = new Map();

    await setupServiceWorker({
      isDev: true,
      navigatorRef: {
        serviceWorker: {
          controller: {},
          getRegistrations: () => Promise.resolve([{ unregister }]),
          register,
        },
      },
      locationRef: { reload },
      sessionStorageRef: {
        getItem: (key) => sessionStorage.get(key) || null,
        setItem: (key, value) => sessionStorage.set(key, value),
      },
    });

    expect(unregister).toHaveBeenCalledOnce();
    expect(register).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('registers the PWA worker outside dev', async () => {
    const register = vi.fn(() => Promise.resolve());

    await setupServiceWorker({
      isDev: false,
      serviceWorkerUrl: '/sw.js',
      navigatorRef: {
        serviceWorker: {
          register,
        },
      },
    });

    expect(register).toHaveBeenCalledWith('/sw.js', { scope: './' });
  });
});
