import { inferDisplayColumnTypes } from './format.js';

export function arrowTableToObjects(table) {
  const fields = Array.from(table?.schema?.fields || []);
  const columns = fields.map((field) => field.name);
  const rawColumnTypes = Object.fromEntries(
    fields.map((field) => [field.name, String(field.type || '')]),
  );
  const rows = Array.from(table?.toArray?.() || []).map((row) => {
    const raw = typeof row?.toJSON === 'function' ? row.toJSON() : row;
    const object = {};
    const keys = columns.length ? columns : Object.keys(raw || {});
    for (const key of keys) object[key] = raw?.[key];
    return object;
  });
  const columnTypes = inferDisplayColumnTypes(columns, rows, rawColumnTypes);
  return { columns, columnTypes, rows };
}
