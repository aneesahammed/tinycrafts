export function filterCommands(commands, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [...commands];
  return commands.filter((c) => `${c.title} ${c.sub || ''}`.toLowerCase().includes(q));
}

export function buildCommands(state, actions) {
  const list = [];
  if (state.activeTable) {
    list.push(
      {
        group: 'Queries',
        icon: 'Σ',
        title: 'SUMMARIZE active file',
        sub: `SUMMARIZE ${state.activeTable}`,
        run: () => actions.setSql(`SUMMARIZE ${state.activeTable};`),
      },
      {
        group: 'Queries',
        icon: '?',
        title: 'DESCRIBE active file',
        sub: `DESCRIBE ${state.activeTable}`,
        run: () => actions.setSql(`DESCRIBE SELECT *\nFROM ${state.activeTable};`),
      },
      {
        group: 'Queries',
        icon: '*',
        title: 'SELECT * (LIMIT 500)',
        sub: `SELECT * FROM ${state.activeTable}`,
        run: () => actions.setSql(`SELECT *\nFROM ${state.activeTable}\nLIMIT 500;`),
      },
    );
  }
  if (state.files.size > 1) {
    list.push({
      group: 'Queries',
      icon: 'Σ',
      title: 'SUMMARIZE across all files',
      sub: [...state.files.keys()].join(', '),
      run: () => {
        const u = [...state.files.keys()].map((t) => `SELECT '${t}' AS file, * FROM ${t}`).join('\nUNION ALL\n');
        actions.setSql(`WITH all_files AS (\n${u}\n)\nSUMMARIZE all_files;`);
      },
    });
  }
  const snapshots = (state.querySnapshots || []).slice(0, 5);
  if (snapshots.length) {
    for (const snapshot of snapshots) {
      list.push({
        group: 'Runs',
        icon: '↻',
        title: snapshot.title,
        sub: `${snapshot.activeTable || 'query'} · ${snapshot.rowCount ?? 0} rows`,
        run: () => actions.setSql(snapshot.sql),
      });
    }
    list.push({
      group: 'Runs',
      icon: '▣',
      title: 'Show all query snapshots',
      sub: `${state.querySnapshots.length} saved`,
      run: () => actions.openSnapshots?.(),
    });
  }
  let i = 0;
  for (const [name] of state.files) {
    i += 1;
    list.push({
      group: 'Files',
      icon: 'F',
      title: `Switch to ${name}`,
      sub: name === state.activeTable ? 'active' : '',
      shortcut: i <= 9 ? ['⌘', String(i)] : null,
      run: () => actions.switchActive(name),
    });
  }
  list.push(
    { group: 'Files', icon: '+', title: 'Open file…', sub: '', run: () => actions.pickFiles() },
    { group: 'Actions', icon: '↻', title: 'Run query', shortcut: ['⌘', '↩'], run: () => actions.run() },
    { group: 'Actions', icon: '⤓', title: 'Export result as CSV', shortcut: ['⌘', 'E'], run: () => actions.exportCsv() },
    { group: 'Actions', icon: '◐', title: 'Toggle theme', shortcut: ['⌘', 'D'], run: () => actions.toggleTheme() },
    { group: 'Actions', icon: '×', title: 'Close all files', sub: '', run: () => actions.closeAll() },
  );
  return list;
}
