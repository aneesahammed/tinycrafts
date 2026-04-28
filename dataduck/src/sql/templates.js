import { quoteString } from '../util/sql-quote.js';
import { formatById } from '../duckdb/formats.js';

export function sampleQueries(tableName, virtualFileName, formatId = 'parquet') {
  const file = quoteString(virtualFileName);
  const queries = [
    { label: 'SELECT *', sql: `SELECT *\nFROM ${tableName}\nLIMIT 500;` },
    { label: 'DESCRIBE', sql: `DESCRIBE SELECT *\nFROM ${tableName};` },
    { label: 'SUMMARIZE', sql: `SUMMARIZE ${tableName};` },
  ];
  if (!formatById(formatId)?.hasParquetMetadata) return queries;
  return [
    ...queries,
    { label: 'parquet_file_metadata', sql: `SELECT *\nFROM parquet_file_metadata(${file});` },
    {
      label: 'parquet_metadata',
      sql: `SELECT row_group_id, path_in_schema, compression, stats_min, stats_max, stats_null_count\nFROM parquet_metadata(${file})\nLIMIT 100;`,
    },
  ];
}
