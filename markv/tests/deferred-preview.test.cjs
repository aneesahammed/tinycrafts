const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../assets/library-core.js");
const { functionSource, between, runtime } = require("./helpers/inline-app.cjs");

test("editing persists the latest markdown without replacing the hidden preview", () => {
  let stored = "";
  const classList = { toggle() {} };
  const preview = { innerHTML: "Previously rendered content", dataset: {} };
  const els = { editor: { value: "# Latest edit", scrollTop: 0 }, preview, previewPane: { classList } };
  const state = { contentVersion: 2, lastRenderedContentVersion: 1, previewRenderGeneration: 1,
    sourceMode: "editor", currentName: "note.md", dirty: true };
  const ctx = runtime({
    state, els, libraryCore: core, isEditModeActive: () => true,
    document: { activeElement: els.editor, documentElement: { classList }, body: { classList }, dispatchEvent() {} },
    window: { sessionStorage: {} }, CustomEvent: class {},
    marked: { defaults: {}, lexer: () => [], parser: () => "A replacement preview" }, markedOptions: {},
    getFrontmatterTitle: () => "", preprocessMarkdownWithSourceMap: (text) => ({ text }),
    annotateTokenSourceRanges: (tokens) => tokens, renderFrontmatterHeader: () => "",
    preservePreviewScroll: (fn) => fn(), wrapTables() {}, decorateCodeBlocks() {}, decorateLinks() {},
    applyHighlightsToPreview() {}, refreshReaderRail: async () => {},
    hasMermaidBlocks: () => false, hasLatex: () => false, applyHighlightJs() {},
    scheduleSessionContentWrite: (text) => { stored = text; }, writeSessionMeta() {}, updateUiState() {},
    updateWordCount() {}, setStatus() {}, syncCurrentHighlights() {}, nowString: () => "",
  }, [between("        function render(source)", "        function scheduleRender()")]);
  ctx.render("editor");
  assert.equal(preview.innerHTML, "Previously rendered content");
  assert.equal(stored, "# Latest edit");
  assert.equal(state.lastRenderedContentVersion, 1, "the preview still needs rendering when Read is selected");
});

test("chat reads the latest editor content while its preview is deferred", () => {
  const ctx = runtime({ document: {
    getElementById: (id) => id === "editor" ? { value: "Latest markdown" } : { innerText: "Older preview" },
    body: { classList: { contains: () => true } },
  } }, [functionSource("getDocumentText")]);
  assert.equal(ctx.getDocumentText(), "Latest markdown");
});

test("continuous typing buffers recovery text without writing a full session snapshot on each input", () => {
  const writes = [], idle = [], events = new Map();
  const ctx = runtime({
    state: { dirty: false, sourceMode: "editor", currentName: "" },
    els: { editor: { value: "First edit" }, autoRefreshToggle: { checked: false } },
    SESSION_CONTENT_KEY: "session",
    window: {
      sessionStorage: { setItem: (_key, value) => writes.push(value) },
      requestIdleCallback: (fn) => { idle.push(fn); return idle.length; }, cancelIdleCallback() {},
      setTimeout: () => 1, clearTimeout() {}, addEventListener: (event, fn) => events.set(event, fn),
    },
    isUntitledDraftMode: () => false,
  }, [functionSource("writeStorage"),
    between("        var __pendingSessionWrite =", "        var __pendingUntitledDraftWrites ="),
    functionSource("scheduleRender")]);
  ctx.scheduleRender();
  ctx.els.editor.value = "Latest edit";
  ctx.scheduleRender();
  idle.forEach((fn) => fn());
  assert.deepEqual(writes, [], "idle work must wait for the debounced update");
  events.get("pagehide")();
  assert.deepEqual(writes, ["Latest edit"], "closing before the debounce still recovers the latest input");
});

test("switching to an untitled draft cancels recovery writes from the previous document", () => {
  const storage = new Map(), idle = [];
  const ctx = runtime({
    state: { sourceMode: "untitled" }, SESSION_CONTENT_KEY: "session",
    window: {
      sessionStorage: { setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
      requestIdleCallback: (fn) => { idle.push(fn); return idle.length; }, cancelIdleCallback() {},
      addEventListener() {},
    },
    captureActiveUntitledDraft() {}, writeSessionMeta() {},
  }, [functionSource("writeStorage"), functionSource("removeStorage"),
    between("        var __pendingSessionWrite =", "        var __pendingUntitledDraftWrites ="),
    functionSource("persistEditorContent")]);
  ctx.scheduleSessionContentWrite("Previous document");
  ctx.persistEditorContent("New draft");
  idle.forEach((fn) => fn());
  assert.equal(storage.has("session"), false);
});
