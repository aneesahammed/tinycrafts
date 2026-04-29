import { ANALYSIS_PLAN_JSON_SCHEMA } from '../plan-schema.js';
import { AI_LIMITS, DEFAULT_ANTHROPIC_MODEL } from '../privacy.js';
import { missingKeyError, ProviderError, providerLabel } from './errors.js';
import { withProviderRetry } from './retry.js';
import { DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS, fetchWithProviderTimeout } from './timeout.js';
import { incrementDailyRequestCount } from './usage.js';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

// Keep this stable unless adopting newer Anthropic API features that require a version bump.
const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_RETRY_POLICY = {
  retries: 2,
  baseMs: 1000,
  capMs: 15_000,
  retryOn: (error) => {
    if (error?.code === 'TIMEOUT') return true;
    if (error?.status === 408 || error?.status === 409 || error?.status === 429) return true;
    return error?.status >= 500;
  },
};
// Anthropic tool input_schema is JSON Schema, but does not understand OpenAI's
// `strict` field. Strip OpenAI-only keys before sending. Standard JSON Schema
// constraints (minimum/maximum/maxLength/etc.) are preserved — Claude respects
// them when generating tool inputs.
const OPENAI_ONLY_SCHEMA_KEYS = new Set(['strict']);

export const anthropicAdapter = {
  provider: 'anthropic',
  callJson: callAnthropicJson,
  callText: callAnthropicText,
};

export async function callAnthropicJson({
  apiKey,
  model = DEFAULT_ANTHROPIC_MODEL,
  messages,
  plannerPrompt = null,
  jsonSchema = ANALYSIS_PLAN_JSON_SCHEMA,
  schemaName = 'dataduck_analysis_plan',
  maxCompletionTokens = AI_LIMITS.maxCompletionTokens,
  abortSignal = null,
  fetchImpl = fetch,
  requestTimeoutMs = DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
  sleep,
} = {}) {
  assertApiKey(apiKey);
  incrementDailyRequestCount('anthropic');
  const toolName = String(schemaName || 'dataduck_analysis_plan').trim() || 'dataduck_analysis_plan';
  const response = await postAnthropicWithRetry({
    apiKey,
    abortSignal,
    fetchImpl,
    requestTimeoutMs,
    sleep,
    body: {
      ...baseRequestBody({ model, messages, plannerPrompt, maxCompletionTokens }),
      // Force structured output via Anthropic tool calling. The model is
      // required to emit one tool_use block conforming to input_schema.
      tools: [
        {
          name: toolName,
          description: 'Return the analysis plan as structured JSON conforming to the schema.',
          input_schema: toAnthropicStructuredSchema(jsonSchema),
        },
      ],
      tool_choice: { type: 'tool', name: toolName },
    },
  });
  return parseAnthropicJson(response, toolName);
}

export async function callAnthropicText({
  apiKey,
  model = DEFAULT_ANTHROPIC_MODEL,
  messages,
  maxCompletionTokens = AI_LIMITS.maxCompletionTokens,
  abortSignal = null,
  fetchImpl = fetch,
  requestTimeoutMs = DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
  sleep,
} = {}) {
  assertApiKey(apiKey);
  incrementDailyRequestCount('anthropic');
  const response = await postAnthropicWithRetry({
    apiKey,
    abortSignal,
    fetchImpl,
    requestTimeoutMs,
    sleep,
    body: baseRequestBody({ model, messages, maxCompletionTokens }),
  });
  return parseAnthropicText(response);
}

function assertApiKey(apiKey) {
  if (!String(apiKey || '').trim()) throw missingKeyError('anthropic');
}

function baseRequestBody({ model, messages, plannerPrompt = null, maxCompletionTokens }) {
  const body = {
    model: String(model || DEFAULT_ANTHROPIC_MODEL).trim() || DEFAULT_ANTHROPIC_MODEL,
    max_tokens: Math.max(1, Math.min(4000, Math.floor(Number(maxCompletionTokens) || AI_LIMITS.maxCompletionTokens))),
    stream: false,
  };
  if (plannerPrompt) {
    body.system = plannerSystemBlocks(plannerPrompt);
    body.messages = [{ role: 'user', content: String(plannerPrompt.question || '') }];
    return body;
  }
  const converted = convertMessages(messages);
  if (converted.system.length) body.system = converted.system.join('\n\n');
  body.messages = converted.messages;
  return body;
}

function plannerSystemBlocks(plannerPrompt) {
  const datasetText = JSON.stringify(plannerPrompt.dataset || {});
  return [
    { type: 'text', text: String(plannerPrompt.system || '') },
    {
      type: 'text',
      text: `Dataset context:\n${datasetText}`,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

function convertMessages(messages = []) {
  const system = [];
  const converted = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    const role = message?.role === 'assistant' ? 'assistant' : message?.role === 'system' ? 'system' : 'user';
    const content = contentToText(message?.content);
    if (role === 'system') {
      if (content) system.push(content);
      continue;
    }
    converted.push({ role, content });
  }
  return { system, messages: converted };
}

function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .filter(Boolean)
      .join('\n');
  }
  return content == null ? '' : String(content);
}

async function postAnthropicWithRetry({ body, apiKey, abortSignal, fetchImpl, requestTimeoutMs, sleep }) {
  return withProviderRetry({
    provider: 'anthropic',
    retryPolicy: ANTHROPIC_RETRY_POLICY,
    sleep,
    operation: async () => postAnthropic({ body, apiKey, abortSignal, fetchImpl, requestTimeoutMs }),
  });
}

async function postAnthropic({ body, apiKey, abortSignal, fetchImpl, requestTimeoutMs }) {
  let response;
  try {
    response = await fetchWithProviderTimeout({
      provider: 'anthropic',
      fetchImpl,
      url: ANTHROPIC_MESSAGES_URL,
      timeoutMs: requestTimeoutMs,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
        signal: abortSignal || undefined,
      },
    });
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error?.name === 'AbortError') throw error;
    throw new ProviderError('Could not reach Claude. Check network access, CORS, or browser privacy settings.', {
      provider: 'anthropic',
      code: 'NETWORK',
      cause: error,
    });
  }
  if (!response.ok) throw await buildAnthropicHttpError(response);
  return response;
}

async function buildAnthropicHttpError(response) {
  let message = '';
  let type = '';
  try {
    const payload = await response.clone().json();
    message = payload?.error?.message || payload?.message || '';
    type = payload?.error?.type || '';
  } catch {
    message = '';
  }
  if (!message) message = await response.text().catch(() => '');
  return new ProviderError(`${providerLabel('anthropic')} error ${response.status}: ${message || response.statusText}`, {
    provider: 'anthropic',
    code: codeForStatus(response.status, type),
    status: response.status,
    retryAfter: retryAfterHeader(response.headers),
    requestId: response.headers?.get?.('request-id') || response.headers?.get?.('x-request-id') || '',
  });
}

async function parseAnthropicJson(response, toolName = 'dataduck_analysis_plan') {
  const parsed = await readAnthropicPayload(response);
  assertCompleteResponse(parsed);
  // Tool-calling path (the normal case): the forced tool_use block carries the
  // structured plan in its `input` field — already a parsed object.
  const toolUse = (parsed?.content || []).find((block) => block?.type === 'tool_use' && (toolName ? block.name === toolName : true));
  if (toolUse && toolUse.input && typeof toolUse.input === 'object') {
    return toolUse.input;
  }
  // Fallback: if Claude emitted a text block instead of the tool (rare under
  // tool_choice forcing, but possible for some refusal patterns), try to parse
  // the text as JSON so the rest of the planner pipeline still gets a chance.
  const text = textFromAnthropicContent(parsed);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ProviderError('Claude returned invalid JSON.', {
      provider: 'anthropic',
      code: 'BAD_JSON',
      cause: error,
    });
  }
}

async function parseAnthropicText(response) {
  const parsed = await readAnthropicPayload(response);
  assertCompleteResponse(parsed);
  return textFromAnthropicContent(parsed);
}

async function readAnthropicPayload(response) {
  let parsed;
  try {
    parsed = await response.json();
  } catch (error) {
    throw new ProviderError('Claude returned an unreadable response.', {
      provider: 'anthropic',
      code: 'BAD_RESPONSE',
      cause: error,
    });
  }
  return parsed;
}

function assertCompleteResponse(parsed) {
  if (parsed?.stop_reason === 'refusal') {
    throw new ProviderError('Claude refused to produce a structured response for this request.', {
      provider: 'anthropic',
      code: 'REFUSAL',
    });
  }
  if (parsed?.stop_reason === 'max_tokens') {
    throw new ProviderError('Claude reached the response token limit before finishing the structured response.', {
      provider: 'anthropic',
      code: 'MAX_TOKENS',
    });
  }
}

function textFromAnthropicContent(parsed) {
  const text = (parsed?.content || [])
    .filter((block) => block?.type === 'text')
    .map((block) => block.text || '')
    .join('');
  if (!text.trim()) {
    throw new ProviderError('Claude returned no message content.', {
      provider: 'anthropic',
      code: 'EMPTY_RESPONSE',
    });
  }
  return text;
}

function toAnthropicStructuredSchema(schema) {
  return transformSchemaValue(schema);
}

function transformSchemaValue(value) {
  if (Array.isArray(value)) return value.map(transformSchemaValue);
  if (!value || typeof value !== 'object') return value;
  const next = {};
  for (const [key, nested] of Object.entries(value)) {
    if (OPENAI_ONLY_SCHEMA_KEYS.has(key)) continue;
    next[key] = transformSchemaValue(nested);
  }
  return next;
}

function retryAfterHeader(headers) {
  const retryAfter = headers?.get?.('retry-after');
  if (retryAfter) return retryAfter;
  const resets = [
    headers?.get?.('anthropic-ratelimit-requests-reset'),
    headers?.get?.('anthropic-ratelimit-tokens-reset'),
  ].filter(Boolean);
  if (!resets.length) return '';
  return resets.sort((a, b) => {
    const aMs = Date.parse(a);
    const bMs = Date.parse(b);
    if (!Number.isFinite(aMs)) return 1;
    if (!Number.isFinite(bMs)) return -1;
    return aMs - bMs;
  })[0];
}

function codeForStatus(status, type) {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 408) return 'TIMEOUT';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 529 || type === 'overloaded_error') return 'OVERLOADED';
  if (status >= 500) return 'HTTP';
  return 'HTTP';
}
