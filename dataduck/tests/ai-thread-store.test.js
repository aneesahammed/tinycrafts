import { describe, expect, it } from 'vitest';
import { createThread, threadIsHistorical } from '../src/ai/thread-store.js';
import { prepareQuestionThread } from '../src/assistant/AssistantApp.jsx';

describe('AI thread binding', () => {
  it('forks historical threads so new questions bind to the current dataset', () => {
    const oldThread = createThread({
      title: 'Old file',
      datasetFingerprint: 'old-fingerprint',
      tableLabel: 'old_table',
      now: () => 1,
      randomUUID: () => 'old-thread',
    });
    oldThread.messages = [{ id: 'm1', role: 'user', text: 'old question', createdAt: 1 }];

    const next = prepareQuestionThread({
      activeThread: oldThread,
      currentFingerprint: 'new-fingerprint',
      activeTable: 'new_table',
      question: 'new question',
      now: () => 2,
      randomUUID: () => 'new-thread',
    });

    expect(threadIsHistorical(oldThread, 'new-fingerprint')).toBe(true);
    expect(next.id).toBe('new-thread');
    expect(next.datasetFingerprint).toBe('new-fingerprint');
    expect(next.tableLabel).toBe('new_table');
    expect(next.messages.map((message) => message.text)).toEqual(['new question']);
  });
});
