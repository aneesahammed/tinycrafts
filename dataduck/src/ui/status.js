import { formatNumber } from '../util/format.js';
import { toCsv, downloadBlob } from '../util/csv.js';
import { setHtml, spinner } from '../util/dom.js';

export function mountStatus(el, store, handlers = {}) {
  const pill = document.createElement('div');
  pill.className = 'status';
  pill.hidden = true;
  pill.id = 'statusPill';
  setHtml(pill, `
    <span id="sIcon"><span class="dot"></span></span>
    <span id="sRows"></span>
    <span class="sep ms-sep">·</span>
    <span id="sMs" class="ms"></span>
    <span class="pager" id="sPager">
      <span class="sep">·</span>
      <button class="btn" id="sPrev" type="button" aria-label="Previous page" title="Previous page">◀</button>
      <span id="sPage"></span>
      <button class="btn" id="sNext" type="button" aria-label="Next page" title="Next page">▶</button>
    </span>
    <span class="sep">·</span>
    <button class="btn chart-btn" id="sChart" type="button" title="Chart this result">Chart</button>
    <span class="sep">·</span>
    <button class="btn" id="sSnapshots" type="button" title="Query snapshots" hidden>Runs</button>
    <span class="sep" id="sSnapshotsSep" hidden>·</span>
    <button class="btn" id="sExport" type="button" aria-label="Export CSV" title="Export CSV">⤓ CSV</button>
  `);

  function setIcon(busy) {
    const slot = pill.querySelector('#sIcon');
    setHtml(slot, busy ? spinner() : '<span class="dot"></span>');
  }
  el.appendChild(pill);

  pill.querySelector('#sPrev').addEventListener('click', () => store.setPage(Math.max(0, store.state.page - 1)));
  pill.querySelector('#sNext').addEventListener('click', () => {
    const pageCount = Math.max(1, Math.ceil(store.state.resultRows.length / store.state.pageSize));
    store.setPage(Math.min(pageCount - 1, store.state.page + 1));
  });
  pill.querySelector('#sExport').addEventListener('click', () => {
    const s = store.state;
    if (!s.resultColumns.length) return;
    const csv = toCsv(s.resultColumns, s.resultRows, s.resultColumnTypes);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `dataduck-${stamp}.csv`);
  });
  pill.querySelector('#sSnapshots').addEventListener('click', () => handlers.onOpenSnapshots?.());
  pill.querySelector('#sChart').addEventListener('click', () => handlers.onOpenChart?.());

  store.subscribe((s) => {
    pill.hidden = (!s.resultColumns.length && !s.isBusy) || (Boolean(s.queryError) && !s.isBusy);
    if (pill.hidden) return;
    setIcon(s.isBusy);
    pill.querySelector('#sRows').textContent = s.isBusy
      ? (s.busyLabel || 'Working')
      : `${formatNumber(s.resultRows.length)} rows`;
    pill.querySelector('#sMs').textContent = s.isBusy
      ? '—'
      : `${s.queryElapsedMs ?? 0} ms`;
    const pageCount = Math.max(1, Math.ceil(s.resultRows.length / s.pageSize));
    pill.querySelector('#sPager').hidden = s.isBusy || pageCount <= 1;
    pill.querySelector('#sPage').textContent = s.resultRows.length ? `${s.page + 1}/${pageCount}` : '';
    pill.querySelector('#sPrev').disabled = s.isBusy || s.page === 0;
    pill.querySelector('#sNext').disabled = s.isBusy || s.page >= pageCount - 1;
    pill.querySelector('#sExport').disabled = s.isBusy || !s.resultColumns.length;
    const chartBtn = pill.querySelector('#sChart');
    chartBtn.disabled = s.isBusy || !s.resultColumns.length || !s.resultRows.length;
    chartBtn.setAttribute('aria-pressed', s.rightPanel?.type === 'chart' ? 'true' : 'false');
    const showSnapshots = Boolean(s.querySnapshots?.length);
    pill.querySelector('#sSnapshots').hidden = !showSnapshots;
    pill.querySelector('#sSnapshotsSep').hidden = !showSnapshots;
  });
}
