import { describe, expect, it } from 'vitest';
import { createStore } from '../src/state/store.js';
import { mountResult } from '../src/ui/result.js';

describe('result states', () => {
  it('right-aligns numeric headers with their values and keeps real column case', () => {
    const store = createStore();
    const host = document.createElement('main');
    mountResult(host, store);

    store.setResult({
      columns: ['Species', 'mass_g'],
      rows: [{ Species: 'Adelie', mass_g: 3750 }],
      elapsedMs: 1,
    });

    const [, species, mass] = host.querySelectorAll('th');
    expect(species.classList.contains('num')).toBe(false);
    expect(mass.classList.contains('num')).toBe(true);
    expect(species.textContent).toContain('Species');
  });

  it('says so when a query matches no rows', () => {
    const store = createStore();
    const host = document.createElement('main');
    mountResult(host, store);

    store.setResult({ columns: ['a'], rows: [], elapsedMs: 1 });

    expect(host.querySelector('thead')).not.toBeNull();
    expect(host.querySelector('.result-msg').textContent).toContain('No rows');
  });

  it('replaces stale rows with the error, preserving its whitespace, until the next success', () => {
    const store = createStore();
    const host = document.createElement('main');
    mountResult(host, store);

    store.setResult({ columns: ['a'], rows: [{ a: 1 }], elapsedMs: 1, sql: 'SELECT 1 AS a;' });
    store.setQueryError('Parser Error\nLINE 1: SELEC\n        ^', 'SELEC');

    expect(host.querySelector('table')).toBeNull();
    expect(host.querySelector('[role="alert"] pre').textContent).toBe('Parser Error\nLINE 1: SELEC\n        ^');
    expect(store.state.lastRunSql).toBe('SELEC');

    store.setResult({ columns: ['a'], rows: [{ a: 2 }], elapsedMs: 1, sql: 'SELECT 2 AS a;' });
    expect(store.state.queryError).toBeNull();
    expect(host.querySelector('table')).not.toBeNull();
  });
});
