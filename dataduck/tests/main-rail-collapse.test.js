import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainSource = readFileSync('src/main.js', 'utf8');

describe('main rail collapse startup', () => {
  it('initializes the rail collapse sync guard before the first sync call', () => {
    const guardIndex = mainSource.indexOf('let lastSyncedRailCollapsed');
    const startupSyncIndex = mainSource.indexOf('syncRailCollapsed(store.state);');

    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(startupSyncIndex).toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeLessThan(startupSyncIndex);
  });

  it('passes the theme toggle handler to the header', () => {
    const headerMount = mainSource.match(/mountHeader\(head, store, \{([\s\S]*?)\n\}\);/);

    expect(headerMount?.[1]).toContain('onToggleTheme: toggleTheme');
  });
});
