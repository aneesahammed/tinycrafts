import { describe, expect, it } from 'vitest';

import { datasetFingerprint } from '../src/ai/dataset-fingerprint.js';

describe('dataset fingerprint', () => {
  it('serializes DuckDB bigint row counts safely', () => {
    const fingerprint = datasetFingerprint(
      {
        virtualName: 'dataduck_lab.csv',
        size: 162_000,
        format: 'csv',
        profile: {
          fileMeta: { num_rows: 16_858n },
          schema: [
            { column_name: 'bill_invoice_id', column_type: 'VARCHAR' },
            { column_name: 'line_item_blended_cost', column_type: 'DOUBLE' },
          ],
        },
      },
      'lab',
    );

    expect(JSON.parse(fingerprint)).toMatchObject({
      activeTable: 'lab',
      rowCount: 16858,
    });
  });
});
