import { quoteString } from '../util/sql-quote.js';

export function sampleQueries(tableName, virtualFileName) {
  const file = quoteString(virtualFileName);
  return [
    { label: 'SELECT *', sql: `SELECT *\nFROM ${tableName}\nLIMIT 500;` },
    { label: 'DESCRIBE', sql: `DESCRIBE SELECT *\nFROM ${tableName};` },
    { label: 'SUMMARIZE', sql: `SUMMARIZE ${tableName};` },
    { label: 'parquet_file_metadata', sql: `SELECT *\nFROM parquet_file_metadata(${file});` },
    {
      label: 'parquet_metadata',
      sql: `SELECT row_group_id, path_in_schema, compression, stats_min, stats_max, stats_null_count\nFROM parquet_metadata(${file})\nLIMIT 100;`,
    },
  ];
}
