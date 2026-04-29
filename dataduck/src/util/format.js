const MS_PER_DAY = 86_400_000;
const EPOCH_MS_MIN = Date.UTC(1990, 0, 1);
const EPOCH_MS_MAX = Date.UTC(2100, 0, 1);

export function valueToDisplay(value, columnType = null) {
  if (value == null) return 'NULL';
  const temporal = temporalValueToDisplay(value, columnType);
  if (temporal != null) return temporal;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return bytesToHex(value);
  if (ArrayBuffer.isView(value)) return bytesToHex(new Uint8Array(value.buffer));
  if (Array.isArray(value) || typeof value === 'object') return safeJson(value);
  return String(value);
}

export function isTemporalColumnType(columnType) {
  return isDateColumnType(columnType) || isTimestampColumnType(columnType);
}

export function isDateColumnType(columnType) {
  const type = normalizeColumnType(columnType);
  return /^DATE(?:32|64)?(?:<|$)/.test(type) || type === 'DATE';
}

export function isTimestampColumnType(columnType) {
  const type = normalizeColumnType(columnType);
  return /^TIMESTAMP(?:<|$|\s|_)/.test(type) || type === 'TIMESTAMPTZ';
}

export function inferDisplayColumnType(name, columnType, values = []) {
  if (isTemporalColumnType(columnType)) return columnType;
  if (!isNumericColumnType(columnType)) return columnType || '';
  if (!isTemporalColumnName(name)) return columnType || '';
  if (!looksLikeEpochMilliseconds(values)) return columnType || '';
  return isDateColumnName(name) ? 'Date64<MILLISECOND>' : 'Timestamp<MILLISECOND>';
}

export function inferDisplayColumnTypes(columns = [], rows = [], columnTypes = {}) {
  return Object.fromEntries(
    columns.map((column) => [
      column,
      inferDisplayColumnType(
        column,
        columnTypes[column],
        rows.map((row) => row?.[column]),
      ),
    ]),
  );
}

function temporalValueToDisplay(value, columnType) {
  if (!isTemporalColumnType(columnType)) return null;
  const ms = temporalValueToMs(value, columnType);
  if (ms == null) return value instanceof Date ? formatTemporalDate(value, columnType) : null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return formatTemporalDate(date, columnType);
}

function formatTemporalDate(date, columnType) {
  const iso = date.toISOString();
  return isDateColumnType(columnType) ? iso.slice(0, 10) : iso;
}

function temporalValueToMs(value, columnType) {
  if (value instanceof Date) return value.getTime();

  const type = normalizeColumnType(columnType);
  const dateMatch = type.match(/^DATE(?:32|64)?(?:<([^>]+)>)?$/);
  if (dateMatch || type === 'DATE') {
    const explicitUnit = dateMatch?.[1];
    const unit = explicitUnit === 'DAY' && looksLikeEpochMillisecondValue(value)
      ? 'MILLISECOND'
      : explicitUnit || inferDateUnit(value);
    return unit === 'DAY'
      ? scaleTemporalNumber(value, MS_PER_DAY)
      : scaleTemporalNumber(value, 1);
  }

  const timestampMatch = type.match(/^TIMESTAMP(?:<([^>,]+)(?:,[^>]*)?>)?/);
  if (timestampMatch || type === 'TIMESTAMPTZ') {
    const unit = timestampMatch?.[1] || sqlTimestampUnit(type);
    if (unit === 'SECOND') return scaleTemporalNumber(value, 1000);
    if (unit === 'MICROSECOND') return divideTemporalNumber(value, 1000);
    if (unit === 'NANOSECOND') return divideTemporalNumber(value, 1_000_000);
    return scaleTemporalNumber(value, 1);
  }

  return null;
}

function inferDateUnit(value) {
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) < 1_000_000 ? 'DAY' : 'MILLISECOND';
}

function sqlTimestampUnit(type) {
  if (/_NS\b/.test(type)) return 'NANOSECOND';
  if (/_US\b/.test(type)) return 'MICROSECOND';
  if (/_S\b/.test(type)) return 'SECOND';
  return 'MILLISECOND';
}

function scaleTemporalNumber(value, factor) {
  if (typeof value === 'bigint') return Number(value * BigInt(factor));
  const number = numericTemporalValue(value);
  return number == null ? null : number * factor;
}

function divideTemporalNumber(value, divisor) {
  if (typeof value === 'bigint') return Number(value / BigInt(divisor));
  const number = numericTemporalValue(value);
  return number == null ? null : number / divisor;
}

function numericTemporalValue(value) {
  if (typeof value === 'string' && value.trim() && !/^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeColumnType(columnType) {
  return String(columnType || '').trim().toUpperCase();
}

function isNumericColumnType(columnType) {
  const type = normalizeColumnType(columnType);
  return /^(?:U?INT|U?INT\d+|INT\d+|FLOAT|FLOAT\d+|DECIMAL|DOUBLE|NUMERIC|BIGINT|HUGEINT|SMALLINT|TINYINT)(?:<|\[|\(|$)/.test(type);
}

function isTemporalColumnName(name) {
  return isDateColumnName(name) || isTimestampColumnName(name);
}

function isDateColumnName(name) {
  return tokenizeColumnName(name).includes('date');
}

function isTimestampColumnName(name) {
  const tokens = tokenizeColumnName(name);
  return tokens.includes('timestamp') ||
    tokens.includes('datetime') ||
    tokens.includes('time') ||
    nameEndsWithAt(name);
}

function tokenizeColumnName(name) {
  return String(name || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function nameEndsWithAt(name) {
  return /(?:^|_)at$/i.test(String(name || ''));
}

function looksLikeEpochMilliseconds(values = []) {
  const sample = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!sample.length) return false;
  const plausible = sample.filter((value) => value >= EPOCH_MS_MIN && value <= EPOCH_MS_MAX);
  return plausible.length / sample.length >= 0.8;
}

function looksLikeEpochMillisecondValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= EPOCH_MS_MIN && number <= EPOCH_MS_MAX;
}

export function safeJson(value) {
  try {
    return JSON.stringify(value, (_key, innerValue) =>
      typeof innerValue === 'bigint' ? innerValue.toString() : innerValue,
    );
  } catch {
    return String(value);
  }
}

export function bytesToHex(bytes) {
  return Array.from(bytes)
    .slice(0, 32)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function formatNumber(value) {
  if (value == null || value === '') return '-';
  if (typeof value === 'bigint') return value.toLocaleString();
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : String(value);
}

export function formatBytes(value) {
  const number = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isFinite(number) || number < 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = number;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const decimals = unit === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(decimals)} ${units[unit]}`;
}

export function abbreviateCount(n) {
  if (n == null) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}
