import { isTemporalColumnType, valueToDisplay } from '../util/format.js';
import { setHtml, esc } from '../util/dom.js';

export function mountResult(el, store) {
  const wrap = document.createElement('div');
  wrap.className = 'result';
  el.appendChild(wrap);

  wrap.addEventListener('click', (event) => {
    const th = event.target.closest('th[data-sortable]');
    if (!th) return;
    const column = th.dataset.col;
    if (!column) return;
    const { sortColumn, sortDirection } = store.state;
    const next = nextSortDirection(sortColumn === column ? sortDirection : null);
    store.setSort(next ? column : null, next);
  });

  store.subscribe((s) => render(wrap, s));
}

function nextSortDirection(current) {
  if (current === 'asc') return 'desc';
  if (current === 'desc') return null;
  return 'asc';
}

function render(wrap, s) {
  if (!s.resultColumns.length) {
    setHtml(wrap, '');
    return;
  }
  const sortedRows = sortRows(s.resultRows, s.sortColumn, s.sortDirection, s.resultColumnTypes);
  const head = `<tr><th>#</th>${s.resultColumns
    .map((c) => {
      const isActive = s.sortColumn === c;
      const ariaSort = isActive ? (s.sortDirection === 'desc' ? 'descending' : 'ascending') : 'none';
      const indicator = isActive ? (s.sortDirection === 'desc' ? '▼' : '▲') : '↕';
      return `<th data-sortable="true" data-col="${esc(c)}" aria-sort="${ariaSort}" title="Sort by ${esc(c)}">${esc(c)}<span class="sort-ind" aria-hidden="true">${indicator}</span></th>`;
    })
    .join('')}</tr>`;
  const start = s.page * s.pageSize;
  const rows = sortedRows.slice(start, start + s.pageSize);
  const body = rows
    .map((r, i) => {
      const cells = s.resultColumns
        .map((c) => {
          const v = r[c];
          const type = s.resultColumnTypes?.[c];
          const isNum = !isTemporalColumnType(type) && (typeof v === 'number' || typeof v === 'bigint');
          const isNull = v == null;
          const cls = [isNum && 'num', isNull && 'null'].filter(Boolean).join(' ');
          return `<td${cls ? ` class="${cls}"` : ''}>${esc(valueToDisplay(v, type))}</td>`;
        })
        .join('');
      return `<tr><td>${start + i + 1}</td>${cells}</tr>`;
    })
    .join('');
  setHtml(wrap, `<table><thead>${head}</thead><tbody>${body}</tbody></table>`);
}

function sortRows(rows, column, direction, columnTypes) {
  if (!column || !direction || !rows?.length) return rows;
  const type = columnTypes?.[column];
  const temporal = isTemporalColumnType(type);
  const dir = direction === 'desc' ? -1 : 1;
  // Slice so we never mutate the upstream rows array stored in the store.
  return rows.slice().sort((a, b) => {
    const aValue = a?.[column];
    const bValue = b?.[column];
    const nullOrder = compareNullOrder(aValue, bValue);
    if (nullOrder !== 0) return nullOrder;
    return dir * compareCells(aValue, bValue, temporal);
  });
}

function compareNullOrder(a, b) {
  const aNull = a == null;
  const bNull = b == null;
  if (aNull && bNull) return 0;
  if (aNull) return 1;   // nulls always last
  if (bNull) return -1;
  return 0;
}

function compareCells(a, b, temporal) {
  if (temporal) {
    const ta = toTime(a);
    const tb = toTime(b);
    if (ta != null && tb != null) return ta - tb;
  }
  if (typeof a === 'bigint' || typeof b === 'bigint') {
    const aNum = Number(a);
    const bNum = Number(b);
    return aNum < bNum ? -1 : aNum > bNum ? 1 : 0;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function toTime(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}
