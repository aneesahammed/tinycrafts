import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callGroqJson, dailyRequestCount, GroqError } from '../src/ai/groq-client.js';
import { dailyRequestKey } from '../src/ai/providers/usage.js';

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
    expect(localStorage.getItem(dailyRequestKey('groq'))).toContain('"count":1');
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

  it('surfaces 401 and 429 provider diagnostics', async () => {
    const unauthorized = {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
      clone: () => ({ json: async () => ({ error: { message: 'bad key' } }) }),
      text: async () => '',
    };
    await expect(callGroqJson({ apiKey: 'bad', messages: [], fetchImpl: vi.fn().mockResolvedValue(unauthorized) }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });

    const rateLimited = {
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers({ 'retry-after': '7' }),
      clone: () => ({ json: async () => ({ error: { message: 'slow down' } }) }),
      text: async () => '',
    };
    await expect(callGroqJson({ apiKey: 'gsk', messages: [], fetchImpl: vi.fn().mockResolvedValue(rateLimited) }))
      .rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfter: '7' });
  });

  it('backs off and retries transient 429 responses', async () => {
    const rateLimited = {
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers(),
      clone: () => ({ json: async () => ({ error: { message: 'slow down' } }) }),
      text: async () => '',
    };
    const good = {
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"mode":"clarify"}' } }] }),
    };
    const fetchImpl = vi.fn().mockResolvedValueOnce(rateLimited).mockResolvedValueOnce(good);
    const sleep = vi.fn(async () => {});

    const result = await callGroqJson({ apiKey: 'gsk', messages: [], fetchImpl, sleep });

    expect(result).toEqual({ mode: 'clarify' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
    expect(dailyRequestCount()).toBe(2);
  });

  it('normalizes network failures without leaking the key', async () => {
    await expect(callGroqJson({
      apiKey: 'gsk_secret',
      messages: [],
      fetchImpl: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    })).rejects.toMatchObject({ code: 'NETWORK' });
    expect(JSON.stringify(localStorage)).not.toContain('gsk_secret');
  });

  it('times out stalled requests through the compatibility wrapper', async () => {
    const promise = callGroqJson({
      apiKey: 'gsk_secret',
      messages: [],
      requestTimeoutMs: 5,
      fetchImpl: vi.fn(() => new Promise(() => {})),
    });
    promise.catch(() => undefined);

    const result = await Promise.race([
      promise.then(() => 'resolved', (error) => error.code),
      new Promise((resolve) => setTimeout(() => resolve('pending'), 50)),
    ]);
    expect(result).toBe('TIMEOUT');
  });

  it('tracks daily request counts without secrets', () => {
    expect(dailyRequestCount()).toBe(0);
  });
});
