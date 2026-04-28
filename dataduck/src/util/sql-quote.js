export function quoteString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
