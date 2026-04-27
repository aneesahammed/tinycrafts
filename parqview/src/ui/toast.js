const TOAST_MS = 3600;
let timer = null;

export function showToast(message, type = '', action = null) {
  const el = document.querySelector('#toast');
  if (!el) return;
  el.textContent = '';
  el.append(document.createTextNode(message));
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
    el.append(document.createTextNode(' '));
    el.append(button);
  }
  el.classList.toggle('error', type === 'error');
  el.classList.add('show');
  window.clearTimeout(timer);
  timer = window.setTimeout(() => el.classList.remove('show'), TOAST_MS);
}

export function toErrorMessage(error) {
  const raw = error?.message || String(error);
  return raw.replace(/^Error:\s*/i, '').slice(0, 500);
}
