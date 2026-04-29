import { closeRightPanel, ensureRightPanel, openRightPanel } from '../ui/right-panel.js';

export function createLazyAiAssistant(stage, store, options = {}) {
  let controller = null;
  let loadingPromise = null;
  let failed = null;

  async function load() {
    if (controller) return controller;
    if (!loadingPromise) {
      loadingPromise = import('./mount.jsx')
        .then((mod) => {
          controller = mod.mountAiAssistant(stage, store, options);
          failed = null;
          return controller;
        })
        .catch((error) => {
          failed = error;
          loadingPromise = null;
          renderPlaceholder('error');
          options.showToast?.('Could not load the assistant. Check the network and try again.', 'error');
          throw error;
        });
    }
    return loadingPromise;
  }

  function renderPlaceholder(state = 'loading') {
    const host = ensureRightPanel(stage, store);
    host.classList.add('assistant-host');
    host.replaceChildren();
    const panel = document.createElement('section');
    panel.className = 'assistant-panel assistant-panel-loading';
    panel.setAttribute('aria-label', 'Ask DataDuck');
    const title = document.createElement('h2');
    title.textContent = state === 'error' ? 'Assistant unavailable' : 'Loading assistant...';
    const text = document.createElement('p');
    text.textContent = state === 'error'
      ? 'The assistant bundle could not be loaded.'
      : 'Preparing the local analysis workspace.';
    panel.append(title, text);
    if (state === 'error') {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'Retry';
      retry.addEventListener('click', () => {
        failed = null;
        open();
      });
      panel.append(retry);
    }
    host.append(panel);
  }

  async function open() {
    openRightPanel(stage, store, { type: 'assistant' });
    if (!controller) renderPlaceholder(failed ? 'error' : 'loading');
    const loaded = await load();
    loaded.open();
  }

  function close() {
    if (controller) controller.close();
    else closeRightPanel(stage, store);
  }

  function toggle() {
    if (store?.state?.rightPanel?.type === 'assistant') close();
    else void open();
  }

  return {
    open: () => open(),
    close,
    toggle,
    destroy() {
      controller?.destroy();
      controller = null;
      loadingPromise = null;
    },
  };
}
