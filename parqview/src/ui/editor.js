import { highlightSql } from '../sql/highlight.js';
import { setHtml } from '../util/dom.js';

const DEFAULT_SQL = `SELECT *\nFROM parquet_file\nLIMIT 500;`;

export function mountEditor(el, store, handlers) {
  const wrap = document.createElement('div');
  wrap.className = 'editor';
  setHtml(wrap, `
    <div class="tabs">
      <div class="tab on">Query</div>
      <div class="grow"></div>
      <div class="right" id="eRight">SELECT</div>
    </div>
    <div class="body">
      <div class="ln" id="eLn">1</div>
      <div class="stack">
        <pre class="hl" id="eHl" aria-hidden="true"></pre>
        <textarea id="eSql" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off"></textarea>
      </div>
    </div>
    <div class="foot">
      <span class="ok">●</span><span id="eStatus">Ready</span>
      <span class="grow"></span>
      <span class="pill">⌘↩ run</span>
      <span class="pill">⌘/ comment</span>
    </div>
  `);
  el.appendChild(wrap);

  const ta = wrap.querySelector('#eSql');
  const hl = wrap.querySelector('#eHl');
  const ln = wrap.querySelector('#eLn');
  const right = wrap.querySelector('#eRight');
  ta.value = DEFAULT_SQL;

  const update = () => {
    setHtml(hl, highlightSql(ta.value) + '\n');
    const lines = ta.value.split('\n').length;
    ln.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
    const firstWord = ta.value.trim().split(/\s+/)[0]?.toUpperCase();
    if (firstWord) right.textContent = firstWord;
  };

  ta.addEventListener('input', update);
  ta.addEventListener('scroll', () => {
    hl.scrollTop = ta.scrollTop;
    hl.scrollLeft = ta.scrollLeft;
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
    if (s.isBusy) {
      status.textContent = 'Running…';
      wrap.querySelector('.foot .ok').style.color = 'var(--num)';
    } else {
      status.textContent = s.activeTable ? 'Ready' : 'Open a file';
      wrap.querySelector('.foot .ok').style.color = 'var(--accent)';
    }
  });

  update();

  return {
    getSql: () => ta.value,
    setSql: (v) => {
      ta.value = v;
      update();
      ta.focus();
      ta.setSelectionRange(v.length, v.length);
    },
    focus: () => ta.focus(),
  };
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
