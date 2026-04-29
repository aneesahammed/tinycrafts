import { describe, expect, it } from 'vitest';
import { createThread, deleteThread, listThreads, saveThread } from '../src/ai/thread-store.js';

describe('AI thread storage sanitization', () => {
  it('stores schemaVersion 2 and caps persisted analysis rows without SQL or params', async () => {
    const thread = createThread({
      title: 'Sensitive',
      datasetFingerprint: 'fp',
      tableLabel: 'orders',
      randomUUID: () => 'thread_storage_test',
      now: () => 1,
    });
    thread.messages.push({
      id: 'msg1',
      role: 'assistant',
      text: 'done',
      createdAt: 1,
      analysis: {
        type: 'analysis_result',
        mode: 'analysis',
        title: 'Rows',
        question: 'show rows',
        text: 'done',
        artifacts: [{
          id: 'artifact',
          tool: 'aggregate_query',
          status: 'ok',
          title: 'Rows',
          sql: 'SELECT secret FROM active_file WHERE x = ?',
          params: ['secret-value'],
          columns: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
          columnTypes: {},
          rows: Array.from({ length: 30 }, (_, index) => ({ a: `row-${index}`, b: 'x'.repeat(200) })),
          chart: { kind: 'table', x: null, series: [] },
        }],
      },
    });

    await saveThread(thread);
    const saved = (await listThreads()).find((item) => item.id === 'thread_storage_test');
    const artifact = saved.messages[0].analysis.artifacts[0];

    expect(saved.schemaVersion).toBe(2);
    expect(JSON.stringify(saved)).not.toContain('secret-value');
    expect(JSON.stringify(saved)).not.toContain('SELECT secret');
    expect(artifact.rows).toHaveLength(20);
    expect(artifact.columns).toHaveLength(8);
    expect(artifact.rows[0].b.length).toBeLessThanOrEqual(160);

    await deleteThread('thread_storage_test');
  });
});
