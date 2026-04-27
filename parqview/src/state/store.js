export function createStore() {
  const state = {
    files: new Map(),
    activeTable: null,
    resultColumns: [],
    resultRows: [],
    queryElapsedMs: null,
    page: 0,
    pageSize: 100,
    isBusy: false,
    paletteOpen: false,
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
    setResult({ columns, rows, elapsedMs }) {
      state.resultColumns = columns;
      state.resultRows = rows;
      state.queryElapsedMs = elapsedMs;
      state.page = 0;
      emit();
    },
    clearResult() {
      state.resultColumns = [];
      state.resultRows = [];
      state.queryElapsedMs = null;
      state.page = 0;
      emit();
    },
    setBusy(busy) {
      state.isBusy = busy;
      emit();
    },
    setPaletteOpen(open) {
      state.paletteOpen = open;
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
