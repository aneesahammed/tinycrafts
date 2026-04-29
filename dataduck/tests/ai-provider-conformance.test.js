import { describe, expect, it, vi } from 'vitest';
import { callAnthropicJson } from '../src/ai/providers/anthropic.js';
import { createOpenAICompatibleAdapter } from '../src/ai/providers/openai-compat.js';
import { ANALYSIS_TOOL_PLAN_JSON_SCHEMA } from '../src/ai/analysis-engine/tool-schema.js';

describe('AI provider structured-output conformance', () => {
  it('sends Anthropic output_config.format with the tool-plan schema', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => ({ content: [{ type: 'text', text: '{"schemaVersion":1,"catalogVersion":"2026-04-29","mode":"clarify","title":"Clarify","steps":[{"tool":"profile_overview","id":"context","title":"Context"}],"clarifyingQuestion":"Which column?"}' }] }),
    });

    await callAnthropicJson({
      apiKey: 'sk-ant-test',
      messages: [{ role: 'user', content: 'question' }],
      jsonSchema: ANALYSIS_TOOL_PLAN_JSON_SCHEMA,
      fetchImpl,
    });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.output_config.format.schema.properties.catalogVersion.const).toBe('2026-04-29');
  });

  it('sends OpenAI-compatible json_schema for strict Groq models', async () => {
    const adapter = createOpenAICompatibleAdapter({
      provider: 'groq',
      chatUrl: 'https://example.test/chat',
      defaultModel: 'openai/gpt-oss-120b',
      strictStructuredModels: new Set(['openai/gpt-oss-120b']),
      retryPolicy: { retries: 0 },
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => ({ choices: [{ message: { content: '{"mode":"clarify"}' } }] }),
    });

    await adapter.callJson({
      apiKey: 'gsk_test',
      messages: [],
      jsonSchema: ANALYSIS_TOOL_PLAN_JSON_SCHEMA,
      fetchImpl,
    });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.schema.properties.catalogVersion.const).toBe('2026-04-29');
  });
});
