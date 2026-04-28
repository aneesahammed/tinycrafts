export const AGGREGATE_UPLOAD_LIMITS = {
  maxRows: 50,
  maxColumns: 12,
  maxCellChars: 512,
  maxPayloadChars: 24_000,
};

export const GROQ_LIMITS = {
  maxCompletionTokens: 1600,
  dailyRequestWarning: 50,
};

export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';
export const GROQ_DAILY_REQUEST_KEY = 'dataduck:groq-daily-requests';
