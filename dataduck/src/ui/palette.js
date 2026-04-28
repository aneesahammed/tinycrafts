import { filterCommands, buildCommands } from './palette-filter.js';
import { setHtml, esc } from '../util/dom.js';

export function mountPalette(scrim, store, actions) {
  const root = scrim.querySelector('#palette');
  let selected = 0;
  let commands = [];
  let filtered = [];
  let queryString = '';
  let mounted = false;
  let lastCommandKey = '';

  function buildShell() {
    setHtml(root, `
      <div class="p-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.65" y2="16.65"/></svg>
        <input placeholder="Run command, jump to file…" />
        <span class="badge">⌘K</span>
      </div>
      <div class="p-list"></div>
      <div class="p-foot">
        <span class="hint"><span>↑</span><span>↓</span> navigate</span>
        <span class="hint"><span>↩</span> select</span>
        <span class="hint"><span>esc</span> close</span>
        <span class="grow"></span>
        <span class="p-count"></span>
      </div>
    `);
    const input = root.querySelector('input');
    input.addEventListener('input', () => {
      queryString = input.value;
      filtered = filterCommands(commands, queryString);
      selected = 0;
      renderList();
      const list = root.querySelector('.p-list');
      if (list) list.scrollTop = 0;
    });
    mounted = true;
  }

  function renderList() {
    const listEl = root.querySelector('.p-list');
    if (!listEl) return;
    const groups = new Map();
    for (let i = 0; i < filtered.length; i += 1) {
      const c = filtered[i];
      if (!groups.has(c.group)) groups.set(c.group, []);
      groups.get(c.group).push({ ...c, idx: i });
    }
    const groupHtml = [...groups.entries()]
      .map(
        ([name, items]) => `
      <div class="p-group">
        <div class="p-glabel">${esc(name)}</div>
        ${items
          .map(
            (c) => `
          <div class="p-row${c.idx === selected ? ' on' : ''}" data-idx="${c.idx}">
            <div class="p-icon">${esc(c.icon || '·')}</div>
            <div class="p-text">
              <div class="p-title">${esc(c.title)}</div>
              ${c.sub ? `<div class="p-sub">${esc(c.sub)}</div>` : ''}
            </div>
            <div class="p-key">${(c.shortcut || []).map((k) => `<span>${esc(k)}</span>`).join('')}</div>
          </div>
        `,
          )
          .join('')}
      </div>
    `,
      )
      .join('');
    setHtml(listEl, groupHtml);
    listEl.querySelectorAll('.p-row').forEach((rowEl) => {
      const idx = Number(rowEl.dataset.idx);
      rowEl.addEventListener('mouseenter', () => updateSelection(idx, { scroll: false }));
      rowEl.addEventListener('click', () => runCommand(filtered[idx]));
    });
    const count = root.querySelector('.p-count');
    if (count) count.textContent = `${filtered.length} result${filtered.length === 1 ? '' : 's'}`;
  }

  function updateSelection(nextIdx, { scroll = false } = {}) {
    if (!filtered.length) return;
    const clamped = Math.max(0, Math.min(filtered.length - 1, nextIdx));
    if (clamped === selected) return;
    const oldRow = root.querySelector(`.p-row[data-idx="${selected}"]`);
    if (oldRow) oldRow.classList.remove('on');
    const newRow = root.querySelector(`.p-row[data-idx="${clamped}"]`);
    if (newRow) newRow.classList.add('on');
    selected = clamped;
    if (scroll && newRow) newRow.scrollIntoView({ block: 'nearest' });
  }

  function commandsKey(list) {
    return list.map((c) => c.id || `${c.group}::${c.title}::${c.sub || ''}`).join('|');
  }

  function rebuild() {
    if (!mounted) buildShell();
    commands = buildCommands(store.state, actions);
    lastCommandKey = commandsKey(commands);
    filtered = filterCommands(commands, queryString);
    selected = 0;

    const input = root.querySelector('input');
    if (input) {
      input.value = queryString;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
    renderList();
    const list = root.querySelector('.p-list');
    if (list) list.scrollTop = 0;
  }

  function refreshCommandsIfChanged() {
    const next = buildCommands(store.state, actions);
    const nextKey = commandsKey(next);
    if (nextKey === lastCommandKey) return;
    commands = next;
    lastCommandKey = nextKey;
    filtered = filterCommands(commands, queryString);
    selected = Math.min(selected, Math.max(0, filtered.length - 1));
    renderList();
  }

  function runCommand(cmd) {
    if (!cmd) return;
    cmd.run();
    store.setPaletteOpen(false);
  }

  function onKey(e) {
    if (!store.state.paletteOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      store.setPaletteOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      updateSelection(selected + 1, { scroll: true });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      updateSelection(selected - 1, { scroll: true });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runCommand(filtered[selected]);
    }
  }
  window.addEventListener('keydown', onKey);

  let wasOpen = false;
  store.subscribe((s) => {
    const open = !!s.paletteOpen;
    scrim.hidden = !open;
    if (open && !wasOpen) {
      rebuild();
    } else if (!open && wasOpen) {
      queryString = '';
      mounted = false;
    } else if (open) {
      refreshCommandsIfChanged();
    }
    wasOpen = open;
  });
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) store.setPaletteOpen(false);
  });
}
