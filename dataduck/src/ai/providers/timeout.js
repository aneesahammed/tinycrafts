import { ProviderError, providerLabel } from './errors.js';

export const DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS = 60_000;

export async function fetchWithProviderTimeout({
  provider,
  fetchImpl,
  url,
  init,
  timeoutMs = DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
} = {}) {
  const ms = Math.floor(Number(timeoutMs) || 0);
  if (ms <= 0) return fetchImpl(url, init);

  const callerSignal = init?.signal;
  if (callerSignal?.aborted) throw abortError();

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const requestInit = controller ? { ...init, signal: controller.signal } : init;
  let timeoutId = null;
  let cleanupCallerAbort = () => {};
  let settled = false;

  if (controller && callerSignal) {
    const onCallerAbort = () => controller.abort(callerSignal.reason);
    callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    cleanupCallerAbort = () => callerSignal.removeEventListener('abort', onCallerAbort);
  }

  const fetchPromise = Promise.resolve().then(() => fetchImpl(url, requestInit));
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      if (settled) return;
      controller?.abort();
      reject(new ProviderError(`${providerLabel(provider)} request timed out.`, {
        provider,
        code: 'TIMEOUT',
      }));
    }, ms);
  });

  try {
    return await Promise.race([fetchPromise, timeoutPromise]);
  } finally {
    settled = true;
    clearTimeout(timeoutId);
    cleanupCallerAbort();
    fetchPromise.catch(() => undefined);
  }
}

function abortError() {
  try {
    return new DOMException('The operation was aborted.', 'AbortError');
  } catch {
    const error = new Error('The operation was aborted.');
    error.name = 'AbortError';
    return error;
  }
}
