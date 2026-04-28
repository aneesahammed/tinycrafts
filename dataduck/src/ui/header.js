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
    <a class="brand" href="./" aria-label="DataDuck home">
      <svg class="brand-duck" height="22" viewBox="0 0 823 675" fill="none" aria-hidden="true">
        <g fill="currentColor">
          <path d="M406 312 C407 276.1 377.6 294.1 368 297 C358.4 299.9 338.9 329.2 329 335 C319.1 340.8 300.8 346.4 289 343 C277.2 339.6 245.4 312.2 235 308 C224.6 303.8 211.9 306.6 206 309 C200.1 311.4 192 317.1 188 327 C184 336.9 180 377.5 174 388 C168 398.5 151.5 408 140 411 C128.5 414 91 407.1 82 412 C73 416.9 42.4 425 68 450 C93.6 475 254 591.4 287 612 C320 632.6 322.9 618.5 332 615 C341.1 611.5 350.8 621.9 360 584 C369.2 546.1 405 347.9 406 312 Z"/>
          <path d="M606 112 C599.5 110.5 585.5 110.5 575 116 C564.5 121.5 532.6 151.5 522 156 C511.4 160.5 500 156.9 490 152 C480 147.1 452.2 118.8 442 117 C431.8 115.2 402.9 102.4 408 138 C413.1 173.6 469.6 365.5 483 402 C496.4 438.5 505.2 427.8 515 430 C524.8 432.2 530.5 444 561 420 C591.5 396 736.6 265.4 759 238 C781.4 210.6 749.1 204.9 740 201 C730.9 197.1 697 208.1 686 207 C675 205.9 659.4 201.9 652 192 C644.6 182.1 632.8 138 627 128 C621.2 118 612.5 113.5 606 112 Z"/>
        </g>
      </svg>
      <span class="word">DataDuck</span>
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
    <button class="icon-btn ask-btn" id="hAssistant" type="button" aria-label="Ask DataDuck" title="Ask DataDuck">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 L13.6 10.4 L22 12 L13.6 13.6 L12 22 L10.4 13.6 L2 12 L10.4 10.4 Z"/></svg>
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
  el.querySelector('#hAssistant').addEventListener('click', () => handlers.onOpenAssistant?.());

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
    el.querySelector('#hAssistant').setAttribute('aria-pressed', s.rightPanel?.type === 'assistant' ? 'true' : 'false');
  });
}
