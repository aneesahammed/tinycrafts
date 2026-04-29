export function sanitizeProviderError(error) {
  const code = String(error?.code || statusCode(error?.status) || 'PROVIDER_ERROR');
  const provider = String(error?.provider || 'provider');
  const status = Number.isFinite(Number(error?.status)) ? Number(error.status) : null;
  return {
    provider,
    code,
    status,
    requestId: safeToken(error?.requestId),
    retryAfter: safeToken(error?.retryAfter),
    safeMessage: safeProviderMessage(provider, code, status),
  };
}

export function safeAnalysisError(error) {
  if (error?.code === 'STALE_DATASET') {
    return {
      code: 'STALE_DATASET',
      safeMessage: 'The active file changed before analysis completed. Ask again for the current file.',
    };
  }
  if (error?.code === 'CLARIFY') {
    return { code: 'CLARIFY', safeMessage: error.message || 'This request needs clarification.' };
  }
  if (error?.provider || error?.status || String(error?.code || '').match(/^(?:UNAUTHORIZED|RATE_LIMITED|TIMEOUT|NETWORK|BAD_JSON|BAD_RESPONSE|MAX_TOKENS|REFUSAL)/)) {
    return sanitizeProviderError(error);
  }
  return {
    code: String(error?.code || 'ANALYSIS_ERROR'),
    safeMessage: 'DataDuck could not complete this analysis. Try narrowing the question or selected columns.',
  };
}

function safeProviderMessage(provider, code, status) {
  const label = provider === 'anthropic' ? 'Claude' : provider === 'groq' ? 'Groq' : 'The AI provider';
  if (code === 'UNAUTHORIZED') return `${label} rejected the API key. Check the key in AI settings.`;
  if (code === 'RATE_LIMITED') return `${label} rate limited this request. Try again later.`;
  if (code === 'TIMEOUT') return `${label} timed out while planning the analysis.`;
  if (code === 'NETWORK') return `Could not reach ${label}. Check network access, CORS, or browser privacy settings.`;
  if (code === 'BAD_JSON' || code === 'BAD_RESPONSE') return `${label} did not return a valid analysis plan. Try narrowing the question.`;
  if (code === 'MAX_TOKENS') return `${label} reached the response token limit. Try a narrower question.`;
  if (code === 'REFUSAL') return `${label} refused to produce an analysis plan for this request.`;
  return `${label} could not return a valid analysis plan${status ? ` (${status})` : ''}. Try narrowing the question or selected columns.`;
}

function statusCode(status) {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 429) return 'RATE_LIMITED';
  return '';
}

function safeToken(value) {
  const text = String(value || '');
  return /^[A-Za-z0-9_.:/ -]{0,160}$/.test(text) ? text : '';
}
