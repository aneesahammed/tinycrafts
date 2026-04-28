import { describe, expect, it, vi } from 'vitest';
import { setupServiceWorker } from '../src/service-worker.js';

describe('service-worker setup', () => {
  it('unregisters existing workers in Vite dev instead of registering a PWA worker', async () => {
    const unregister = vi.fn(() => Promise.resolve(true));
    const register = vi.fn();
    const reload = vi.fn();

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
    });

    expect(unregister).toHaveBeenCalledOnce();
    expect(register).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('ignores stale cleanup markers after a successful dev unregister', async () => {
    const unregister = vi.fn(() => Promise.resolve(true));
    const reload = vi.fn();

    await setupServiceWorker({
      isDev: true,
      navigatorRef: {
        serviceWorker: {
          controller: {},
          getRegistrations: () => Promise.resolve([{ unregister }]),
        },
      },
      locationRef: { reload },
      sessionStorageRef: {
        getItem: () => '1',
        setItem: vi.fn(),
      },
    });

    expect(unregister).toHaveBeenCalledOnce();
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

  it('registers the root service-worker script by default in production', async () => {
    const register = vi.fn(() => Promise.resolve());

    await setupServiceWorker({
      isDev: false,
      navigatorRef: {
        serviceWorker: {
          register,
        },
      },
    });

    expect(register).toHaveBeenCalledWith('./sw.js', { scope: './' });
  });
});
