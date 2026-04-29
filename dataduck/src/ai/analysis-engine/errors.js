export const ANALYSIS_ERROR_CODES = Object.freeze({
  STALE_DATASET: 'STALE_DATASET',
  NO_DATASET: 'NO_DATASET',
  COLUMN_NOT_FOUND: 'COLUMN_NOT_FOUND',
  COLUMN_TYPE_MISMATCH: 'COLUMN_TYPE_MISMATCH',
  COLUMN_TYPE_UNSUPPORTED: 'COLUMN_TYPE_UNSUPPORTED',
  FILTER_INVALID: 'FILTER_INVALID',
  ORDER_FIELD_NOT_SELECTED: 'ORDER_FIELD_NOT_SELECTED',
  CHART_FIELD_NOT_SELECTED: 'CHART_FIELD_NOT_SELECTED',
  UNSUPPORTED_AGGREGATE: 'UNSUPPORTED_AGGREGATE',
  INVALID_PLAN: 'INVALID_PLAN',
  EMPTY_SELECTION: 'EMPTY_SELECTION',
  TOO_MANY_COLUMNS: 'TOO_MANY_COLUMNS',
  LLM_MISSING_KEY: 'LLM_MISSING_KEY',
  LLM_UNAUTHORIZED: 'LLM_UNAUTHORIZED',
  LLM_FORBIDDEN: 'LLM_FORBIDDEN',
  LLM_RATE_LIMITED: 'LLM_RATE_LIMITED',
  LLM_TIMEOUT: 'LLM_TIMEOUT',
  LLM_NETWORK: 'LLM_NETWORK',
  LLM_BAD_JSON: 'LLM_BAD_JSON',
  LLM_BAD_RESPONSE: 'LLM_BAD_RESPONSE',
  LLM_EMPTY_RESPONSE: 'LLM_EMPTY_RESPONSE',
  LLM_MAX_TOKENS: 'LLM_MAX_TOKENS',
  LLM_REFUSED: 'LLM_REFUSED',
  LLM_OVERLOADED: 'LLM_OVERLOADED',
  LLM_HTTP: 'LLM_HTTP',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  ANALYSIS_ERROR: 'ANALYSIS_ERROR',
});

const ANALYSIS_ERROR_CODE_VALUES = new Set(Object.values(ANALYSIS_ERROR_CODES));
const PROVIDER_CODE_MAP = Object.freeze({
  MISSING_KEY: ANALYSIS_ERROR_CODES.LLM_MISSING_KEY,
  UNAUTHORIZED: ANALYSIS_ERROR_CODES.LLM_UNAUTHORIZED,
  FORBIDDEN: ANALYSIS_ERROR_CODES.LLM_FORBIDDEN,
  RATE_LIMITED: ANALYSIS_ERROR_CODES.LLM_RATE_LIMITED,
  TIMEOUT: ANALYSIS_ERROR_CODES.LLM_TIMEOUT,
  NETWORK: ANALYSIS_ERROR_CODES.LLM_NETWORK,
  BAD_JSON: ANALYSIS_ERROR_CODES.LLM_BAD_JSON,
  BAD_RESPONSE: ANALYSIS_ERROR_CODES.LLM_BAD_RESPONSE,
  EMPTY_RESPONSE: ANALYSIS_ERROR_CODES.LLM_EMPTY_RESPONSE,
  MAX_TOKENS: ANALYSIS_ERROR_CODES.LLM_MAX_TOKENS,
  REFUSAL: ANALYSIS_ERROR_CODES.LLM_REFUSED,
  OVERLOADED: ANALYSIS_ERROR_CODES.LLM_OVERLOADED,
  HTTP: ANALYSIS_ERROR_CODES.LLM_HTTP,
});

export function sanitizeProviderError(error) {
  const rawCode = String(error?.code || statusCode(error?.status) || 'PROVIDER_ERROR');
  const code = providerDisplayCode(rawCode);
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
      code: ANALYSIS_ERROR_CODES.STALE_DATASET,
      kind: 'error',
      safeMessage: 'The active file changed before analysis completed. Ask again for the current file.',
    };
  }
  if (error?.name === 'AnalysisCompileError' || error?.name === 'PlanCompileError' || error?.code === 'CLARIFY') {
    const code = analysisDisplayCode(error?.code);
    return {
      code,
      kind: error?.kind || 'clarify',
      safeMessage: error?.message || 'This request needs clarification.',
    };
  }
  if (error?.provider || error?.status || String(error?.code || '').match(/^(?:MISSING_KEY|UNAUTHORIZED|FORBIDDEN|RATE_LIMITED|TIMEOUT|NETWORK|BAD_JSON|BAD_RESPONSE|EMPTY_RESPONSE|MAX_TOKENS|REFUSAL|OVERLOADED|HTTP)/)) {
    return sanitizeProviderError(error);
  }
  return {
    code: analysisDisplayCode(error?.code || ANALYSIS_ERROR_CODES.ANALYSIS_ERROR),
    kind: 'error',
    safeMessage: 'DataDuck could not complete this analysis. Try narrowing the question or selected columns.',
  };
}

function safeProviderMessage(provider, code, status) {
  const label = provider === 'anthropic' ? 'Claude' : provider === 'groq' ? 'Groq' : 'The AI provider';
  if (code === ANALYSIS_ERROR_CODES.LLM_MISSING_KEY || code === ANALYSIS_ERROR_CODES.LLM_UNAUTHORIZED) return `${label} rejected the API key. Check the key in AI settings.`;
  if (code === ANALYSIS_ERROR_CODES.LLM_FORBIDDEN) return `${label} denied this request. Check API key permissions.`;
  if (code === ANALYSIS_ERROR_CODES.LLM_RATE_LIMITED) return `${label} rate limited this request. Try again later.`;
  if (code === ANALYSIS_ERROR_CODES.LLM_TIMEOUT) return `${label} timed out while planning the analysis.`;
  if (code === ANALYSIS_ERROR_CODES.LLM_NETWORK) return `Could not reach ${label}. Check network access, CORS, or browser privacy settings.`;
  if (code === ANALYSIS_ERROR_CODES.LLM_BAD_JSON || code === ANALYSIS_ERROR_CODES.LLM_BAD_RESPONSE || code === ANALYSIS_ERROR_CODES.LLM_EMPTY_RESPONSE) return `${label} did not return a valid analysis plan. Try narrowing the question.`;
  if (code === ANALYSIS_ERROR_CODES.LLM_MAX_TOKENS) return `${label} reached the response token limit. Try a narrower question.`;
  if (code === ANALYSIS_ERROR_CODES.LLM_REFUSED) return `${label} refused to produce an analysis plan for this request.`;
  if (code === ANALYSIS_ERROR_CODES.LLM_OVERLOADED) return `${label} is overloaded. Try again later.`;
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

function providerDisplayCode(code) {
  if (PROVIDER_CODE_MAP[code]) return PROVIDER_CODE_MAP[code];
  if (ANALYSIS_ERROR_CODE_VALUES.has(code)) return code;
  return ANALYSIS_ERROR_CODES.PROVIDER_ERROR;
}

function analysisDisplayCode(code) {
  if (code === 'CLARIFY') return ANALYSIS_ERROR_CODES.INVALID_PLAN;
  const text = String(code || '');
  return ANALYSIS_ERROR_CODE_VALUES.has(text) ? text : ANALYSIS_ERROR_CODES.ANALYSIS_ERROR;
}
