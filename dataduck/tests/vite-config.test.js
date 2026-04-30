import { describe, expect, it } from 'vitest';
import config from '../vite.config.js';

describe('Vite dev-server config', () => {
  it('does not forward browser console errors back through the dev websocket', () => {
    expect(config.server?.forwardConsole).toBe(false);
  });

  it('does not inline font assets as CSP-blocked data URLs', () => {
    expect(config.build?.assetsInlineLimit).toBe(0);
  });
});
