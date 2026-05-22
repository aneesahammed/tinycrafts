import { rowCountFromProfile } from '../duckdb/profile-row-count.js';

export function datasetFingerprint(record, activeTable) {
  const schema = record?.profile?.schema || [];
  return JSON.stringify({
    activeTable: activeTable || null,
    virtualName: record?.virtualName || null,
    size: record?.size || 0,
    format: record?.format || null,
    rowCount: rowCountFromProfile(record?.profile),
    schema: schema.map((column) => [column.column_name, column.column_type]),
  });
}

export function activeDatasetFingerprint(state) {
  const activeTable = state?.activeTable || null;
  const record = activeTable ? state?.files?.get?.(activeTable) : null;
  return datasetFingerprint(record, activeTable);
}
