const TOAST_MS = 3600;
let timer = null;

export function showToast(message, type = '') {
  const el = document.querySelector('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', type === 'error');
  el.classList.add('show');
  window.clearTimeout(timer);
  timer = window.setTimeout(() => el.classList.remove('show'), TOAST_MS);
}

export function toErrorMessage(error) {
  const raw = error?.message || String(error);
  return raw.replace(/^Error:\s*/i, '').slice(0, 500);
}
