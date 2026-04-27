import { formatNumber } from '../util/format.js';
import { toCsv, downloadBlob } from '../util/csv.js';
import { setHtml } from '../util/dom.js';

export function mountStatus(el, store) {
  const pill = document.createElement('div');
  pill.className = 'status';
  pill.hidden = true;
  pill.id = 'statusPill';
  setHtml(pill, `
    <span class="dot"></span>
    <span id="sRows"></span>
    <span class="sep">·</span>
    <span id="sMs"></span>
    <span class="sep" id="sPSep1">·</span>
    <button class="btn" id="sPrev" type="button" title="Previous page">◀</button>
    <span id="sPage"></span>
    <button class="btn" id="sNext" type="button" title="Next page">▶</button>
    <span class="sep">·</span>
    <button class="btn" id="sExport" type="button" title="Export CSV">⤓ CSV</button>
  `);
  el.appendChild(pill);

  pill.querySelector('#sPrev').addEventListener('click', () => store.setPage(Math.max(0, store.state.page - 1)));
  pill.querySelector('#sNext').addEventListener('click', () => {
    const pageCount = Math.max(1, Math.ceil(store.state.resultRows.length / store.state.pageSize));
    store.setPage(Math.min(pageCount - 1, store.state.page + 1));
  });
  pill.querySelector('#sExport').addEventListener('click', () => {
    const s = store.state;
    if (!s.resultColumns.length) return;
    const csv = toCsv(s.resultColumns, s.resultRows);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `parqview-${stamp}.csv`);
  });

  store.subscribe((s) => {
    pill.hidden = !s.resultColumns.length;
    if (pill.hidden) return;
    pill.querySelector('#sRows').textContent = `${formatNumber(s.resultRows.length)} rows`;
    pill.querySelector('#sMs').textContent = `${s.queryElapsedMs ?? 0} ms`;
    const pageCount = Math.max(1, Math.ceil(s.resultRows.length / s.pageSize));
    pill.querySelector('#sPage').textContent = `${s.page + 1}/${pageCount}`;
    pill.querySelector('#sPrev').disabled = s.page === 0;
    pill.querySelector('#sNext').disabled = s.page >= pageCount - 1;
  });
}
