import { listRecents, clearRecents } from '../state/recents.js';
import { setHtml, esc, spinner } from '../util/dom.js';

function formatSize(n) {
  if (!n) return '–';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i ? 1 : 0)} ${u[i]}`;
}

function relativeTime(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function mountEmpty(el, store, handlers) {
  const empty = document.createElement('div');
  empty.className = 'empty';
  el.appendChild(empty);

  async function render() {
    const s = store.state;
    if (s.isBusy && s.busyLabel) {
      setHtml(empty, `
        <div class="hero">
          <h1>${esc(s.busyLabel)}</h1>
          <p>This may take a moment for large files. Don't close the tab.</p>
          <div class="loading">
            ${spinner('lg')}
            <div class="label">Working…</div>
            <div class="sub">Reading metadata, schema, and column statistics</div>
          </div>
          <p class="footnote">Local-first · works offline · install as a PWA</p>
        </div>
      `);
      return;
    }
    const recents = await listRecents().catch(() => []);
    const recentBlock = recents.length
      ? `
        <div class="recent">
          <div class="h"><span>Recent</span><button class="clear" id="recClear" type="button">Clear</button></div>
          ${recents
            .map(
              (r, index) => `
            <button class="row" type="button" data-recent-index="${index}" aria-label="Open ${esc(r.name)}">
              <span class="name">${esc(r.name)}</span>
              <span class="meta">${esc(formatSize(r.size))}</span>
              <span class="when">${esc(relativeTime(r.openedAt))}</span>
            </button>
          `,
            )
            .join('')}
        </div>
      `
      : '';

    setHtml(empty, `
      <div class="hero">
        <h1>Open a local data file</h1>
        <p>Files stay in your browser. Nothing is uploaded — DuckDB-WASM does the work locally.</p>
        <button class="drop" type="button" id="emptyDrop">
          <div class="icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </div>
          <div class="label">Drop files here, or click to browse</div>
          <div class="hint">Parquet and CSV supported</div>
        </button>
        ${recentBlock}
        <p class="footnote">Local-first · works offline · install as a PWA</p>
      </div>
    `);
    empty.querySelector('#emptyDrop').addEventListener('click', handlers.onPickFiles);
    empty.querySelectorAll('[data-recent-index]').forEach((row) => {
      row.addEventListener('click', () => {
        const recent = recents[Number(row.dataset.recentIndex)];
        if (recent) handlers.onOpenRecent?.(recent.name);
      });
    });
    empty.querySelector('#recClear')?.addEventListener('click', async () => {
      await clearRecents();
      render();
    });
  }

  store.subscribe((s) => {
    empty.hidden = s.files.size > 0;
    if (!empty.hidden) render();
  });
  render();
}
