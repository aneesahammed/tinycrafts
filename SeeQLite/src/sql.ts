import type { Catalog, CatalogForeignKey } from './engine/protocol';

export function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

const FORMAT_PHRASES = [
  'EXPLAIN QUERY PLAN',
  'LEFT OUTER JOIN',
  'RIGHT OUTER JOIN',
  'FULL OUTER JOIN',
  'GROUP BY',
  'ORDER BY',
  'UNION ALL',
] as const;

const FORMAT_KEYWORDS = [
  'SELECT', 'DISTINCT', 'FROM', 'WHERE', 'HAVING', 'LIMIT', 'OFFSET', 'RETURNING',
  'UNION', 'INTERSECT', 'EXCEPT', 'JOIN', 'LEFT', 'RIGHT', 'FULL', 'INNER', 'OUTER',
  'CROSS', 'NATURAL', 'ON', 'AND', 'OR', 'AS', 'WITH', 'RECURSIVE', 'INSERT', 'UPDATE',
  'DELETE', 'VALUES', 'SET', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'EXISTS', 'IN', 'IS',
  'NULL', 'NOT', 'LIKE', 'BETWEEN', 'ASC', 'DESC', 'EXPLAIN', 'PRAGMA',
] as const;

function protectedSegmentEnd(source: string, start: number) {
  const opener = source[start];
  if (source.startsWith('--', start)) {
    const newline = source.indexOf('\n', start + 2);
    return newline === -1 ? source.length : newline + 1;
  }
  if (source.startsWith('/*', start)) {
    const closer = source.indexOf('*/', start + 2);
    return closer === -1 ? source.length : closer + 2;
  }
  if (opener === '[') {
    for (let index = start + 1; index < source.length; index += 1) {
      if (source[index] !== ']') continue;
      if (source[index + 1] === ']') {
        index += 1;
        continue;
      }
      return index + 1;
    }
    return source.length;
  }
  if (opener !== "'" && opener !== '"' && opener !== '`') return start;
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] !== opener) continue;
    if (source[index + 1] === opener) {
      index += 1;
      continue;
    }
    return index + 1;
  }
  return source.length;
}

function maskProtectedSqlSegments(source: string) {
  const segments: string[] = [];
  let nonce = 0;
  let markerPrefix = '';
  do {
    markerPrefix = `\u0000seeqlite-format-${nonce}-`;
    nonce += 1;
  } while (source.includes(markerPrefix));

  let masked = '';
  for (let index = 0; index < source.length;) {
    const end = protectedSegmentEnd(source, index);
    if (end === index) {
      masked += source[index];
      index += 1;
      continue;
    }
    const marker = `${markerPrefix}${segments.length}\u0000`;
    segments.push(source.slice(index, end));
    masked += marker;
    index = end;
  }

  return {
    masked,
    restore(value: string) {
      return segments.reduce((formatted, segment, index) => formatted.replaceAll(`${markerPrefix}${index}\u0000`, segment), value);
    },
  };
}

// A deliberately small formatter for the SQL users can write in SeeQLite. It
// never parses or rewrites quoted values, identifiers, or comments; those are
// masked while keywords and clause boundaries are normalized.
export function formatSql(source: string) {
  if (!source.trim()) return source;
  const { masked, restore } = maskProtectedSqlSegments(source);
  let formatted = masked.trim().replace(/[\t\r\n ]+/g, ' ').replace(/\s*,\s*/g, ', ');

  for (const phrase of FORMAT_PHRASES) {
    formatted = formatted.replace(new RegExp(`\\b${phrase.replaceAll(' ', '\\s+')}\\b`, 'gi'), phrase);
  }
  for (const keyword of FORMAT_KEYWORDS) {
    formatted = formatted.replace(new RegExp(`\\b${keyword}\\b`, 'gi'), keyword);
  }

  formatted = formatted
    .replace(/\s+(FROM|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT|OFFSET|RETURNING|UNION ALL|UNION|INTERSECT|EXCEPT)\b/g, '\n$1')
    .replace(/\s+((?:(?:LEFT|RIGHT|FULL|INNER|CROSS|NATURAL)(?: OUTER)? )?JOIN)\b/g, '\n$1')
    .replace(/\s+ON\b/g, '\n  ON')
    .replace(/\s+(AND|OR)\b/g, '\n  $1')
    .replace(/^EXPLAIN QUERY PLAN\s+SELECT\s+/, 'EXPLAIN QUERY PLAN\nSELECT\n  ')
    .replace(/^SELECT\s+/, 'SELECT\n  ')
    .replace(/\s*;\s*$/, ';');

  return restore(formatted).trim();
}

// Builds a quoted, single-statement read-only join for a declared foreign key.
// Returns null when the referenced table/columns cannot be resolved.
export function buildJoinSql(relation: CatalogForeignKey, catalog: Catalog) {
  const child = catalog.tables.find((table) => table.name === relation.fromTable);
  const parent = catalog.tables.find((table) => table.name === relation.toTable);
  if (!child || !parent || relation.fromColumns.length === 0 || relation.fromColumns.length !== relation.toColumns.length || relation.fromColumns.some((column) => !column)) return null;
  const parentPrimaryKey = parent.columns.filter((column) => column.primaryKey).sort((left, right) => left.primaryKey - right.primaryKey).map((column) => column.name);
  const parentColumns = relation.toColumns.map((column, index) => column || parentPrimaryKey[index] || '');
  if (parentColumns.some((column) => !column)) return null;
  const predicates = relation.fromColumns.map((column, index) => `child.${quoteIdentifier(column)} = parent.${quoteIdentifier(parentColumns[index])}`).join(' AND ');
  return `SELECT *\nFROM ${quoteIdentifier(child.name)} AS child\nJOIN ${quoteIdentifier(parent.name)} AS parent ON ${predicates};`;
}
