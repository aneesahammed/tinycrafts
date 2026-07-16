import type { QueryResult } from './engine/protocol';

export type PlanNode = { id: string; parent: string; detail: string };

export function buildPlanNodes(result: QueryResult): PlanNode[] {
  const idIndex = result.columns.findIndex((column) => column.name.toLowerCase() === 'id');
  const parentIndex = result.columns.findIndex((column) => column.name.toLowerCase() === 'parent');
  const detailIndex = result.columns.findIndex((column) => column.name.toLowerCase() === 'detail');
  return result.rows.map((row, index) => ({
    id: planText(row[idIndex] ?? index),
    parent: planText(row[parentIndex] ?? ''),
    detail: planText(row[detailIndex] ?? row[row.length - 1] ?? 'Plan step'),
  }));
}

export function planDepth(node: PlanNode, positions: Map<string, number>, nodes: PlanNode[]) {
  let depth = 0;
  let parent = node.parent;
  const seen = new Set<string>();
  while (parent && parent !== '-1' && positions.has(parent) && !seen.has(parent) && depth < 8) {
    seen.add(parent);
    depth += 1;
    parent = nodes[positions.get(parent)!].parent;
  }
  return Math.min(depth, 6);
}

function planText(value: QueryResult['rows'][number][number]) {
  if (value === null) return '';
  if (typeof value === 'object' && value.kind === 'text') return value.value;
  if (typeof value === 'object') return value.preview;
  return String(value);
}
