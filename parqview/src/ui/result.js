import { valueToDisplay } from '../util/format.js';
import { setHtml, esc } from '../util/dom.js';

export function mountResult(el, store) {
  const wrap = document.createElement('div');
  wrap.className = 'result';
  el.appendChild(wrap);
  store.subscribe((s) => render(wrap, s));
}

function render(wrap, s) {
  if (!s.resultColumns.length) {
    setHtml(wrap, '');
    return;
  }
  const head = `<tr><th>#</th>${s.resultColumns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>`;
  const start = s.page * s.pageSize;
  const rows = s.resultRows.slice(start, start + s.pageSize);
  const body = rows
    .map((r, i) => {
      const cells = s.resultColumns
        .map((c) => {
          const v = r[c];
          const isNum = typeof v === 'number' || typeof v === 'bigint';
          const isNull = v == null;
          const cls = [isNum && 'num', isNull && 'null'].filter(Boolean).join(' ');
          return `<td${cls ? ` class="${cls}"` : ''}>${esc(valueToDisplay(v))}</td>`;
        })
        .join('');
      return `<tr><td>${start + i + 1}</td>${cells}</tr>`;
    })
    .join('');
  setHtml(wrap, `<table><thead>${head}</thead><tbody>${body}</tbody></table>`);
}
