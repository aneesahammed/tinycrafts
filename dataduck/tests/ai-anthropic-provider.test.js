import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callAnthropicJson, callAnthropicText } from '../src/ai/providers/anthropic.js';
import { ProviderError } from '../src/ai/providers/errors.js';
import { buildPlannerPrompt } from '../src/ai/prompts.js';
import { ANALYSIS_PLAN_JSON_SCHEMA } from '../src/ai/plan-schema.js';

describe('Anthropic provider adapter', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('fails closed when the API key is missing', async () => {
    await expect(callAnthropicJson({ apiKey: '', messages: [] })).rejects.toMatchObject({
      provider: 'anthropic',
      code: 'MISSING_KEY',
    });
  });

  it('sends browser BYOK headers, JSON schema output config, and cacheable planner context', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'request-id': 'req_123' }),
      json: async () => ({ content: [{ type: 'text', text: '{"mode":"clarify"}' }] }),
    });
    const plannerPrompt = buildPlannerPrompt({
      question: 'top region',
      context: {
        hasDataset: true,
        summaryStatus: 'ready',
        columns: [{ name: 'region', type: 'VARCHAR', rowCount: 3 }],
      },
    });

    const result = await callAnthropicJson({
      apiKey: 'sk-ant-secret',
      plannerPrompt,
      jsonSchema: ANALYSIS_PLAN_JSON_SCHEMA,
      fetchImpl,
    });

    expect(result).toEqual({ mode: 'clarify' });
    const [url, request] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(request.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-api-key': 'sk-ant-secret',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    });

    const body = JSON.parse(request.body);
    expect(body.model).toBe('claude-sonnet-4-6');
    expect(body.output_config.format.type).toBe('json_schema');
    expect(unsupportedSchemaKeys(body.output_config.format.schema)).toEqual([]);
    expect(unsupportedSchemaKeys(ANALYSIS_PLAN_JSON_SCHEMA)).toEqual(expect.arrayContaining(['maxLength', 'minLength', 'maximum', 'pattern']));
    expect(body.system.at(-1).cache_control).toEqual({ type: 'ephemeral' });
    expect(body.system.at(-1).text).toContain('"table":"active_file"');
    expect(body.messages).toEqual([{ role: 'user', content: 'top region' }]);
  });

  it('concatenates text content blocks for aggregate summaries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => ({ content: [{ type: 'text', text: 'First ' }, { type: 'tool_use', input: {} }, { type: 'text', text: 'second.' }] }),
    });

    await expect(callAnthropicText({
      apiKey: 'sk-ant-secret',
      messages: [{ role: 'user', content: 'summarize' }],
      fetchImpl,
    })).resolves.toBe('First second.');
  });

  it('normalizes retryable errors with provider attribution and request IDs', async () => {
    const overloaded = {
      ok: false,
      status: 529,
      statusText: 'Overloaded',
      headers: new Headers({ 'request-id': 'req_overloaded' }),
      clone: () => ({ json: async () => ({ error: { type: 'overloaded_error', message: 'try later' } }) }),
      text: async () => '',
    };
    const good = {
      ok: true,
      headers: new Headers({ 'request-id': 'req_good' }),
      json: async () => ({ content: [{ type: 'text', text: '{"mode":"unsupported"}' }] }),
    };
    const fetchImpl = vi.fn().mockResolvedValueOnce(overloaded).mockResolvedValueOnce(good);
    const sleep = vi.fn(async () => {});

    const result = await callAnthropicJson({ apiKey: 'sk-ant-secret', messages: [], fetchImpl, sleep });

    expect(result).toEqual({ mode: 'unsupported' });
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it('maps structured-output refusal and token-limit stop reasons to actionable errors', async () => {
    await expect(callAnthropicJson({
      apiKey: 'sk-ant-secret',
      messages: [],
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        json: async () => ({ stop_reason: 'refusal', content: [{ type: 'text', text: 'No.' }] }),
      }),
    })).rejects.toMatchObject({ provider: 'anthropic', code: 'REFUSAL' });

    await expect(callAnthropicJson({
      apiKey: 'sk-ant-secret',
      messages: [],
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        json: async () => ({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"mode":' }] }),
      }),
    })).rejects.toMatchObject({ provider: 'anthropic', code: 'MAX_TOKENS' });
  });

  it('times out stalled requests and clears the timer path', async () => {
    const promise = callAnthropicText({
      apiKey: 'sk-ant-secret',
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

  it('does not leak API keys through provider errors', async () => {
    await expect(callAnthropicText({
      apiKey: 'sk-ant-secret',
      messages: [],
      fetchImpl: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    })).rejects.toBeInstanceOf(ProviderError);

    await expect(callAnthropicText({
      apiKey: 'sk-ant-secret',
      messages: [],
      fetchImpl: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    })).rejects.not.toMatchObject({ message: expect.stringContaining('sk-ant-secret') });
  });
});

function unsupportedSchemaKeys(value, found = []) {
  if (!value || typeof value !== 'object') return found;
  for (const [key, nested] of Object.entries(value)) {
    if (['minimum', 'maximum', 'minLength', 'maxLength', 'maxItems', 'minItems', 'pattern', 'format'].includes(key)) {
      found.push(key);
    }
    unsupportedSchemaKeys(nested, found);
  }
  return found;
}
