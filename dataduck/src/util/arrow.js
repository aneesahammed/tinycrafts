export function arrowTableToObjects(table) {
  const columns = Array.from(table?.schema?.fields || []).map((field) => field.name);
  const rows = Array.from(table?.toArray?.() || []).map((row) => {
    const raw = typeof row?.toJSON === 'function' ? row.toJSON() : row;
    const object = {};
    const keys = columns.length ? columns : Object.keys(raw || {});
    for (const key of keys) object[key] = raw?.[key];
    return object;
  });
  return { columns, rows };
}
