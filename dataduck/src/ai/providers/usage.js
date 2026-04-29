export function dailyRequestKey(providerId) {
  return `dataduck:provider:${String(providerId || 'unknown')}:daily-requests`;
}

export function dailyRequestCount(providerId, storage = safeLocalStorage(), now = () => new Date()) {
  const today = now().toISOString().slice(0, 10);
  try {
    const payload = JSON.parse(storage?.getItem?.(dailyRequestKey(providerId)) || 'null');
    return payload?.day === today ? Number(payload.count) || 0 : 0;
  } catch {
    return 0;
  }
}

export function incrementDailyRequestCount(providerId, storage = safeLocalStorage(), now = () => new Date()) {
  if (!storage) return;
  const today = now().toISOString().slice(0, 10);
  // This is a soft client-side warning counter; simultaneous tabs may race by one request.
  const count = dailyRequestCount(providerId, storage, now) + 1;
  try {
    storage.setItem(dailyRequestKey(providerId), JSON.stringify({ day: today, count }));
  } catch {
    // Ignore quota/private-mode failures.
  }
}

export function safeLocalStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}
