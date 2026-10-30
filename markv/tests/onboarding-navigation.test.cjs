const test = require("node:test");
const assert = require("node:assert/strict");
const { between, functionSource, runtime } = require("./helpers/inline-app.cjs");

function app() {
  const storage = new Map([["content", "My unsaved note"]]);
  const renders = [], messages = [];
  const state = {
    documentEpoch: 1, contentVersion: 1, documentReadGeneration: 0,
    lastRenderedContentVersion: -1,
    sourceMode: "editor", currentName: "", hasSessionDraft: true, untitledDrafts: [],
  };
  const els = { editor: { value: "My unsaved note" }, autoRefreshToggle: {} };
  const ctx = runtime({
    state, els, window: { location: { href: "http://localhost/" }, clearTimeout() {}, sessionStorage: storage },
    SESSION_CONTENT_KEY: "content", SESSION_META_KEY: "meta", console,
    clearSelectionController() {}, flushActiveUntitledDraft: async () => {}, stopAutoRefresh() {},
    detachSharedSnapshotContext() {}, setPrimaryFileHandle() {}, clearActiveLibrarySelection: async () => {},
    createUntitledDraftId: () => "new-draft", getNextUntitledDraftTitle: () => "Untitled 1",
    upsertUntitledDraftInState: (record) => { state.untitledDrafts.push(record); return record; },
    removeStorage: (_store, key) => storage.delete(key), updateUiState() {},
    render: () => { renders.push(els.editor.value); state.lastRenderedContentVersion = state.contentVersion; },
    renderLibraryDrawer() {}, scheduleUntitledDraftWrite() {},
    flushUntitledDraftWrites: async () => {}, setMode() {}, setStatus: (message) => messages.push(message),
  }, [between("        function markEditorContentChanged()", "        function readStorage("),
    functionSource("loadBundledMarkdown"), functionSource("openBundledDocument"), functionSource("createUntitledDocument")]);
  return { ctx, state, els, storage, renders, messages };
}

test("a slow bundled page cannot replace edits made after it was requested", async () => {
  const { ctx, state, els, storage } = app();
  let finish;
  ctx.fetch = () => new Promise((resolve) => { finish = resolve; });
  const pending = ctx.openBundledDocument("assets/welcome.md");
  els.editor.value = "Newer unsaved note";
  ctx.markEditorContentChanged();
  storage.set("content", els.editor.value);
  finish({ ok: true, text: async () => "# Welcome to MarkV" });
  await pending;
  assert.equal(els.editor.value, "Newer unsaved note");
  assert.equal(storage.get("content"), "Newer unsaved note");
  assert.equal(state.untitledDrafts.length, 0);
});

test("the newest bundled page request wins when fetches finish out of order", async () => {
  const { ctx, els } = app();
  let finish;
  ctx.fetch = (path) => path === "slow" ? new Promise((resolve) => { finish = resolve; }) :
    Promise.resolve({ ok: true, text: async () => "# Newest page" });
  const old = ctx.openBundledDocument("slow");
  await ctx.openBundledDocument("newest");
  finish({ ok: true, text: async () => "# Old request" });
  await old;
  assert.equal(els.editor.value, "# Newest page");
});

test("a missing bundled page keeps the current document and reports failure", async () => {
  const { ctx, els, messages } = app();
  ctx.fetch = async () => ({ ok: false });
  await ctx.openBundledDocument("missing");
  assert.equal(els.editor.value, "My unsaved note");
  assert.equal(messages.length, 1);
});

function startup({ saved = "", draft = "", library = "" } = {}) {
  const { ctx, state, els, renders } = app();
  els.editor.value = "";
  state.hasSessionDraft = false;
  Object.assign(ctx, {
    readSessionMeta: () => ({ hasSessionDraft: !!saved }), readStorage: () => saved,
    readSharedSnapshotFromLocation: async () => null,
    restoreUntitledDraftsFromStorage: async () => !!draft,
    applyReadingSettings() {}, readReadingSettings() {}, applyReaderPalette() {},
    coerceReaderPaletteForTheme: () => "original", readReaderPalette() {}, getGlobalTheme() {},
    restoreLibraryFromStorage: async () => { if (library) { state.sourceMode = "library"; ctx.setEditorMarkdown(library); ctx.render(); } },
    loadUntitledDraft: async () => { state.sourceMode = "untitled"; ctx.setEditorMarkdown(draft); ctx.render(); },
    loadDefaultSample: async () => "# Welcome to MarkV",
  });
  // Run the actual startup coordinator against controlled storage/file boundaries.
  require("node:vm").runInContext(functionSource("init"), ctx);
  return { ctx, state, els, renders };
}

test("a clean first visit renders the welcome document without an intermediate empty page", async () => {
  const { ctx, renders } = startup();
  await ctx.init();
  assert.deepEqual(renders, ["# Welcome to MarkV"]);
});

for (const [name, options, text] of [
  ["session", { saved: "Saved session" }, "Saved session"],
  ["untitled draft", { draft: "Recovered draft" }, "Recovered draft"],
  ["library", { library: "Library document" }, "Library document"],
]) {
  test(`a returning ${name} opens its content instead of the welcome page`, async () => {
    const { ctx, els } = startup(options);
    await ctx.init();
    assert.equal(els.editor.value, text);
  });
}

test("typing while the first welcome fetch is pending wins over the default page", async () => {
  const { ctx, els } = startup();
  let finish;
  ctx.loadDefaultSample = () => new Promise((resolve) => { finish = resolve; });
  const pending = ctx.init();
  await new Promise(setImmediate);
  els.editor.value = "First note";
  ctx.markEditorContentChanged();
  finish("# Welcome to MarkV");
  await pending;
  assert.equal(els.editor.value, "First note");
});

test("startup leaves room for a primary file handle being restored instead of opening welcome", async () => {
  const { ctx, els, renders } = startup();
  ctx.window.MarkVPWA = { shouldRestorePrimaryFileHandle: () => true };
  ctx.loadDefaultSample = async () => { throw new Error("must not replace the restored file"); };
  await ctx.init();
  assert.equal(els.editor.value, "");
  assert.deepEqual(renders, [""]);
});

test("a first visit with an unavailable welcome asset renders the bundled fallback", async () => {
  const { ctx, els } = startup();
  ctx.fetch = async () => { throw new Error("offline"); };
  require("node:vm").runInContext(
    between("        const DEFAULT_SAMPLE_FALLBACK =", "        async function loadBundledMarkdown(") +
      functionSource("loadDefaultSample"), ctx,
  );
  await ctx.init();
  assert.ok(els.editor.value.startsWith("# Welcome to MarkV\n"));
  assert.ok(els.editor.value.includes("open one"));
});
