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

  it('preserves diagnostic codes and safe provider metadata when persisted', async () => {
    const thread = createThread({
      title: 'Diagnostic',
      datasetFingerprint: 'fp',
      tableLabel: 'orders',
      randomUUID: () => 'thread_diagnostic_test',
      now: () => 1,
    });
    thread.messages.push({
      id: 'msg1',
      role: 'assistant',
      text: 'failed',
      createdAt: 1,
      analysis: {
        type: 'analysis_result',
        mode: 'incomplete',
        title: 'Analysis plan failed',
        question: 'top products',
        text: 'Claude rate limited this request. Retry after 7 seconds.',
        artifacts: [{
          id: 'plan_diagnostic',
          tool: 'diagnostic',
          status: 'error',
          code: 'LLM_RATE_LIMITED',
          safeMessage: 'Claude rate limited this request. Retry after 7 seconds.',
          requestId: 'req_123',
          retryAfter: '7',
          rows: [],
          columns: [],
          columnTypes: {},
          chart: { kind: 'table', x: null, series: [] },
        }],
        primaryArtifactId: 'plan_diagnostic',
      },
    });

    await saveThread(thread);
    const saved = (await listThreads()).find((item) => item.id === 'thread_diagnostic_test');
    const artifact = saved.messages[0].analysis.artifacts[0];

    expect(artifact).toMatchObject({
      code: 'LLM_RATE_LIMITED',
      safeMessage: 'Claude rate limited this request. Retry after 7 seconds.',
      requestId: 'req_123',
      retryAfter: '7',
    });

    await deleteThread('thread_diagnostic_test');
  });

  it('normalizes legacy analysis records into persisted v2 artifacts', async () => {
    const thread = createThread({
      title: 'Legacy',
      datasetFingerprint: 'fp',
      tableLabel: 'orders',
      randomUUID: () => 'thread_legacy_test',
      now: () => 1,
    });
    thread.messages.push({
      id: 'msg1',
      role: 'assistant',
      text: 'done',
      createdAt: 1,
      analysis: {
        mode: 'analysis',
        title: 'Legacy rows',
        question: 'show rows',
        text: 'done',
        sql: 'SELECT private_token FROM active_file',
        params: ['private-token'],
        columns: ['product'],
        columnTypes: {},
        rows: [{ product: 'Tea' }],
        chart: { kind: 'table', x: null, series: [] },
      },
    });

    await saveThread(thread);
    const saved = (await listThreads()).find((item) => item.id === 'thread_legacy_test');

    expect(saved.messages[0].analysis).toMatchObject({
      schemaVersion: 2,
      primaryArtifactId: 'legacy_result',
    });
    expect(saved.messages[0].analysis.artifacts[0]).toMatchObject({
      id: 'legacy_result',
      rows: [{ product: 'Tea' }],
    });
    expect(JSON.stringify(saved)).not.toContain('private-token');
    expect(JSON.stringify(saved)).not.toContain('SELECT private_token');

    await deleteThread('thread_legacy_test');
  });
});
