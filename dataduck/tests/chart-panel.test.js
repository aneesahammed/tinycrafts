import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../src/state/store.js';
import { mountChartPanel } from '../src/ui/chart-panel.js';
import { mountStatus } from '../src/ui/status.js';

function chartTitles(stage) {
  return [...stage.querySelectorAll('.chart-panel-svg title')].map((node) => node.textContent);
}

describe('chart panel', () => {
  it('rerenders against the latest query result while the drawer is open', () => {
    const store = createStore();
    const stage = document.createElement('main');
    stage.className = 'stage';
    const panel = mountChartPanel(stage, store);

    store.setResult({
      columns: ['species', 'body_mass_g'],
      columnTypes: { species: 'VARCHAR', body_mass_g: 'DOUBLE' },
      rows: [{ species: 'Adelie', body_mass_g: 1 }],
      elapsedMs: 1,
    });
    panel.open();

    expect(stage.querySelector('.chart-panel-heading h2').textContent).toBe('body_mass_g by species');
    expect(chartTitles(stage)).toContain('Adelie: 1');

    store.setResult({
      columns: ['island', 'count'],
      columnTypes: { island: 'VARCHAR', count: 'DOUBLE' },
      rows: [{ island: 'Biscoe', count: 4 }],
      elapsedMs: 2,
    });

    expect(stage.querySelector('.chart-panel-heading h2').textContent).toBe('count by island');
    expect(chartTitles(stage)).toContain('Biscoe: 4');
    expect(stage.textContent).not.toContain('body_mass_g by species');
  });

  it('aggregates repeated categorical x values into chart groups', () => {
    const store = createStore();
    const stage = document.createElement('main');
    stage.className = 'stage';
    const panel = mountChartPanel(stage, store);

    store.setResult({
      columns: ['species', 'body_mass_g'],
      columnTypes: { species: 'VARCHAR', body_mass_g: 'DOUBLE' },
      rows: [
        { species: 'Adelie', body_mass_g: 1 },
        { species: 'Adelie', body_mass_g: 2 },
        { species: 'Gentoo', body_mass_g: 5 },
      ],
      elapsedMs: 1,
    });
    panel.open();

    expect(stage.querySelectorAll('.chart-panel-svg .bar')).toHaveLength(2);
    expect(chartTitles(stage)).toEqual(expect.arrayContaining(['Adelie: 3', 'Gentoo: 5']));
    expect(stage.querySelector('.chart-panel-summary').textContent).toBe('2 groups');
  });

  it('does not enable the status Chart action for zero-row results', () => {
    const store = createStore();
    const work = document.createElement('main');
    mountStatus(work, store, { onOpenChart: vi.fn() });

    store.setResult({
      columns: ['species', 'body_mass_g'],
      columnTypes: { species: 'VARCHAR', body_mass_g: 'DOUBLE' },
      rows: [],
      elapsedMs: 1,
    });

    expect(work.querySelector('#sChart').disabled).toBe(true);
  });
});
