import { ANALYSIS_PLAN_JSON_SCHEMA } from './plan-schema.js';
import { DEFAULT_GROQ_MODEL, GROQ_LIMITS } from './privacy.js';
import { ProviderError } from './providers/errors.js';
import { groqAdapter } from './providers/openai-compat.js';
import { dailyRequestCount as providerDailyRequestCount } from './providers/usage.js';

export const GroqError = ProviderError;

export function callGroqJson({
  apiKey,
  model = DEFAULT_GROQ_MODEL,
  messages,
  jsonSchema = ANALYSIS_PLAN_JSON_SCHEMA,
  maxCompletionTokens = GROQ_LIMITS.maxCompletionTokens,
  abortSignal = null,
  fetchImpl = fetch,
  requestTimeoutMs,
  sleep,
} = {}) {
  return groqAdapter.callJson({
    apiKey,
    model,
    messages,
    jsonSchema,
    maxCompletionTokens,
    abortSignal,
    fetchImpl,
    requestTimeoutMs,
    sleep,
  });
}

export function callGroqText({
  apiKey,
  model = DEFAULT_GROQ_MODEL,
  messages,
  maxCompletionTokens = GROQ_LIMITS.maxCompletionTokens,
  abortSignal = null,
  fetchImpl = fetch,
  requestTimeoutMs,
  sleep,
} = {}) {
  return groqAdapter.callText({
    apiKey,
    model,
    messages,
    maxCompletionTokens,
    abortSignal,
    fetchImpl,
    requestTimeoutMs,
    sleep,
  });
}

export function dailyRequestCount(storage, now) {
  return providerDailyRequestCount('groq', storage, now);
}
