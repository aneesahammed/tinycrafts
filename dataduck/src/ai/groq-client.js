import { ANALYSIS_PLAN_JSON_SCHEMA } from './plan-schema.js';
import { DEFAULT_GROQ_MODEL, GROQ_DAILY_REQUEST_KEY, GROQ_LIMITS } from './privacy.js';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const STRICT_STRUCTURED_MODELS = new Set(['openai/gpt-oss-20b', 'openai/gpt-oss-120b']);

export class GroqError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'GroqError';
    Object.assign(this, details);
  }
}

export async function callGroqJson({
  apiKey,
  model = DEFAULT_GROQ_MODEL,
  messages,
  jsonSchema = ANALYSIS_PLAN_JSON_SCHEMA,
  maxCompletionTokens = GROQ_LIMITS.maxCompletionTokens,
  abortSignal = null,
  fetchImpl = fetch,
} = {}) {
  if (!String(apiKey || '').trim()) {
    throw new GroqError('Groq API key is missing. Add it in Ask DataDuck settings.', { code: 'MISSING_KEY' });
  }

  const body = baseRequestBody({ model, messages, maxCompletionTokens });
  body.response_format = responseFormatForModel(model, jsonSchema);

  try {
    incrementDailyRequestCount();
    const response = await postGroq({ body, apiKey, abortSignal, fetchImpl });
    return parseGroqJsonContent(response);
  } catch (error) {
    if (shouldRetryWithJsonObject(error, body.response_format)) {
      const fallbackBody = baseRequestBody({ model, messages, maxCompletionTokens });
      fallbackBody.response_format = { type: 'json_object' };
      const response = await postGroq({ body: fallbackBody, apiKey, abortSignal, fetchImpl });
      return parseGroqJsonContent(response);
    }
    throw normalizeGroqError(error);
  }
}

export async function callGroqText({
  apiKey,
  model = DEFAULT_GROQ_MODEL,
  messages,
  maxCompletionTokens = GROQ_LIMITS.maxCompletionTokens,
  abortSignal = null,
  fetchImpl = fetch,
} = {}) {
  if (!String(apiKey || '').trim()) {
    throw new GroqError('Groq API key is missing. Add it in Ask DataDuck settings.', { code: 'MISSING_KEY' });
  }
  incrementDailyRequestCount();
  const response = await postGroq({
    body: baseRequestBody({ model, messages, maxCompletionTokens }),
    apiKey,
    abortSignal,
    fetchImpl,
  });
  return parseGroqTextContent(response);
}

export function dailyRequestCount(storage = safeLocalStorage(), now = () => new Date()) {
  const today = now().toISOString().slice(0, 10);
  try {
    const payload = JSON.parse(storage?.getItem?.(GROQ_DAILY_REQUEST_KEY) || 'null');
    return payload?.day === today ? Number(payload.count) || 0 : 0;
  } catch {
    return 0;
  }
}

function incrementDailyRequestCount(storage = safeLocalStorage(), now = () => new Date()) {
  if (!storage) return;
  const today = now().toISOString().slice(0, 10);
  const count = dailyRequestCount(storage, now) + 1;
  try {
    storage.setItem(GROQ_DAILY_REQUEST_KEY, JSON.stringify({ day: today, count }));
  } catch {
    // Ignore quota/private-mode failures.
  }
}

function baseRequestBody({ model, messages, maxCompletionTokens }) {
  const body = {
    model: String(model || DEFAULT_GROQ_MODEL).trim() || DEFAULT_GROQ_MODEL,
    messages: Array.isArray(messages) ? messages : [],
    stream: false,
    max_completion_tokens: Math.max(1, Math.min(4000, Math.floor(Number(maxCompletionTokens) || GROQ_LIMITS.maxCompletionTokens))),
  };
  if (/qwen3/i.test(body.model)) body.reasoning_effort = 'none';
  return body;
}

function responseFormatForModel(model, schema) {
  const normalized = String(model || '').trim().toLowerCase();
  if (STRICT_STRUCTURED_MODELS.has(normalized)) {
    return {
      type: 'json_schema',
      json_schema: {
        name: 'dataduck_analysis_plan',
        strict: true,
        schema,
      },
    };
  }
  return { type: 'json_object' };
}

async function postGroq({ body, apiKey, abortSignal, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: abortSignal || undefined,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new GroqError('Could not reach Groq. Check network access, CORS, or browser privacy settings.', {
      code: 'NETWORK',
      cause: error,
    });
  }
  if (!response.ok) throw await buildProviderError(response);
  return response;
}

async function buildProviderError(response) {
  let message = '';
  try {
    const payload = await response.clone().json();
    message = payload?.error?.message || payload?.message || '';
  } catch {
    message = '';
  }
  if (!message) {
    message = await response.text().catch(() => '');
  }
  return new GroqError(`Groq error ${response.status}: ${message || response.statusText}`, {
    code: response.status === 401 ? 'UNAUTHORIZED' : response.status === 429 ? 'RATE_LIMITED' : 'HTTP',
    status: response.status,
    retryAfter: response.headers.get('retry-after') || '',
    rateLimitResetTokens: response.headers.get('x-ratelimit-reset-tokens') || '',
  });
}

async function parseGroqJsonContent(response) {
  const text = await parseGroqTextContent(response);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new GroqError('Groq returned invalid JSON.', { code: 'BAD_JSON', cause: error });
  }
}

async function parseGroqTextContent(response) {
  let parsed;
  try {
    parsed = await response.json();
  } catch (error) {
    throw new GroqError('Groq returned an unreadable response.', { code: 'BAD_RESPONSE', cause: error });
  }
  const content = parsed?.choices?.[0]?.message?.content;
  if (!String(content || '').trim()) {
    throw new GroqError('Groq returned no message content.', { code: 'EMPTY_RESPONSE' });
  }
  return content;
}

function shouldRetryWithJsonObject(error, responseFormat) {
  return error?.status === 400 && responseFormat?.type === 'json_schema';
}

function normalizeGroqError(error) {
  if (error instanceof GroqError || error?.name === 'AbortError') return error;
  return new GroqError(error?.message || 'Groq request failed.', { code: 'UNKNOWN', cause: error });
}

function safeLocalStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}
