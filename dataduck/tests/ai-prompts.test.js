import { describe, expect, it } from 'vitest';
import { buildPlannerMessages } from '../src/ai/prompts.js';

describe('AI planner prompts', () => {
  it('sends only redacted dataset metadata to Groq', () => {
    const messages = buildPlannerMessages({
      question: 'what is the payroll total?',
      context: {
        hasDataset: true,
        activeTable: 'acme_payroll_april',
        table: 'active_file',
        fileName: 'acme-payroll-april.csv',
        fingerprint: '{"activeTable":"acme_payroll_april","virtualName":"dataduck_123_acme-payroll-april.csv"}',
        format: 'csv',
        size: 12345,
        summaryStatus: 'ready',
        columns: [
          { name: 'employee_id', type: 'VARCHAR', rowCount: 10, nullCount: 0, nullPercentage: 0, distinct: 10 },
          { name: 'salary', type: 'DOUBLE', rowCount: 10, nullCount: 0, nullPercentage: 0, distinct: 8, min: 1, max: 2 },
        ],
      },
    });

    const payload = JSON.parse(messages[1].content);
    const serialized = JSON.stringify(payload.dataset);

    expect(payload.dataset).toMatchObject({
      hasDataset: true,
      table: 'active_file',
      summaryStatus: 'ready',
    });
    expect(payload.dataset).not.toHaveProperty('activeTable');
    expect(payload.dataset).not.toHaveProperty('fileName');
    expect(payload.dataset).not.toHaveProperty('fingerprint');
    expect(payload.dataset).not.toHaveProperty('size');
    expect(payload.dataset).not.toHaveProperty('format');
    expect(serialized).not.toContain('acme');
    expect(serialized).not.toContain('dataduck_123');
  });
});
