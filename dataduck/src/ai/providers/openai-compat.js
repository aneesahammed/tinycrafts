import { ANALYSIS_PLAN_JSON_SCHEMA } from '../plan-schema.js';
import { AI_LIMITS, DEFAULT_GROQ_MODEL } from '../privacy.js';
import { missingKeyError, ProviderError, providerLabel } from './errors.js';
import { withProviderRetry } from './retry.js';
import { DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS, fetchWithProviderTimeout } from './timeout.js';
import { incrementDailyRequestCount } from './usage.js';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const STRICT_STRUCTURED_MODELS = new Set(['openai/gpt-oss-20b', 'openai/gpt-oss-120b']);

const GROQ_RETRY_POLICY = {
  retries: 2,
  baseMs: 250,
  capMs: 2_000,
  retryOn: [429],
};

export const groqAdapter = createOpenAICompatibleAdapter({
  provider: 'groq',
  chatUrl: GROQ_CHAT_URL,
  defaultModel: DEFAULT_GROQ_MODEL,
  strictStructuredModels: STRICT_STRUCTURED_MODELS,
  retryPolicy: GROQ_RETRY_POLICY,
  bodyMutators: [
    (body) => {
      if (/qwen3/i.test(body.model)) body.reasoning_effort = 'none';
      return body;
    },
  ],
});

export function createOpenAICompatibleAdapter({
  provider,
  chatUrl,
  defaultModel,
  retryPolicy,
  headers = {},
  strictStructuredModels = new Set(),
  bodyMutators = [],
} = {}) {
  return {
    provider,
    async callJson({
      apiKey,
      model = defaultModel,
      messages,
      jsonSchema = ANALYSIS_PLAN_JSON_SCHEMA,
      schemaName = 'dataduck_analysis_plan',
      maxCompletionTokens = AI_LIMITS.maxCompletionTokens,
      abortSignal = null,
      fetchImpl = fetch,
      requestTimeoutMs = DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
      sleep,
    } = {}) {
      assertApiKey(provider, apiKey);
      const body = buildBody({ model, defaultModel, messages, maxCompletionTokens, bodyMutators });
      body.response_format = responseFormatForModel(model, jsonSchema, schemaName, strictStructuredModels);

      try {
        const response = await postWithRetry({
          provider,
          chatUrl,
          headers,
          body,
          apiKey,
          abortSignal,
          fetchImpl,
          requestTimeoutMs,
          sleep,
          retryPolicy,
        });
        return parseJsonContent(provider, response);
      } catch (error) {
        if (shouldRetryWithJsonObject(error, body.response_format)) {
          const fallbackBody = buildBody({ model, defaultModel, messages, maxCompletionTokens, bodyMutators });
          fallbackBody.response_format = { type: 'json_object' };
          const response = await postWithRetry({
            provider,
            chatUrl,
            headers,
            body: fallbackBody,
            apiKey,
            abortSignal,
            fetchImpl,
            requestTimeoutMs,
            sleep,
            retryPolicy,
          });
          return parseJsonContent(provider, response);
        }
        throw normalizeProviderError(provider, error);
      }
    },

    async callText({
      apiKey,
      model = defaultModel,
      messages,
      maxCompletionTokens = AI_LIMITS.maxCompletionTokens,
      abortSignal = null,
      fetchImpl = fetch,
      requestTimeoutMs = DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
      sleep,
    } = {}) {
      assertApiKey(provider, apiKey);
      const response = await postWithRetry({
        provider,
        chatUrl,
        headers,
        body: buildBody({ model, defaultModel, messages, maxCompletionTokens, bodyMutators }),
        apiKey,
        abortSignal,
        fetchImpl,
        requestTimeoutMs,
        sleep,
        retryPolicy,
      });
      return parseTextContent(provider, response);
    },
  };
}

function assertApiKey(provider, apiKey) {
  if (!String(apiKey || '').trim()) throw missingKeyError(provider);
}

function buildBody({ model, defaultModel, messages, maxCompletionTokens, bodyMutators }) {
  const body = {
    model: String(model || defaultModel).trim() || defaultModel,
    messages: Array.isArray(messages) ? messages : [],
    stream: false,
    max_completion_tokens: normalizeMaxTokens(maxCompletionTokens),
  };
  return bodyMutators.reduce((next, mutator) => mutator(next) || next, body);
}

function normalizeMaxTokens(value) {
  return Math.max(1, Math.min(4000, Math.floor(Number(value) || AI_LIMITS.maxCompletionTokens)));
}

function responseFormatForModel(model, schema, schemaName, strictStructuredModels) {
  const normalized = String(model || '').trim().toLowerCase();
  if (strictStructuredModels.has(normalized)) {
    return {
      type: 'json_schema',
      json_schema: {
        name: schemaName || 'dataduck_analysis_plan',
        strict: true,
        schema,
      },
    };
  }
  return { type: 'json_object' };
}

async function postWithRetry({ provider, chatUrl, headers, body, apiKey, abortSignal, fetchImpl, requestTimeoutMs, sleep, retryPolicy }) {
  return withProviderRetry({
    provider,
    retryPolicy,
    sleep,
    operation: async () => {
      incrementDailyRequestCount(provider);
      return post({ provider, chatUrl, headers, body, apiKey, abortSignal, fetchImpl, requestTimeoutMs });
    },
  });
}

async function post({ provider, chatUrl, headers, body, apiKey, abortSignal, fetchImpl, requestTimeoutMs }) {
  let response;
  try {
    const providerHeaders = typeof headers === 'function' ? headers({ provider, body }) : headers;
    response = await fetchWithProviderTimeout({
      provider,
      fetchImpl,
      url: chatUrl,
      timeoutMs: requestTimeoutMs,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...providerHeaders,
        },
        body: JSON.stringify(body),
        signal: abortSignal || undefined,
      },
    });
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error?.name === 'AbortError') throw error;
    throw new ProviderError(`Could not reach ${providerLabel(provider)}. Check network access, CORS, or browser privacy settings.`, {
      provider,
      code: 'NETWORK',
      cause: error,
    });
  }
  if (!response.ok) throw await buildHttpError(provider, response);
  return response;
}

async function buildHttpError(provider, response) {
  let message = '';
  try {
    const payload = await response.clone().json();
    message = payload?.error?.message || payload?.message || '';
  } catch {
    message = '';
  }
  if (!message) message = await response.text().catch(() => '');
  return new ProviderError(`${providerLabel(provider)} error ${response.status}: ${message || response.statusText}`, {
    provider,
    code: codeForStatus(response.status),
    status: response.status,
    retryAfter: response.headers?.get?.('retry-after') || '',
    rateLimitResetTokens: response.headers?.get?.('x-ratelimit-reset-tokens') || '',
    requestId: response.headers?.get?.('x-request-id') || '',
  });
}

async function parseJsonContent(provider, response) {
  const text = await parseTextContent(provider, response);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ProviderError(`${providerLabel(provider)} returned invalid JSON.`, { provider, code: 'BAD_JSON', cause: error });
  }
}

async function parseTextContent(provider, response) {
  let parsed;
  try {
    parsed = await response.json();
  } catch (error) {
    throw new ProviderError(`${providerLabel(provider)} returned an unreadable response.`, {
      provider,
      code: 'BAD_RESPONSE',
      cause: error,
    });
  }
  const content = parsed?.choices?.[0]?.message?.content;
  if (!String(content || '').trim()) {
    throw new ProviderError(`${providerLabel(provider)} returned no message content.`, { provider, code: 'EMPTY_RESPONSE' });
  }
  return content;
}

function codeForStatus(status) {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 429) return 'RATE_LIMITED';
  return 'HTTP';
}

function shouldRetryWithJsonObject(error, responseFormat) {
  return error?.status === 400 && responseFormat?.type === 'json_schema';
}

function normalizeProviderError(provider, error) {
  if (error instanceof ProviderError || error?.name === 'AbortError') return error;
  return new ProviderError(error?.message || `${providerLabel(provider)} request failed.`, {
    provider,
    code: 'UNKNOWN',
    cause: error,
  });
}
