import React from 'react';
import { createRoot } from 'react-dom/client';
import { ensureRightPanel, openRightPanel } from '../ui/right-panel.js';
import { AssistantApp } from './AssistantApp.jsx';

export function mountAiAssistant(stage, store, options = {}) {
  let root = null;
  let host = null;

  function render() {
    host = ensureRightPanel(stage, store);
    host.classList.add('assistant-host');
    if (!root) root = createRoot(host);
    root.render(
      <AssistantApp
        store={store}
        queryFn={options.query}
        setSql={options.setSql}
        showToast={options.showToast}
      />,
    );
  }

  function open() {
    host = openRightPanel(stage, store, { type: 'assistant' });
    render();
  }

  const unsubscribe = store.subscribe((state) => {
    if (state.rightPanel?.type === 'assistant') {
      render();
    } else if (root) {
      root.unmount();
      root = null;
      host?.classList.remove('assistant-host');
    }
  });

  return {
    open,
    destroy() {
      unsubscribe?.();
      root?.unmount();
      root = null;
    },
  };
}
