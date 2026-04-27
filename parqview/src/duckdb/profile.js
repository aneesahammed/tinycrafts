import { tryQuery, query } from './engine.js';
import { quoteString, quoteIdentifier } from '../util/sql-quote.js';

export async function profileFile(virtualName, tableName) {
  const filePath = quoteString(virtualName);
  const tableId = quoteIdentifier(tableName);

  const [schema, fileMeta, codecs, rowGroups] = await Promise.all([
    query(`DESCRIBE SELECT * FROM ${tableId};`),
    tryQuery(`SELECT * FROM parquet_file_metadata(${filePath}) LIMIT 1;`),
    tryQuery(`
      SELECT compression, COUNT(*) AS column_chunks
      FROM parquet_metadata(${filePath})
      GROUP BY compression
      ORDER BY column_chunks DESC;
    `),
    tryQuery(`
      SELECT
        row_group_id,
        MAX(row_group_num_rows) AS rows,
        MAX(row_group_bytes) AS bytes,
        COUNT(*) AS column_chunks,
        STRING_AGG(DISTINCT compression, ', ') AS compression
      FROM parquet_metadata(${filePath})
      GROUP BY row_group_id
      ORDER BY row_group_id
      LIMIT 250;
    `),
  ]);

  return {
    schema: schema.rows,
    fileMeta: fileMeta.rows[0] || null,
    codecs: codecs.rows,
    rowGroups: rowGroups.rows,
  };
}
