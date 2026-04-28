import { highlightSql } from '../sql/highlight.js';
import { setHtml, spinner } from '../util/dom.js';

const DEFAULT_SQL = `SELECT *\nFROM active_file\nLIMIT 500;`;

export function mountEditor(el, store, handlers) {
  const wrap = document.createElement('div');
  wrap.className = 'editor';
  setHtml(wrap, `
    <div class="tabs">
      <button class="tab on" type="button" data-editor-tab="query" aria-selected="true">Query</button>
      <button class="tab" type="button" data-editor-tab="schema" aria-selected="false" disabled>Schema</button>
      <button class="tab" type="button" data-editor-tab="sample" aria-selected="false" disabled>Sample</button>
      <div class="grow"></div>
      <div class="right" id="eRight">SELECT</div>
    </div>
    <div class="body">
      <div class="ln" id="eLn">1</div>
      <div class="stack">
        <pre class="hl" id="eHl" aria-hidden="true"></pre>
        <textarea id="eSql" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" wrap="off"></textarea>
      </div>
    </div>
    <div class="foot">
      <span id="eIcon" class="ok">●</span><span id="eStatus">Ready</span>
      <span class="grow"></span>
      <span class="pill">⌘↩ run</span>
      <span class="pill">⌘/ comment</span>
    </div>
  `);
  el.appendChild(wrap);

  const resizerTrack = document.createElement('div');
  resizerTrack.className = 'editor-resizer-track';
  const resizer = document.createElement('div');
  resizer.className = 'editor-resizer';
  resizer.id = 'editorResizer';
  resizer.setAttribute('role', 'separator');
  resizer.setAttribute('aria-label', 'Resize query editor');
  resizer.setAttribute('aria-orientation', 'horizontal');
  resizer.setAttribute('aria-valuemin', '140');
  resizer.setAttribute('aria-valuemax', '560');
  resizer.setAttribute('aria-valuenow', '280');
  resizer.tabIndex = 0;
  resizerTrack.appendChild(resizer);
  el.appendChild(resizerTrack);
  setupEditorResize(el, resizer);

  const ta = wrap.querySelector('#eSql');
  const hl = wrap.querySelector('#eHl');
  const ln = wrap.querySelector('#eLn');
  const right = wrap.querySelector('#eRight');
  const tabButtons = Array.from(wrap.querySelectorAll('[data-editor-tab]'));
  let activeTab = 'query';
  let queryDraft = DEFAULT_SQL;
  ta.value = DEFAULT_SQL;

  const getActiveTable = () => store.state?.activeTable || null;

  const tabSql = (tab) => {
    const table = getActiveTable();
    if (!table) return queryDraft;
    if (tab === 'schema') return `DESCRIBE SELECT *\nFROM ${table};`;
    if (tab === 'sample') return `SELECT *\nFROM ${table}\nORDER BY random()\nLIMIT 100;`;
    return queryDraft;
  };

  const updateTabs = () => {
    const hasActiveTable = Boolean(getActiveTable());
    for (const button of tabButtons) {
      const tab = button.dataset.editorTab;
      button.classList.toggle('on', tab === activeTab);
      button.setAttribute('aria-selected', String(tab === activeTab));
      button.disabled = tab !== 'query' && !hasActiveTable;
    }
  };

  const selectTab = (tab) => {
    if (tab !== 'query' && !getActiveTable()) return;
    if (activeTab === 'query') queryDraft = ta.value;
    activeTab = tab;
    ta.value = tabSql(tab);
    updateTabs();
    update();
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  };

  const update = () => {
    setHtml(hl, highlightSql(ta.value) + '\n');
    const lines = ta.value.split('\n').length;
    ln.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
    const firstWord = ta.value.trim().split(/\s+/)[0]?.toUpperCase();
    if (firstWord) right.textContent = firstWord;
  };

  // Lock the editor when there's no active table. The Run button is already
  // gated by store state in header.js — here we mirror that on the textarea
  // so the surface communicates "you cannot run this yet" honestly.
  const updateLock = (active) => {
    const locked = !active;
    wrap.classList.toggle('is-locked', locked);
    ta.disabled = locked;
    ta.setAttribute('aria-disabled', String(locked));
  };

  for (const button of tabButtons) {
    button.addEventListener('click', () => selectTab(button.dataset.editorTab));
  }

  ta.addEventListener('input', update);
  ta.addEventListener('input', () => {
    activeTab = 'query';
    queryDraft = ta.value;
    updateTabs();
  });
  ta.addEventListener('scroll', () => {
    hl.scrollTop = ta.scrollTop;
    hl.scrollLeft = ta.scrollLeft;
    ln.scrollTop = ta.scrollTop;
  });
  ta.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handlers.onRun();
    } else if ((e.metaKey || e.ctrlKey) && e.key === '/') {
      e.preventDefault();
      toggleComment(ta);
      update();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      ta.value = ta.value.slice(0, start) + '  ' + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = start + 2;
      update();
    }
  });

  store.subscribe((s) => {
    const status = wrap.querySelector('#eStatus');
    const icon = wrap.querySelector('#eIcon');
    if (s.isBusy) {
      status.textContent = s.busyLabel || 'Working…';
      setHtml(icon, spinner());
      icon.style.color = 'var(--accent)';
    } else {
      status.textContent = s.activeTable ? 'Ready' : 'Open a file';
      setHtml(icon, '●');
      icon.style.color = 'var(--accent)';
    }
    if (activeTab !== 'query') {
      ta.value = tabSql(activeTab);
      update();
    }
    updateTabs();
    updateLock(s.activeTable);
  });

  updateTabs();
  update();
  updateLock(store.state?.activeTable);

  return {
    getSql: () => ta.value,
    setSql: (v) => {
      activeTab = 'query';
      ta.value = v;
      queryDraft = v;
      updateTabs();
      update();
      ta.focus();
      ta.setSelectionRange(v.length, v.length);
    },
    focus: () => ta.focus(),
  };
}

export function setupEditorResize(work, resizer) {
  const minHeight = 140;
  const defaultMaxHeight = 560;
  const minResultHeight = 160;

  const applyHeight = (height) => {
    const box = work.getBoundingClientRect();
    const maxHeight = Math.max(minHeight, Math.min(defaultMaxHeight, box.height - minResultHeight));
    const next = Math.round(Math.min(Math.max(height, minHeight), maxHeight));
    work.style.setProperty('--editor-height', `${next}px`);
    resizer.setAttribute('aria-valuenow', String(next));
  };

  const resizeFromViewportY = (clientY) => {
    const box = work.getBoundingClientRect();
    applyHeight(clientY - box.top);
  };

  resizer.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    resizer.setPointerCapture?.(event.pointerId);
    document.body.classList.add('is-resizing-editor');

    const onMove = (moveEvent) => resizeFromViewportY(moveEvent.clientY);
    const onEnd = () => {
      document.body.classList.remove('is-resizing-editor');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };

    resizeFromViewportY(event.clientY);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  });

  resizer.addEventListener('keydown', (event) => {
    const current = Number(resizer.getAttribute('aria-valuenow')) || 280;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      applyHeight(current - 24);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      applyHeight(current + 24);
    } else if (event.key === 'Home') {
      event.preventDefault();
      applyHeight(minHeight);
    } else if (event.key === 'End') {
      event.preventDefault();
      applyHeight(defaultMaxHeight);
    }
  });
}

function toggleComment(ta) {
  const { selectionStart, selectionEnd, value } = ta;
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const lineEnd = value.indexOf('\n', selectionEnd);
  const end = lineEnd === -1 ? value.length : lineEnd;
  const slice = value.slice(lineStart, end);
  const lines = slice.split('\n');
  const allCommented = lines.every((l) => l.trimStart().startsWith('--') || l.trim() === '');
  const next = lines
    .map((l) => (allCommented ? l.replace(/^(\s*)--\s?/, '$1') : l.trim() === '' ? l : `-- ${l}`))
    .join('\n');
  ta.value = value.slice(0, lineStart) + next + value.slice(end);
  ta.setSelectionRange(lineStart, lineStart + next.length);
}
