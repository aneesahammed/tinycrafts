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
    if (error?.status === 408 || error?.status === 409 || error?.status === 429) return true;
    return error?.status >= 500;
  },
};
const UNSUPPORTED_STRUCTURED_SCHEMA_KEYS = new Set([
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'pattern',
  'format',
]);

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
  maxCompletionTokens = AI_LIMITS.maxCompletionTokens,
  abortSignal = null,
  fetchImpl = fetch,
  requestTimeoutMs = DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
  sleep,
} = {}) {
  assertApiKey(apiKey);
  const response = await postAnthropicWithRetry({
    apiKey,
    abortSignal,
    fetchImpl,
    requestTimeoutMs,
    sleep,
    body: {
      ...baseRequestBody({ model, messages, plannerPrompt, maxCompletionTokens }),
      output_config: {
        format: {
          type: 'json_schema',
          schema: toAnthropicStructuredSchema(jsonSchema),
        },
      },
    },
  });
  return parseAnthropicJson(response);
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
    operation: async () => {
      incrementDailyRequestCount('anthropic');
      return postAnthropic({ body, apiKey, abortSignal, fetchImpl, requestTimeoutMs });
    },
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
    retryAfter: response.headers?.get?.('retry-after') || '',
    requestId: response.headers?.get?.('request-id') || response.headers?.get?.('x-request-id') || '',
  });
}

async function parseAnthropicJson(response) {
  const parsed = await readAnthropicPayload(response);
  assertCompleteResponse(parsed);
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
  const notes = [];
  for (const [key, nested] of Object.entries(value)) {
    if (UNSUPPORTED_STRUCTURED_SCHEMA_KEYS.has(key)) {
      notes.push(describeRemovedConstraint(key, nested));
      continue;
    }
    next[key] = transformSchemaValue(nested);
  }
  const description = notes.filter(Boolean).join(' ');
  if (description) next.description = [next.description, description].filter(Boolean).join(' ');
  return next;
}

function describeRemovedConstraint(key, value) {
  if (key === 'minimum') return `Minimum value: ${value}.`;
  if (key === 'maximum') return `Maximum value: ${value}.`;
  if (key === 'minLength') return `Minimum length: ${value}.`;
  if (key === 'maxLength') return `Maximum length: ${value}.`;
  if (key === 'minItems') return `Minimum items: ${value}.`;
  if (key === 'maxItems') return `Maximum items: ${value}.`;
  if (key === 'pattern') return `Must match pattern: ${value}.`;
  if (key === 'format') return `Expected format: ${value}.`;
  return '';
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
