import { typeIcon, iconClass } from '../duckdb/summarize.js';
import { abbreviateCount } from '../util/format.js';
import { setHtml, esc } from '../util/dom.js';

export function mountRail(el, store, handlers) {
  setHtml(el, `
    <div class="search"><input id="rSearch" type="search" placeholder="Search columns, files…" /></div>
    <div class="section">
      <div class="label">
        <span>Files <span class="count" id="rFileCount">0</span></span>
        <button class="add" id="rAdd" type="button" aria-label="Open file">+</button>
      </div>
    </div>
    <div class="files" id="rFiles"></div>
    <div class="section" id="rColsSection" hidden>
      <div class="label">
        <span>Columns of <span style="color:var(--accent);" id="rColsName"></span></span>
        <span class="count" id="rColsCount">0</span>
      </div>
    </div>
    <div class="cols" id="rCols"></div>
    <div class="section" id="rMetaSection" hidden>
      <div class="label"><span>Metadata of <span style="color:var(--accent);" id="rMetaName"></span></span></div>
    </div>
    <div class="meta-rows" id="rMeta"></div>
    <div class="rail-foot">
      <p class="footer-credit">Built by <a href="https://anees.xyz" target="_blank" rel="noopener noreferrer">Anees</a></p>
    </div>
  `);
  el.querySelector('#rAdd').addEventListener('click', handlers.onPickFiles);

  const search = el.querySelector('#rSearch');
  let filterText = '';
  search.addEventListener('input', () => {
    filterText = search.value.trim().toLowerCase();
    render(el, store.state, handlers, filterText);
  });

  store.subscribe((s) => render(el, s, handlers, filterText));
}

function render(el, s, handlers, filterText) {
  el.querySelector('#rFileCount').textContent = String(s.files.size);

  const filesEl = el.querySelector('#rFiles');
  setHtml(filesEl, '');
  for (const [name, rec] of s.files.entries()) {
    const row = document.createElement('div');
    row.className = `file${name === s.activeTable ? ' active' : ''}`;
    const rows = rec.profile?.fileMeta?.num_rows;
    const rowsAbbrev = rows != null ? abbreviateCount(Number(rows)) : '';
    setHtml(row, `
      <span class="dot"></span>
      <span class="name">${esc(name)}</span>
      <span class="rows">${esc(rowsAbbrev)}</span>
      <button class="x" type="button" title="Close" aria-label="Close ${esc(name)}">×</button>
    `);
    row.querySelector('.x').addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.onClose(name);
    });
    row.addEventListener('click', () => handlers.onSwitch(name));
    filesEl.appendChild(row);
  }

  const active = s.activeTable && s.files.get(s.activeTable);
  el.querySelector('#rColsSection').hidden = !active;
  el.querySelector('#rMetaSection').hidden = !active;

  const colsEl = el.querySelector('#rCols');
  const metaEl = el.querySelector('#rMeta');

  if (!active) {
    setHtml(colsEl, '');
    setHtml(metaEl, '');
    return;
  }

  el.querySelector('#rColsName').textContent = s.activeTable;
  el.querySelector('#rMetaName').textContent = s.activeTable;

  const schema = active.profile?.schema || [];
  const summary = active.summary || new Map();
  const totalRows = active.profile?.fileMeta?.num_rows
    ? Number(active.profile.fileMeta.num_rows)
    : Math.max(1, ...[...summary.values()].map((v) => v.rowCount ?? 0));

  const visible = schema.filter((row) => {
    if (!filterText) return true;
    const name = String(row.column_name || row.name || '').toLowerCase();
    return name.includes(filterText);
  });
  el.querySelector('#rColsCount').textContent = String(visible.length);

  setHtml(colsEl, visible.map((row) => {
    const name = row.column_name || row.name;
    const type = row.column_type || row.type || '';
    const stats = summary.get(name) || {};
    const ico = typeIcon(type);
    const cls = iconClass(ico);
    const distinct = stats.distinct;
    const distinctText = distinct == null ? '' : distinct >= totalRows * 0.8 ? 'all' : abbreviateCount(distinct);
    const barWidth = distinct == null || !totalRows ? 0 : Math.min(100, Math.round((distinct / totalRows) * 100));
    const bar = barWidth ? `<span class="bar"><i style="width:${barWidth}%"></i></span>` : '';
    return `<div class="col" data-col="${esc(name)}" title="${esc(type)}"><span class="ico ${cls}">${esc(ico)}</span><span class="name">${esc(name)}</span><span class="stat">${bar}${esc(distinctText)}</span></div>`;
  }).join(''));

  colsEl.querySelectorAll('.col').forEach((row) => {
    row.addEventListener('click', () => handlers.onColClick(row.dataset.col));
  });

  const codec = (active.profile?.codecs || []).map((c) => c.compression).filter(Boolean).join(', ');
  setHtml(metaEl, `
    ${codec ? `<div class="meta-row"><span>Compression</span><b>${esc(codec)}</b></div>` : ''}
    ${active.profile?.rowGroups?.length ? `<div class="meta-row"><span>Row groups</span><b>${active.profile.rowGroups.length}</b></div>` : ''}
    ${active.profile?.fileMeta?.created_by ? `<div class="meta-row"><span>Created by</span><b>${esc(String(active.profile.fileMeta.created_by))}</b></div>` : ''}
  `);
}
