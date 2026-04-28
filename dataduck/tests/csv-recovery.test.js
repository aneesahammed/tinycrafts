import { describe, expect, it, vi } from 'vitest';
import { showCsvRecoveryToast } from '../src/ui/csv-recovery.js';

describe('CSV recovery toast', () => {
  it('offers to reopen auto-detection failures with all columns as text', () => {
    const file = new File(['id\nx'], 'sales.csv', { type: 'text/csv' });
    const showToast = vi.fn();
    const reopen = vi.fn();

    const handled = showCsvRecoveryToast({
      error: new Error('Conversion Error: Could not convert string "x" to INT64'),
      file,
      csvMode: 'auto',
      replaceTable: 'sales',
      showToast,
      reopen,
    });

    expect(handled).toBe(true);
    expect(showToast).toHaveBeenCalledWith('CSV auto-detection could not read this file.', 'error', {
      label: 'Open columns as text',
      run: expect.any(Function),
    });

    showToast.mock.calls[0][2].run();
    expect(reopen).toHaveBeenCalledWith(file, 'sales');
  });

  it('does not offer recovery for non-CSV files or CSV files already opened as text', () => {
    const showToast = vi.fn();

    expect(
      showCsvRecoveryToast({
        error: new Error('Conversion Error: Could not convert string "x" to INT64'),
        file: new File(['x'], 'events.parquet'),
        showToast,
        reopen: vi.fn(),
      }),
    ).toBe(false);

    expect(
      showCsvRecoveryToast({
        error: new Error('Conversion Error: Could not convert string "x" to INT64'),
        file: new File(['x'], 'sales.csv'),
        csvMode: 'text',
        showToast,
        reopen: vi.fn(),
      }),
    ).toBe(false);
    expect(showToast).not.toHaveBeenCalled();
  });
});
