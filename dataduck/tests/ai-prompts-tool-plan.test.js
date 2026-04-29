import { describe, expect, it } from 'vitest';
import { buildPlannerMessages, promptDatasetContext } from '../src/ai/prompts.js';
import { buildPlanMemory } from '../src/ai/analysis-engine/conversation-memory.js';

describe('tool-plan prompt privacy', () => {
  it('includes tool catalog but excludes rows, SQL, fingerprints, file names, and API keys', () => {
    const context = {
      hasDataset: true,
      activeTable: 'acme-payroll.csv',
      fileName: 'acme-payroll.csv',
      fingerprint: '{"activeTable":"acme-payroll.csv"}',
      summaryStatus: 'ready',
      columns: [{ name: 'revenue', type: 'DOUBLE', min: 1, max: 10, rowCount: 2 }],
      resultRows: [{ secret: 'do-not-send' }],
    };
    const messages = buildPlannerMessages({ question: 'top revenue', context });
    const serialized = JSON.stringify(messages);

    expect(serialized).toContain('toolCatalog');
    expect(serialized).not.toContain('acme-payroll');
    expect(serialized).not.toContain('fingerprint');
    expect(serialized).not.toContain('do-not-send');
    expect(serialized).not.toContain('sk-ant');
  });

  it('narrows wide schemas deterministically and asks for clarification when nothing matches', () => {
    const columns = Array.from({ length: 130 }, (_, index) => ({ name: `field_${index}`, type: 'VARCHAR' }));
    columns.push({ name: 'netRevenue', type: 'DOUBLE' });
    const narrowed = promptDatasetContext({ hasDataset: true, columns }, { question: 'net revenue by month' });
    expect(narrowed.narrowedColumns).toBe(true);
    expect(narrowed.columns.map((column) => column.name)).toContain('netRevenue');

    const unclear = promptDatasetContext({ hasDataset: true, columns }, { question: 'what happened?' });
    expect(unclear.needsColumnClarification).toBe(true);
    expect(unclear.columns).toHaveLength(0);
  });

  it('does not include sensitive columns in plan memory', () => {
    const thread = {
      datasetFingerprint: 'same',
      messages: [{
        role: 'assistant',
        analysis: {
          artifacts: [{
            tool: 'top_n',
            title: 'Top',
            columns: ['patient_ssn_hashed', 'revenue'],
            chart: { kind: 'bar' },
          }],
        },
      }],
    };
    const memory = buildPlanMemory({
      thread,
      currentFingerprint: 'same',
      promptColumns: ['patient_ssn_hashed', 'revenue'],
    });
    const serialized = JSON.stringify(memory);
    expect(serialized).not.toContain('patient_ssn_hashed');
    expect(serialized).toContain('revenue');
  });
});
