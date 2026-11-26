const test = require("node:test");
const assert = require("node:assert/strict");
const { functionSource, runtime } = require("./helpers/inline-app.cjs");

function sessionRuntime(state) {
  const store = new Map();
  const app = runtime(
    {
      state,
      SESSION_META_KEY: "meta",
      window: { sessionStorage: {} },
      readStorage: (_s, key, fallback) => (store.has(key) ? store.get(key) : fallback),
      writeStorage: (_s, key, value) => store.set(key, value),
    },
    [
      functionSource("isLibraryDocument"),
      functionSource("readSessionMeta"),
      functionSource("writeSessionMeta"),
    ],
  );
  return app;
}

test("an edited folder file's draft remembers which file it belongs to", () => {
  const app = sessionRuntime({
    hasSessionDraft: true,
    sourceMode: "editor",
    untitledDraftId: "",
    libraryCurrentFileHandle: {},
    libraryActiveFolderId: "f1",
    libraryActiveFilePath: "notes/doc.md",
  });
  app.writeSessionMeta();
  assert.equal(
    JSON.stringify(app.readSessionMeta().libraryLink),
    JSON.stringify({ folderId: "f1", path: "notes/doc.md" }),
  );
});

test("an untitled draft has no folder link", () => {
  const app = sessionRuntime({
    hasSessionDraft: true,
    sourceMode: "editor",
    untitledDraftId: "",
    libraryCurrentFileHandle: null,
    libraryActiveFolderId: "",
    libraryActiveFilePath: "",
  });
  app.writeSessionMeta();
  assert.equal(app.readSessionMeta().libraryLink, null);
});

function reattachRuntime(folder, node) {
  const calls = [];
  const state = {
    hasSessionDraft: true,
    sourceMode: "editor",
    libraryActiveFolderId: "",
    libraryActiveFilePath: "",
    libraryCurrentFolderHandle: null,
    libraryCurrentFileHandle: null,
  };
  const app = runtime(
    {
      state,
      getLibraryFolderById: (id) => (folder && folder.id === id ? folder : null),
      findLibraryFileNode: () => node,
      updateUiState: () => calls.push("ui"),
      renderLibraryDrawer: () => calls.push("drawer"),
      render: (source) => calls.push("render:" + source),
    },
    [functionSource("reattachLibraryDraft")],
  );
  return { app, state, calls };
}

test("a restored draft re-links to its folder file", () => {
  const folderHandle = { kind: "directory" };
  const fileHandle = { kind: "file" };
  const { app, state, calls } = reattachRuntime(
    { id: "f1", handle: folderHandle, tree: [] },
    { handle: fileHandle },
  );
  assert.equal(app.reattachLibraryDraft({ folderId: "f1", path: "notes/doc.md" }), true);
  assert.equal(state.libraryActiveFolderId, "f1");
  assert.equal(state.libraryActiveFilePath, "notes/doc.md");
  assert.equal(state.libraryCurrentFolderHandle, folderHandle);
  assert.equal(state.libraryCurrentFileHandle, fileHandle);
  assert.equal(state.sourceMode, "editor");
  assert.ok(calls.includes("render:force"));
});

test("a restored draft keeps its folder for images even before the folder is rescanned", () => {
  const folderHandle = { kind: "directory" };
  const { app, state } = reattachRuntime({ id: "f1", handle: folderHandle, tree: [] }, null);
  assert.equal(app.reattachLibraryDraft({ folderId: "f1", path: "notes/doc.md" }), true);
  assert.equal(state.libraryCurrentFolderHandle, folderHandle);
  assert.equal(state.libraryCurrentFileHandle, null);
});

test("a draft whose folder was removed stays detached", () => {
  const { app, state } = reattachRuntime(null, null);
  assert.equal(app.reattachLibraryDraft({ folderId: "gone", path: "a.md" }), false);
  assert.equal(state.libraryActiveFolderId, "");
});
