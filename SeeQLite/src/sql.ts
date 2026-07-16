import type { Catalog, CatalogForeignKey } from './engine/protocol';

export function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
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
