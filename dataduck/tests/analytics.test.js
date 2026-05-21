import { describe, expect, it } from 'vitest';

import { setupAnalytics } from '../src/analytics.js';

function createDocumentStub() {
  const appended = [];
  return {
    appended,
    createElement(tag) {
      return { tag, async: false, dataset: {}, src: '' };
    },
    head: {
      appendChild(node) {
        appended.push(node);
      },
    },
  };
}

describe('DataDuck analytics', () => {
  it('loads the DataDuck GoatCounter collector on production hosts', () => {
    const documentRef = createDocumentStub();

    const script = setupAnalytics({
      documentRef,
      locationRef: { hostname: 'dataduck.tinycrafts.dev', protocol: 'https:' },
      isDev: false,
    });

    expect(script).toMatchObject({
      tag: 'script',
      async: true,
      src: 'https://gc.zgo.at/count.js',
    });
    expect(script.dataset.goatcounter).toBe('https://dataduck.goatcounter.com/count');
    expect(documentRef.appended).toEqual([script]);
  });

  it('skips local and dev sessions', () => {
    expect(
      setupAnalytics({
        documentRef: createDocumentStub(),
        locationRef: { hostname: 'dataduck.tinycrafts.dev', protocol: 'https:' },
        isDev: true,
      }),
    ).toBeNull();
    expect(
      setupAnalytics({
        documentRef: createDocumentStub(),
        locationRef: { hostname: 'localhost', protocol: 'http:' },
        isDev: false,
      }),
    ).toBeNull();
  });
});
