import { setHtml } from '../util/dom.js';

const HOST_CLASS = 'right-panel';

export function ensureRightPanel(el, store = null) {
  let host = el.querySelector(`.${HOST_CLASS}`);
  if (host) return host;

  host = document.createElement('aside');
  host.className = `${HOST_CLASS} profile-drawer`;
  host.hidden = true;
  host.setAttribute('aria-live', 'polite');
  el.appendChild(host);

  if (!el.__rightPanelEsc) {
    el.__rightPanelEsc = true;
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const current = el.querySelector(`.${HOST_CLASS}`);
      if (!current || current.hidden) return;
      event.preventDefault();
      closeRightPanel(el, store);
    });
  }

  return host;
}

export function openRightPanel(el, store, panel) {
  const host = ensureRightPanel(el, store);
  host.hidden = false;
  host.dataset.panel = panel?.type || '';
  host.setAttribute('aria-label', panelLabel(panel));
  setStageOpen(el, true);
  store?.setRightPanel?.(panel || null);
  return host;
}

export function closeRightPanel(el, store) {
  const host = ensureRightPanel(el, store);
  host.hidden = true;
  host.dataset.panel = '';
  store?.setRightPanel?.(null);
  setHtml(host, '');
  host.setAttribute('aria-label', 'Right panel');
  setStageOpen(el, false);
}

function setStageOpen(el, open) {
  const stage = el?.classList?.contains('stage') ? el : el?.closest?.('.stage');
  if (!stage) return;
  if (open) stage.dataset.rightOpen = 'true';
  else delete stage.dataset.rightOpen;
}

function panelLabel(panel) {
  if (panel?.type === 'profile') return 'Column profile';
  if (panel?.type === 'snapshots') return 'Query snapshots';
  if (panel?.type === 'assistant') return 'Data assistant';
  return 'Right panel';
}
