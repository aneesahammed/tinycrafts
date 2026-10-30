const test = require("node:test");
const assert = require("node:assert/strict");
const { functionSource, between, runtime } = require("./helpers/inline-app.cjs");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const nextTurn = () => new Promise(setImmediate);

function app(overrides = {}) {
  const state = {
    contentVersion: 1, documentEpoch: 1, documentReadGeneration: 0,
    fileHandle: null, sourceMode: "handle", currentName: "a.md",
    dirty: true, hasSessionDraft: true, untitledDraftId: "",
    libraryActiveFolderId: "", libraryActiveFilePath: "",
    handleWriteQueues: new WeakMap(),
    ...overrides.state,
  };
  const els = { editor: { value: "Original" }, autoRefreshToggle: { checked: false } };
  return runtime({
    state, els, window: { location: { href: "http://localhost/" }, clearTimeout() {} },
    flushActiveUntitledDraft: async () => {}, detachSharedSnapshotContext() {},
    clearActiveLibrarySelection: async () => {}, updateUiState() {}, render() {},
    setPrimaryFileHandle: (handle) => { state.fileHandle = handle; },
    updateLibraryContextDocument() {},
    clearSelectionController() {}, setStatus() {}, nowString: () => "",
    invalidateLastRenderedDocument() {}, writeSessionMeta() {}, stopAutoRefresh() {},
    getReaderSaveState: () => ({ canSave: true, saveAction: "overwrite-handle" }),
    getSuggestedSaveName: () => "a.md", ensureWritableHandle: async () => true,
    queryWritableHandlePermission: async () => "granted",
    getWritableSaveTarget: () => ({ handle: state.fileHandle, sourceMode: "handle" }),
    canUseLibraryStorage: () => false, renderLibraryDrawer() {}, isCoarsePointer: () => false,
    ...overrides,
    state,
  }, [
    between("        function markEditorContentChanged()", "        function readStorage("),
    functionSource("loadFromHandle"), functionSource("loadFromFile"),
    functionSource("markDocumentSaved"), functionSource("saveCurrentDocument"),
    functionSource("flushWritableHandleIfPermitted"),
    functionSource("loadFromLibrarySelection"),
  ]);
}

test("a pending reload cannot overwrite an edit made during the disk read", async () => {
  const read = deferred();
  const handle = { getFile: async () => ({ name: "a.md", text: () => read.promise }) };
  const ctx = app({ state: { fileHandle: handle } });
  const pending = ctx.loadFromHandle(true);
  await nextTurn();
  ctx.els.editor.value = "Unsaved edit";
  ctx.markEditorContentChanged();
  read.resolve("Stale disk snapshot");
  await pending;
  assert.equal(ctx.els.editor.value, "Unsaved edit");
  assert.equal(ctx.state.dirty, true);
});

test("a pending library read cannot overwrite an edit made while it was loading", async () => {
  const read = deferred();
  const handle = { getFile: async () => ({ name: "library.md", text: () => read.promise }) };
  const folder = { id: "folder", status: "ready", tree: [] };
  const ctx = app({ getLibraryFolderById: () => folder, findLibraryFileNode: () => ({ handle }) });
  const pending = ctx.loadFromLibrarySelection("folder", "library.md", { quiet: true });
  await nextTurn();
  ctx.els.editor.value = "Unsaved while opening";
  ctx.markEditorContentChanged();
  read.resolve("Older library content");
  await pending;
  assert.equal(ctx.els.editor.value, "Unsaved while opening");
});

test("the most recently requested file wins when reads finish out of order", async () => {
  const firstRead = deferred();
  const ctx = app();
  const first = ctx.loadFromFile({ name: "a.md", text: () => firstRead.promise });
  await nextTurn();
  ctx.setPrimaryFileHandle = (handle) => { ctx.state.fileHandle = handle; };
  await ctx.loadFromFile({ name: "b.md", text: async () => "New document" });
  firstRead.resolve("Older request");
  await first;
  assert.equal(ctx.els.editor.value, "New document");
  assert.equal(ctx.state.currentName, "b.md");
});

for (const lifecycle of [false, true]) {
  test(`${lifecycle ? "lifecycle" : "manual"} save keeps newer edits marked as unsaved`, async () => {
    const write = deferred();
    const handle = { name: "a.md" };
    const ctx = app({ state: { fileHandle: handle }, writeMarkdownToHandle: () => write.promise });
    const pending = lifecycle ? ctx.flushWritableHandleIfPermitted() : ctx.saveCurrentDocument();
    await nextTurn();
    ctx.els.editor.value = "Edit after save started";
    ctx.markEditorContentChanged();
    write.resolve();
    await pending;
    assert.equal(ctx.state.dirty, true);
    assert.equal(ctx.state.hasSessionDraft, true);
  });
}

test("a save captures its target before an asynchronous permission request", async () => {
  const permission = deferred();
  const a = { name: "a.md" }, b = { name: "b.md" };
  const writes = [];
  const ctx = app({ state: { fileHandle: a },
    ensureWritableHandle: () => permission.promise,
    writeMarkdownToHandle: async (handle, text) => writes.push({ handle, text }),
  });
  const pending = ctx.saveCurrentDocument();
  ctx.state.fileHandle = b;
  ctx.state.currentName = "b.md";
  ctx.setEditorMarkdown("Document B");
  permission.resolve(true);
  await pending;
  assert.equal(writes.some((write) => write.handle === b), false);
  assert.equal(ctx.state.currentName, "b.md");
  assert.equal(ctx.els.editor.value, "Document B");
});

test("writes to the same file finish in the order they were requested", async () => {
  const firstWrite = deferred();
  const writes = [];
  const handle = { createWritable: async () => ({
    async write(text) { if (text === "first") await firstWrite.promise; writes.push(text); },
    async close() {}, async abort() {},
  }) };
  const ctx = runtime({ state: { handleWriteQueues: new WeakMap() } }, [functionSource("writeMarkdownToHandle")]);
  const first = ctx.writeMarkdownToHandle(handle, "first");
  await nextTurn();
  const second = ctx.writeMarkdownToHandle(handle, "second");
  await nextTurn();
  firstWrite.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(writes, ["first", "second"]);
});
