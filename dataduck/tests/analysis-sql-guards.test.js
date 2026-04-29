import { describe, expect, it } from 'vitest';
import {
  AnalysisCompileError,
  compileFilterList,
  contextColumnMap,
  escapeLike,
  requireNumericColumn,
} from '../src/ai/analysis-engine/sql-guards.js';

const context = {
  columns: [
    { name: 'product"; DROP TABLE active_file;--', type: 'VARCHAR' },
    { name: 'units', type: 'INTEGER' },
    { name: 'created_at', type: 'TIMESTAMP' },
    { name: 'payload', type: 'STRUCT(name VARCHAR)' },
  ],
};

describe('analysis SQL guards', () => {
  it('uses parameters for filter literals and escapes contains wildcards', () => {
    const columns = contextColumnMap(context);
    const { sql, params } = compileFilterList([
      { column: 'product"; DROP TABLE active_file;--', op: 'contains', value: 'a%b_c\\d' },
    ], columns);

    expect(sql).toContain('ILIKE ?');
    expect(params).toEqual(['%a\\%b\\_c\\\\d%']);
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  });

  it('rejects mismatched and unsupported filter types', () => {
    const columns = contextColumnMap(context);
    expect(() => compileFilterList([{ column: 'units', op: '>', value: 'ten' }], columns)).toThrow(AnalysisCompileError);
    expect(() => compileFilterList([{ column: 'created_at', op: 'between', value: [1, 2] }], columns)).toThrow(AnalysisCompileError);
    expect(() => compileFilterList([{ column: 'payload', op: '=', value: 'x' }], columns)).toThrow(AnalysisCompileError);
  });

  it('rejects numeric analysis over non-numeric columns', () => {
    const columns = contextColumnMap(context);
    expect(() => requireNumericColumn(columns, 'product"; DROP TABLE active_file;--')).toThrow(AnalysisCompileError);
  });
});
