import { setHtml, esc } from '../util/dom.js';
import { abbreviateCount, formatNumber } from '../util/format.js';
import { closeRightPanel, ensureRightPanel, openRightPanel } from './right-panel.js';

export function mountQuerySnapshots(el, store, handlers) {
  const host = ensureRightPanel(el, store);
  let filterText = '';

  const close = () => closeRightPanel(el, store);

  const open = () => {
    openRightPanel(el, store, { type: 'snapshots' });
    render();
  };

  const render = () => {
    if (store.state.rightPanel?.type !== 'snapshots') return;
    const snapshots = filterSnapshots(store.state.querySnapshots || [], filterText);
    setHtml(host, snapshotsHtml(snapshots, store.state.querySnapshots?.length || 0, filterText));

    host.querySelector('[data-snapshot-action="close"]').addEventListener('click', close);
    host.querySelector('.snapshot-search')?.addEventListener('input', (event) => {
      filterText = event.target.value;
      render();
    });
    host.querySelector('[data-snapshot-action="clear"]')?.addEventListener('click', () => handlers.onClear());

    host.querySelectorAll('.snapshot-row').forEach((row) => {
      const snapshot = snapshotById(store.state.querySnapshots, row.dataset.snapshotId);
      if (!snapshot) return;
      row.addEventListener('click', () => {
        handlers.onRestore(snapshot);
        close();
      });
      row.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        handlers.onRestore(snapshot);
        close();
      });
      row.querySelectorAll('[data-snapshot-action]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const action = button.dataset.snapshotAction;
          if (action === 'rerun') handlers.onRerun(snapshot);
          if (action === 'pin') handlers.onTogglePin(snapshot);
          if (action === 'copy') handlers.onCopy(snapshot.sql);
          if (action === 'delete') handlers.onDelete(snapshot);
        });
      });
    });
  };

  store.subscribe(render);
  return { open, close, render };
}

function snapshotsHtml(snapshots, total, filterText) {
  const pinned = snapshots.filter((snapshot) => snapshot.pinned);
  const recent = snapshots.filter((snapshot) => !snapshot.pinned);
  return `
    <div class="snapshot-head">
      <div>
        <p class="profile-kicker">Runs</p>
        <h2 class="profile-title">Query snapshots</h2>
        <p class="snapshot-copy">${total ? `${total} saved · Last 20 unpinned runs` : 'No saved runs yet'}</p>
      </div>
      <button class="profile-close" type="button" data-snapshot-action="close" aria-label="Close query snapshots">×</button>
    </div>
    <div class="snapshot-tools">
      <input class="snapshot-search" type="search" placeholder="Search runs…" value="${esc(filterText)}" />
      <button class="snapshot-clear" type="button" data-snapshot-action="clear"${total ? '' : ' disabled'}>Clear</button>
    </div>
    <div class="snapshot-list">
      ${sectionHtml('Pinned', pinned)}
      ${sectionHtml('Recent', recent)}
      ${!snapshots.length ? '<p class="snapshot-empty">No matching query snapshots.</p>' : ''}
    </div>
  `;
}

function sectionHtml(label, snapshots) {
  if (!snapshots.length) return '';
  return `
    <section class="snapshot-section">
      <h3>${esc(label)}</h3>
      ${snapshots.map(rowHtml).join('')}
    </section>
  `;
}

function rowHtml(snapshot) {
  return `
    <div class="snapshot-row" role="button" tabindex="0" data-snapshot-id="${esc(snapshot.id)}">
      <span class="snapshot-row-main">
        <b>${esc(snapshot.title)}</b>
        <span>${esc(snapshot.activeTable || 'no table')} · ${formatNumber(snapshot.rowCount)} rows · ${formatNumber(snapshot.elapsedMs)} ms · ${snapshot.columns.length} cols</span>
      </span>
      <span class="snapshot-row-time">${esc(relativeTime(snapshot.ranAt))}</span>
      <span class="snapshot-actions" aria-label="Snapshot actions">
        <button type="button" data-snapshot-action="rerun" title="Rerun">↻</button>
        <button type="button" data-snapshot-action="pin" title="${snapshot.pinned ? 'Unpin' : 'Pin'}">${snapshot.pinned ? '◆' : '◇'}</button>
        <button type="button" data-snapshot-action="copy" title="Copy SQL">⧉</button>
        <button type="button" data-snapshot-action="delete" title="Delete">×</button>
      </span>
    </div>
  `;
}

function filterSnapshots(snapshots = [], filterText = '') {
  const q = filterText.trim().toLowerCase();
  if (!q) return snapshots;
  return snapshots.filter((snapshot) =>
    [
      snapshot.title,
      snapshot.sql,
      snapshot.activeTable,
      ...(snapshot.columns || []),
    ]
      .join(' ')
      .toLowerCase()
      .includes(q),
  );
}

function snapshotById(snapshots = [], id) {
  return snapshots.find((snapshot) => snapshot.id === id);
}

function relativeTime(ranAt) {
  const delta = Math.max(0, Date.now() - Number(ranAt || 0));
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${abbreviateCount(Math.floor(hours / 24))}d`;
}
