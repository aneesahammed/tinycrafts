import { ProviderError } from './errors.js';

export async function withProviderRetry({
  provider,
  operation,
  retryPolicy,
  sleep = delay,
} = {}) {
  const policy = retryPolicy || {};
  const retries = Math.max(0, Number(policy.retries) || 0);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      const retryDelay = retryDelayMs(error, attempt, policy);
      if (retryDelay == null) throw error;
      await sleep(retryDelay);
    }
  }

  function retryDelayMs(error, attempt, retryPolicyConfig) {
    if (attempt >= retries) return null;
    if (!shouldRetry(error, retryPolicyConfig)) return null;
    const retryAfterMs = parseRetryAfterMs(error?.retryAfter);
    const fallback = Math.max(0, Number(retryPolicyConfig.baseMs) || 0) * (2 ** attempt);
    const delayMs = retryAfterMs ?? fallback;
    const capMs = Number(retryPolicyConfig.capMs);
    if (Number.isFinite(capMs) && capMs >= 0 && delayMs > capMs) return null;
    return delayMs;
  }

  function shouldRetry(error, retryPolicyConfig) {
    if (error?.name === 'AbortError') return false;
    if (!(error instanceof ProviderError) && !error?.code) return false;
    if (typeof retryPolicyConfig.retryOn === 'function') return retryPolicyConfig.retryOn(error);
    const statuses = Array.isArray(retryPolicyConfig.retryOn) ? retryPolicyConfig.retryOn : [];
    return statuses.some((status) => status === error?.status || status === error?.code);
  }
}

export function parseRetryAfterMs(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const seconds = Number(text);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const dateMs = Date.parse(text);
  if (!Number.isFinite(dateMs)) return null;
  return Math.max(0, dateMs - Date.now());
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
