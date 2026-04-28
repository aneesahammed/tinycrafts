const TOAST_MS = 3600;
const ERROR_TOAST_MS = 7200;
let timer = null;

export function showToast(message, type = '', action = null) {
  const el = document.querySelector('#toast');
  if (!el) return;
  const isError = type === 'error';

  el.textContent = '';

  const indicator = document.createElement('span');
  indicator.className = 'toast-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  el.append(indicator);

  const body = document.createElement('span');
  body.className = 'toast-body';
  body.textContent = message;
  el.append(body);

  if (action?.label && typeof action.run === 'function') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-action';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      window.clearTimeout(timer);
      el.classList.remove('show');
      action.run();
    });
    el.append(button);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '×';
  close.addEventListener('click', () => {
    window.clearTimeout(timer);
    el.classList.remove('show');
  });
  el.append(close);

  el.classList.toggle('error', isError);
  el.classList.add('show');
  window.clearTimeout(timer);
  timer = window.setTimeout(() => el.classList.remove('show'), isError ? ERROR_TOAST_MS : TOAST_MS);
}

export function toErrorMessage(error) {
  const raw = error?.message || String(error);
  return raw.replace(/^Error:\s*/i, '').slice(0, 500);
}
