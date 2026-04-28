import { formatNumber, formatBytes } from '../util/format.js';
import { setHtml } from '../util/dom.js';
import { rowCountFromProfile } from '../duckdb/profile-row-count.js';

function commandShortcut() {
  const platform = globalThis.navigator?.platform || '';
  return /Mac|iPhone|iPad|iPod/i.test(platform) ? ['⌘', 'K'] : ['Ctrl', 'K'];
}

export function mountHeader(el, store, handlers) {
  const [modKey, actionKey] = commandShortcut();
  const shortcutText = `${modKey} ${actionKey}`;
  setHtml(el, `
    <a class="brand" href="./" aria-label="ParqView home">
      <span class="mark">Pq</span><span class="word">ParqView</span>
    </a>
    <div class="crumb" hidden>
      <span class="file" id="hCrumbFile"></span>
      <span class="sep" id="hCrumbSep" hidden>·</span>
      <span id="hCrumbMeta"></span>
    </div>
    <div class="grow"></div>
    <button class="cmd-trigger" id="hPalette" type="button" aria-label="Open command menu" title="Open command menu (${shortcutText})">
      <span class="cmd-trigger-icon" aria-hidden="true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"><path d="m4 7 5 5-5 5"/><path d="M12 17h8"/></svg>
      </span>
      <span class="cmd-trigger-label">Commands</span>
      <span class="cmd-trigger-shortcut" aria-hidden="true"><kbd>${modKey}</kbd><kbd>${actionKey}</kbd></span>
    </button>
    <button class="icon-btn runs-btn" id="hSnapshots" type="button" aria-label="Open query snapshots" title="Runs" hidden>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/><path d="M12 7v5l3 2"/></svg>
    </button>
    <button class="icon-btn" id="hTheme" type="button" aria-label="Toggle theme" title="Toggle theme">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    </button>
    <button class="run" id="hRun" type="button" disabled>Run<span class="k">⌘↩</span></button>
  `);
  el.querySelector('#hRun').addEventListener('click', handlers.onRun);
  el.querySelector('#hTheme').addEventListener('click', handlers.onToggleTheme);
  el.querySelector('#hPalette').addEventListener('click', handlers.onOpenPalette);
  el.querySelector('#hSnapshots').addEventListener('click', () => handlers.onOpenSnapshots?.());

  store.subscribe((s) => {
    const crumb = el.querySelector('.crumb');
    const file = el.querySelector('#hCrumbFile');
    const sep = el.querySelector('#hCrumbSep');
    const meta = el.querySelector('#hCrumbMeta');
    if (s.activeTable) {
      crumb.hidden = false;
      file.textContent = s.activeTable;
      sep.hidden = false;
      const rec = s.files.get(s.activeTable);
      const cols = rec?.profile?.schema?.length ?? 0;
      const rowsRaw = rowCountFromProfile(rec?.profile);
      const rowsText = rowsRaw != null ? `${formatNumber(rowsRaw)} rows · ` : '';
      const sizeText = rec?.size ? ` · ${formatBytes(rec.size)}` : '';
      meta.textContent = `${rowsText}${cols} cols${sizeText}`;
    } else {
      crumb.hidden = true;
      file.textContent = '';
      sep.hidden = true;
      meta.textContent = '';
    }
    el.querySelector('#hRun').disabled = !s.activeTable || s.isBusy;
    const snapshotsBtn = el.querySelector('#hSnapshots');
    snapshotsBtn.hidden = !(s.querySnapshots?.length);
    snapshotsBtn.setAttribute('aria-pressed', s.rightPanel?.type === 'snapshots' ? 'true' : 'false');
  });
}
