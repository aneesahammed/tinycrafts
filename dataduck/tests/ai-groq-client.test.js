import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callGroqJson, dailyRequestCount, GroqError } from '../src/ai/groq-client.js';

describe('Groq client', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('fails closed when the API key is missing', async () => {
    await expect(callGroqJson({ apiKey: '', messages: [] })).rejects.toBeInstanceOf(GroqError);
  });

  it('parses JSON content and does not store API keys', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"mode":"clarify"}' } }] }),
    });

    const result = await callGroqJson({ apiKey: 'gsk_secret', messages: [], fetchImpl });

    expect(result).toEqual({ mode: 'clarify' });
    expect(localStorage.getItem('dataduck:groq-daily-requests')).toContain('"count":1');
    expect(JSON.stringify(localStorage)).not.toContain('gsk_secret');
  });

  it('falls back to json_object when strict schema returns 400', async () => {
    const bad = {
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers(),
      clone: () => ({ json: async () => ({ error: { message: 'schema unsupported' } }) }),
      text: async () => '',
    };
    const good = {
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"mode":"unsupported"}' } }] }),
    };
    const fetchImpl = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(good);

    const result = await callGroqJson({ apiKey: 'gsk_secret', model: 'openai/gpt-oss-20b', messages: [], fetchImpl });

    expect(result).toEqual({ mode: 'unsupported' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('tracks daily request counts without secrets', () => {
    expect(dailyRequestCount()).toBe(0);
  });
});
