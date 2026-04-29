export class ProviderError extends Error {
  constructor(message, {
    provider = 'unknown',
    code = 'UNKNOWN',
    status = null,
    retryAfter = '',
    requestId = '',
    cause = null,
    ...details
  } = {}) {
    super(String(message || 'AI provider request failed.'));
    this.name = 'ProviderError';
    this.provider = provider;
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter || '';
    this.requestId = requestId || '';
    if (cause) this.cause = cause;
    Object.assign(this, details);
  }
}

export function providerLabel(provider) {
  if (provider === 'anthropic') return 'Claude';
  if (provider === 'groq') return 'Groq';
  return 'AI provider';
}

export function missingKeyError(provider) {
  const label = providerLabel(provider);
  return new ProviderError(`${label} API key is missing. Add it in Ask DataDuck settings.`, {
    provider,
    code: 'MISSING_KEY',
  });
}
