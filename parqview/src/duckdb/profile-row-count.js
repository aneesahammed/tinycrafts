export function normalizeRowCount(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'bigint') return Number(value);
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function rowCountFromProfile(profile = {}) {
  return normalizeRowCount(profile.rowCount) ?? normalizeRowCount(profile.fileMeta?.num_rows);
}

export function rowCountFromSummary(summary) {
  if (!(summary instanceof Map) || summary.size === 0) return null;
  const counts = [...summary.values()]
    .map((stats) => normalizeRowCount(stats?.rowCount))
    .filter((count) => count != null);
  return counts.length ? Math.max(...counts) : null;
}

export function withNormalizedRowCount(profile = {}, summary = new Map()) {
  return {
    ...profile,
    rowCount: rowCountFromProfile(profile) ?? rowCountFromSummary(summary),
  };
}
