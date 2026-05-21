import { afterEach, describe, expect, it, vi } from 'vitest';

describe('DOM security helpers', () => {
  afterEach(() => {
    delete globalThis.trustedTypes;
    delete globalThis[Symbol.for('dataduck.trustedTypesPolicy')];
    vi.resetModules();
  });

  it('allows only same-origin worker script URLs through Trusted Types', async () => {
    globalThis.trustedTypes = {
      createPolicy: (_name, policy) => policy,
    };
    vi.resetModules();

    const { trustedScriptUrl } = await import('../src/util/dom.js');
    const sameOriginBlob = `blob:${globalThis.location.origin}/7d9d0e5c-worker`;

    expect(trustedScriptUrl('/assets/worker.js')).toBe('/assets/worker.js');
    expect(trustedScriptUrl(sameOriginBlob)).toBe(sameOriginBlob);
    expect(trustedScriptUrl('https://gc.zgo.at/count.js')).toBe('https://gc.zgo.at/count.js');
    expect(() => trustedScriptUrl('data:text/javascript,postMessage(1)')).toThrow(/Untrusted script URL/);
    expect(() => trustedScriptUrl('blob:https://evil.example/worker')).toThrow(/Untrusted script URL/);
    expect(() => trustedScriptUrl('https://evil.example/worker.js')).toThrow(/Untrusted script URL/);
  });

  it('does not allow arbitrary spinner class injection', async () => {
    const { spinner } = await import('../src/util/dom.js');

    expect(spinner('lg')).toContain('class="spin lg"');
    expect(spinner('lg onclick=alert(1)')).toContain('class="spin"');
    expect(spinner('lg onclick=alert(1)')).not.toContain('onclick');
  });
});
