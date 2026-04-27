const STORAGE_KEY = 'parqview-theme';

export function restoreTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') {
    document.documentElement.dataset.theme = saved;
    return saved;
  }
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    document.documentElement.dataset.theme = 'dark';
    return 'dark';
  }
  document.documentElement.dataset.theme = 'light';
  return 'light';
}

export function toggleTheme() {
  const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem(STORAGE_KEY, next);
  return next;
}
