export function valueToDisplay(value) {
  if (value == null) return 'NULL';
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return bytesToHex(value);
  if (ArrayBuffer.isView(value)) return bytesToHex(new Uint8Array(value.buffer));
  if (Array.isArray(value) || typeof value === 'object') return safeJson(value);
  return String(value);
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
