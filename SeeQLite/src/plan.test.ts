import { describe, expect, it } from 'vitest';
import type { QueryResult } from './engine/protocol';
import { buildPlanNodes, planDepth } from './plan';

const result = (rows: QueryResult['rows']): QueryResult => ({
  columns: [{ name: 'id' }, { name: 'parent' }, { name: 'detail' }],
  rows,
  returnedRows: rows.length,
  truncated: false,
});

describe('query-plan projection', () => {
  it('keeps an empty plan explicit and bounded', () => {
    expect(buildPlanNodes(result([]))).toEqual([]);
  });

  it('bounds orphan, cyclic, and hostile plan rows without rewriting detail text', () => {
    const nodes = buildPlanNodes(result([
      [1, 99, '<img src=x onerror=alert(1)>'],
      [2, 2, 'cycle'],
    ]));
    const positions = new Map(nodes.map((node, index) => [node.id, index]));
    expect(nodes[0].detail).toBe('<img src=x onerror=alert(1)>');
    expect(planDepth(nodes[0], positions, nodes)).toBe(0);
    expect(planDepth(nodes[1], positions, nodes)).toBeLessThanOrEqual(6);
  });
});
