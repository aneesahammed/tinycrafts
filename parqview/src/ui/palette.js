import { filterCommands, buildCommands } from './palette-filter.js';
import { setHtml, esc } from '../util/dom.js';

export function mountPalette(scrim, store, actions) {
  const root = scrim.querySelector('#palette');
  let selected = 0;
  let commands = [];
  let filtered = [];
  let queryString = '';

  function rebuild() {
    commands = buildCommands(store.state, actions);
    filtered = filterCommands(commands, queryString);
    selected = 0;
    render();
  }

  function render() {
    selected = Math.min(selected, Math.max(0, filtered.length - 1));
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

    setHtml(root, `
      <div class="p-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.65" y2="16.65"/></svg>
        <input value="${esc(queryString)}" placeholder="Run command, jump to file…" />
        <span class="badge">⌘K</span>
      </div>
      ${groupHtml}
      <div class="p-foot">
        <span class="hint"><span>↑</span><span>↓</span> navigate</span>
        <span class="hint"><span>↩</span> select</span>
        <span class="hint"><span>esc</span> close</span>
        <span class="grow"></span>
        <span>${filtered.length} result${filtered.length === 1 ? '' : 's'}</span>
      </div>
    `);
    const input = root.querySelector('input');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    input.addEventListener('input', () => {
      queryString = input.value;
      filtered = filterCommands(commands, queryString);
      selected = 0;
      render();
    });
    root.querySelectorAll('.p-row').forEach((rowEl) => {
      rowEl.addEventListener('mouseenter', () => {
        selected = Number(rowEl.dataset.idx);
        render();
      });
      rowEl.addEventListener('click', () => exec(filtered[Number(rowEl.dataset.idx)]));
    });
  }

  function exec(cmd) {
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
      selected = Math.min(filtered.length - 1, selected + 1);
      render();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selected = Math.max(0, selected - 1);
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      exec(filtered[selected]);
    }
  }
  window.addEventListener('keydown', onKey);

  store.subscribe((s) => {
    scrim.hidden = !s.paletteOpen;
    if (s.paletteOpen) rebuild();
    else queryString = '';
  });
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) store.setPaletteOpen(false);
  });
}
