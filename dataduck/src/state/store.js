export function createStore() {
  const state = {
    files: new Map(),
    activeTable: null,
    resultColumns: [],
    resultColumnTypes: {},
    resultRows: [],
    queryElapsedMs: null,
    page: 0,
    pageSize: 100,
    isBusy: false,
    busyLabel: null,
    paletteOpen: false,
    querySnapshots: [],
    rightPanel: null,
    railCollapsed: false,
  };

  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn(state));

  return {
    state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    addFile(tableName, record) {
      state.files.set(tableName, record);
      if (state.activeTable == null) state.activeTable = tableName;
      emit();
    },
    updateFile(tableName, patch) {
      if (!state.files.has(tableName)) return;
      state.files.set(tableName, { ...state.files.get(tableName), ...patch });
      emit();
    },
    removeFile(tableName) {
      state.files.delete(tableName);
      if (state.activeTable === tableName) {
        state.activeTable = state.files.size ? state.files.keys().next().value : null;
      }
      emit();
    },
    setActive(tableName) {
      if (!state.files.has(tableName)) return;
      state.activeTable = tableName;
      emit();
    },
    setResult({ columns, columnTypes = {}, rows, elapsedMs }) {
      state.resultColumns = columns;
      state.resultColumnTypes = { ...columnTypes };
      state.resultRows = rows;
      state.queryElapsedMs = elapsedMs;
      state.page = 0;
      emit();
    },
    clearResult() {
      state.resultColumns = [];
      state.resultColumnTypes = {};
      state.resultRows = [];
      state.queryElapsedMs = null;
      state.page = 0;
      emit();
    },
    setBusy(busy, label = null) {
      state.isBusy = busy;
      state.busyLabel = label;
      emit();
    },
    setPaletteOpen(open) {
      state.paletteOpen = open;
      emit();
    },
    setQuerySnapshots(snapshots) {
      state.querySnapshots = Array.isArray(snapshots) ? [...snapshots] : [];
      emit();
    },
    addQuerySnapshot(snapshot) {
      if (!snapshot) return;
      state.querySnapshots = [snapshot, ...state.querySnapshots.filter((item) => item.id !== snapshot.id)];
      emit();
    },
    updateQuerySnapshot(id, patch) {
      state.querySnapshots = state.querySnapshots.map((item) => (item.id === id ? { ...item, ...patch } : item));
      emit();
    },
    removeQuerySnapshot(id) {
      state.querySnapshots = state.querySnapshots.filter((item) => item.id !== id);
      emit();
    },
    setRightPanel(panel) {
      state.rightPanel = panel;
      emit();
    },
    setRailCollapsed(collapsed) {
      state.railCollapsed = Boolean(collapsed);
      emit();
    },
    setPage(page) {
      state.page = page;
      emit();
    },
    setPageSize(pageSize) {
      state.pageSize = pageSize;
      state.page = 0;
      emit();
    },
  };
}
