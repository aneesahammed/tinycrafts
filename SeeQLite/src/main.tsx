import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';
import { BUILD_ID } from './build-id';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error: unknown) => {
      console.error(`[SeeQLite build ${BUILD_ID}] Service worker registration failed.`, error instanceof Error ? error.name : 'unknown');
      window.dispatchEvent(new Event('seeqlite-offline-unavailable'));
    });
  });
} else {
  queueMicrotask(() => window.dispatchEvent(new Event('seeqlite-offline-unavailable')));
}
